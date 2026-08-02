import test from "node:test";
import assert from "node:assert/strict";
import { samplePortraitLandmarkFixture } from "./physicsFixtures.js";

test("portrait landmark fixture loops deterministically in scene bounds", () => {
  const bounds = { x: 100, y: 200, width: 300, height: 400 };
  assert.deepEqual(samplePortraitLandmarkFixture(0, bounds), samplePortraitLandmarkFixture(4, bounds));
  assert.deepEqual(samplePortraitLandmarkFixture(1, bounds), { x: 262, y: 380 });
});
