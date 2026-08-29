import assert from "node:assert/strict";
import test from "node:test";
import { MANIM_DEMO_EXAMPLES } from "./manimDemoExamples.js";
import { validateManimSource } from "./manimFrame.js";
import { parseScriptParameters } from "./scriptParameters.js";

const byId = id => MANIM_DEMO_EXAMPLES.find(example => example.id === id);

test("Manim teaching demos include geometry, perceptron, and physics examples", () => {
  assert.deepEqual(
    MANIM_DEMO_EXAMPLES.map(example => example.id),
    ["pythagorean-rearrangement", "perceptron-and-gate", "double-pendulum"],
  );
  for (const example of MANIM_DEMO_EXAMPLES) {
    assert.equal(validateManimSource(example.source).valid, true, `${example.id} should parse as Manim Livecode`);
  }
});

test("perceptron demo exposes binary inputs, weights, and bias", () => {
  const parameters = parseScriptParameters(byId("perceptron-and-gate").source);
  assert.deepEqual(parameters.map(parameter => parameter.name), ["x1", "x2", "w1", "w2", "bias"]);
  assert.match(byId("perceptron-and-gate").source, /new Matrix/);
  assert.match(byId("perceptron-and-gate").source, /H\(z\)/);
});

test("double pendulum demo exposes initial state and simulation controls", () => {
  const example = byId("double-pendulum");
  const parameters = parseScriptParameters(example.source);
  assert.deepEqual(parameters.map(parameter => parameter.name), ["theta1", "theta2", "gravity", "duration"]);
  assert.match(example.source, /function accelerations/);
  assert.match(example.source, /new ValueTracker/);
  assert.match(example.source, /addUpdater/);
});
