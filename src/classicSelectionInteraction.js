const LINEAR_CLASSIC_TYPES = new Set(["freedraw", "line", "arrow"]);

const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const localBoundsForElement = element => {
  const points = Array.isArray(element?.points) ? element.points : [];
  const xs = [0, numberOr(element?.width), ...points.map(point => numberOr(point?.[0]))];
  const ys = [0, numberOr(element?.height), ...points.map(point => numberOr(point?.[1]))];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const toLocalPoint = (element, point, bounds = localBoundsForElement(element)) => {
  const center = [
    numberOr(element?.x) + (bounds.minX + bounds.maxX) / 2,
    numberOr(element?.y) + (bounds.minY + bounds.maxY) / 2,
  ];
  const angle = -(numberOr(element?.angle));
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = numberOr(point?.[0]) - center[0];
  const dy = numberOr(point?.[1]) - center[1];
  return [
    center[0] + dx * cosine - dy * sine - numberOr(element?.x),
    center[1] + dx * sine + dy * cosine - numberOr(element?.y),
  ];
};

const distanceToSegment = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dy * t));
};

const pointNearPath = (element, point, threshold, bounds) => {
  const points = Array.isArray(element?.points) ? element.points : [];
  if (points.length < 2) return false;
  const local = toLocalPoint(element, point, bounds);
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(local, points[index - 1], points[index]) <= threshold) return true;
  }
  return false;
};

export const isClassicLinearElement = (element, {
  isExcluded = () => false,
} = {}) => Boolean(
  element
  && !element.isDeleted
  && LINEAR_CLASSIC_TYPES.has(element.type)
  && !isExcluded(element),
);

/**
 * Return a selected classic linear element whose empty bounding-box interior
 * can safely begin a move gesture. Native Excalidraw owns the path itself,
 * resize handles, and all specialized overlays; this fallback only fills the
 * otherwise confusing empty interior of a single selected freehand/line.
 */
export const getClassicSelectionDragCandidate = ({
  elements = [],
  selectedElementIds = {},
  point = [0, 0],
  zoom = 1,
  edgePaddingPx = 12,
  pathPaddingPx = 6,
  isExcluded,
} = {}) => {
  const selected = elements.filter(element => selectedElementIds?.[element.id] && !element.isDeleted);
  if (selected.length !== 1) return null;
  const element = selected[0];
  if (!isClassicLinearElement(element, { isExcluded })) return null;
  const bounds = localBoundsForElement(element);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  if (spanX <= 0 || spanY <= 0) return null;
  const local = toLocalPoint(element, point, bounds);
  const edgePadding = Math.max(0, numberOr(edgePaddingPx, 12)) / Math.max(0.01, numberOr(zoom, 1));
  if (
    local[0] < bounds.minX + edgePadding
    || local[0] > bounds.maxX - edgePadding
    || local[1] < bounds.minY + edgePadding
    || local[1] > bounds.maxY - edgePadding
  ) return null;
  const pathPadding = Math.max(0, numberOr(pathPaddingPx, 6)) / Math.max(0.01, numberOr(zoom, 1));
  if (pointNearPath(element, point, Math.max(pathPadding, numberOr(element.strokeWidth, 1) / 2), bounds)) return null;
  return { element, bounds, localPoint: local };
};

export const classicSelectionLocalBounds = localBoundsForElement;
export const classicSelectionPointToLocal = toLocalPoint;
