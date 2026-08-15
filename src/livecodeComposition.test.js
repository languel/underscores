import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIVECODE_COMPOSITION,
  normalizeLivecodeComposition,
  resolveP5Transparency,
  shouldClearLivecodeFrame,
} from "./livecodeComposition.js";

test("composition settings default to adapter-owned behavior", () => {
  assert.deepEqual(normalizeLivecodeComposition(), DEFAULT_LIVECODE_COMPOSITION);
  assert.deepEqual(normalizeLivecodeComposition({ settings: {} }), DEFAULT_LIVECODE_COMPOSITION);
  assert.deepEqual(normalizeLivecodeComposition({ backgroundMode: "invalid", persistence: "invalid" }), DEFAULT_LIVECODE_COMPOSITION);
});

test("composition settings retain the legacy transparent hint", () => {
  assert.deepEqual(normalizeLivecodeComposition({ transparent: true }), {
    backgroundMode: "transparent",
    persistence: "auto",
  });
  assert.deepEqual(normalizeLivecodeComposition({ transparent: false }), {
    backgroundMode: "solid",
    persistence: "auto",
  });
});

test("p5 transparency preserves the existing livecode default until overridden", () => {
  assert.equal(resolveP5Transparency({}), true);
  assert.equal(resolveP5Transparency({ transparent: false }), false);
  assert.equal(resolveP5Transparency({ backgroundMode: "transparent", transparent: false }), true);
  assert.equal(resolveP5Transparency({ backgroundMode: "solid", transparent: true }), false);
});

test("frame clearing is explicit and does not add a per-frame default", () => {
  assert.equal(shouldClearLivecodeFrame({}), false);
  assert.equal(shouldClearLivecodeFrame({ persistence: "accumulate" }), false);
  assert.equal(shouldClearLivecodeFrame({ persistence: "clear" }), true);
});
