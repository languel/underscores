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

test("object eyedropper defaults to Option-I", () => {
  const event = { code: "KeyI", metaKey: false, ctrlKey: false, altKey: true, shiftKey: false };
  assert.equal(shortcutFromEvent(event), "Alt+KeyI");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "object.eyedropper");
});

test("object picker defaults to Option-Shift-O", () => {
  const event = { code: "KeyO", metaKey: false, ctrlKey: false, altKey: true, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Alt+Shift+KeyO");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "object.pick.fromCanvas");
});

test("context AI command defaults to Option-Shift-minus", () => {
  const event = { code: "Minus", metaKey: false, ctrlKey: false, altKey: true, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Alt+Shift+Minus");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "ai.context.prompt");
});

test("canvas help, bare slash, and greater-than shortcuts use the shared registry", () => {
  assert.equal(DEFAULT_SHORTCUTS["documentation.shortcuts"], "Shift+Slash");
  assert.equal(shortcutFromEvent({ code: "Slash", shiftKey: true }), "Shift+Slash");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, { code: "Slash", shiftKey: true })?.id, "documentation.shortcuts");

  assert.equal(shortcutFromEvent({ code: "Slash" }), "Slash");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, { code: "Slash" })?.id, "command.palette.toggle");

  assert.equal(shortcutFromEvent({ code: "Period", shiftKey: true }), "Shift+Period");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, { code: "Period", shiftKey: true })?.id, "ai.context.prompt");
});

test("session recording defaults to Command-Option-R on macOS", () => {
  assert.equal(DEFAULT_SHORTCUTS["history.record.toggle"], "Mod+Alt+KeyR");
  const event = { code: "KeyR", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
  assert.equal(shortcutFromEvent(event), "Mod+Alt+KeyR");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "history.record.toggle");
});

test("migrates the former recording binding to the portable Mod shortcut", () => {
  const bindings = normalizeShortcutBindings({ "history.record.toggle": "Ctrl+Alt+KeyR" });
  assert.equal(bindings["history.record.toggle"], "Mod+Alt+KeyR");
});

test("clear scene uses the explicit Ctrl+Shift+Backspace binding", () => {
  const event = { code: "Backspace", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Ctrl+Shift+Backspace");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "iannix.command.clear");
});

test("clear scene also accepts Ctrl+Shift+Delete", () => {
  const event = { code: "Delete", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Ctrl+Shift+Delete");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "iannix.command.clear");
});

test("workspace reset uses Ctrl+Alt+Shift+D", () => {
  const event = { code: "KeyD", ctrlKey: true, altKey: true, shiftKey: true };
  assert.equal(shortcutFromEvent(event), "Ctrl+Alt+Shift+KeyD");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, event)?.id, "workspace.reset.defaults");
});

test("panel shortcuts open Properties on Command-Option-P and toggle the physics toolbar on Control-Option-P", () => {
  assert.equal(DEFAULT_SHORTCUTS["panel-mods"], undefined);
  assert.equal(DEFAULT_SHORTCUTS["mods.float.toggle"], undefined);

  const propertiesEvent = { code: "KeyP", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
  assert.equal(shortcutFromEvent(propertiesEvent), "Mod+Alt+KeyP");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, propertiesEvent)?.id, "panel-properties.open");

  const physicsToolbarEvent = { code: "KeyP", metaKey: false, ctrlKey: true, altKey: true, shiftKey: false };
  assert.equal(shortcutFromEvent(physicsToolbarEvent), "Ctrl+Alt+KeyP");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, physicsToolbarEvent)?.id, "physics.toolbar.toggle");
});

test("layer shortcuts reserve the native bracket chords for the shared scene stack", () => {
  const sendBackward = { code: "BracketLeft", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
  const bringForward = { code: "BracketRight", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
  const sendToBack = { code: "BracketLeft", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };
  const bringToFront = { code: "BracketRight", metaKey: true, ctrlKey: false, altKey: true, shiftKey: false };

  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, sendBackward)?.id, "scene.layer.sendBackward");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, bringForward)?.id, "scene.layer.bringForward");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, sendToBack)?.id, "scene.layer.sendToBack");
  assert.equal(findShortcutAction(DEFAULT_SHORTCUTS, bringToFront)?.id, "scene.layer.bringToFront");
});

test("ignores bare modifier presses", () => {
  assert.equal(shortcutFromEvent({ code: "ShiftLeft", shiftKey: true }), null);
});
