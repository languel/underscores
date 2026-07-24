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

test("bottom dock collapse defaults to Mod+Shift+B", () => {
  const event = { code: "KeyB", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Mod+Shift+KeyB");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "dock.bottom.toggle");
});

test("clear scene uses the explicit Ctrl+Shift+Backspace binding", () => {
  const event = { code: "Backspace", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Ctrl+Shift+Backspace");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "iannix.command.clear");
});

test("workspace reset uses Ctrl+Alt+Shift+D", () => {
  const event = { code: "KeyD", ctrlKey: true, altKey: true, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Ctrl+Alt+Shift+KeyD");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "workspace.reset.defaults");
});

test("ignores bare modifier presses", () => {
  assert.equal(shortcutFromEvent({ code: "ShiftLeft", shiftKey: true }), null);
});
