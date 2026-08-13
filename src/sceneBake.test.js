import test from "node:test";
import assert from "node:assert/strict";
import { createBakedImageElement, createBakedImageFile, createCanvasSnapshotImageElement, replaceSceneElementsWithBake } from "./sceneBake.js";

test("creates one image host that records its baked source set", () => {
  const element = createBakedImageElement({
    fileId: "file-1",
    bounds: { minX: 10, minY: 20, maxX: 210, maxY: 120 },
    sourceElements: [{ id: "a", frameId: "frame" }, { id: "b", frameId: "frame" }],
    now: 42,
  });
  assert.equal(element.type, "image");
  assert.deepEqual([element.x, element.y, element.width, element.height], [10, 20, 200, 100]);
  assert.equal(element.frameId, "frame");
  assert.deepEqual(element.customData.underscoresBake.sourceElementIds, ["a", "b"]);
  assert.equal(createBakedImageFile({ fileId: "file-1", dataURL: "data:image/png;base64,x", now: 42 }).mimeType, "image/png");
});

test("replaces selected objects in one transaction without moving the bake above later scene content", () => {
  const baked = { id: "baked", type: "image" };
  const result = replaceSceneElementsWithBake([
    { id: "below", version: 1 },
    { id: "a", version: 2 },
    { id: "b", version: 3 },
    { id: "above", version: 1 },
  ], ["a", "b"], baked, 50);
  assert.deepEqual(result.map(element => element.id), ["below", "baked", "a", "b", "above"]);
  assert.equal(result.find(element => element.id === "a").isDeleted, true);
  assert.equal(result.find(element => element.id === "b").version, 4);
  assert.equal(result.find(element => element.id === "above").isDeleted, undefined);
});

test("canvas snapshots preserve the live host transform without deleting its source", () => {
  const image = createCanvasSnapshotImageElement({
    fileId: "holistic-png",
    sourceElement: {
      id: "holistic",
      x: 30,
      y: 40,
      width: 320,
      height: 240,
      angle: Math.PI / 6,
      frameId: "frame",
    },
    label: "Holistic PNG snapshot",
    now: 75,
  });
  assert.deepEqual([image.x, image.y, image.width, image.height], [30, 40, 320, 240]);
  assert.equal(image.angle, Math.PI / 6);
  assert.equal(image.frameId, "frame");
  assert.equal(image.customData.underscoresLabel, "Holistic PNG snapshot");
  assert.deepEqual(image.customData.underscoresSnapshot, {
    version: 1,
    format: "png",
    sourceElementId: "holistic",
    createdAt: 75,
  });
});
