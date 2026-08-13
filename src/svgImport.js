const NUMBER = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
const PATH_TOKEN = new RegExp(`([a-zA-Z])|(${NUMBER})`, "g");
const TAG_TOKEN = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
const ATTRIBUTE = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const UNDERSCORE_SVG_METADATA_ID = "underscore-editable-elements";
const UNDERSCORE_SVG_METADATA_VERSION = 1;

const emptyStyle = { strokeColor: null, backgroundColor: "transparent", strokeWidth: 2, opacity: 100 };

const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const parseAttributes = source => {
  const attributes = {};
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(source))) attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  return attributes;
};

const parseStyleAttribute = source => Object.fromEntries(String(source || "").split(";").map(part => {
  const index = part.indexOf(":");
  return index < 0 ? [] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
}).filter(pair => pair.length));

const resolveStyle = (inherited, attributes) => {
  const inline = parseStyleAttribute(attributes.style);
  const value = key => attributes[key] ?? inline[key];
  const stroke = value("stroke");
  const fill = value("fill");
  const strokeWidth = finite(value("stroke-width"));
  const opacity = finite(value("opacity"));
  const strokeOpacity = finite(value("stroke-opacity"));
  const fillOpacity = finite(value("fill-opacity"));
  const strokeColor = stroke === "none" ? "transparent" : (stroke || inherited.strokeColor || null);
  const backgroundColor = fill === "none" ? "transparent" : (fill || inherited.backgroundColor || "transparent");
  return {
    // Leave absent strokes unresolved so Underscore can use the active theme's
    // foreground color instead of importing a nearly invisible light-mode default.
    strokeColor,
    backgroundColor,
    strokeWidth: Math.max(1, strokeWidth ?? inherited.strokeWidth ?? 2),
    opacity: clamp(Math.round((opacity ?? 1) * (strokeOpacity ?? 1) * 100), 0, 100),
    fillOpacity: clamp(Math.round((opacity ?? 1) * (fillOpacity ?? 1) * 100), 0, 100),
    ...(backgroundColor !== "transparent" ? { fillStyle: "solid" } : {}),
  };
};

const identity = () => [1, 0, 0, 1, 0, 0];
const multiply = (left, right) => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];
const applyTransform = (matrix, point) => [
  matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
  matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
];

const parseTransform = source => {
  const value = String(source || "");
  const command = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let matrix = identity();
  let match;
  while ((match = command.exec(value))) {
    const values = match[2].match(new RegExp(NUMBER, "g"))?.map(Number) || [];
    let next = identity();
    if (match[1] === "matrix" && values.length >= 6) next = values.slice(0, 6);
    if (match[1] === "translate") next = [1, 0, 0, 1, values[0] || 0, values[1] || 0];
    if (match[1] === "scale") next = [values[0] ?? 1, 0, 0, values[1] ?? values[0] ?? 1, 0, 0];
    if (match[1] === "rotate" && values.length) {
      const radians = values[0] * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotate = [cos, sin, -sin, cos, 0, 0];
      if (values.length >= 3) next = multiply(multiply([1, 0, 0, 1, values[1], values[2]], rotate), [1, 0, 0, 1, -values[1], -values[2]]);
      else next = rotate;
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
};

const cubicPoint = (from, c1, c2, to, t) => {
  const inverse = 1 - t;
  return [
    inverse ** 3 * from[0] + 3 * inverse ** 2 * t * c1[0] + 3 * inverse * t ** 2 * c2[0] + t ** 3 * to[0],
    inverse ** 3 * from[1] + 3 * inverse ** 2 * t * c1[1] + 3 * inverse * t ** 2 * c2[1] + t ** 3 * to[1],
  ];
};
const quadraticPoint = (from, control, to, t) => {
  const inverse = 1 - t;
  return [inverse ** 2 * from[0] + 2 * inverse * t * control[0] + t ** 2 * to[0], inverse ** 2 * from[1] + 2 * inverse * t * control[1] + t ** 2 * to[1]];
};
const addCurve = (points, evaluate) => {
  for (let step = 1; step <= 12; step += 1) points.push(evaluate(step / 12));
};

const tokenizePath = source => {
  const tokens = [];
  PATH_TOKEN.lastIndex = 0;
  let match;
  while ((match = PATH_TOKEN.exec(String(source || "")))) tokens.push(match[1] || Number(match[2]));
  return tokens;
};

export const parseSvgPath = source => {
  const tokens = tokenizePath(source);
  const paths = [];
  let index = 0;
  let command = null;
  let current = [0, 0];
  let subpathStart = [0, 0];
  let points = null;
  let previousControl = null;
  const hasNumbers = count => tokens.slice(index, index + count).every(value => typeof value === "number");
  const coordinate = (x, y, relative) => relative ? [current[0] + x, current[1] + y] : [x, y];
  const finish = () => {
    if (points?.length >= 2) paths.push(points);
    points = null;
  };
  while (index < tokens.length) {
    if (typeof tokens[index] === "string") command = tokens[index++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const type = command.toUpperCase();
    if (type === "Z") {
      if (points?.length && (current[0] !== subpathStart[0] || current[1] !== subpathStart[1])) points.push([...subpathStart]);
      current = [...subpathStart];
      previousControl = null;
      command = null;
      continue;
    }
    if (type === "M") {
      if (!hasNumbers(2)) break;
      finish();
      current = coordinate(tokens[index++], tokens[index++], relative);
      subpathStart = [...current];
      points = [[...current]];
      command = relative ? "l" : "L";
      previousControl = null;
      continue;
    }
    if (type === "L" && hasNumbers(2)) {
      current = coordinate(tokens[index++], tokens[index++], relative);
      points?.push([...current]); previousControl = null; continue;
    }
    if (type === "H" && hasNumbers(1)) {
      current = [relative ? current[0] + tokens[index++] : tokens[index++], current[1]];
      points?.push([...current]); previousControl = null; continue;
    }
    if (type === "V" && hasNumbers(1)) {
      current = [current[0], relative ? current[1] + tokens[index++] : tokens[index++]];
      points?.push([...current]); previousControl = null; continue;
    }
    if (type === "C" && hasNumbers(6)) {
      const from = [...current];
      const c1 = coordinate(tokens[index++], tokens[index++], relative);
      const c2 = coordinate(tokens[index++], tokens[index++], relative);
      current = coordinate(tokens[index++], tokens[index++], relative);
      addCurve(points, t => cubicPoint(from, c1, c2, current, t)); previousControl = c2; continue;
    }
    if (type === "S" && hasNumbers(4)) {
      const from = [...current];
      const c1 = previousControl ? [2 * current[0] - previousControl[0], 2 * current[1] - previousControl[1]] : [...current];
      const c2 = coordinate(tokens[index++], tokens[index++], relative);
      current = coordinate(tokens[index++], tokens[index++], relative);
      addCurve(points, t => cubicPoint(from, c1, c2, current, t)); previousControl = c2; continue;
    }
    if (type === "Q" && hasNumbers(4)) {
      const from = [...current];
      const control = coordinate(tokens[index++], tokens[index++], relative);
      current = coordinate(tokens[index++], tokens[index++], relative);
      addCurve(points, t => quadraticPoint(from, control, current, t)); previousControl = control; continue;
    }
    if (type === "T" && hasNumbers(2)) {
      const from = [...current];
      const control = previousControl ? [2 * current[0] - previousControl[0], 2 * current[1] - previousControl[1]] : [...current];
      current = coordinate(tokens[index++], tokens[index++], relative);
      addCurve(points, t => quadraticPoint(from, control, current, t)); previousControl = control; continue;
    }
    if (type === "A" && hasNumbers(7)) {
      // Arc import keeps its endpoints. Circles and ellipses are imported as
      // native shapes; this fallback retains arbitrary arc paths as editable lines.
      index += 5;
      current = coordinate(tokens[index++], tokens[index++], relative);
      points?.push([...current]); previousControl = null; continue;
    }
    break;
  }
  finish();
  return paths;
};

const rectangleSpec = (attributes, style, transform) => {
  const x = finite(attributes.x) || 0;
  const y = finite(attributes.y) || 0;
  const width = finite(attributes.width);
  const height = finite(attributes.height);
  if (!(width > 0 && height > 0)) return null;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map(point => applyTransform(transform, point));
  const minX = Math.min(...corners.map(point => point[0]));
  const minY = Math.min(...corners.map(point => point[1]));
  const maxX = Math.max(...corners.map(point => point[0]));
  const maxY = Math.max(...corners.map(point => point[1]));
  return { type: "rectangle", x: minX, y: minY, width: maxX - minX, height: maxY - minY, ...style };
};

const ellipseSpec = (attributes, style, transform, circle = false) => {
  const cx = finite(attributes.cx) ?? ((finite(attributes.x) || 0) + (finite(attributes.width) || 0) / 2);
  const cy = finite(attributes.cy) ?? ((finite(attributes.y) || 0) + (finite(attributes.height) || 0) / 2);
  const rx = finite(circle ? attributes.r : attributes.rx) ?? (finite(attributes.width) || 0) / 2;
  const ry = finite(circle ? attributes.r : attributes.ry) ?? (finite(attributes.height) || 0) / 2;
  if (!(rx > 0 && ry > 0)) return null;
  const corners = [[cx - rx, cy - ry], [cx + rx, cy + ry]].map(point => applyTransform(transform, point));
  const minX = Math.min(...corners.map(point => point[0]));
  const minY = Math.min(...corners.map(point => point[1]));
  const maxX = Math.max(...corners.map(point => point[0]));
  const maxY = Math.max(...corners.map(point => point[1]));
  return { type: "ellipse", x: minX, y: minY, width: maxX - minX, height: maxY - minY, ...style };
};

const polySpec = (source, style, transform, closed = false) => {
  const numbers = String(source || "").match(new RegExp(NUMBER, "g"))?.map(Number) || [];
  const points = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) points.push(applyTransform(transform, [numbers[index], numbers[index + 1]]));
  if (closed && points.length > 2) points.push([...points[0]]);
  if (points.length < 2) return null;
  return { type: "freedraw", points, ...editablePathStyle(style) };
};

// SVG paths become Excalidraw freedraw elements. Unlike SVG, freedraw has no
// faithful fill model for compound/overlapping paths and simulated pressure
// changes its apparent width. Keep these imports as constant-width editable
// outlines; native rect/circle/ellipse imports retain their real fills.
const editablePathStyle = style => {
  const { fillStyle: _fillStyle, ...withoutFillStyle } = style;
  const strokeColor = (style.strokeColor === "transparent" || !style.strokeColor)
      && style.backgroundColor !== "transparent"
    ? style.backgroundColor
    : style.strokeColor;
  return {
    ...withoutFillStyle,
    strokeColor,
    backgroundColor: "transparent",
    simulatePressure: false,
  };
};

const pathSpecs = (source, style, transform) => parseSvgPath(source).map(points => {
  const transformed = points.map(point => applyTransform(transform, point));
  return {
    type: points.length === 2 ? "line" : "freedraw",
    ...(points.length === 2
      ? { x: transformed[0][0], y: transformed[0][1], x2: transformed[1][0], y2: transformed[1][1] }
      : { points: transformed }),
    ...editablePathStyle(style),
  };
});

const inspectSvg = source => {
  const value = String(source || "");
  const direct = value.match(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/i)?.[0];
  return direct || (value.trim().startsWith("<svg") ? value.trim() : null);
};

export const extractSvgMarkup = input => inspectSvg(input);

// SVG only describes the rendered outline of a pressure-sensitive Excalidraw
// freehand stroke. Preserve the original elements in standards-compliant SVG
// metadata when Underscore copies a selection, so a later Underscore paste can
// restore the actual editable points, pressures, and score metadata exactly.
// Other SVG consumers simply ignore <metadata> and render the regular export.
export const attachUnderscoreSvgMetadata = (input, elements) => {
  const svg = cleanSvgMarkup(input);
  const source = Array.isArray(elements) ? elements : [];
  if (!svg || source.length === 0) return svg;
  const payload = encodeURIComponent(JSON.stringify({
    version: UNDERSCORE_SVG_METADATA_VERSION,
    elements: source,
  }));
  return svg.replace(/<\/svg\s*>\s*$/i, `<metadata id="${UNDERSCORE_SVG_METADATA_ID}" data-encoding="uri">${payload}</metadata></svg>`);
};

export const extractUnderscoreSvgMetadata = input => {
  const svg = extractSvgMarkup(input);
  if (!svg) return null;
  const metadata = /<metadata\b([^>]*)>([\s\S]*?)<\/metadata\s*>/gi;
  let match;
  while ((match = metadata.exec(svg))) {
    const attributes = parseAttributes(match[1]);
    if (attributes.id !== UNDERSCORE_SVG_METADATA_ID || attributes["data-encoding"] !== "uri") continue;
    try {
      const payload = JSON.parse(decodeURIComponent(match[2].trim()));
      if (payload?.version !== UNDERSCORE_SVG_METADATA_VERSION || !Array.isArray(payload.elements)) return null;
      const elements = payload.elements.filter(element => element && typeof element === "object" && typeof element.id === "string" && typeof element.type === "string");
      return elements.length > 0 ? { version: payload.version, elements } : null;
    } catch {
      return null;
    }
  }
  return null;
};

// Excalidraw and tldraw add remote @font-face styles to copied SVG even when
// a selection contains no text. Keep definitions for text SVG, but remove
// that baggage from geometry-only exchange and discard empty defs afterwards.
export const cleanSvgMarkup = input => {
  const source = extractSvgMarkup(input);
  if (!source) return null;
  let cleaned = source.replace(/<!--[^]*?-->/g, "");
  if (!/<text\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, style => (
      /@font-face|font-family/i.test(style) ? "" : style
    ));
    cleaned = cleaned.replace(/<defs\b[^>]*>\s*<\/defs\s*>/gi, "");
  }
  return cleaned.trim();
};

export const getSvgDrawableBounds = specs => {
  const points = [];
  for (const spec of specs || []) {
    if (Array.isArray(spec.points)) points.push(...spec.points);
    else if (Number.isFinite(spec.x) && Number.isFinite(spec.y)) {
      points.push([spec.x, spec.y], [spec.x + (Number(spec.width) || 0), spec.y + (Number(spec.height) || 0)]);
      if (Number.isFinite(spec.x2) && Number.isFinite(spec.y2)) points.push([spec.x2, spec.y2]);
    }
  }
  if (!points.length) return null;
  const minX = Math.min(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1]));
  const maxX = Math.max(...points.map(point => point[0]));
  const maxY = Math.max(...points.map(point => point[1]));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

export const offsetSvgDrawableSpecs = (specs, dx, dy) => (specs || []).map(spec => ({
  ...spec,
  ...(Number.isFinite(spec.x) ? { x: spec.x + dx } : {}),
  ...(Number.isFinite(spec.y) ? { y: spec.y + dy } : {}),
  ...(Number.isFinite(spec.x2) ? { x2: spec.x2 + dx } : {}),
  ...(Number.isFinite(spec.y2) ? { y2: spec.y2 + dy } : {}),
  ...(Array.isArray(spec.points) ? { points: spec.points.map(point => [point[0] + dx, point[1] + dy]) } : {}),
}));

export const parseSvgToDrawableSpecs = input => {
  const source = cleanSvgMarkup(input);
  if (!source) return [];
  const specs = [];
  const stack = [{ transform: identity(), style: emptyStyle }];
  TAG_TOKEN.lastIndex = 0;
  let match;
  while ((match = TAG_TOKEN.exec(source))) {
    const raw = match[0];
    const name = match[1].toLowerCase();
    const closing = raw.startsWith("</");
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const attributes = parseAttributes(match[2]);
    const parent = stack.at(-1);
    const transform = multiply(parent.transform, parseTransform(attributes.transform));
    const style = resolveStyle(parent.style, attributes);
    if (name === "path") specs.push(...pathSpecs(attributes.d, style, transform));
    if (name === "line") {
      const x1 = finite(attributes.x1); const y1 = finite(attributes.y1); const x2 = finite(attributes.x2); const y2 = finite(attributes.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        const start = applyTransform(transform, [x1, y1]); const end = applyTransform(transform, [x2, y2]);
        specs.push({ type: "line", x: start[0], y: start[1], x2: end[0], y2: end[1], ...style });
      }
    }
    if (name === "polyline") { const spec = polySpec(attributes.points, style, transform); if (spec) specs.push(spec); }
    if (name === "polygon") { const spec = polySpec(attributes.points, style, transform, true); if (spec) specs.push(spec); }
    if (name === "rect") { const spec = rectangleSpec(attributes, style, transform); if (spec) specs.push(spec); }
    if (name === "circle" || name === "ellipse") { const spec = ellipseSpec(attributes, style, transform, name === "circle"); if (spec) specs.push(spec); }
    if (!raw.endsWith("/>") && ["svg", "g", "a"].includes(name)) stack.push({ transform, style });
  }
  return specs.filter(spec => spec.type && (spec.strokeColor !== "transparent" || spec.backgroundColor !== "transparent"));
};
