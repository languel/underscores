export const CANVAS_CONTEXT_ELEMENT_TYPES = Object.freeze([
  "freedraw",
  "line",
  "arrow",
  "ellipse",
  "rectangle",
  "diamond",
  "frame",
]);

export const ROUNDABLE_ELEMENT_TYPES = Object.freeze([
  "freedraw",
  "line",
  "arrow",
  "rectangle",
  "diamond",
]);

const contextTypes = new Set(CANVAS_CONTEXT_ELEMENT_TYPES);
const roundableTypes = new Set(ROUNDABLE_ELEMENT_TYPES);

export const isCanvasContextElement = element => Boolean(
  element && !element.isDeleted && contextTypes.has(element.type)
);

export const supportsElementRoundness = element => Boolean(
  element && !element.isDeleted && roundableTypes.has(element.type)
);

export const hasAuthoredPointGeometry = element => Boolean(
  element
  && !element.isDeleted
  && ((Array.isArray(element.points) && element.points.length >= 2)
    || (Array.isArray(element.customData?.underscoresGeometry?.anchors)
      && element.customData.underscoresGeometry.anchors.length >= 2))
);

export const getCanvasContextMenuCapabilities = elements => {
  const selected = (Array.isArray(elements) ? elements : []).filter(isCanvasContextElement);
  const paths = selected.filter(element => element.type === "freedraw" || element.type === "line");
  const roundable = selected.filter(supportsElementRoundness);
  return {
    selected,
    paths,
    roundable,
    showSnapPoints: selected.some(hasAuthoredPointGeometry),
    hasShapes: selected.some(element => ["ellipse", "rectangle", "diamond"].includes(element.type)),
    showPathOperations: paths.length > 0,
    showSharpRound: roundable.length > 0,
    allSharp: roundable.length > 0 && roundable.every(element => !element.roundness),
    allRound: roundable.length > 0 && roundable.every(element => Boolean(element.roundness)),
  };
};

export const setSelectedElementRoundness = (elements, selectedIds, mode, options = {}) => {
  const ids = selectedIds || {};
  const updated = Number.isFinite(options.updated) ? options.updated : Date.now();
  const createNonce = options.createNonce || (() => Math.floor(Math.random() * 0x7fffffff));
  let changed = 0;
  const nextElements = elements.map(element => {
    if (!ids[element.id] || !supportsElementRoundness(element)) return element;
    const nextRoundness = mode === "round" ? { type: 2 } : null;
    const alreadyMatches = mode === "round" ? Boolean(element.roundness) : !element.roundness;
    if (alreadyMatches) return element;
    changed += 1;
    return {
      ...element,
      roundness: nextRoundness,
      version: (element.version || 0) + 1,
      versionNonce: createNonce(),
      updated,
    };
  });
  return { elements: nextElements, changed };
};

export const fitRectangularElementToViewport = (element, viewport, mode = "fit") => {
  if (!element || !["rectangle", "frame"].includes(element.type)) return element;
  const sourceWidth = Math.max(1e-6, Math.abs(Number(element.width) || 0));
  const sourceHeight = Math.max(1e-6, Math.abs(Number(element.height) || 0));
  const viewportWidth = Math.max(1, Number(viewport?.width) || 1);
  const viewportHeight = Math.max(1, Number(viewport?.height) || 1);
  const angle = Number(element.angle) || 0;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const rotatedWidth = sourceWidth * cos + sourceHeight * sin;
  const rotatedHeight = sourceWidth * sin + sourceHeight * cos;
  const scale = mode === "pip"
    ? (viewportHeight / 6) / rotatedHeight
    : Math.min(viewportWidth / rotatedWidth, viewportHeight / rotatedHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const boundsWidth = rotatedWidth * scale;
  const boundsHeight = rotatedHeight * scale;
  const viewportX = Number(viewport?.x) || 0;
  const viewportY = Number(viewport?.y) || 0;
  const centerX = mode === "pip"
    ? viewportX + viewportWidth - boundsWidth / 2
    : viewportX + viewportWidth / 2;
  const centerY = mode === "pip"
    ? viewportY + viewportHeight - boundsHeight / 2
    : viewportY + viewportHeight / 2;
  return {
    ...element,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
};

export const shapePathPoints = element => {
  const width = Number(element?.width) || 0;
  const height = Number(element?.height) || 0;
  if (element?.type === "rectangle") return [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
  if (element?.type === "diamond") return [[width / 2, 0], [width, height / 2], [width / 2, height], [0, height / 2], [width / 2, 0]];
  if (element?.type !== "ellipse") return null;
  return Array.from({ length: 37 }, (_, index) => {
    const angle = index * 2 * Math.PI / 36;
    return [width / 2 + width / 2 * Math.cos(angle), height / 2 + height / 2 * Math.sin(angle)];
  });
};

export const convertShapeElementToPath = (element, targetType = "line", options = {}) => {
  const points = shapePathPoints(element);
  if (!points) return element;
  const updated = Number.isFinite(options.updated) ? options.updated : Date.now();
  const createNonce = options.createNonce || (() => Math.floor(Math.random() * 0x7fffffff));
  const next = {
    ...element,
    type: targetType,
    points,
    roughness: 0,
    roundness: null,
    backgroundColor: targetType === "freedraw" ? "transparent" : element.backgroundColor,
    boundElements: null,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    version: (element.version || 0) + 1,
    versionNonce: createNonce(),
    updated,
  };
  return targetType === "freedraw" ? {
    ...next,
    pressures: points.map(() => 0.5),
    simulatePressure: false,
  } : next;
};
