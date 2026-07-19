import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SHORTCUTS, findShortcutAction, normalizeShortcutBindings, shortcutFromEvent } from "./shortcutSystem.js";

test("normalizes partial saved shortcuts against stable defaults", () => {
  const bindings = normalizeShortcutBindings({ "tool-select": "KeyS", unknown: "KeyX" });
  assert.equal(bindings["tool-select"], "KeyS");
  assert.equal(bindings["tool-freedraw"], DEFAULT_SHORTCUTS["tool-freedraw"]);
  assert.equal(bindings.unknown, undefined);
});

test("uses a portable Mod modifier and distinguishes shifted quote", () => {
  const event = { code: "Quote", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Mod+Shift+Quote");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "grid.visible.toggle");
});

test("ignores bare modifier presses", () => {
  assert.equal(shortcutFromEvent({ code: "ShiftLeft", shiftKey: true }), null);
});
