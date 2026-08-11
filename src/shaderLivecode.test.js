import test from "node:test";
import assert from "node:assert/strict";
import {
  FLUID_BRUSH_FRAGMENT_SOURCE,
  getShaderExample,
  INKWASH_FRAGMENT_SOURCE,
  normalizeShaderCompositionSettings,
  SHADER_EXAMPLES,
  shaderExampleForSource,
  STOKES_FLUID_FRAGMENT_SOURCE,
  validateShaderSource,
} from "./shaderLivecode.js";

test("the bundled Stokes fragment shader satisfies the Livecode shader contract", () => {
  assert.deepEqual(validateShaderSource(STOKES_FLUID_FRAGMENT_SOURCE), { valid: true, error: "" });
  assert.match(STOKES_FLUID_FRAGMENT_SOURCE, /uniform vec2 u_resolution/);
  assert.match(STOKES_FLUID_FRAGMENT_SOURCE, /vec2 stokeslet/);
});

test("shader validation catches empty programs, missing entry points, and unmatched braces", () => {
  assert.equal(validateShaderSource("").valid, false);
  assert.equal(validateShaderSource("precision highp float;").valid, false);
  assert.equal(validateShaderSource("void main() {").valid, false);
  assert.equal(validateShaderSource("void main() { }}").valid, false);
});

test("the shader catalog exposes the excalishader examples, Inkwash, and Stokes", () => {
  assert.deepEqual(SHADER_EXAMPLES.map(example => example.id), ["hello", "rainbow", "shadow", "fluid", "inkwash", "stokes"]);
  SHADER_EXAMPLES.forEach(example => assert.equal(validateShaderSource(example.source).valid, true));
  assert.equal(getShaderExample("fluid").mode, "feedback");
  assert.equal(shaderExampleForSource(FLUID_BRUSH_FRAGMENT_SOURCE)?.id, "fluid");
  assert.equal(shaderExampleForSource(INKWASH_FRAGMENT_SOURCE)?.id, "inkwash");
  assert.equal(getShaderExample("missing").id, "hello");
  assert.match(FLUID_BRUSH_FRAGMENT_SOURCE, /uniform vec4 u_segments/);
  assert.match(FLUID_BRUSH_FRAGMENT_SOURCE, /uniform float u_sceneInteraction/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /float mobility/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /uniform float u_brushMode/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /float sceneCapacity/);
});

test("shader composition settings normalize optional layering and transparency", () => {
  assert.deepEqual(normalizeShaderCompositionSettings(), {
    compositeMode: "overlay",
    compositeOpacity: 1,
    blendMode: "normal",
    backgroundMode: "solid",
    sceneInteraction: true,
    emitterSource: "scene",
  });
  assert.deepEqual(normalizeShaderCompositionSettings({
    compositeMode: "underlay",
    compositeOpacity: 0.45,
    blendMode: "screen",
    backgroundMode: "transparent",
    sceneInteraction: false,
  }), {
    compositeMode: "underlay",
    compositeOpacity: 0.45,
    blendMode: "screen",
    backgroundMode: "transparent",
    sceneInteraction: false,
    emitterSource: "scene",
  });
  assert.equal(normalizeShaderCompositionSettings({ compositeOpacity: 5 }).compositeOpacity, 1);
  assert.equal(normalizeShaderCompositionSettings({ blendMode: "difference" }).blendMode, "normal");
  assert.equal(normalizeShaderCompositionSettings({ backgroundMode: "checkerboard" }).backgroundMode, "solid");
  assert.equal(normalizeShaderCompositionSettings({ emitterSource: "debug" }).emitterSource, "debug");
});
