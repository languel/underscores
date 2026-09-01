export const STROKE_WIDTH_MIN = 0.1;
export const STROKE_WIDTH_MAX = 20;
export const STROKE_WIDTH_STEP = 1;
export const STROKE_WIDTH_FINE_STEP = STROKE_WIDTH_STEP / 10;

export const getStrokeWidthShortcut = event => {
  if (!event || event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.code === "BracketLeft") return { direction: -1, fine: Boolean(event.shiftKey) };
  if (event.code === "BracketRight") return { direction: 1, fine: Boolean(event.shiftKey) };
  return null;
};

export const stepStrokeWidth = (value, direction, fine = false) => {
  const current = Number.isFinite(Number(value)) ? Number(value) : 1;
  const step = fine ? STROKE_WIDTH_FINE_STEP : STROKE_WIDTH_STEP;
  const next = Math.min(STROKE_WIDTH_MAX, Math.max(STROKE_WIDTH_MIN, current + Math.sign(direction) * step));
  return Math.round(next * 10) / 10;
};

// Excalidraw tracks revisions per element. Updating a selected freehand or
// line must therefore produce a fresh element version rather than treating a
// style change as an app-state-only preference. This also keeps collaborative
// and grid-quantized strokes from being reconciled against a stale snapshot.
export const applyStrokeWidthShortcut = ({
  elements = [],
  selectedElementIds = {},
  currentItemStrokeWidth = 1,
  direction = 1,
  fine = false,
  now = Date.now(),
  createVersionNonce = () => Math.floor(Math.random() * 0x7fffffff),
} = {}) => {
  const selectedIds = new Set(Object.entries(selectedElementIds)
    .filter(([, selected]) => selected)
    .map(([id]) => id));
  const targets = elements.filter(element => (
    selectedIds.has(element.id)
    && !element.isDeleted
    && ["freedraw", "line"].includes(element.type)
  ));

  if (!targets.length) {
    return {
      changed: true,
      currentItemStrokeWidth: stepStrokeWidth(currentItemStrokeWidth, direction, fine),
      elements,
    };
  }

  const widthById = new Map(targets.map(element => [
    element.id,
    stepStrokeWidth(element.strokeWidth, direction, fine),
  ]));
  return {
    changed: true,
    currentItemStrokeWidth: widthById.get(targets[0].id),
    elements: elements.map(element => {
      const strokeWidth = widthById.get(element.id);
      if (strokeWidth === undefined) return element;
      return {
        ...element,
        strokeWidth,
        version: (Number(element.version) || 0) + 1,
        versionNonce: createVersionNonce(),
        updated: now,
      };
    }),
  };
};
