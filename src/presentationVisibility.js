export const isElementVisibleInPresentation = element => (
  element?.customData?.presentationVisible !== false
);

export const isElementPresentationMasked = element => (
  element?.customData?.presentationMaskActive === true
);

// Excalidraw clamps camera zoom at 0.1. Asking scrollToContent() to fit bounds
// that are still larger than the viewport at that zoom recenters the camera on
// an impossible span and can move the authored scene completely offscreen.
export const canFitPresentationBounds = (bounds, viewport, minimumZoom = 0.1) => {
  if (!Array.isArray(bounds) || bounds.length < 4) return false;
  const [minX, minY, maxX, maxY] = bounds.map(Number);
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  const zoom = Number(minimumZoom);
  if (![minX, minY, maxX, maxY, width, height, zoom].every(Number.isFinite)) return false;
  if (width <= 0 || height <= 0 || zoom <= 0) return false;
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  return Math.min(width / boundsWidth, height / boundsHeight) >= zoom;
};

const withRevision = (element, patch, now) => ({
  ...element,
  ...patch,
  version: (element.version || 0) + 1,
  versionNonce: Math.floor(Math.random() * 0x7fffffff),
  updated: now,
});

export const applyPresentationVisibilityToElement = (element, presentationMode, now = Date.now()) => {
  if (!element || element.isDeleted) return element;
  const customData = { ...(element.customData || {}) };
  const masked = customData.presentationMaskActive === true;
  const shouldMask = presentationMode && !isElementVisibleInPresentation(element);

  if (shouldMask && !masked) {
    customData.presentationMaskActive = true;
    customData.presentationSavedOpacity = element.opacity ?? 100;
    return withRevision(element, { customData, opacity: 0 }, now);
  }

  if (!shouldMask && masked) {
    const opacity = customData.presentationSavedOpacity ?? 100;
    delete customData.presentationMaskActive;
    delete customData.presentationSavedOpacity;
    return withRevision(element, { customData, opacity }, now);
  }

  return element;
};

export const applyPresentationVisibility = (elements, presentationMode, now = Date.now()) => {
  let changed = false;
  const next = elements.map(element => {
    const result = applyPresentationVisibilityToElement(element, presentationMode, now);
    if (result !== element) changed = true;
    return result;
  });
  return changed ? next : elements;
};
