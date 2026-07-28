import {
  CUBIC_BEZIER_KIND,
  DRAWERATOR_GEOMETRY_VERSION,
  flattenBezierGeometry,
  flattenBezierGeometryDetailed,
  normalizeBezierGeometry,
} from "./bezierGeometry.js";
import { analyzeSvgSource } from "./svgObject.js";
import { SVGPathData } from "svg-pathdata";
import {
  getSvgNodeTransform,
  invertSvgTransform,
  transformSvgPoint,
} from "./svgTransform.js";

const EPSILON = 1e-7;

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const anchor = (point, incoming = null, outgoing = null, mode = "corner") => ({
  x: point[0],
  y: point[1],
  in: incoming,
  out: outgoing,
  mode,
});

const smoothMode = value => {
  if (!value?.in || !value?.out) return "corner";
  const cross = value.in[0] * value.out[1] - value.in[1] * value.out[0];
  const lengths = Math.hypot(...value.in) * Math.hypot(...value.out);
  return lengths > EPSILON && Math.abs(cross) / lengths < 0.015 ? "smooth" : "corner";
};

export const parseSvgPathGeometry = source => {
  const authored = String(source || "").trim();
  if (!authored) return { valid: false, error: "The path has no geometry.", geometry: null };
  const anchors = [];
  let closed = false;
  let commands;
  try {
    commands = new SVGPathData(authored)
      .toAbs()
      .normalizeHVZ(false, true, true, false)
      .normalizeST()
      .qtToC()
      .aToC()
      .commands;
  } catch (error) {
    return {
      valid: false,
      error: error?.message || "The SVG path data is malformed.",
      geometry: null,
    };
  }

  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      if (anchors.length) {
        return { valid: false, error: "Multi-subpath SVG paths must be split before canvas editing.", geometry: null };
      }
      anchors.push(anchor([command.x, command.y]));
    } else if (command.type === SVGPathData.LINE_TO) {
      if (!anchors.length) return { valid: false, error: "The path must begin with a move command.", geometry: null };
      anchors.push(anchor([command.x, command.y]));
    } else if (command.type === SVGPathData.CURVE_TO) {
      if (!anchors.length) return { valid: false, error: "The path must begin with a move command.", geometry: null };
      const current = anchors.at(-1);
      current.out = [command.x1 - current.x, command.y1 - current.y];
      const next = anchor(
        [command.x, command.y],
        [command.x2 - command.x, command.y2 - command.y],
      );
      current.mode = smoothMode(current);
      anchors.push(next);
    } else if (command.type === SVGPathData.CLOSE_PATH) {
      closed = true;
    } else {
      return { valid: false, error: "The SVG path contains an unsupported command.", geometry: null };
    }
  }

  if (anchors.length < 2) return { valid: false, error: "The path needs at least two anchors.", geometry: null };
  anchors.forEach(value => { value.mode = smoothMode(value); });
  return {
    valid: true,
    error: "",
    geometry: normalizeBezierGeometry({
      version: DRAWERATOR_GEOMETRY_VERSION,
      revision: 1,
      kind: CUBIC_BEZIER_KIND,
      closed,
      anchors,
    }),
  };
};

const getSvgPathSubpathRanges = source => {
  const authored = String(source || "");
  const starts = [...authored.matchAll(/[Mm]/g)].map(match => match.index);
  if (!starts.length) {
    const start = authored.search(/\S/);
    if (start < 0) return [];
    let end = authored.length;
    while (end > start && /\s/.test(authored[end - 1])) end -= 1;
    return [{ start, end, source: authored.slice(start, end) }];
  }
  return starts.flatMap((start, index) => {
    let end = starts[index + 1] ?? authored.length;
    while (end > start && /\s/.test(authored[end - 1])) end -= 1;
    return end > start ? [{ start, end, source: authored.slice(start, end) }] : [];
  });
};

export const splitSvgPathSubpathSources = source => (
  getSvgPathSubpathRanges(source).map(subpath => subpath.source)
);

export const removeExactDuplicateSvgPathSubpaths = source => {
  const subpaths = splitSvgPathSubpathSources(source);
  if (subpaths.length < 2) return String(source || "");
  const seen = new Set();
  const unique = subpaths.filter(subpath => {
    const signature = subpath.trim().replace(/\s+/g, " ");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
  return unique.length === subpaths.length ? String(source || "") : unique.join(" ");
};

export const parseSvgPathCollection = source => {
  const ranges = getSvgPathSubpathRanges(source);
  if (!ranges.length) return { valid: false, error: "The path has no geometry.", subpaths: [] };
  const subpaths = ranges.map((range, index) => ({
    index,
    start: range.start,
    end: range.end,
    source: range.source,
    ...parseSvgPathGeometry(range.source),
  }));
  const invalid = subpaths.find(subpath => !subpath.valid);
  return {
    valid: !invalid,
    error: invalid ? `Subpath ${invalid.index + 1}: ${invalid.error}` : "",
    subpaths,
  };
};

const formatNumber = value => {
  const rounded = Math.round(finite(value) * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

const formatPoint = value => `${formatNumber(value[0])} ${formatNumber(value[1])}`;

export const convertFirstSvgSubpathToStraightLine = source => {
  const first = parseSvgPathCollection(source).subpaths[0];
  const anchors = first?.geometry?.anchors;
  if (!first?.valid || anchors?.length !== 2) return String(source || "");
  return `M ${formatNumber(anchors[0].x)} ${formatNumber(anchors[0].y)} L ${formatNumber(anchors[1].x)} ${formatNumber(anchors[1].y)}`;
};

const boundsFromPoints = points => {
  const finitePoints = points.filter(point =>
    Array.isArray(point)
    && point.length >= 2
    && Number.isFinite(Number(point[0]))
    && Number.isFinite(Number(point[1]))
  );
  if (!finitePoints.length) return null;
  const xs = finitePoints.map(point => Number(point[0]));
  const ys = finitePoints.map(point => Number(point[1]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const mergeBounds = values => {
  const bounds = values.filter(Boolean);
  if (!bounds.length) return null;
  return [
    Math.min(...bounds.map(value => value[0])),
    Math.min(...bounds.map(value => value[1])),
    Math.max(...bounds.map(value => value[2])),
    Math.max(...bounds.map(value => value[3])),
  ];
};

const numberAttribute = (node, name, fallback = 0) => {
  const value = Number(node?.attributes?.[name]);
  return Number.isFinite(value) ? value : fallback;
};

const primitiveNodeBounds = node => {
  const tag = node?.tag?.toLowerCase();
  if (tag === "path") {
    const parsed = parseSvgPathCollection(node.attributes?.d);
    return mergeBounds(parsed.subpaths.map(subpath => (
      subpath.valid ? boundsFromPoints(flattenBezierGeometry(subpath.geometry, 0.25)) : null
    )));
  }
  if (tag === "rect" || tag === "image" || tag === "foreignobject") {
    const x = numberAttribute(node, "x");
    const y = numberAttribute(node, "y");
    const width = Math.max(0, numberAttribute(node, "width"));
    const height = Math.max(0, numberAttribute(node, "height"));
    return width || height ? [x, y, x + width, y + height] : null;
  }
  if (tag === "circle") {
    const cx = numberAttribute(node, "cx");
    const cy = numberAttribute(node, "cy");
    const radius = Math.max(0, numberAttribute(node, "r"));
    return radius ? [cx - radius, cy - radius, cx + radius, cy + radius] : null;
  }
  if (tag === "ellipse") {
    const cx = numberAttribute(node, "cx");
    const cy = numberAttribute(node, "cy");
    const rx = Math.max(0, numberAttribute(node, "rx"));
    const ry = Math.max(0, numberAttribute(node, "ry"));
    return rx || ry ? [cx - rx, cy - ry, cx + rx, cy + ry] : null;
  }
  if (tag === "line") {
    return boundsFromPoints([
      [numberAttribute(node, "x1"), numberAttribute(node, "y1")],
      [numberAttribute(node, "x2"), numberAttribute(node, "y2")],
    ]);
  }
  if (tag === "polyline" || tag === "polygon") {
    const values = String(node.attributes?.points || "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)?.map(Number) || [];
    const points = [];
    for (let index = 0; index + 1 < values.length; index += 2) points.push([values[index], values[index + 1]]);
    return boundsFromPoints(points);
  }
  return null;
};

export const getSvgNodeBounds = (source, nodeIndex) => {
  const analysis = analyzeSvgSource(source);
  const selected = analysis.nodes[nodeIndex];
  if (!analysis.valid || !selected) return null;
  if (selected.index === 0 && selected.tag.toLowerCase() === "svg") {
    const [x, y, width, height] = analysis.viewBox;
    return [x, y, x + width, y + height];
  }
  const nodesByIndex = new Map(analysis.nodes.map(node => [node.index, node]));
  const isDescendant = node => {
    let current = node;
    while (Number.isInteger(current?.parentIndex)) {
      if (current.parentIndex === selected.index) return true;
      current = nodesByIndex.get(current.parentIndex);
    }
    return false;
  };
  const candidates = [selected, ...analysis.nodes.filter(isDescendant)];
  return mergeBounds(candidates.map(node => {
    const bounds = primitiveNodeBounds(node);
    if (!bounds) return null;
    try {
      const transform = getSvgNodeTransform(analysis, node);
      const [minX, minY, maxX, maxY] = bounds;
      return boundsFromPoints([
        transformSvgPoint(transform, [minX, minY]),
        transformSvgPoint(transform, [maxX, minY]),
        transformSvgPoint(transform, [maxX, maxY]),
        transformSvgPoint(transform, [minX, maxY]),
      ]);
    } catch {
      return null;
    }
  }));
};

export const getSvgNodeWorldOutline = (element, svgObject, source, nodeIndex) => {
  const bounds = getSvgNodeBounds(source, nodeIndex);
  if (!bounds) return null;
  const [minX, minY, maxX, maxY] = bounds;
  return [
    svgPointToWorld(element, svgObject, [minX, minY]),
    svgPointToWorld(element, svgObject, [maxX, minY]),
    svgPointToWorld(element, svgObject, [maxX, maxY]),
    svgPointToWorld(element, svgObject, [minX, maxY]),
  ];
};

export const serializeSvgPathGeometry = value => {
  const geometry = normalizeBezierGeometry(value);
  if (geometry.anchors.length < 2) return "";
  const first = geometry.anchors[0];
  const commands = [`M ${formatPoint([first.x, first.y])}`];
  const segmentCount = geometry.closed ? geometry.anchors.length : geometry.anchors.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = geometry.anchors[index];
    const end = geometry.anchors[(index + 1) % geometry.anchors.length];
    const startPoint = [start.x, start.y];
    const endPoint = [end.x, end.y];
    const control1 = start.out ? add(startPoint, start.out) : startPoint;
    const control2 = end.in ? add(endPoint, end.in) : endPoint;
    commands.push(`C ${formatPoint(control1)} ${formatPoint(control2)} ${formatPoint(endPoint)}`);
  }
  if (geometry.closed) commands.push("Z");
  return commands.join(" ");
};

export const replaceSvgPathSubpath = (source, subpathIndex, geometry) => {
  const collection = parseSvgPathCollection(source);
  if (!collection.subpaths[subpathIndex] || !geometry) return String(source || "");
  return collection.subpaths.map(subpath => (
    subpath.index === subpathIndex ? serializeSvgPathGeometry(geometry) : subpath.source
  )).join(" ");
};

const editableEndpointIndices = geometry => {
  const count = geometry?.anchors?.length || 0;
  if (!count) return [];
  return geometry.closed || count === 1 ? [0] : [0, count - 1];
};

export const getSvgPathEndpointConnections = (
  source,
  subpathIndex,
  anchorIndex,
  tolerance = 0.001,
) => {
  const collection = parseSvgPathCollection(source);
  const selected = collection.subpaths[subpathIndex];
  const selectedAnchor = selected?.valid ? selected.geometry.anchors[anchorIndex] : null;
  if (!selectedAnchor || !editableEndpointIndices(selected.geometry).includes(anchorIndex)) return [];
  const threshold = Math.max(EPSILON, finite(tolerance));
  return collection.subpaths.flatMap(subpath => {
    if (!subpath.valid) return [];
    return editableEndpointIndices(subpath.geometry).flatMap(candidateAnchorIndex => {
      const candidate = subpath.geometry.anchors[candidateAnchorIndex];
      return Math.hypot(candidate.x - selectedAnchor.x, candidate.y - selectedAnchor.y) <= threshold
        ? [{ subpathIndex: subpath.index, anchorIndex: candidateAnchorIndex }]
        : [];
    });
  });
};

export const replaceSvgPathSubpathWithConnectedEndpoint = (
  source,
  subpathIndex,
  anchorIndex,
  geometry,
) => {
  const collection = parseSvgPathCollection(source);
  const selected = collection.subpaths[subpathIndex];
  const nextSelectedAnchor = geometry?.anchors?.[anchorIndex];
  if (!selected?.valid || !nextSelectedAnchor) return replaceSvgPathSubpath(source, subpathIndex, geometry);
  const connections = getSvgPathEndpointConnections(source, subpathIndex, anchorIndex);
  if (connections.length <= 1) return replaceSvgPathSubpath(source, subpathIndex, geometry);

  const changed = new Map([[subpathIndex, normalizeBezierGeometry(geometry)]]);
  for (const connection of connections) {
    const subpath = collection.subpaths[connection.subpathIndex];
    const current = changed.get(connection.subpathIndex) || subpath.geometry;
    const anchors = current.anchors.map(anchorValue => ({
      ...anchorValue,
      in: anchorValue.in ? [...anchorValue.in] : null,
      out: anchorValue.out ? [...anchorValue.out] : null,
    }));
    anchors[connection.anchorIndex] = {
      ...anchors[connection.anchorIndex],
      x: nextSelectedAnchor.x,
      y: nextSelectedAnchor.y,
    };
    changed.set(connection.subpathIndex, normalizeBezierGeometry({ ...current, anchors }));
  }
  return collection.subpaths.map(subpath => (
    changed.has(subpath.index) ? serializeSvgPathGeometry(changed.get(subpath.index)) : subpath.source
  )).join(" ");
};

const rotate = (value, center, angle) => {
  if (!angle) return value;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = value[0] - center[0];
  const dy = value[1] - center[1];
  return [
    center[0] + dx * cosine - dy * sine,
    center[1] + dx * sine + dy * cosine,
  ];
};

export const svgPointToWorld = (element, svgObject, value, nodeTransform = null) => {
  const transformed = nodeTransform ? transformSvgPoint(nodeTransform, value) : value;
  const viewBox = svgObject?.viewBox || [0, 0, 1, 1];
  const width = Math.max(EPSILON, finite(viewBox[2]));
  const height = Math.max(EPSILON, finite(viewBox[3]));
  const point = [
    finite(element?.x) + ((finite(transformed?.[0]) - finite(viewBox[0])) / width) * finite(element?.width),
    finite(element?.y) + ((finite(transformed?.[1]) - finite(viewBox[1])) / height) * finite(element?.height),
  ];
  return rotate(point, [
    finite(element?.x) + finite(element?.width) / 2,
    finite(element?.y) + finite(element?.height) / 2,
  ], finite(element?.angle));
};

export const worldPointToSvg = (element, svgObject, value, inverseNodeTransform = null) => {
  const center = [
    finite(element?.x) + finite(element?.width) / 2,
    finite(element?.y) + finite(element?.height) / 2,
  ];
  const unrotated = rotate(value, center, -finite(element?.angle));
  const viewBox = svgObject?.viewBox || [0, 0, 1, 1];
  const svgPoint = [
    finite(viewBox[0]) + ((unrotated[0] - finite(element?.x)) / Math.max(EPSILON, finite(element?.width))) * finite(viewBox[2]),
    finite(viewBox[1]) + ((unrotated[1] - finite(element?.y)) / Math.max(EPSILON, finite(element?.height))) * finite(viewBox[3]),
  ];
  return inverseNodeTransform ? transformSvgPoint(inverseNodeTransform, svgPoint) : svgPoint;
};

export const getSvgPathWorldControls = (element, svgObject, geometryValue, nodeTransform = null) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  return geometry.anchors.map(value => {
    const point = [value.x, value.y];
    return {
      anchor: svgPointToWorld(element, svgObject, point, nodeTransform),
      in: value.in ? svgPointToWorld(element, svgObject, add(point, value.in), nodeTransform) : null,
      out: value.out ? svgPointToWorld(element, svgObject, add(point, value.out), nodeTransform) : null,
      mode: value.mode,
    };
  });
};

export const getSvgSubpathWorldAnchors = (element, svgObject, geometryValue, nodeTransform = null) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  return geometry.anchors.map(value => {
    const anchorPoint = [value.x, value.y];
    const anchorWorld = svgPointToWorld(element, svgObject, anchorPoint, nodeTransform);
    const mapVector = vector => {
      if (!vector) return null;
      const controlWorld = svgPointToWorld(element, svgObject, add(anchorPoint, vector), nodeTransform);
      return subtract(controlWorld, anchorWorld);
    };
    return {
      x: anchorWorld[0],
      y: anchorWorld[1],
      in: mapVector(value.in),
      out: mapVector(value.out),
      mode: value.mode,
    };
  });
};

export const getSvgPathWorldPoints = (element, svgObject, geometryValue, nodeTransform = null) => (
  flattenBezierGeometry(geometryValue, 0.35).map(value => svgPointToWorld(element, svgObject, value, nodeTransform))
);

export const getSvgPathWorldDetailed = (element, svgObject, geometryValue, nodeTransform = null) => (
  flattenBezierGeometryDetailed(geometryValue, 0.35).map(entry => ({
    ...entry,
    point: svgPointToWorld(element, svgObject, entry.point, nodeTransform),
  }))
);

export const getEditableSvgPathNodes = source => {
  const analysis = analyzeSvgSource(source);
  if (!analysis.valid) return [];
  return analysis.nodes.filter(node => node.tag.toLowerCase() === "path" && node.attributes.d).map(node => {
    let transform;
    let inverseTransform;
    let transformError = "";
    try {
      transform = getSvgNodeTransform(analysis, node);
      inverseTransform = invertSvgTransform(transform);
    } catch (error) {
      transformError = error?.message || "The path transform cannot be inverted.";
    }
    const collection = parseSvgPathCollection(node.attributes.d);
    const subpaths = collection.subpaths.map(subpath => transformError
      ? {
        ...subpath,
        valid: false,
        error: transformError,
        geometry: null,
      }
      : subpath
    );
    const firstEditable = subpaths.find(subpath => subpath.valid);
    return {
      node,
      subpaths,
      valid: Boolean(firstEditable),
      error: firstEditable ? "" : subpaths[0]?.error || collection.error,
      geometry: firstEditable?.geometry || null,
      transform,
      inverseTransform,
    };
  });
};
