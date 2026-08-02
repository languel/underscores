import {
  bezierLocalPointToWorld,
  bezierWorldPointToLocal,
  flattenBezierGeometry,
  getBezierWorldAnchors,
  getBezierWorldPath,
  hasCubicBezierGeometry,
  normalizeBezierGeometry,
  setElementBezierGeometry,
} from "./bezierGeometry.js";
import { normalizePhysicsEndpoint } from "./relationshipGraph.js";

const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, finite(value)));
const lerp = (a, b, amount) => a + (b - a) * amount;
const pointLerp = (a, b, amount) => [lerp(a[0], b[0], amount), lerp(a[1], b[1], amount)];
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const closedFreehandContour = (element, points, width, height) => {
  if (element?.type !== "freedraw" || points.length < 3) return false;
  // Excalidraw usually repeats the first point at the end of a closed
  // freehand contour. Retain a scale-aware fallback for imported strokes.
  return distance(points[0], points.at(-1)) <= Math.max(2, Math.min(width, height) * 0.08);
};

const distinctPoints = points => points.filter((point, index) => (
  index === 0 || distance(point, points[index - 1]) > EPSILON
));

const rotatePoint = (point, center, angle) => {
  if (!angle) return point;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
};

export const getPhysicsElementCenter = element => [
  finite(element?.x) + finite(element?.width) / 2,
  finite(element?.y) + finite(element?.height) / 2,
];

export const getPhysicsElementWorldPoints = element => {
  if (!element) return [];
  if (hasCubicBezierGeometry(element)) return getBezierWorldPath(element, 1.2);
  if (!Array.isArray(element.points)) return [];
  const center = getPhysicsElementCenter(element);
  return element.points.map(point => rotatePoint([
    finite(element.x) + finite(point?.[0]),
    finite(element.y) + finite(point?.[1]),
  ], center, finite(element.angle)));
};

export const inferPhysicsBodyFromElement = (element, overrides = {}) => {
  if (!element) return null;
  const center = getPhysicsElementCenter(element);
  const width = Math.max(1, Math.abs(finite(element.width, 1)));
  const height = Math.max(1, Math.abs(finite(element.height, 1)));
  let collider;
  let bodyType = overrides.bodyType || "dynamic";
  const freehandPoints = element.type === "freedraw" ? getPhysicsElementWorldPoints(element) : [];
  if (closedFreehandContour(element, freehandPoints, width, height)) {
    const nearRound = Math.abs(width - height) <= Math.max(width, height) * 0.16;
    if (nearRound) {
      collider = { kind: "circle", radius: Math.min(width, height) / 2 };
    } else {
      collider = {
        kind: "convex",
        points: distinctPoints(freehandPoints).map(point => [point[0] - center[0], point[1] - center[1]]),
      };
    }
  } else if (["line", "arrow", "freedraw"].includes(element.type) || hasCubicBezierGeometry(element)) {
    const worldPoints = getPhysicsElementWorldPoints(element);
    collider = { kind: "polyline", points: worldPoints.map(point => [point[0] - center[0], point[1] - center[1]]) };
    bodyType = overrides.bodyType || "fixed";
  } else if (element.type === "ellipse" && Math.abs(width - height) <= Math.max(width, height) * 0.12) {
    collider = { kind: "circle", radius: Math.min(width, height) / 2 };
  } else {
    collider = { kind: "box", width, height };
  }
  return {
    id: overrides.id || `physics-body-${crypto.randomUUID()}`,
    systemId: String(overrides.systemId || ""),
    name: overrides.name || element.customData?.name || `${element.type} body`,
    enabled: true,
    tracking: overrides.tracking || "authored-rigid",
    bodyType,
    objectRef: { kind: "element", elementId: element.id },
    collider: { ...collider, sensor: overrides.sensor === true },
    material: overrides.material,
    collisionTags: overrides.collisionTags || [],
    initial: {
      x: center[0],
      y: center[1],
      angle: finite(element.angle),
      velocityX: finite(overrides.velocityX),
      velocityY: finite(overrides.velocityY),
      angularVelocity: finite(overrides.angularVelocity),
    },
    render: overrides.render,
  };
};

const pointAtProgress = (points, progress) => {
  if (!points.length) return null;
  if (points.length === 1) return [...points[0]];
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths.at(-1) + distance(points[index - 1], points[index]));
  const total = lengths.at(-1);
  if (total <= EPSILON) return [...points[0]];
  const target = clamp(progress, 0, 1) * total;
  for (let index = 1; index < lengths.length; index += 1) {
    if (target > lengths[index]) continue;
    const span = Math.max(EPSILON, lengths[index] - lengths[index - 1]);
    return pointLerp(points[index - 1], points[index], (target - lengths[index - 1]) / span);
  }
  return [...points.at(-1)];
};

export const resolvePhysicsEndpoint = (endpointValue, { elements = [], streams = null } = {}) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  if (!endpoint) return { ok: false, reason: "invalid-endpoint" };
  if (endpoint.kind === "world") return { ok: true, point: endpoint.point, endpoint };
  if (endpoint.kind === "stream") {
    const value = streams?.get?.(endpoint.streamId, endpoint.featureId) ?? streams?.read?.(endpoint.streamId, endpoint.featureId);
    const path = endpoint.path.split(".").filter(Boolean);
    let resolved = value;
    for (const segment of path) resolved = resolved?.[segment];
    const point = Array.isArray(resolved) ? resolved : [resolved?.x, resolved?.y];
    return Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1]))
      ? { ok: true, point: [Number(point[0]), Number(point[1])], endpoint }
      : { ok: false, reason: "missing-stream-value", endpoint };
  }
  const element = elements.find(candidate => candidate.id === endpoint.objectRef.elementId && !candidate.isDeleted);
  if (!element) return { ok: false, reason: "missing-object", endpoint };
  if (endpoint.kind === "object") {
    if (endpoint.anchor === "center") return { ok: true, point: getPhysicsElementCenter(element), endpoint, element };
    const local = endpoint.localPoint;
    const center = getPhysicsElementCenter(element);
    const unrotated = [element.x + local[0] * element.width, element.y + local[1] * element.height];
    return { ok: true, point: rotatePoint(unrotated, center, finite(element.angle)), endpoint, element };
  }
  if (endpoint.kind === "bezier-anchor") {
    if (!hasCubicBezierGeometry(element)) return { ok: false, reason: "missing-bezier-geometry", endpoint, element };
    const anchor = getBezierWorldAnchors(element).find(candidate => candidate.id === endpoint.anchorId);
    return anchor ? { ok: true, point: anchor.anchor, endpoint, element } : { ok: false, reason: "missing-anchor", endpoint, element };
  }
  const points = getPhysicsElementWorldPoints(element);
  const point = pointAtProgress(points, endpoint.progress);
  return point ? { ok: true, point, endpoint, element } : { ok: false, reason: "missing-curve", endpoint, element };
};

const seededRandom = seedValue => {
  let state = (Math.round(finite(seedValue, 1)) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

const smoothAnchors = (anchors, amount, iterations, closed) => {
  let current = anchors.map(anchor => ({ ...anchor }));
  const blend = clamp(amount, 0, 1);
  for (let pass = 0; pass < Math.max(1, Math.round(iterations)); pass += 1) {
    current = current.map((anchor, index, source) => {
      if (!closed && (index === 0 || index === source.length - 1)) return anchor;
      const previous = source[(index - 1 + source.length) % source.length];
      const next = source[(index + 1) % source.length];
      return {
        ...anchor,
        x: lerp(anchor.x, (previous.x + next.x) / 2, blend),
        y: lerp(anchor.y, (previous.y + next.y) / 2, blend),
      };
    });
  }
  return current;
};

export const applyBezierSculptOperator = (element, operator, options = {}) => {
  if (!hasCubicBezierGeometry(element)) return element;
  const geometry = normalizeBezierGeometry(element.customData.draweratorGeometry);
  let anchors = geometry.anchors.map(anchor => ({ ...anchor, in: anchor.in && [...anchor.in], out: anchor.out && [...anchor.out] }));
  if (operator === "smooth") {
    anchors = smoothAnchors(anchors, finite(options.amount, 0.35), finite(options.iterations, 1), geometry.closed);
  } else if (operator === "randomize") {
    const random = seededRandom(options.seed);
    const amount = Math.max(0, finite(options.amount, 0.02));
    anchors = anchors.map(anchor => ({ ...anchor, x: anchor.x + (random() * 2 - 1) * amount, y: anchor.y + (random() * 2 - 1) * amount }));
  } else if (operator === "attract" || operator === "repel") {
    const worldTarget = [finite(options.point?.[0]), finite(options.point?.[1])];
    const localTarget = bezierWorldPointToLocal(element, worldTarget);
    const radius = Math.max(EPSILON, finite(options.radius, 120) / Math.max(1, Math.abs(element.width), Math.abs(element.height)));
    const amount = clamp(options.amount ?? 0.25, 0, 1) * (operator === "repel" ? -1 : 1);
    anchors = anchors.map(anchor => {
      const delta = [localTarget[0] - anchor.x, localTarget[1] - anchor.y];
      const d = Math.hypot(...delta);
      const influence = d >= radius ? 0 : (1 - d / radius) * amount;
      return { ...anchor, x: anchor.x + delta[0] * influence, y: anchor.y + delta[1] * influence };
    });
  } else if (operator === "morph") {
    const target = options.targetElement;
    if (!target || !hasCubicBezierGeometry(target)) return element;
    const targetWorld = getBezierWorldPath(target, 1);
    const amount = clamp(options.amount ?? 1, 0, 1);
    anchors = anchors.map((anchor, index) => {
      const targetPoint = pointAtProgress(targetWorld, anchors.length <= 1 ? 0 : index / (anchors.length - 1));
      if (!targetPoint) return anchor;
      const local = bezierWorldPointToLocal(element, targetPoint);
      return { ...anchor, x: lerp(anchor.x, local[0], amount), y: lerp(anchor.y, local[1], amount) };
    });
  } else {
    throw new Error(`Unknown Bézier sculpt operator: ${operator}`);
  }
  return setElementBezierGeometry(element, { ...geometry, revision: geometry.revision + 1, anchors });
};

export const applyAnchorAttractorFrame = (element, targets = [], deltaSeconds = 1 / 60) => {
  if (!hasCubicBezierGeometry(element) || !targets.length) return element;
  const geometry = normalizeBezierGeometry(element.customData.draweratorGeometry);
  const targetById = new Map(targets.map(target => [target.anchorId, target]));
  const anchors = geometry.anchors.map(anchor => {
    const target = targetById.get(anchor.id);
    if (!target?.point) return anchor;
    const local = bezierWorldPointToLocal(element, target.point);
    const stiffness = Math.max(0, finite(target.stiffness, 18));
    const amount = 1 - Math.exp(-stiffness * Math.max(0, deltaSeconds));
    return { ...anchor, x: lerp(anchor.x, local[0], amount), y: lerp(anchor.y, local[1], amount) };
  });
  return setElementBezierGeometry(element, { ...geometry, anchors });
};

export const sampleBezierWorldAtProgress = (element, progress) => pointAtProgress(getBezierWorldPath(element, 1), progress);
export const projectWorldPointToBezierLocal = (element, point) => bezierWorldPointToLocal(element, point);
export const projectBezierLocalPointToWorld = (element, point) => bezierLocalPointToWorld(element, point);
export const flattenNormalizedBezier = geometry => flattenBezierGeometry(geometry, 0.003);
