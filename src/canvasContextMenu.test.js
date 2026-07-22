import test from "node:test";
import assert from "node:assert/strict";
import {
  convertShapeElementToPath,
  getCanvasContextMenuCapabilities,
  isCanvasContextElement,
  setSelectedElementRoundness,
  supportsElementRoundness,
} from "./canvasContextMenu.js";

test("canvas context menu accepts paths and basic shapes", () => {
  for (const type of ["freedraw", "line", "ellipse", "rectangle", "diamond"]) {
    assert.equal(isCanvasContextElement({ id: type, type }), true);
  }
  assert.equal(isCanvasContextElement({ id: "text", type: "text" }), false);
  assert.equal(isCanvasContextElement({ id: "deleted", type: "ellipse", isDeleted: true }), false);
});

test("roundness is available for paths, rectangles, and diamonds but not ellipses", () => {
  assert.equal(supportsElementRoundness({ type: "line" }), true);
  assert.equal(supportsElementRoundness({ type: "rectangle" }), true);
  assert.equal(supportsElementRoundness({ type: "diamond" }), true);
  assert.equal(supportsElementRoundness({ type: "ellipse" }), false);

  const capabilities = getCanvasContextMenuCapabilities([
    { id: "oval", type: "ellipse" },
    { id: "box", type: "rectangle", roundness: null },
  ]);
  assert.equal(capabilities.hasShapes, true);
  assert.equal(capabilities.showPathOperations, false);
  assert.equal(capabilities.showSharpRound, true);
  assert.equal(capabilities.allSharp, true);
  assert.equal(capabilities.allRound, false);
});

test("setting selection roundness is immutable and ignores ellipses", () => {
  const source = [
    { id: "box", type: "rectangle", version: 2, roundness: null },
    { id: "diamond", type: "diamond", version: 4, roundness: null },
    { id: "oval", type: "ellipse", version: 1, roundness: null },
  ];
  const rounded = setSelectedElementRoundness(source, { box: true, diamond: true, oval: true }, "round", {
    updated: 123,
    createNonce: () => 99,
  });
  assert.equal(rounded.changed, 2);
  assert.deepEqual(rounded.elements[0].roundness, { type: 2 });
  assert.deepEqual(rounded.elements[1].roundness, { type: 2 });
  assert.equal(rounded.elements[2], source[2]);
  assert.equal(rounded.elements[0].version, 3);
  assert.equal(rounded.elements[0].versionNonce, 99);

  const sharp = setSelectedElementRoundness(rounded.elements, { box: true }, "sharp", {
    updated: 124,
    createNonce: () => 100,
  });
  assert.equal(sharp.changed, 1);
  assert.equal(sharp.elements[0].roundness, null);
  assert.deepEqual(sharp.elements[1].roundness, { type: 2 });
});

test("basic shapes convert to zero-roughness paths and freehand strokes", () => {
  const rectangle = { id: "box", type: "rectangle", width: 80, height: 40, version: 2, roughness: 2, roundness: { type: 2 }, backgroundColor: "#fff" };
  const path = convertShapeElementToPath(rectangle, "line", { updated: 10, createNonce: () => 11 });
  assert.equal(path.type, "line");
  assert.equal(path.roughness, 0);
  assert.equal(path.roundness, null);
  assert.deepEqual(path.points, [[0, 0], [80, 0], [80, 40], [0, 40], [0, 0]]);
  assert.equal(path.version, 3);
  assert.equal(path.versionNonce, 11);

  const pencil = convertShapeElementToPath({ ...rectangle, type: "diamond" }, "freedraw", { updated: 12, createNonce: () => 13 });
  assert.equal(pencil.type, "freedraw");
  assert.equal(pencil.backgroundColor, "transparent");
  assert.equal(pencil.pressures.length, pencil.points.length);
  assert.equal(pencil.simulatePressure, false);
});

test("ellipse path sampling is closed", () => {
  const oval = convertShapeElementToPath({ id: "oval", type: "ellipse", width: 100, height: 50 }, "line", { createNonce: () => 1 });
  assert.equal(oval.points.length, 37);
  assert.ok(Math.abs(oval.points[0][0] - oval.points.at(-1)[0]) < 1e-9);
  assert.ok(Math.abs(oval.points[0][1] - oval.points.at(-1)[1]) < 1e-9);
});
