import test from "node:test";
import assert from "node:assert/strict";
import {
  getElementExportBounds,
  getElementsExportBounds,
  getP5ExportableElements,
  hideP5FrameHostsForExport,
  drawP5FramesOnCanvas,
  EXCALIDRAW_DARK_THEME_FILTER,
  exportDraweratorPng,
} from "./p5Export.js";

const p5Frame = {
  id: "p5",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  angle: 0,
  customData: { draweratorP5: {} },
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

test("p5 host elements are hidden while their live canvases are composited", () => {
  const hidden = hideP5FrameHostsForExport([p5Frame, { id: "line", type: "line", opacity: 80 }]);
  assert.equal(hidden[0].opacity, 0);
  assert.equal(hidden[1].opacity, 80);
  assert.equal(getP5ExportableElements([...hidden]).length, 1);
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

  await exportDraweratorPng({
    exportToCanvas: async options => {
      exportOptions = options;
      return canvas;
    },
    elements: [{ id: "line", type: "line", x: 0, y: 0, width: 100, height: 50, angle: 0 }],
    appState: { viewBackgroundColor: "#123456" },
    files: {},
    exportBackground: false,
    root: { querySelectorAll: () => [] },
  });

  assert.equal(exportOptions.appState.exportBackground, false);
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

  const { canvas } = await exportDraweratorPng({
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
  assert.deepEqual(exportOptions.getDimensions(100, 50), { width: 100, height: 50, scale: 2 });
});
