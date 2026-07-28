// Excalidraw stores its scene in back-to-front paint order. Drawerator keeps
// that array as the single source of truth for native canvas, Outliner, and
// overlay layer ordering.
export const getSceneLayerElements = (elements = []) => (
  Array.isArray(elements) ? elements.filter(element => element && !element.isDeleted) : []
);

// The Outliner reads naturally from front to back, while the scene array paints
// from back to front.
export const getOutlinerLayerElements = (elements = []) => (
  [...getSceneLayerElements(elements)].reverse()
);

export const reorderSceneElements = (
  elements = [],
  movedId,
  anchorId,
  placement = "front",
) => {
  if (!Array.isArray(elements) || !movedId || !anchorId || movedId === anchorId) {
    return elements;
  }

  const movedIndex = elements.findIndex(element => element?.id === movedId);
  const hasAnchor = elements.some(element => element?.id === anchorId);
  if (movedIndex < 0 || !hasAnchor) return elements;

  const next = [...elements];
  const [moved] = next.splice(movedIndex, 1);
  const nextAnchorIndex = next.findIndex(element => element?.id === anchorId);
  if (nextAnchorIndex < 0) return elements;

  // In the reverse Outliner view, dropping above means in front and dropping
  // below means behind. The scene array itself is back-to-front.
  next.splice(placement === "back" ? nextAnchorIndex : nextAnchorIndex + 1, 0, moved);

  return next.every((element, index) => element === elements[index]) ? elements : next;
};
