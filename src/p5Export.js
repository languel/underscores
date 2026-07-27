import { isP5FrameElement, shouldRenderP5Frame } from "./p5Frame.js";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Excalidraw draws the dark theme by filtering its light source canvas.  The
// public export API deliberately returns that source canvas unfiltered, so a
// Drawerator export must apply the same filter before it composites live p5
// canvases (which are already drawn in their final colours).
export const EXCALIDRAW_DARK_THEME_FILTER = "invert(93%) hue-rotate(180deg)";

export const getElementExportBounds = element => {
  const x = finite(element?.x);
  const y = finite(element?.y);
  const width = Math.abs(finite(element?.width, 1));
  const height = Math.abs(finite(element?.height, 1));
  const angle = finite(element?.angle);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([cornerX, cornerY]) => ({
    x: centerX + cornerX * cosine - cornerY * sine,
    y: centerY + cornerX * sine + cornerY * cosine,
  }));

  return corners.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
};

export const getElementsExportBounds = elements => {
  const visibleElements = (elements || []).filter(element => element && !element.isDeleted);
  if (!visibleElements.length) return null;
  return visibleElements.reduce((bounds, element) => {
    const elementBounds = getElementExportBounds(element);
    return {
      minX: Math.min(bounds.minX, elementBounds.minX),
      maxX: Math.max(bounds.maxX, elementBounds.maxX),
      minY: Math.min(bounds.minY, elementBounds.minY),
      maxY: Math.max(bounds.maxY, elementBounds.maxY),
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
};

export const getP5ExportableElements = elements => (elements || []).filter(shouldRenderP5Frame);

// The Excalidraw host is still needed for selection and transforms, but it is
// not the live p5 drawing. Hide that host while exporting so the captured
// canvas below replaces it exactly once.
export const hideP5FrameHostsForExport = elements => (elements || []).map(element => (
  isP5FrameElement(element) ? { ...element, opacity: 0 } : element
));

export const findP5CanvasForElement = (elementId, root = globalThis.document) => {
  if (!root?.querySelectorAll) return null;
  const id = String(elementId);
  for (const container of root.querySelectorAll("[data-drawerator-p5-element-id]")) {
    if (container.getAttribute("data-drawerator-p5-element-id") === id) {
      return container.querySelector("canvas");
    }
  }
  return null;
};

export const drawP5FramesOnCanvas = ({ canvas, elements, bounds, root = globalThis.document }) => {
  if (!canvas || !bounds) return 0;
  const context = canvas.getContext?.("2d");
  if (!context) return 0;
  const sceneWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sceneHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  let captured = 0;

  getP5ExportableElements(elements).forEach(element => {
    const source = findP5CanvasForElement(element.id, root);
    if (!source || source.width < 1 || source.height < 1) return;
    const x = finite(element.x);
    const y = finite(element.y);
    const width = Math.max(1, Math.abs(finite(element.width, 1)));
    const height = Math.max(1, Math.abs(finite(element.height, 1)));
    context.save();
    context.translate((x + width / 2 - bounds.minX) * scaleX, (y + height / 2 - bounds.minY) * scaleY);
    context.rotate(finite(element.angle));
    context.drawImage(source, -width * scaleX / 2, -height * scaleY / 2, width * scaleX, height * scaleY);
    context.restore();
    captured += 1;
  });
  return captured;
};

export const applyExcalidrawThemeFilter = ({
  canvas,
  theme,
  documentRef = canvas?.ownerDocument || globalThis.document,
}) => {
  if (!canvas || theme !== "dark" || !documentRef?.createElement) return canvas;
  const filteredCanvas = documentRef.createElement("canvas");
  filteredCanvas.width = canvas.width;
  filteredCanvas.height = canvas.height;
  const context = filteredCanvas.getContext?.("2d");
  if (!context) return canvas;

  context.filter = EXCALIDRAW_DARK_THEME_FILTER;
  context.drawImage(canvas, 0, 0);
  return filteredCanvas;
};

export const exportDraweratorPng = async ({
  exportToCanvas,
  elements,
  appState,
  files,
  exportBackground = true,
  root = globalThis.document,
  pixelRatio = finite(globalThis.devicePixelRatio, 1),
}) => {
  const activeElements = (elements || []).filter(element => element && !element.isDeleted);
  if (!activeElements.length) throw new Error("There is nothing to export.");
  const bounds = getElementsExportBounds(activeElements);
  const resolution = Math.min(4, Math.max(1, pixelRatio));
  const sourceCanvas = await exportToCanvas({
    elements: hideP5FrameHostsForExport(activeElements),
    appState: { ...appState, exportBackground },
    files,
    exportPadding: 0,
    getDimensions: (width, height) => ({ width, height, scale: resolution }),
  });
  const canvas = applyExcalidrawThemeFilter({
    canvas: sourceCanvas,
    theme: appState?.theme,
    documentRef: root,
  });
  const capturedP5Frames = drawP5FramesOnCanvas({ canvas, elements: activeElements, bounds, root });
  return { canvas, capturedP5Frames };
};

export const downloadCanvasAsPng = (canvas, { filename = "drawerator-export.png", documentRef = globalThis.document } = {}) => {
  if (!canvas?.toDataURL || !documentRef?.createElement) return false;
  const link = documentRef.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.rel = "noopener";
  documentRef.body?.appendChild(link);
  link.click();
  link.remove();
  return true;
};
