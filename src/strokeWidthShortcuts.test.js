import test from "node:test";
import assert from "node:assert/strict";
import { getStrokeWidthShortcut, stepStrokeWidth } from "./strokeWidthShortcuts.js";

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
