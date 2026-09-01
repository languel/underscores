import test from "node:test";
import assert from "node:assert/strict";
import { applyStrokeWidthShortcut, getStrokeWidthShortcut, stepStrokeWidth } from "./strokeWidthShortcuts.js";

test("bracket shortcuts expose normal and one-tenth stroke width steps", () => {
  assert.deepEqual(getStrokeWidthShortcut({ code: "BracketLeft", shiftKey: false }), { direction: -1, fine: false });
  assert.deepEqual(getStrokeWidthShortcut({ code: "BracketRight", shiftKey: true }), { direction: 1, fine: true });
  assert.equal(getStrokeWidthShortcut({ code: "BracketLeft", metaKey: true }), null);
  assert.equal(stepStrokeWidth(4, 1), 5);
  assert.equal(stepStrokeWidth(4, -1), 3);
  assert.equal(stepStrokeWidth(4, 1, true), 4.1);
  assert.equal(stepStrokeWidth(4, -1, true), 3.9);
});

test("stroke width stepping clamps and avoids floating point drift", () => {
  assert.equal(stepStrokeWidth(0.1, -1, true), 0.1);
  assert.equal(stepStrokeWidth(20, 1), 20);
  assert.equal(stepStrokeWidth(0.3, 1, true), 0.4);
});

test("selected freehand strokes step from their own width and receive fresh element versions", () => {
  const selected = { curve: true };
  const source = [
    { id: "curve", type: "freedraw", strokeWidth: 0.4, version: 12, versionNonce: 3, updated: 4 },
    { id: "other", type: "freedraw", strokeWidth: 2, version: 8 },
  ];
  const result = applyStrokeWidthShortcut({
    elements: source,
    selectedElementIds: selected,
    currentItemStrokeWidth: 3,
    direction: 1,
    now: 100,
    createVersionNonce: () => 99,
  });

  assert.equal(result.currentItemStrokeWidth, 1.4);
  assert.deepEqual(result.elements[0], { id: "curve", type: "freedraw", strokeWidth: 1.4, version: 13, versionNonce: 99, updated: 100 });
  assert.equal(result.elements[1], source[1]);
});

test("unselected stroke shortcuts update only the next-drawn style", () => {
  const source = [{ id: "curve", type: "freedraw", strokeWidth: 2, version: 1 }];
  const result = applyStrokeWidthShortcut({
    elements: source,
    selectedElementIds: {},
    currentItemStrokeWidth: 2,
    direction: -1,
    fine: true,
  });
  assert.equal(result.currentItemStrokeWidth, 1.9);
  assert.equal(result.elements, source);
});

test("the snapped freedraw bracket sequence preserves geometry and revisions", () => {
  let elements = [{
    id: "snapped-curve",
    type: "freedraw",
    strokeWidth: 0.4,
    version: 40,
    points: [[0, 0], [10, 10]],
  }];
  let currentItemStrokeWidth = 0.4;
  const selectedElementIds = { "snapped-curve": true };
  let nonce = 100;

  for (const { direction, fine } of [
    { direction: 1, fine: false },
    { direction: 1, fine: false },
    { direction: -1, fine: true },
    { direction: -1, fine: true },
    { direction: -1, fine: true },
    { direction: -1, fine: true },
  ]) {
    const result = applyStrokeWidthShortcut({
      elements,
      selectedElementIds,
      currentItemStrokeWidth,
      direction,
      fine,
      now: 200,
      createVersionNonce: () => ++nonce,
    });
    elements = result.elements;
    currentItemStrokeWidth = result.currentItemStrokeWidth;
  }

  assert.equal(currentItemStrokeWidth, 2);
  assert.equal(elements[0].strokeWidth, 2);
  assert.equal(elements[0].version, 46);
  assert.deepEqual(elements[0].points, [[0, 0], [10, 10]]);
});
