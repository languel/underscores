export const isElementVisibleInPresentation = element => (
  element?.customData?.presentationVisible !== false
);

export const isElementPresentationMasked = element => (
  element?.customData?.presentationMaskActive === true
);

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
