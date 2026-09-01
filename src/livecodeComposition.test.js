import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIVECODE_COMPOSITION,
  LIVECODE_BLEND_MODES,
  LIVECODE_COMPOSITE_MODES,
  isLivecodeUnderlayVisible,
  livecodeRendererSettings,
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
    compositeMode: "overlay",
    compositeOpacity: 1,
    blendMode: "normal",
    backgroundMode: "transparent",
    persistence: "auto",
  });
  assert.deepEqual(normalizeLivecodeComposition({ transparent: false }), {
    compositeMode: "overlay",
    compositeOpacity: 1,
    blendMode: "normal",
    backgroundMode: "solid",
    persistence: "auto",
  });
});

test("composition settings normalize shared layer, opacity, and blend controls", () => {
  assert.deepEqual(normalizeLivecodeComposition({
    compositeMode: "underlay",
    compositeOpacity: 0.35,
    blendMode: "screen",
  }), {
    ...DEFAULT_LIVECODE_COMPOSITION,
    compositeMode: "underlay",
    compositeOpacity: 0.35,
    blendMode: "screen",
  });
  assert.deepEqual(LIVECODE_COMPOSITE_MODES, ["overlay", "underlay"]);
  assert.deepEqual(LIVECODE_BLEND_MODES, ["normal", "screen", "multiply", "overlay", "soft-light"]);
  assert.equal(normalizeLivecodeComposition({ compositeOpacity: -2 }).compositeOpacity, 0);
  assert.equal(normalizeLivecodeComposition({ compositeOpacity: 9 }).compositeOpacity, 1);
  assert.equal(normalizeLivecodeComposition({ blendMode: "difference" }).blendMode, "normal");
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

test("underlay visibility follows authored presentation state", () => {
  assert.equal(isLivecodeUnderlayVisible({}), false);
  assert.equal(isLivecodeUnderlayVisible({
    customData: { underscoresLivecode: { kind: "markdown", runtime: { settings: { compositeMode: "underlay" } } } },
  }), true);
});

test("stopped shader underlays require a retained frame", () => {
  const element = {
    customData: {
      underscoresLivecode: {
        kind: "shader",
        runtime: { running: false, settings: { compositeMode: "underlay" } },
      },
    },
  };
  assert.equal(isLivecodeUnderlayVisible(element), false);
  assert.equal(isLivecodeUnderlayVisible(element, { hasRetainedFrame: true }), true);
  element.customData.underscoresLivecode.runtime.settings.keepLastFrame = false;
  assert.equal(isLivecodeUnderlayVisible(element, { hasRetainedFrame: true }), false);
});

test("compositor-only settings do not participate in renderer identity", () => {
  assert.deepEqual(livecodeRendererSettings({
    compositeMode: "underlay",
    compositeOpacity: 0.5,
    blendMode: "screen",
    backgroundMode: "transparent",
    persistence: "clear",
    fps: 24,
  }), {
    backgroundMode: "transparent",
    persistence: "clear",
    fps: 24,
  });
});
