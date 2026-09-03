import test from "node:test";
import assert from "node:assert/strict";
import { clampScreencastPosition, formatScreencastKey, formatScreencastModifiers, isScreencastModifierKey, screencastModifierState, screencastToolIcon, screencastToolLabel } from "./screencastInput.js";

test("formats modifier keys for the screencast overlay", () => {
  assert.equal(formatScreencastKey({ metaKey: true, altKey: true, key: "i" }), "⌘⌥i");
  assert.equal(formatScreencastKey({ shiftKey: true, key: " " }), "⇧Space");
  assert.equal(formatScreencastModifiers({ meta: true, shift: true }), "⌘⇧");
  assert.deepEqual(screencastModifierState({ metaKey: true, altKey: true }), { alt: true, ctrl: false, meta: true, shift: false });
  assert.equal(isScreencastModifierKey({ key: "Meta" }), true);
  assert.equal(isScreencastModifierKey({ key: "m" }), false);
});

test("describes common canvas tools", () => {
  assert.equal(screencastToolLabel("freedraw"), "Pencil");
  assert.equal(screencastToolIcon("freedraw"), "✎");
  assert.equal(screencastToolIcon("hand"), "↔");
  assert.equal(screencastToolLabel("unknown-tool"), "Unknown Tool");
});

test("keeps a draggable overlay inside the viewport", () => {
  assert.deepEqual(clampScreencastPosition({ x: 900, y: 700 }, { width: 1000, height: 800 }, { width: 220, height: 110 }), { x: 772, y: 682 });
  assert.deepEqual(clampScreencastPosition({ x: -10, y: -5 }, { width: 1000, height: 800 }, { width: 220, height: 110 }), { x: 8, y: 8 });
});
