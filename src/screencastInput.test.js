import test from "node:test";
import assert from "node:assert/strict";
import { clampScreencastPosition, formatScreencastKey, screencastToolIcon, screencastToolLabel } from "./screencastInput.js";

test("formats modifier keys for the screencast overlay", () => {
  assert.equal(formatScreencastKey({ metaKey: true, altKey: true, key: "i" }), "⌘⌥i");
  assert.equal(formatScreencastKey({ shiftKey: true, key: " " }), "⇧Space");
});

test("describes common canvas tools", () => {
  assert.equal(screencastToolLabel("freedraw"), "Pencil");
  assert.equal(screencastToolIcon("freedraw"), "✎");
  assert.equal(screencastToolLabel("unknown-tool"), "Unknown Tool");
});

test("keeps a draggable overlay inside the viewport", () => {
  assert.deepEqual(clampScreencastPosition({ x: 900, y: 700 }, { width: 1000, height: 800 }, { width: 220, height: 110 }), { x: 772, y: 682 });
  assert.deepEqual(clampScreencastPosition({ x: -10, y: -5 }, { width: 1000, height: 800 }, { width: 220, height: 110 }), { x: 8, y: 8 });
});
