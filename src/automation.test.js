import test from "node:test";
import assert from "node:assert/strict";
import { autoKeyElement, collectAutomationKeys, evaluateElementAutomation, evaluateTrack } from "./automation.js";

test("auto-key records changed core and Underscore fields", () => {
  const previous = { id: "a", x: 0, y: 0, opacity: 100, customData: { modifiers: [] }, points: [[0, 0]] };
  const next = { ...previous, x: 20, customData: { modifiers: [{ brushId: "hairy" }] } };
  const keyed = autoKeyElement(previous, next, 2);
  assert.equal(keyed.customData.underscoreAutomation.tracks.x[0].value, 20);
  assert.equal(keyed.customData.underscoreAutomation.tracks["customData.modifiers"][0].interpolation, "step");
  assert.equal(collectAutomationKeys([keyed]).length, 2);
});

test("automation interpolates numerics and holds structured values", () => {
  assert.equal(evaluateTrack([
    { time: 0, value: 0, interpolation: "linear" },
    { time: 2, value: 10, interpolation: "linear" },
  ], 1), 5);
  const element = {
    id: "a",
    x: 0,
    customData: {
      underscoreAutomation: {
        tracks: { x: [
          { time: 0, value: 0, interpolation: "linear" },
          { time: 2, value: 10, interpolation: "linear" },
        ] },
      },
    },
  };
  assert.equal(evaluateElementAutomation(element, 1).x, 5);
});
