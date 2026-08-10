import assert from "node:assert/strict";
import test from "node:test";
import { shouldPublishPhysicsPoses } from "./physicsWorkerCadence.js";

test("publishes every newly solved pose instead of throttling a 60 Hz world below display cadence", () => {
  assert.equal(shouldPublishPhysicsPoses({ totalSteps: 1, timestamp: 16.7, lastPoseAt: 8 }), true);
});

test("retains a bounded idle refresh without continuously publishing unchanged poses", () => {
  assert.equal(shouldPublishPhysicsPoses({ totalSteps: 0, timestamp: 19, lastPoseAt: 0 }), false);
  assert.equal(shouldPublishPhysicsPoses({ totalSteps: 0, timestamp: 20, lastPoseAt: 0 }), true);
});
