import test from "node:test";
import assert from "node:assert/strict";
import { createPlaylistItem, createPlaylistState, movePlaylistItem, playlistItemLabel } from "./playlist.js";

test("playlist state normalizes anchors and defaults", () => {
  const state = createPlaylistState({
    defaultDuration: 12,
    items: [{ id: "shot-a", elementId: "frame-a", duration: 3, transition: "fade" }],
  });
  assert.equal(state.version, 1);
  assert.equal(state.defaultDuration, 12);
  assert.deepEqual(state.items[0].elementIds, ["frame-a"]);
  assert.equal(state.items[0].transition, "fade");
  assert.equal(state.items[0].duration, 3);
  assert.equal(state.defaultDurationValue.expression, "12 s");
  assert.equal(state.items[0].durationValue.expression, "3 s");
});

test("playlist time values preserve authored units for display and editing", () => {
  const state = createPlaylistState({
    defaultDurationValue: { version: 1, expression: "1 bar", fallbackSeconds: 2 },
    items: [{ elementId: "frame-a", durationValue: { version: 1, expression: "2 beats", fallbackSeconds: 1 } }],
  });
  assert.equal(state.defaultDurationValue.expression, "1 bar");
  assert.equal(state.items[0].durationValue.expression, "2 beats");
  assert.equal(state.items[0].duration, 1);
});

test("playlist rows preserve trigger kind and bounded source", () => {
  const state = createPlaylistState({ items: [{ elementId: "frame-a", trigger: "command", triggerSource: "playlist.next", triggerTargetId: "node-a" }] });
  assert.equal(state.items[0].trigger, "command");
  assert.equal(state.items[0].triggerSource, "playlist.next");
  assert.equal(state.items[0].triggerTargetId, "node-a");
  const item = createPlaylistItem({ elementIds: ["frame-b"], trigger: "js", triggerSource: "__.playlist.next()", triggerTargetId: "node-b" });
  assert.equal(item.trigger, "js");
  assert.equal(item.triggerSource, "__.playlist.next()");
  assert.equal(item.triggerTargetId, "node-b");
});

test("playlist state keeps empty rows so they can be configured later", () => {
  const state = createPlaylistState({ items: [{ triggerTargetId: "node-a" }] });
  assert.equal(state.items.length, 1);
  assert.deepEqual(state.items[0].elementIds, []);
  assert.equal(playlistItemLabel(state.items[0]), "Empty playlist row");
});

test("playlist rows reorder without mutating the source", () => {
  const items = ["a", "b", "c"].map(id => createPlaylistItem({ elementIds: [id], label: id }));
  const reordered = movePlaylistItem(items, 0, 2);
  assert.deepEqual(reordered.map(item => item.label), ["b", "c", "a"]);
  assert.deepEqual(items.map(item => item.label), ["a", "b", "c"]);
});

test("playlist labels reflect one or many anchors", () => {
  const one = createPlaylistItem({ elementIds: ["frame-a"] });
  assert.equal(playlistItemLabel(one, [{ id: "frame-a", label: "Opening" }]), "Opening");
  const many = createPlaylistItem({ elementIds: ["frame-a", "frame-b"] });
  assert.equal(playlistItemLabel(many, [{ id: "frame-a" }, { id: "frame-b" }]), "2 objects");
});
