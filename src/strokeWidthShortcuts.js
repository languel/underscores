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
