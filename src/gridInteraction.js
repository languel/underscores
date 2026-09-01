export const GRID_INTERACTION_DRAG_THRESHOLD_PX = 3;

export const createGridInteractionState = (pointerStart = null) => ({
  moving: false,
  resizing: false,
  pointEditing: false,
  pointIndices: null,
  pointerStart: Array.isArray(pointerStart) ? [Number(pointerStart[0]) || 0, Number(pointerStart[1]) || 0] : null,
  moved: false,
});

export const updateGridInteractionMovement = (
  interaction,
  { clientX, clientY, buttons } = {},
  threshold = GRID_INTERACTION_DRAG_THRESHOLD_PX,
) => {
  if (!interaction || interaction.moved || buttons !== 1 || !interaction.pointerStart) return Boolean(interaction?.moved);
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.hypot(x - interaction.pointerStart[0], y - interaction.pointerStart[1]) >= threshold) {
    interaction.moved = true;
  }
  return interaction.moved;
};
