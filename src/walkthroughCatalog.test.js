import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLED_HELP_CATALOG,
  BUNDLED_WALKTHROUGHS,
  MARIONETTE_WALKTHROUGH,
  MARIONETTE_WALKTHROUGH_ID,
} from "./walkthroughCatalog.js";

test("bundled marionette case study is discoverable and staged", () => {
  assert.ok(BUNDLED_WALKTHROUGHS.some(item => item.id === MARIONETTE_WALKTHROUGH_ID));
  assert.equal(MARIONETTE_WALKTHROUGH.steps.length, 7);
  assert.deepEqual(MARIONETTE_WALKTHROUGH.steps.map(step => step.id), [
    "construct-costume",
    "inspect-rig",
    "live-pose",
    "wind-chime",
    "mediapipe-second-rig",
    "record-take",
    "review-take",
  ]);
  assert.equal(MARIONETTE_WALKTHROUGH.steps[0].advance.assertion.type, "physics.state");
  assert.equal(MARIONETTE_WALKTHROUGH.steps[3].cues[1].commandId, "physics.mapping.create");
  assert.equal(MARIONETTE_WALKTHROUGH.steps[4].cues[0].args.example, "mediapipe-schlemmer-pose");
  assert.equal(BUNDLED_HELP_CATALOG.find(item => item.id === "physics-marionette")?.walkthroughId, MARIONETTE_WALKTHROUGH_ID);
});
