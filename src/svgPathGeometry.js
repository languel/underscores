import {
  CUBIC_BEZIER_KIND,
  DRAWERATOR_GEOMETRY_VERSION,
  flattenBezierGeometry,
  flattenBezierGeometryDetailed,
  normalizeBezierGeometry,
} from "./bezierGeometry.js";
import { analyzeSvgSource } from "./svgObject.js";

const TOKEN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const COMMAND_ARITY = Object.freeze({
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  Z: 0,
});
const EPSILON = 1e-7;

const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];
const multiply = (value, amount) => [value[0] * amount, value[1] * amount];
const reflect = (control, center) => [
  center[0] * 2 - control[0],
  center[1] * 2 - control[1],
];

const anchor = (point, incoming = null, outgoing = null, mode = "corner") => ({
  x: point[0],
  y: point[1],
  in: incoming,
  out: outgoing,
  mode,
});

const commandTokens = source => String(source || "").match(TOKEN) || [];

const readNumbers = (tokens, index, count) => {
  const values = tokens.slice(index, index + count).map(Number);
  return values.length === count && values.every(Number.isFinite) ? values : null;
};

const makeAbsolute = (values, relative, current, command) => {
  if (!relative) return values;
  if (command === "H") return [values[0] + current[0]];
  if (command === "V") return [values[0] + current[1]];
  return values.map((value, index) => value + current[index % 2]);
};

const smoothMode = value => {
  if (!value?.in || !value?.out) return "corner";
  const cross = value.in[0] * value.out[1] - value.in[1] * value.out[0];
  const lengths = Math.hypot(...value.in) * Math.hypot(...value.out);
  return lengths > EPSILON && Math.abs(cross) / lengths < 0.015 ? "smooth" : "corner";
};

export const parseSvgPathGeometry = source => {
  const tokens = commandTokens(source);
  if (!tokens.length) return { valid: false, error: "The path has no geometry.", geometry: null };

  const anchors = [];
  let index = 0;
  let command = "";
  let current = [0, 0];
  let start = null;
  let previousCommand = "";
  let previousQuadraticControl = null;
  let closed = false;

  const addLine = end => {
    if (!anchors.length) anchors.push(anchor(current));
    anchors.push(anchor(end));
    current = end;
    previousQuadraticControl = null;
  };

  const addCubic = (control1, control2, end) => {
    if (!anchors.length) anchors.push(anchor(current));
    const startAnchor = anchors.at(-1);
    startAnchor.out = subtract(control1, current);
    const nextAnchor = anchor(end, subtract(control2, end));
    startAnchor.mode = smoothMode(startAnchor);
    anchors.push(nextAnchor);
    current = end;
    previousQuadraticControl = null;
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    if (!command) return { valid: false, error: "The SVG path is missing a command.", geometry: null };
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const arity = COMMAND_ARITY[upper];
    if (arity === undefined) {
      return {
        valid: false,
        error: upper === "A"
          ? "Arc commands must be converted to cubic curves before canvas editing."
          : `SVG path command ${upper} is not supported by the canvas editor.`,
        geometry: null,
      };
    }
    if (upper === "Z") {
      if (!start || anchors.length < 2) return { valid: false, error: "The path cannot close before it has two anchors.", geometry: null };
      closed = true;
      current = start;
      previousCommand = upper;
      command = "";
      continue;
    }

    const values = readNumbers(tokens, index, arity);
    if (!values) return { valid: false, error: `SVG path command ${upper} has incomplete coordinates.`, geometry: null };
    index += arity;
    const absolute = makeAbsolute(values, relative, current, upper);

    if (upper === "M") {
      if (start && anchors.length) {
        return { valid: false, error: "Multi-subpath SVG paths must be split before canvas editing.", geometry: null };
      }
      current = [absolute[0], absolute[1]];
      start = current;
      anchors.push(anchor(current));
      previousQuadraticControl = null;
      command = relative ? "l" : "L";
    } else if (upper === "L") {
      addLine([absolute[0], absolute[1]]);
    } else if (upper === "H") {
      addLine([absolute[0], current[1]]);
    } else if (upper === "V") {
      addLine([current[0], absolute[0]]);
    } else if (upper === "C") {
      addCubic(
        [absolute[0], absolute[1]],
        [absolute[2], absolute[3]],
        [absolute[4], absolute[5]],
      );
    } else if (upper === "S") {
      const control1 = ["C", "S"].includes(previousCommand) && anchors.at(-1)?.in
        ? reflect(add(current, anchors.at(-1).in), current)
        : current;
      addCubic(control1, [absolute[0], absolute[1]], [absolute[2], absolute[3]]);
    } else if (upper === "Q") {
      const control = [absolute[0], absolute[1]];
      const end = [absolute[2], absolute[3]];
      addCubic(
        add(current, multiply(subtract(control, current), 2 / 3)),
        add(end, multiply(subtract(control, end), 2 / 3)),
        end,
      );
      previousQuadraticControl = control;
    } else if (upper === "T") {
      const control = ["Q", "T"].includes(previousCommand) && previousQuadraticControl
        ? reflect(previousQuadraticControl, current)
        : current;
      const end = [absolute[0], absolute[1]];
      addCubic(
        add(current, multiply(subtract(control, current), 2 / 3)),
        add(end, multiply(subtract(control, end), 2 / 3)),
        end,
      );
      previousQuadraticControl = control;
    }
    previousCommand = upper;
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

export const splitSvgPathSubpathSources = source => {
  const authored = String(source || "").trim();
  const starts = [...authored.matchAll(/[Mm]/g)].map(match => match.index);
  if (!starts.length) return authored ? [authored] : [];
  return starts.map((start, index) => authored.slice(start, starts[index + 1] ?? authored.length).trim()).filter(Boolean);
};

export const parseSvgPathCollection = source => {
  const sources = splitSvgPathSubpathSources(source);
  if (!sources.length) return { valid: false, error: "The path has no geometry.", subpaths: [] };
  const subpaths = sources.map((subpathSource, index) => ({
    index,
    source: subpathSource,
    ...parseSvgPathGeometry(subpathSource),
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
    let current = node;
    while (current) {
      if (current.attributes?.transform) return null;
      current = Number.isInteger(current.parentIndex) ? nodesByIndex.get(current.parentIndex) : null;
    }
    return primitiveNodeBounds(node);
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

export const svgPointToWorld = (element, svgObject, value) => {
  const viewBox = svgObject?.viewBox || [0, 0, 1, 1];
  const width = Math.max(EPSILON, finite(viewBox[2]));
  const height = Math.max(EPSILON, finite(viewBox[3]));
  const point = [
    finite(element?.x) + ((finite(value?.[0]) - finite(viewBox[0])) / width) * finite(element?.width),
    finite(element?.y) + ((finite(value?.[1]) - finite(viewBox[1])) / height) * finite(element?.height),
  ];
  return rotate(point, [
    finite(element?.x) + finite(element?.width) / 2,
    finite(element?.y) + finite(element?.height) / 2,
  ], finite(element?.angle));
};

export const worldPointToSvg = (element, svgObject, value) => {
  const center = [
    finite(element?.x) + finite(element?.width) / 2,
    finite(element?.y) + finite(element?.height) / 2,
  ];
  const unrotated = rotate(value, center, -finite(element?.angle));
  const viewBox = svgObject?.viewBox || [0, 0, 1, 1];
  return [
    finite(viewBox[0]) + ((unrotated[0] - finite(element?.x)) / Math.max(EPSILON, finite(element?.width))) * finite(viewBox[2]),
    finite(viewBox[1]) + ((unrotated[1] - finite(element?.y)) / Math.max(EPSILON, finite(element?.height))) * finite(viewBox[3]),
  ];
};

export const getSvgPathWorldControls = (element, svgObject, geometryValue) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  return geometry.anchors.map(value => {
    const point = [value.x, value.y];
    return {
      anchor: svgPointToWorld(element, svgObject, point),
      in: value.in ? svgPointToWorld(element, svgObject, add(point, value.in)) : null,
      out: value.out ? svgPointToWorld(element, svgObject, add(point, value.out)) : null,
      mode: value.mode,
    };
  });
};

export const getSvgSubpathWorldAnchors = (element, svgObject, geometryValue) => {
  const geometry = normalizeBezierGeometry(geometryValue);
  return geometry.anchors.map(value => {
    const anchorPoint = [value.x, value.y];
    const anchorWorld = svgPointToWorld(element, svgObject, anchorPoint);
    const mapVector = vector => {
      if (!vector) return null;
      const controlWorld = svgPointToWorld(element, svgObject, add(anchorPoint, vector));
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

export const getSvgPathWorldPoints = (element, svgObject, geometryValue) => (
  flattenBezierGeometry(geometryValue, 0.35).map(value => svgPointToWorld(element, svgObject, value))
);

export const getSvgPathWorldDetailed = (element, svgObject, geometryValue) => (
  flattenBezierGeometryDetailed(geometryValue, 0.35).map(entry => ({
    ...entry,
    point: svgPointToWorld(element, svgObject, entry.point),
  }))
);

export const getEditableSvgPathNodes = source => {
  const analysis = analyzeSvgSource(source);
  if (!analysis.valid) return [];
  const byIndex = new Map(analysis.nodes.map(node => [node.index, node]));
  return analysis.nodes.filter(node => node.tag.toLowerCase() === "path" && node.attributes.d).map(node => {
    let current = node;
    let transformed = false;
    while (current) {
      if (current.attributes?.transform) transformed = true;
      current = Number.isInteger(current.parentIndex) ? byIndex.get(current.parentIndex) : null;
    }
    const collection = parseSvgPathCollection(node.attributes.d);
    const subpaths = collection.subpaths.map(subpath => transformed
      ? {
        ...subpath,
        valid: false,
        error: "Transformed SVG paths are not editable on the canvas yet.",
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
    };
  });
};
