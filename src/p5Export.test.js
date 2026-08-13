import test from "node:test";
import assert from "node:assert/strict";
import {
  getElementExportBounds,
  getElementsExportBounds,
  getP5ExportableElements,
  isLivecodeP5Element,
  shouldRenderLivecodeP5,
  createModifierTrackExportElements,
  drawMediaStreamsOnCanvas,
  hideP5FrameHostsForExport,
  hideLiveCanvasHostsForExport,
  drawP5FramesOnCanvas,
  EXCALIDRAW_DARK_THEME_FILTER,
  exportUnderscorePng,
} from "./p5Export.js";

const p5Frame = {
  id: "p5",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  angle: 0,
  customData: { underscoreP5: {} },
};

test("p5 export bounds account for rotated frame geometry", () => {
  const bounds = getElementExportBounds({ ...p5Frame, angle: Math.PI / 2 });
  assert.ok(Math.abs(bounds.minX - 35) < 1e-9);
  assert.ok(Math.abs(bounds.maxX - 85) < 1e-9);
  assert.ok(Math.abs(bounds.minY + 5) < 1e-9);
  assert.ok(Math.abs(bounds.maxY - 95) < 1e-9);
});

test("p5 export bounds combine all live scene elements", () => {
  const bounds = getElementsExportBounds([
    p5Frame,
    { id: "other", x: -30, y: -10, width: 20, height: 10, angle: 0 },
    { id: "deleted", x: -1000, y: -1000, width: 1, height: 1, isDeleted: true },
  ]);
  assert.deepEqual(bounds, { minX: -30, maxX: 110, minY: -10, maxY: 70 });
});

test("export bounds follow negative relative points in linear elements", () => {
  const bounds = getElementExportBounds({
    id: "reverse-line",
    type: "line",
    x: 400,
    y: 350,
    width: 280,
    height: 250,
    angle: 0,
    points: [[0, 0], [-280, -250]],
  });
  assert.deepEqual(bounds, { minX: 120, maxX: 400, minY: 100, maxY: 350 });
});

test("p5 host elements are hidden while their live canvases are composited", () => {
  const hidden = hideP5FrameHostsForExport([p5Frame, { id: "line", type: "line", opacity: 80 }]);
  assert.equal(hidden[0].opacity, 0);
  assert.equal(hidden[1].opacity, 80);
  assert.equal(getP5ExportableElements([...hidden]).length, 1);
});

test("Livecode p5 nodes use the same PNG capture path as legacy p5 frames", () => {
  const livecodeP5 = {
    id: "live-p5",
    customData: { underscoreLivecode: { kind: "p5" } },
  };
  assert.equal(isLivecodeP5Element(livecodeP5), true);
  assert.equal(shouldRenderLivecodeP5(livecodeP5), true);
  assert.equal(getP5ExportableElements([livecodeP5]).length, 1);
  assert.equal(hideP5FrameHostsForExport([livecodeP5])[0].opacity, 0);
});

test("modifier overlay tracks become export-only native lines", () => {
  const source = {
    id: "pencil",
    type: "freedraw",
    strokeColor: "#111111",
    strokeWidth: 4,
    opacity: 100,
    frameId: "frame",
  };
  const track = { points: [[20, 30], [10, 50], [40, 60]], strokeColor: "#ff0000", strokeWidth: 3, opacity: 0.5, smooth: true };
  track.points[0].pressure = 0.25;
  const [element] = createModifierTrackExportElements(source, [track]);
  assert.deepEqual([element.x, element.y, element.width, element.height], [20, 30, 30, 30]);
  assert.deepEqual(element.points.map(point => [...point]), [[0, 0], [-10, 20], [20, 30]]);
  assert.equal(element.points[0].pressure, 0.25);
  assert.equal(element.strokeColor, "#ff0000");
  assert.equal(element.opacity, 50);
  assert.deepEqual(element.roundness, { type: 2 });
  assert.equal(element.frameId, "frame");
});

test("Holistic canvas pixels are composited at the media host transform", () => {
  const operations = [];
  const context = {
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: (...args) => operations.push(["translate", ...args]),
    rotate: value => operations.push(["rotate", value]),
    drawImage: (...args) => operations.push(["drawImage", ...args]),
  };
  const sourceCanvas = { width: 640, height: 480 };
  const media = {
    id: "holistic",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    angle: 0,
    opacity: 80,
    customData: { underscoreMediaStream: { kind: "holistic", enabled: true } },
  };
  const root = {
    querySelectorAll: () => [{
      getAttribute: () => "holistic",
      querySelector: selector => selector === "canvas.underscore-media-surface" ? sourceCanvas : null,
    }],
  };
  const captured = drawMediaStreamsOnCanvas({
    canvas: { width: 200, height: 100, getContext: () => context },
    elements: [media],
    bounds: { minX: 10, maxX: 110, minY: 20, maxY: 70 },
    root,
  });
  assert.equal(captured, 1);
  assert.equal(context.globalAlpha, 0.8);
  assert.deepEqual(operations, [
    "save",
    ["translate", 100, 50],
    ["rotate", 0],
    ["drawImage", sourceCanvas, -100, -50, 200, 100],
    "restore",
  ]);
  assert.equal(hideLiveCanvasHostsForExport([media])[0].opacity, 0);
});

test("p5 canvas pixels are composited with their frame transform", () => {
  const operations = [];
  const context = {
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: (...args) => operations.push(["translate", ...args]),
    rotate: value => operations.push(["rotate", value]),
    drawImage: (...args) => operations.push(["drawImage", ...args]),
  };
  const sourceCanvas = { width: 200, height: 100 };
  const root = {
    querySelectorAll: () => [{
      getAttribute: () => "p5",
      querySelector: selector => selector === "canvas" ? sourceCanvas : null,
    }],
  };
  const captured = drawP5FramesOnCanvas({
    canvas: { width: 400, height: 200, getContext: () => context },
    elements: [p5Frame],
    bounds: { minX: 10, maxX: 110, minY: 20, maxY: 70 },
    root,
  });

  assert.equal(captured, 1);
  assert.deepEqual(operations, [
    "save",
    ["translate", 200, 100],
    ["rotate", 0],
    ["drawImage", sourceCanvas, -200, -100, 400, 200],
    "restore",
  ]);
});

test("p5 PNG export forwards the requested background mode", async () => {
  let exportOptions = null;
  const canvas = { width: 100, height: 50, getContext: () => null };

  await exportUnderscorePng({
    exportToCanvas: async options => {
      exportOptions = options;
      return canvas;
    },
    elements: [{ id: "line", type: "line", x: 0, y: 0, width: 100, height: 50, angle: 0 }],
    appState: { viewBackgroundColor: "#123456" },
    files: {},
    exportBackground: false,
    exportPadding: 7,
    root: { querySelectorAll: () => [] },
  });

  assert.equal(exportOptions.appState.exportBackground, false);
  assert.equal(exportOptions.exportPadding, 7);
});

test("dark PNG exports use Excalidraw's visible-canvas filter at device resolution", async () => {
  let exportOptions = null;
  const sourceCanvas = { width: 200, height: 100, getContext: () => null };
  const operations = [];
  const context = {
    filter: "none",
    drawImage: (...args) => operations.push(args),
  };
  const filteredCanvas = { width: 0, height: 0, getContext: () => context };
  const root = {
    createElement: tagName => {
      assert.equal(tagName, "canvas");
      return filteredCanvas;
    },
    querySelectorAll: () => [],
  };

  const { canvas } = await exportUnderscorePng({
    exportToCanvas: async options => {
      exportOptions = options;
      return sourceCanvas;
    },
    elements: [{ id: "line", type: "line", x: 0, y: 0, width: 100, height: 50, angle: 0 }],
    appState: { theme: "dark" },
    files: {},
    root,
    pixelRatio: 2,
  });

  assert.equal(canvas, filteredCanvas);
  assert.equal(filteredCanvas.width, 200);
  assert.equal(filteredCanvas.height, 100);
  assert.equal(context.filter, EXCALIDRAW_DARK_THEME_FILTER);
  assert.deepEqual(operations, [[sourceCanvas, 0, 0]]);
  assert.deepEqual(exportOptions.getDimensions(100, 50), { width: 200, height: 100, scale: 2 });
});
