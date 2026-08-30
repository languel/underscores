import { isP5FrameElement, shouldRenderP5Frame } from "./p5Frame.js";
import { isMediaStreamElement, shouldRenderMediaStream } from "./mediaStream.js";
import { captureLivecodeFrame } from "./livecodeCapture.js";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// PNG exports normally apply Excalidraw's dark-theme filter before compositing
// live p5/media canvases (which are already drawn in their final colours).
// Scene-visible Canvas sources can opt out when their native content is already
// in display colours and only need the current board background.
export const EXCALIDRAW_DARK_THEME_FILTER = "invert(93%) hue-rotate(180deg)";

export const getElementExportBounds = element => {
  const x = finite(element?.x);
  const y = finite(element?.y);
  const width = Math.abs(finite(element?.width, 1));
  const height = Math.abs(finite(element?.height, 1));
  const angle = finite(element?.angle);
  const pointGeometry = (element?.type === "line" || element?.type === "freedraw")
    && Array.isArray(element?.points)
    && element.points.length > 0
    ? element.points.map(point => ({ x: x + finite(point?.[0]), y: y + finite(point?.[1]) }))
    : null;
  const sourcePoints = pointGeometry || [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const sourceMinX = Math.min(...sourcePoints.map(point => point.x));
  const sourceMaxX = Math.max(...sourcePoints.map(point => point.x));
  const sourceMinY = Math.min(...sourcePoints.map(point => point.y));
  const sourceMaxY = Math.max(...sourcePoints.map(point => point.y));
  const centerX = (sourceMinX + sourceMaxX) / 2;
  const centerY = (sourceMinY + sourceMaxY) / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const transformedPoints = sourcePoints.map(point => ({
    x: centerX + (point.x - centerX) * cosine - (point.y - centerY) * sine,
    y: centerY + (point.x - centerX) * sine + (point.y - centerY) * cosine,
  }));

  return transformedPoints.reduce((bounds, point) => ({
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

// Livecode p5 nodes use the same P5Frame renderer but carry their authored
// config under underscoresLivecode instead of underscoresP5. Treat them as
// exportable p5 surfaces too, so PNG copy/export and baking share one capture
// path.
export const isLivecodeP5Element = element => element?.customData?.underscoresLivecode?.kind === "p5";

// Shader, Strudel, and Tixy nodes render into DOM canvases over their Excalidraw
// hosts. They are captured through the opt-in livecode registry below. P5 is
// intentionally excluded here because its existing export path handles the
// instance canvas and its theme behaviour separately.
export const isLivecodeCanvasElement = element => {
  const kind = element?.customData?.underscoresLivecode?.kind;
  return kind === "shader" || kind === "strudel" || kind === "tixy";
};

export const shouldRenderLivecodeP5 = element => Boolean(
  element
  && !element.isDeleted
  && !element.customData?.outlinerHidden
  && !element.customData?.presentationMaskActive
  && isLivecodeP5Element(element)
);

export const getP5ExportableElements = elements => (elements || []).filter(element => (
  shouldRenderP5Frame(element) || shouldRenderLivecodeP5(element)
));

// The Excalidraw host is still needed for selection and transforms, but it is
// not the live p5 drawing. Hide that host while exporting so the captured
// canvas below replaces it exactly once.
export const hideP5FrameHostsForExport = elements => (elements || []).map(element => (
  isP5FrameElement(element) || isLivecodeP5Element(element) ? { ...element, opacity: 0 } : element
));

export const hideLiveCanvasHostsForExport = elements => hideP5FrameHostsForExport(elements).map(element => (
  isMediaStreamElement(element) || isLivecodeCanvasElement(element) ? { ...element, opacity: 0 } : element
));

export const findP5CanvasForElement = (elementId, root = globalThis.document) => {
  if (!root?.querySelectorAll) return null;
  const id = String(elementId);
  for (const container of root.querySelectorAll("[data-underscores-p5-element-id]")) {
    if (container.getAttribute("data-underscores-p5-element-id") === id) {
      return container.querySelector("canvas");
    }
  }
  return null;
};

export const findMediaStreamCanvasForElement = (elementId, root = globalThis.document) => {
  if (!root?.querySelectorAll) return null;
  const id = String(elementId);
  for (const container of root.querySelectorAll("[data-underscores-media-stream-id]")) {
    if (container.getAttribute("data-underscores-media-stream-id") === id) {
      return container.querySelector("canvas.underscores-media-surface");
    }
  }
  return null;
};

const drawElementCanvas = ({ context, source, element, bounds, scaleX, scaleY }) => {
  if (!source || source.width < 1 || source.height < 1) return false;
  const x = finite(element.x);
  const y = finite(element.y);
  const width = Math.max(1, Math.abs(finite(element.width, 1)));
  const height = Math.max(1, Math.abs(finite(element.height, 1)));
  context.save();
  // The native Excalidraw layer may have been rendered through the dark-theme
  // filter. Live p5/media surfaces are already display-coloured, so never
  // inherit that filter when they are composited onto the result.
  context.filter = "none";
  context.translate((x + width / 2 - bounds.minX) * scaleX, (y + height / 2 - bounds.minY) * scaleY);
  context.rotate(finite(element.angle));
  context.globalAlpha = Math.max(0, Math.min(1, finite(element.opacity, 100) / 100));
  context.drawImage(source, -width * scaleX / 2, -height * scaleY / 2, width * scaleX, height * scaleY);
  context.restore();
  return true;
};

export const drawP5FramesOnCanvas = ({ canvas, elements, bounds, root = globalThis.document, transformSource = null }) => {
  if (!canvas || !bounds) return 0;
  const context = canvas.getContext?.("2d");
  if (!context) return 0;
  const sceneWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sceneHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  let captured = 0;

  getP5ExportableElements(elements).forEach(element => {
    const rawSource = findP5CanvasForElement(element.id, root);
    const source = transformSource ? transformSource(rawSource) : rawSource;
    if (drawElementCanvas({ context, source, element, bounds, scaleX, scaleY })) captured += 1;
  });
  return captured;
};

export const drawMediaStreamsOnCanvas = ({ canvas, elements, bounds, root = globalThis.document, transformSource = null }) => {
  if (!canvas || !bounds) return 0;
  const context = canvas.getContext?.("2d");
  if (!context) return 0;
  const sceneWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sceneHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  let captured = 0;
  (elements || []).filter(element => isMediaStreamElement(element) && shouldRenderMediaStream(element)).forEach(element => {
    const rawSource = findMediaStreamCanvasForElement(element.id, root);
    const source = transformSource ? transformSource(rawSource) : rawSource;
    if (drawElementCanvas({ context, source, element, bounds, scaleX, scaleY })) captured += 1;
  });
  return captured;
};

export const drawLivecodeCanvasesOnCanvas = async ({
  canvas,
  elements,
  bounds,
  capture = captureLivecodeFrame,
  transformSource = null,
}) => {
  if (!canvas || !bounds) return 0;
  const context = canvas.getContext?.("2d");
  if (!context) return 0;
  const sceneWidth = Math.max(1, bounds.maxX - bounds.minX);
  const sceneHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  let captured = 0;
  // Preserve scene order so multiple visual nodes composite consistently with
  // the authored element order. Each callback is invoked only for an actual
  // capture request (never during ordinary livecode playback).
  for (const element of (elements || []).filter(candidate => (
    isLivecodeCanvasElement(candidate)
    && !candidate.isDeleted
    && !candidate.customData?.outlinerHidden
    && !candidate.customData?.presentationMaskActive
  ))) {
    const rawSource = await capture(element.id);
    const source = transformSource ? transformSource(rawSource) : rawSource;
    if (drawElementCanvas({
      context,
      source,
      element,
      bounds,
      scaleX,
      scaleY,
    })) captured += 1;
  }
  return captured;
};

const copyTrackPoint = point => {
  const copy = [finite(point?.[0]), finite(point?.[1])];
  for (const key of ["pressure", "time", "strokeTime", "speed"]) {
    if (point?.[key] !== undefined) copy[key] = point[key];
  }
  return copy;
};

export const createModifierTrackExportElements = (sourceElement, tracks = []) => tracks
  .filter(track => Array.isArray(track?.points) && track.points.length >= 2)
  .map((track, index) => {
    const points = track.points.map(copyTrackPoint);
    const [startX, startY] = points[0];
    const relativePoints = points.map(point => {
      const relative = copyTrackPoint(point);
      relative[0] -= startX;
      relative[1] -= startY;
      return relative;
    });
    const xs = relativePoints.map(point => point[0]);
    const ys = relativePoints.map(point => point[1]);
    return {
      ...sourceElement,
      id: `${sourceElement.id}-png-track-${index}`,
      type: "line",
      x: startX,
      y: startY,
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      angle: 0,
      points: relativePoints,
      strokeColor: track.strokeColor || sourceElement.strokeColor,
      strokeWidth: Math.max(0.1, finite(track.strokeWidth, sourceElement.strokeWidth || 1)),
      opacity: Math.round(Math.max(0, Math.min(1, finite(track.opacity, 1))) * 100),
      roundness: track.smooth ? { type: 2 } : null,
      groupIds: [],
      boundElements: null,
      startBinding: null,
      endBinding: null,
      lastCommittedPoint: null,
      customData: undefined,
    };
  });

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

// Clipboard images are pasted back into Excalidraw's filtered dark canvas.
// Live p5/media surfaces are already in display colours, so convert those
// pixels back to the authored colour space before putting them on the
// clipboard. Native scene elements are left untouched; their source canvas
// already contains authored pixels.
export const applyInverseExcalidrawThemeFilter = ({
  canvas,
  theme,
  documentRef = canvas?.ownerDocument || globalThis.document,
}) => {
  if (!canvas || theme !== "dark" || !documentRef?.createElement) return canvas;
  const authoredCanvas = documentRef.createElement("canvas");
  authoredCanvas.width = canvas.width;
  authoredCanvas.height = canvas.height;
  const context = authoredCanvas.getContext?.("2d");
  if (!context) return canvas;
  context.drawImage(canvas, 0, 0);
  let pixels;
  try {
    pixels = context.getImageData(0, 0, authoredCanvas.width, authoredCanvas.height);
  } catch {
    // A cross-origin source cannot be read back. Keep the display-colour
    // canvas rather than failing the whole export.
    return canvas;
  }
  const data = pixels.data;
  const invertAmount = 0.93;
  const invertScale = 1 - 2 * invertAmount;
  // The 180-degree hue matrix used by the CSS filter is self-inverse.
  const hue180 = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856],
  ];
  for (let offset = 0; offset < data.length; offset += 4) {
    const visible = [data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255];
    const inverted = hue180.map(row => row.reduce((sum, coefficient, index) => sum + coefficient * visible[index], 0));
    data[offset] = Math.round(Math.min(1, Math.max(0, (inverted[0] - invertAmount) / invertScale)) * 255);
    data[offset + 1] = Math.round(Math.min(1, Math.max(0, (inverted[1] - invertAmount) / invertScale)) * 255);
    data[offset + 2] = Math.round(Math.min(1, Math.max(0, (inverted[2] - invertAmount) / invertScale)) * 255);
  }
  context.putImageData(pixels, 0, 0);
  return authoredCanvas;
};

export const exportUnderscoresPng = async ({
  exportToCanvas,
  elements,
  appState,
  files,
  bounds: suppliedBounds = null,
  exportPadding = 0,
  exportBackground = true,
  root = globalThis.document,
  pixelRatio = finite(globalThis.devicePixelRatio, 1),
  outputMode = "visible",
  applyThemeFilter = true,
  captureLivecode = captureLivecodeFrame,
}) => {
  const activeElements = (elements || []).filter(element => element && !element.isDeleted);
  if (!activeElements.length) throw new Error("There is nothing to export.");
  const bounds = suppliedBounds || getElementsExportBounds(activeElements);
  const resolution = Math.min(4, Math.max(1, pixelRatio));
  const sourceCanvas = await exportToCanvas({
    elements: hideLiveCanvasHostsForExport(activeElements),
    // The application owns the dark-mode remap below. Excalidraw's own
    // exportWithDarkMode flag would bake the same filter into sourceCanvas,
    // causing clipboard images to be transformed a second time on paste.
    appState: { ...appState, exportBackground, exportWithDarkMode: false },
    files,
    exportPadding,
    // Excalidraw's scale controls its drawing transform; callers must enlarge
    // the backing bitmap by the same factor or the scaled scene is clipped.
    getDimensions: (width, height) => ({
      width: width * resolution,
      height: height * resolution,
      scale: resolution,
    }),
  });
  const canvas = outputMode === "authored" || !applyThemeFilter
    ? sourceCanvas
    : applyExcalidrawThemeFilter({
      canvas: sourceCanvas,
      theme: appState?.theme,
      documentRef: root,
    });
  const transformLiveSource = outputMode === "authored"
    ? source => applyInverseExcalidrawThemeFilter({ canvas: source, theme: appState?.theme, documentRef: root })
    : null;
  const capturedP5Frames = drawP5FramesOnCanvas({ canvas, elements: activeElements, bounds, root, transformSource: transformLiveSource });
  const capturedMediaStreams = drawMediaStreamsOnCanvas({ canvas, elements: activeElements, bounds, root, transformSource: transformLiveSource });
  const capturedLivecodeCanvases = await drawLivecodeCanvasesOnCanvas({
    canvas,
    elements: activeElements,
    bounds,
    capture: captureLivecode,
    transformSource: transformLiveSource,
  });
  return { canvas, capturedP5Frames, capturedMediaStreams, capturedLivecodeCanvases };
};

export const downloadCanvasAsPng = (canvas, { filename = "underscores-export.png", documentRef = globalThis.document } = {}) => {
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
