import {
  createBezierHostGeometry,
  getBezierWorldAnchors,
  getBezierWorldPath,
  hasCubicBezierGeometry,
  normalizeBezierGeometry,
} from "./bezierGeometry.js";
import { snapPointToGrid } from "./gridSystem.js";

const pointWithMetadata = (point, x, y) => {
  const next = [x, y];
  for (const key of Object.keys(point || {})) {
    if (key !== "0" && key !== "1") next[key] = point[key];
  }
  return next;
};

const versioned = element => ({
  ...element,
  version: (element.version || 0) + 1,
  versionNonce: Math.floor(Math.random() * 0x7fffffff),
  updated: Date.now(),
});

const absolutePoints = element => (element.points || []).map(point =>
  pointWithMetadata(point, element.x + point[0], element.y + point[1]));

const samePoint = (a, b) => Math.abs((a?.[0] || 0) - (b?.[0] || 0)) < 1e-8 && Math.abs((a?.[1] || 0) - (b?.[1] || 0)) < 1e-8;

const reframeLinearElement = (element, points) => {
  if (points.length < 2) return element;
  const startX = element.type === "freedraw" ? Math.min(...points.map(point => point[0])) : points[0][0];
  const startY = element.type === "freedraw" ? Math.min(...points.map(point => point[1])) : points[0][1];
  const relative = points.map(point => pointWithMetadata(point, point[0] - startX, point[1] - startY));
  const xs = relative.map(point => point[0]);
  const ys = relative.map(point => point[1]);
  const next = versioned({
    ...element,
    x: startX,
    y: startY,
    points: relative,
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
    customData: {
      ...(element.customData || {}),
      ...((element.customData?.originalPoints || element.customData?.modifiers?.length)
        ? { originalPoints: points.map(point => pointWithMetadata(point, point[0], point[1])) }
        : {}),
    },
  });
  if (element.type === "freedraw") {
    next.pressures = points.map((point, index) => Number.isFinite(Number(point.pressure))
      ? Number(point.pressure)
      : Number.isFinite(Number(element.pressures?.[index])) ? Number(element.pressures[index]) : 0.5);
    next.simulatePressure = false;
  }
  return next;
};

const snapConfigured = (grid, point, options) => snapPointToGrid(grid, point, {
  mode: options?.mode || "hard",
  resolution: options?.resolution,
  axes: options?.axes,
  zoom: options?.zoom,
}).point;

const quantizeBezier = (element, grid, options) => {
  const geometry = normalizeBezierGeometry(element.customData?.underscoresGeometry);
  const controls = getBezierWorldAnchors(element);
  const anchors = controls.map(control => {
    const anchor = snapConfigured(grid, control.anchor, options);
    return {
      x: anchor[0],
      y: anchor[1],
      in: control.in ? [control.in[0] - control.anchor[0], control.in[1] - control.anchor[1]] : null,
      out: control.out ? [control.out[0] - control.anchor[0], control.out[1] - control.anchor[1]] : null,
      mode: control.mode,
    };
  });
  if (anchors.every((anchor, index) => samePoint([anchor.x, anchor.y], controls[index].anchor))) return element;
  const host = createBezierHostGeometry(anchors, geometry.closed);
  const nextShape = {
    ...element,
    x: host.bounds.x,
    y: host.bounds.y,
    width: host.bounds.width,
    height: host.bounds.height,
    angle: 0,
    points: host.points,
    customData: {
      ...(element.customData || {}),
      underscoresGeometry: host.geometry,
    },
  };
  const path = getBezierWorldPath(nextShape);
  if (element.customData?.originalPoints || element.customData?.modifiers?.length) {
    nextShape.customData.originalPoints = path.map(point => [point[0], point[1]]);
  }
  return versioned(nextShape);
};

export const translateGridElement = (element, delta) => {
  if (!element || element.isDeleted || (!delta?.[0] && !delta?.[1])) return element;
  const dx = Number(delta[0]) || 0;
  const dy = Number(delta[1]) || 0;
  const originalPoints = element.customData?.originalPoints;
  return versioned({
    ...element,
    x: element.x + dx,
    y: element.y + dy,
    customData: {
      ...(element.customData || {}),
      ...(Array.isArray(originalPoints) ? {
        originalPoints: originalPoints.map(point => pointWithMetadata(point, point[0] + dx, point[1] + dy)),
      } : {}),
    },
  });
};

export const quantizeGridElement = (element, grid, options = {}) => {
  if (!element || element.isDeleted) return element;
  if (hasCubicBezierGeometry(element)) return quantizeBezier(element, grid, options);
  if (Array.isArray(element.points) && element.points.length >= 2) {
    const originalSource = absolutePoints(element);
    const source = Array.isArray(options.worldPoints) && options.worldPoints.length >= 2
      ? options.worldPoints.map((point, index) => pointWithMetadata(originalSource[index] || point, Number(point[0]), Number(point[1])))
      : originalSource;
    if (Array.isArray(options.lastPoint) && element.type === "line") {
      const lastIndex = source.length - 1;
      source[lastIndex] = pointWithMetadata(source[lastIndex], Number(options.lastPoint[0]), Number(options.lastPoint[1]));
    }
    const pointIndices = Array.isArray(options.pointIndices) ? new Set(options.pointIndices) : null;
    const snapped = source.map((point, index) => !pointIndices || pointIndices.has(index)
      ? snapConfigured(grid, point, options)
      : pointWithMetadata(point, point[0], point[1]));
    const matchesAuthoredGeometry = snapped.length === originalSource.length &&
      snapped.every((point, index) => samePoint(point, originalSource[index]));
    return matchesAuthoredGeometry ? element : reframeLinearElement(element, snapped);
  }
  const first = snapConfigured(grid, [element.x, element.y], options);
  if (Math.abs(element.angle || 0) > 1e-8 || !Number.isFinite(element.width) || !Number.isFinite(element.height)) {
    return translateGridElement(element, [first[0] - element.x, first[1] - element.y]);
  }
  const opposite = snapConfigured(grid, [element.x + element.width, element.y + element.height], options);
  if (samePoint(first, [element.x, element.y]) && samePoint(opposite, [element.x + element.width, element.y + element.height])) return element;
  return versioned({
    ...element,
    x: first[0],
    y: first[1],
    width: Math.max(1, opposite[0] - first[0]),
    height: Math.max(1, opposite[1] - first[1]),
  });
};

export const sharedGridSnapDelta = (elements, grid, options = {}) => {
  const active = (elements || []).filter(element => element && !element.isDeleted);
  if (!active.length) return [0, 0];
  const anchor = [Math.min(...active.map(element => element.x)), Math.min(...active.map(element => element.y))];
  const snapped = snapPointToGrid(grid, anchor, options);
  return snapped.snapped ? snapped.delta : [0, 0];
};
