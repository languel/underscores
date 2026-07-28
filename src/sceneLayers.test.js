import assert from "node:assert/strict";
import test from "node:test";
import { getOutlinerLayerElements, reorderSceneElements } from "./sceneLayers.js";

const element = id => ({ id });

test("the Outliner lists live scene layers front to back", () => {
  const layers = [element("back"), { ...element("deleted"), isDeleted: true }, element("front")];
  assert.deepEqual(getOutlinerLayerElements(layers).map(({ id }) => id), ["front", "back"]);
});

test("dropping above or below an Outliner layer changes canonical scene order", () => {
  const layers = [element("back"), element("middle"), element("front")];
  assert.deepEqual(
    reorderSceneElements(layers, "back", "front", "front").map(({ id }) => id),
    ["middle", "front", "back"],
  );
  assert.deepEqual(
    reorderSceneElements(layers, "back", "front", "back").map(({ id }) => id),
    ["middle", "back", "front"],
  );
});

test("invalid reorders preserve the current scene reference", () => {
  const layers = [element("one")];
  assert.equal(reorderSceneElements(layers, "one", "one"), layers);
  assert.equal(reorderSceneElements(layers, "missing", "one"), layers);
});
