import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaStreamsApi,
  disposeMediaStreamRuntime,
  setMediaSemanticFrame,
  setMediaStreamDescriptors,
} from "./mediaStreamRuntime.js";

test("semantic stream API resolves processors by id or name and stays live", () => {
  setMediaStreamDescriptors([{ id: "holistic-a", name: "Performer", sourceId: "camera-a" }]);
  const frames = [];
  const api = createMediaStreamsApi();
  const stream = api.get("Performer");
  const unsubscribe = stream.subscribe(frame => frames.push(frame));
  setMediaSemanticFrame("holistic-a", {
    available: true,
    updatedAt: performance.now(),
    feature: id => ({ id, available: true, scene: { x: 3, y: 4 } }),
    features: query => [{ id: query }],
  });
  assert.equal(api.get("holistic-a").available, true);
  assert.deepEqual(stream.feature("pose.nose", { space: "scene" }).position, { x: 3, y: 4 });
  assert.deepEqual(stream.features("hand"), [{ id: "hand" }]);
  assert.equal(frames.length, 1);
  unsubscribe();
  disposeMediaStreamRuntime();
});
