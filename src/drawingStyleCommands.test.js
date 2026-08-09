import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRoughnessValue, normalizeRoundnessValue, parseDrawingStyleSlash } from "./drawingStyleCommands.js";

test("drawing style slash commands parse their compact forms", () => {
  assert.deepEqual(parseDrawingStyleSlash("/roughness 2"), { id: "geometry.roughness.set", args: { value: 2 } });
  assert.deepEqual(parseDrawingStyleSlash("/sharp"), { id: "geometry.roundness.sharp", args: { value: 0 } });
  assert.deepEqual(parseDrawingStyleSlash("/round"), { id: "geometry.roundness.round", args: { value: 1 } });
  assert.deepEqual(parseDrawingStyleSlash("/roundness 0"), { id: "geometry.roundness.set", args: { value: 0 } });
  assert.equal(parseDrawingStyleSlash("/roughness 3"), null);
  assert.equal(parseDrawingStyleSlash("/roundness 2"), null);
});

test("drawing style values are constrained to the supported Excalidraw range", () => {
  assert.equal(normalizeRoughnessValue("0"), 0);
  assert.equal(normalizeRoughnessValue(2), 2);
  assert.equal(normalizeRoundnessValue(false), 0);
  assert.equal(normalizeRoundnessValue("1"), 1);
  assert.throws(() => normalizeRoughnessValue(2.5), /Roughness must be/);
  assert.throws(() => normalizeRoundnessValue(3), /Roundness must be/);
});
