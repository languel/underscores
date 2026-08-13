export const UNDERSCORES_GEOMETRY_VERSION = 2;
export const CUBIC_BEZIER_KIND = "cubicBezierPath";

const EPSILON = 1e-7;
const DEFAULT_TOLERANCE = 0.35;
const metricsCache = new Map();

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const point = value => [finite(value?.[0]), finite(value?.[1])];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const multiply = (a, amount) => [a[0] * amount, a[1] * amount];
const lerp = (a, b, amount) => [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export const isCubicBezierGeometry = value => value?.kind === CUBIC_BEZIER_KIND && Array.isArray(value.anchors) && value.anchors.length >= 2;
export const hasCubicBezierGeometry = element => isCubicBezierGeometry(element?.customData?.underscoresGeometry);

export const normalizeBezierGeometry = value => ({
  version: Math.max(UNDERSCORES_GEOMETRY_VERSION, Math.round(finite(value?.version, UNDERSCORES_GEOMETRY_VERSION))),
  revision: Math.max(0, Math.round(finite(value?.revision, 0))),
  kind: CUBIC_BEZIER_KIND,
  closed: value?.closed === true,
  anchors: (value?.anchors || []).map((anchor, index) => ({
    id: String(anchor?.id || `anchor-${index}`),
    x: finite(anchor?.x),
    y: finite(anchor?.y),
    in: Array.isArray(anchor?.in) ? point(anchor.in) : null,
    out: Array.isArray(anchor?.out) ? point(anchor.out) : null,
    mode: anchor?.mode === "corner" ? "corner" : "smooth",
  })),
});

const distanceToLine = (candidate, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denominator = Math.hypot(dx, dy);
  return denominator <= EPSILON
    ? distance(candidate, start)
    : Math.abs(dy * candidate[0] - dx * candidate[1] + end[0] * start[1] - end[1] * start[0]) / denominator;
};

const simplifyRdp = (points, tolerance) => {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const candidateDistance = distanceToLine(points[index], points[0], points.at(-1));
    if (candidateDistance > maxDistance) {
      maxDistance = candidateDistance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  const left = simplifyRdp(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyRdp(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
};

const flattenCubic = (p0, p1, p2, p3, tolerance, output, segmentIndex, t0 = 0, t1 = 1, depth = 0) => {
  const flatness = Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3));
  if (depth >= 12 || flatness <= tolerance) {
    output.push({ point: p3, segmentIndex, t: t1 });
    return;
  }
  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const midpoint = lerp(p012, p123, 0.5);
  const tm = (t0 + t1) / 2;
  flattenCubic(p0, p01, p012, midpoint, tolerance, output, segmentIndex, t0, tm, depth + 1);
  flattenCubic(midpoint, p123, p23, p3, tolerance, output, segmentIndex, tm, t1, depth + 1);
};

const segmentControls = (anchors, startIndex, closed) => {
  const endIndex = (startIndex + 1) % anchors.length;
  if (!closed && endIndex === 0) return null;
  const start = anchors[startIndex];
  const end = anchors[endIndex];
  const p0 = [start.x, start.y];
  const p3 = [end.x, end.y];
  return {
    startIndex,
    endIndex,
    p0,
    p1: start.out ? add(p0, start.out) : p0,
    p2: end.in ? add(p3, end.in) : p3,
    p3,
  };
};

export const flattenBezierGeometryDetailed = (geometryValue, tolerance = DEFAULT_TOLERANCE) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  if (geometry.anchors.length < 2) return [];
  const first = geometry.anchors[0];
  const output = [{ point: [first.x, first.y], segmentIndex: 0, t: 0 }];
  const segmentCount = geometry.closed ? geometry.anchors.length : geometry.anchors.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const controls = segmentControls(geometry.anchors, index, geometry.closed);
    if (!controls) continue;
    flattenCubic(controls.p0, controls.p1, controls.p2, controls.p3, Math.max(0.00001, tolerance), output, index);
  }
  return output;
};

export const flattenBezierGeometry = (geometry, tolerance) => flattenBezierGeometryDetailed(geometry, tolerance).map(entry => entry.point);

const rotate = (value, center, angle) => {
  if (!angle) return value;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = value[0] - center[0];
  const dy = value[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
};

const getBezierLocalBounds = geometryValue => {
  const path = flattenBezierGeometry(geometryValue, DEFAULT_TOLERANCE);
  const xs = path.map(value => value[0]);
  const ys = path.map(value => value[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const getBezierElementCenter = element => {
  const bounds = getBezierLocalBounds(element.customData.underscoresGeometry);
  return [
    element.x + (bounds.minX + bounds.maxX) / 2 * element.width,
    element.y + (bounds.minY + bounds.maxY) / 2 * element.height,
  ];
};

export const bezierLocalPointToWorld = (element, value) => {
  const unrotated = [element.x + value[0] * element.width, element.y + value[1] * element.height];
  return rotate(unrotated, getBezierElementCenter(element), element.angle || 0);
};

export const bezierWorldPointToLocal = (element, value) => {
  const center = getBezierElementCenter(element);
  const unrotated = rotate(value, center, -(element.angle || 0));
  return [
    (unrotated[0] - element.x) / Math.max(EPSILON, element.width),
    (unrotated[1] - element.y) / Math.max(EPSILON, element.height),
  ];
};

export const getBezierWorldAnchors = element => {
  const geometry = normalizeBezierGeometry(element?.customData?.underscoresGeometry);
  return geometry.anchors.map(anchor => {
    const anchorWorld = bezierLocalPointToWorld(element, [anchor.x, anchor.y]);
    return {
      id: anchor.id,
      anchor: anchorWorld,
      in: anchor.in ? bezierLocalPointToWorld(element, [anchor.x + anchor.in[0], anchor.y + anchor.in[1]]) : null,
      out: anchor.out ? bezierLocalPointToWorld(element, [anchor.x + anchor.out[0], anchor.y + anchor.out[1]]) : null,
      mode: anchor.mode,
    };
  });
};

export const getBezierWorldPath = (element, tolerance = DEFAULT_TOLERANCE) => {
  if (!hasCubicBezierGeometry(element)) return [];
  return flattenBezierGeometry(element.customData.underscoresGeometry, tolerance / Math.max(1, Math.abs(element.width), Math.abs(element.height)))
    .map(value => bezierLocalPointToWorld(element, value));
};

const geometryFromLocalAnchors = (anchors, closed = false) => normalizeBezierGeometry({
  version: UNDERSCORES_GEOMETRY_VERSION,
  revision: 1,
  kind: CUBIC_BEZIER_KIND,
  closed,
  anchors,
});

export const createBezierGeometryFromElement = element => {
  if (!element || !["line", "freedraw"].includes(element.type) || !Array.isArray(element.points) || element.points.length < 2) return null;
  const normalizedPoints = element.points.map(value => [
    finite(value[0]) / Math.max(EPSILON, element.width),
    finite(value[1]) / Math.max(EPSILON, element.height),
  ]);
  const scale = Math.max(1, Math.abs(element.width), Math.abs(element.height));
  const source = element.type === "freedraw" ? simplifyRdp(normalizedPoints, 1.5 / scale) : normalizedPoints;
  const smooth = element.type === "freedraw" || Boolean(element.roundness);
  const anchors = source.map((value, index) => {
    const previous = source[Math.max(0, index - 1)];
    const next = source[Math.min(source.length - 1, index + 1)];
    const tangent = multiply(subtract(next, previous), 1 / 6);
    return {
      x: value[0],
      y: value[1],
      in: smooth && index !== 0 ? multiply(tangent, -1) : null,
      out: smooth && index !== source.length - 1 ? tangent : null,
      mode: smooth ? "smooth" : "corner",
    };
  });
  return geometryFromLocalAnchors(anchors, false);
};

export const createBezierGeometryFromWorldAnchors = (worldAnchors, closed = false) => {
  const samples = [];
  const raw = geometryFromLocalAnchors(worldAnchors.map(anchor => ({
    x: finite(anchor.x), y: finite(anchor.y), in: anchor.in ? point(anchor.in) : null,
    out: anchor.out ? point(anchor.out) : null, mode: anchor.mode,
  })), closed);
  flattenBezierGeometry(raw, 0.05).forEach(value => samples.push(value));
  const xs = samples.map(value => value[0]);
  const ys = samples.map(value => value[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(0.001, Math.max(...xs) - minX);
  const height = Math.max(0.001, Math.max(...ys) - minY);
  const geometry = geometryFromLocalAnchors(raw.anchors.map(anchor => ({
    x: (anchor.x - minX) / width,
    y: (anchor.y - minY) / height,
    in: anchor.in ? [anchor.in[0] / width, anchor.in[1] / height] : null,
    out: anchor.out ? [anchor.out[0] / width, anchor.out[1] / height] : null,
    mode: anchor.mode,
  })), closed);
  return { geometry, bounds: { x: minX, y: minY, width, height } };
};

const derivedRelativePoints = (element, geometry) => flattenBezierGeometry(geometry, DEFAULT_TOLERANCE / Math.max(1, element.width, element.height))
  .map(value => [value[0] * element.width, value[1] * element.height]);

export const setElementBezierGeometry = (element, geometryValue) => {
  const geometry = normalizeBezierGeometry({ ...geometryValue, revision: finite(geometryValue?.revision) + 1 });
  return {
    ...element,
    points: derivedRelativePoints(element, geometry),
    lastCommittedPoint: null,
    roundness: null,
    roughness: 0,
    customData: { ...(element.customData || {}), underscoresGeometry: geometry },
  };
};

export const reframeBezierElement = element => {
  if (!hasCubicBezierGeometry(element)) return element;
  const geometry = normalizeBezierGeometry(element.customData.underscoresGeometry);
  const path = flattenBezierGeometry(geometry, DEFAULT_TOLERANCE / Math.max(1, element.width, element.height));
  const minX = Math.min(...path.map(value => value[0]));
  const maxX = Math.max(...path.map(value => value[0]));
  const minY = Math.min(...path.map(value => value[1]));
  const maxY = Math.max(...path.map(value => value[1]));
  const rangeX = Math.max(EPSILON, maxX - minX);
  const rangeY = Math.max(EPSILON, maxY - minY);
  const width = Math.max(0.001, Math.abs(element.width) * rangeX);
  const height = Math.max(0.001, Math.abs(element.height) * rangeY);
  const worldCenter = [
    element.x + (minX + maxX) / 2 * element.width,
    element.y + (minY + maxY) / 2 * element.height,
  ];
  const normalizedAnchors = geometry.anchors.map(anchor => ({
    ...anchor,
    x: (anchor.x - minX) / rangeX,
    y: (anchor.y - minY) / rangeY,
    in: anchor.in ? [anchor.in[0] / rangeX, anchor.in[1] / rangeY] : null,
    out: anchor.out ? [anchor.out[0] / rangeX, anchor.out[1] / rangeY] : null,
  }));
  const first = normalizedAnchors[0];
  const reframedGeometry = normalizeBezierGeometry({
    ...geometry,
    revision: geometry.revision + 1,
    anchors: normalizedAnchors.map(anchor => ({
      ...anchor,
      x: anchor.x - first.x,
      y: anchor.y - first.y,
    })),
  });
  const centerOffset = [(0.5 - first.x) * width, (0.5 - first.y) * height];
  const reframed = {
    ...element,
    x: worldCenter[0] - centerOffset[0],
    y: worldCenter[1] - centerOffset[1],
    width,
    height,
  };
  return setElementBezierGeometry(reframed, reframedGeometry);
};

export const normalizeBezierHostElement = element => {
  if (!hasCubicBezierGeometry(element) || !Array.isArray(element.points) || element.points.length === 0) return element;
  const first = element.points[0];
  if (Math.abs(finite(first?.[0])) <= 0.000001 && Math.abs(finite(first?.[1])) <= 0.000001) return element;
  return reframeBezierElement(element);
};

export const createBezierHostGeometry = (worldAnchors, closed = false) => {
  const result = createBezierGeometryFromWorldAnchors(worldAnchors, closed);
  const first = result.geometry.anchors[0];
  const geometry = normalizeBezierGeometry({
    ...result.geometry,
    anchors: result.geometry.anchors.map(anchor => ({
      ...anchor,
      x: anchor.x - first.x,
      y: anchor.y - first.y,
    })),
  });
  const bounds = {
    x: finite(worldAnchors[0]?.x),
    y: finite(worldAnchors[0]?.y),
    width: result.bounds.width,
    height: result.bounds.height,
  };
  const elementShape = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  return { geometry, bounds, points: derivedRelativePoints(elementShape, geometry) };
};

export const updateBezierAnchor = (geometryValue, anchorIndex, part, value, options = {}) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  const anchors = geometry.anchors.map(anchor => ({ ...anchor, in: anchor.in && [...anchor.in], out: anchor.out && [...anchor.out] }));
  const anchor = anchors[anchorIndex];
  if (!anchor) return geometry;
  if (part === "anchor") {
    anchor.x = finite(value[0]);
    anchor.y = finite(value[1]);
  } else if (part === "in" || part === "out") {
    const vector = point(value);
    anchor[part] = vector;
    if (options.breakHandles) anchor.mode = "corner";
    if (anchor.mode === "smooth" && !options.breakHandles) {
      const opposite = part === "in" ? "out" : "in";
      const oldLength = anchor[opposite] ? Math.hypot(...anchor[opposite]) : Math.hypot(...vector);
      const length = Math.max(EPSILON, Math.hypot(...vector));
      anchor[opposite] = [-vector[0] / length * oldLength, -vector[1] / length * oldLength];
    }
  }
  return { ...geometry, revision: geometry.revision + 1, anchors };
};

export const setBezierAnchorMode = (geometryValue, anchorIndex, mode) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  const anchors = geometry.anchors.map((anchor, index) => index === anchorIndex ? { ...anchor, mode: mode === "corner" ? "corner" : "smooth" } : anchor);
  return { ...geometry, revision: geometry.revision + 1, anchors };
};

export const removeBezierAnchor = (geometryValue, anchorIndex) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  if (geometry.anchors.length <= 2) return geometry;
  return { ...geometry, revision: geometry.revision + 1, anchors: geometry.anchors.filter((_, index) => index !== anchorIndex) };
};

export const splitBezierSegment = (geometryValue, segmentIndex, amount = 0.5) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  const controls = segmentControls(geometry.anchors, segmentIndex, geometry.closed);
  if (!controls) return geometry;
  const t = Math.min(0.999, Math.max(0.001, finite(amount, 0.5)));
  const q0 = lerp(controls.p0, controls.p1, t);
  const q1 = lerp(controls.p1, controls.p2, t);
  const q2 = lerp(controls.p2, controls.p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const split = lerp(r0, r1, t);
  const anchors = geometry.anchors.map(anchor => ({ ...anchor, in: anchor.in && [...anchor.in], out: anchor.out && [...anchor.out] }));
  anchors[controls.startIndex].out = subtract(q0, controls.p0);
  anchors[controls.endIndex].in = subtract(q2, controls.p3);
  const inserted = { id: `anchor-${crypto.randomUUID()}`, x: split[0], y: split[1], in: subtract(r0, split), out: subtract(r1, split), mode: "smooth" };
  const insertionIndex = geometry.closed && controls.endIndex === 0 ? anchors.length : controls.endIndex;
  anchors.splice(insertionIndex, 0, inserted);
  return { ...geometry, revision: geometry.revision + 1, anchors };
};

export const findNearestBezierLocation = (element, worldPoint) => {
  if (!hasCubicBezierGeometry(element)) return null;
  const local = bezierWorldPointToLocal(element, worldPoint);
  const detailed = flattenBezierGeometryDetailed(element.customData.underscoresGeometry, 0.002);
  let nearest = null;
  for (let index = 1; index < detailed.length; index += 1) {
    const start = detailed[index - 1];
    const end = detailed[index];
    if (start.segmentIndex !== end.segmentIndex) continue;
    const dx = end.point[0] - start.point[0];
    const dy = end.point[1] - start.point[1];
    const denominator = dx * dx + dy * dy;
    const amount = denominator > EPSILON ? Math.max(0, Math.min(1, ((local[0] - start.point[0]) * dx + (local[1] - start.point[1]) * dy) / denominator)) : 0;
    const projected = [start.point[0] + dx * amount, start.point[1] + dy * amount];
    const candidateDistance = Math.hypot((projected[0] - local[0]) * element.width, (projected[1] - local[1]) * element.height);
    if (!nearest || candidateDistance < nearest.distance) nearest = {
      distance: candidateDistance,
      segmentIndex: end.segmentIndex,
      t: start.t + (end.t - start.t) * amount,
    };
  }
  return nearest;
};

const cacheSignature = element => {
  const geometry = element.customData.underscoresGeometry;
  return `${element.id}:${element.version || 0}:${element.versionNonce || 0}:${element.x}:${element.y}:${element.width}:${element.height}:${element.angle}:${geometry.revision || 0}:${geometry.closed}`;
};

export const getBezierWorldMetrics = element => {
  if (!hasCubicBezierGeometry(element)) return null;
  const signature = cacheSignature(element);
  const cached = metricsCache.get(signature);
  if (cached) return cached;
  const geometry = normalizeBezierGeometry(element.customData.underscoresGeometry);
  const detailed = flattenBezierGeometryDetailed(
    geometry,
    DEFAULT_TOLERANCE / Math.max(1, Math.abs(element.width), Math.abs(element.height)),
  );
  const path = detailed.map(entry => bezierLocalPointToWorld(element, entry.point));
  const segments = [];
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    const segmentLength = distance(path[index - 1], path[index]);
    if (segmentLength <= EPSILON) continue;
    const startDetail = detailed[index - 1];
    const endDetail = detailed[index];
    segments.push({
      start: path[index - 1],
      end: path[index],
      startDistance: length,
      length: segmentLength,
      bezierSegmentIndex: endDetail.segmentIndex,
      t0: startDetail.segmentIndex === endDetail.segmentIndex ? startDetail.t : 0,
      t1: endDetail.t,
    });
    length += segmentLength;
  }
  const metrics = { path, segments, length, geometry, element };
  if (metricsCache.size > 256) metricsCache.clear();
  metricsCache.set(signature, metrics);
  return metrics;
};

const sampleBezierMetricsAtDistance = (metrics, targetDistance) => {
  const distanceOnPath = Math.min(metrics.length, Math.max(0, targetDistance));
  let low = 0;
  let high = metrics.segments.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    const candidate = metrics.segments[middle];
    if (distanceOnPath <= candidate.startDistance + candidate.length + EPSILON) high = middle;
    else low = middle + 1;
  }
  const segment = metrics.segments[low] || metrics.segments.at(-1);
  const amount = Math.min(1, Math.max(0, (distanceOnPath - segment.startDistance) / segment.length));
  return {
    point: lerp(segment.start, segment.end, amount),
    segment,
    t: segment.t0 + (segment.t1 - segment.t0) * amount,
  };
};

const cubicDerivative = (controls, t) => {
  const mt = 1 - t;
  return [
    3 * mt * mt * (controls.p1[0] - controls.p0[0]) +
      6 * mt * t * (controls.p2[0] - controls.p1[0]) +
      3 * t * t * (controls.p3[0] - controls.p2[0]),
    3 * mt * mt * (controls.p1[1] - controls.p0[1]) +
      6 * mt * t * (controls.p2[1] - controls.p1[1]) +
      3 * t * t * (controls.p3[1] - controls.p2[1]),
  ];
};

const localVectorToWorld = (element, vector) => {
  const dx = vector[0] * element.width;
  const dy = vector[1] * element.height;
  const angle = element.angle || 0;
  if (!angle) return [dx, dy];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
};

export const sampleBezierElement = (element, progress) => {
  const metrics = getBezierWorldMetrics(element);
  if (!metrics || metrics.length <= EPSILON) return null;
  const targetDistance = Math.min(1, Math.max(0, finite(progress))) * metrics.length;
  const sampled = sampleBezierMetricsAtDistance(metrics, targetDistance);
  const controls = segmentControls(
    metrics.geometry.anchors,
    sampled.segment.bezierSegmentIndex,
    metrics.geometry.closed,
  );
  const derivative = controls
    ? localVectorToWorld(metrics.element, cubicDerivative(controls, sampled.t))
    : [0, 0];
  const dx = derivative[0];
  const dy = derivative[1];
  const fallbackDx = sampled.segment.end[0] - sampled.segment.start[0];
  const fallbackDy = sampled.segment.end[1] - sampled.segment.start[1];
  return {
    point: sampled.point,
    angle: Math.atan2(
      Math.abs(dx) + Math.abs(dy) > EPSILON ? dy : fallbackDy,
      Math.abs(dx) + Math.abs(dy) > EPSILON ? dx : fallbackDx,
    ),
    distance: targetDistance,
    length: metrics.length,
  };
};

export const getBezierPathLengthFromAnchors = (worldAnchors, closed = false) => {
  const { geometry, bounds } = createBezierGeometryFromWorldAnchors(worldAnchors, closed);
  const element = { id: "length", x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, angle: 0, customData: { underscoresGeometry: geometry } };
  return getBezierWorldMetrics(element)?.length || 0;
};
