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
