const randomNonce = () => Math.floor(Math.random() * 0x7fffffff);

export const createBakedImageFile = ({ fileId, dataURL, now = Date.now() }) => ({
  id: fileId,
  mimeType: "image/png",
  dataURL,
  created: now,
  lastRetrieved: now,
});

export const createBakedImageElement = ({ fileId, bounds, sourceElements = [], now = Date.now() }) => {
  const width = Math.max(1, Number(bounds?.maxX) - Number(bounds?.minX));
  const height = Math.max(1, Number(bounds?.maxY) - Number(bounds?.minY));
  const commonFrameId = sourceElements.length > 0 && sourceElements.every(element => element.frameId === sourceElements[0].frameId)
    ? sourceElements[0].frameId
    : null;
  return {
    id: `image_${now}_${Math.random().toString(36).slice(2, 11)}`,
    type: "image",
    x: Number(bounds?.minX) || 0,
    y: Number(bounds?.minY) || 0,
    width,
    height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 0,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: commonFrameId,
    roundness: null,
    seed: randomNonce(),
    version: 1,
    versionNonce: randomNonce(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
    customData: {
      underscoresBake: {
        version: 1,
        format: "png",
        sourceCount: sourceElements.length,
        sourceElementIds: sourceElements.map(element => element.id),
        createdAt: now,
      },
      underscoresLabel: `Baked PNG · ${sourceElements.length} objects`,
    },
  };
};

export const createCanvasSnapshotImageElement = ({
  fileId,
  sourceElement,
  label = "PNG snapshot",
  now = Date.now(),
}) => {
  const x = Number(sourceElement?.x) || 0;
  const y = Number(sourceElement?.y) || 0;
  const width = Math.max(1, Math.abs(Number(sourceElement?.width) || 1));
  const height = Math.max(1, Math.abs(Number(sourceElement?.height) || 1));
  const image = createBakedImageElement({
    fileId,
    bounds: { minX: x, minY: y, maxX: x + width, maxY: y + height },
    sourceElements: sourceElement ? [sourceElement] : [],
    now,
  });
  return {
    ...image,
    x,
    y,
    width,
    height,
    angle: Number(sourceElement?.angle) || 0,
    frameId: sourceElement?.frameId || null,
    customData: {
      ...image.customData,
      underscoresLabel: label,
      underscoresSnapshot: {
        version: 1,
        format: "png",
        sourceElementId: sourceElement?.id || null,
        createdAt: now,
      },
    },
  };
};

export const replaceSceneElementsWithBake = (elements = [], sourceElementIds = [], bakedElement, now = Date.now()) => {
  const sourceIds = new Set(sourceElementIds);
  const insertionIndex = elements.findIndex(element => sourceIds.has(element.id));
  if (insertionIndex < 0 || !bakedElement) return elements;
  const next = [];
  elements.forEach((element, index) => {
    if (index === insertionIndex) next.push(bakedElement);
    next.push(sourceIds.has(element.id) ? {
      ...element,
      isDeleted: true,
      version: (element.version || 0) + 1,
      versionNonce: randomNonce(),
      updated: now,
    } : element);
  });
  return next;
};
