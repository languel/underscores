import test from "node:test";
import assert from "node:assert/strict";
import {
  getLivecodeP5SourceMode,
  getLivecodeCompositionCapabilities,
  getLivecodeRuntimeConfig,
  hasNativeLivecodeRuntime,
  isLivecodeNodeRunnable,
  validateLivecodeNode,
} from "./livecodeAdapters.js";
import { createLivecodeNode, LIVECODE_KINDS } from "./livecodeNode.js";

test("p5, Three.js, Play Core, and shader nodes resolve through the native adapter registry", () => {
  const p5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function setup() {}", runtime: { running: true } });
  const three = createLivecodeNode({ kind: LIVECODE_KINDS.three, source: "scene.add(new THREE.Scene());", runtime: { running: true } });
  const play = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main() { return '.'; }", runtime: { running: true } });
  const shader = createLivecodeNode({ kind: LIVECODE_KINDS.shader, source: "#version 300 es\nvoid main() {}", runtime: { running: true } });
  const tixy = createLivecodeNode({ kind: LIVECODE_KINDS.tixy, source: "sin(t + x)", runtime: { running: true } });
  assert.equal(hasNativeLivecodeRuntime(p5), true);
  assert.equal(hasNativeLivecodeRuntime(three), true);
  assert.equal(hasNativeLivecodeRuntime(play), true);
  assert.equal(hasNativeLivecodeRuntime(shader), true);
  assert.equal(hasNativeLivecodeRuntime(tixy), true);
  assert.equal(isLivecodeNodeRunnable(p5), true);
  assert.equal(isLivecodeNodeRunnable(three), true);
  assert.equal(isLivecodeNodeRunnable(play), true);
  assert.equal(isLivecodeNodeRunnable(shader), true);
  assert.equal(isLivecodeNodeRunnable(tixy), true);
  assert.equal(getLivecodeP5SourceMode(p5), "global");
  assert.equal(getLivecodeRuntimeConfig(play).source, play.source);
  assert.equal(getLivecodeRuntimeConfig(three).source, three.source);
  assert.equal(getLivecodeRuntimeConfig(three).transparent, true);
  assert.equal(getLivecodeRuntimeConfig(shader).source, shader.source);
  assert.equal(getLivecodeRuntimeConfig(tixy).source, tixy.source);
  assert.equal(getLivecodeRuntimeConfig(tixy).fps, 60);
});

test("visual adapters declare compositing capabilities without adding renderer work", () => {
  const p5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5 });
  const shader = createLivecodeNode({ kind: LIVECODE_KINDS.shader });
  const three = createLivecodeNode({ kind: LIVECODE_KINDS.three });
  const markdown = createLivecodeNode({ kind: LIVECODE_KINDS.markdown });
  assert.deepEqual(getLivecodeCompositionCapabilities(p5).compositeModes, ["overlay", "underlay"]);
  assert.deepEqual(getLivecodeCompositionCapabilities(markdown).blendModes, ["normal", "screen", "multiply", "overlay", "soft-light"]);
  assert.deepEqual(getLivecodeCompositionCapabilities(p5).persistenceModes, ["auto", "clear", "accumulate"]);
  assert.deepEqual(getLivecodeCompositionCapabilities(shader).backgroundModes, ["solid", "transparent"]);
  assert.deepEqual(getLivecodeCompositionCapabilities(three).blendModes, ["normal", "screen", "multiply", "overlay", "soft-light"]);
  assert.deepEqual(getLivecodeCompositionCapabilities(markdown).backgroundModes, ["auto", "transparent", "theme", "solid"]);
});

test("SVG livecode uses the presentation adapter and validates complete SVG documents", () => {
  const svg = createLivecodeNode({ kind: LIVECODE_KINDS.svg, source: '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="4" /></svg>' });
  assert.equal(hasNativeLivecodeRuntime(svg), false);
  assert.equal(isLivecodeNodeRunnable(svg), false);
  assert.equal(validateLivecodeNode(svg).valid, true);
  assert.equal(validateLivecodeNode(createLivecodeNode({ kind: LIVECODE_KINDS.svg, source: "<circle />" })).valid, false);
});

test("p5 livecode uses the authored mode setting and display-density backing store by default", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.p5,
    source: "function draw() {}",
    runtime: { running: true, settings: { p5Mode: "global" } },
  });
  const config = getLivecodeRuntimeConfig(node);
  assert.equal(config.mode, "global");
  assert.equal(config.p5Version, "2");
  assert.equal(config.fps, 120);
  assert.equal(config.pixelDensity, null);
  assert.equal(config.backgroundMode, "auto");
  assert.equal(config.persistence, "auto");

  const legacy = getLivecodeRuntimeConfig({
    ...node,
    runtime: { ...node.runtime, settings: { p5Version: "1" } },
  });
  assert.equal(legacy.p5Version, "1");
});

test("p5 livecode exposes explicit shared composition settings without changing Strudel", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.p5,
    source: "function draw() {}",
    runtime: { running: true, settings: { backgroundMode: "transparent", persistence: "clear" } },
  });
  const config = getLivecodeRuntimeConfig(node);
  assert.equal(config.transparent, true);
  assert.equal(config.backgroundMode, "transparent");
  assert.equal(config.persistence, "clear");

  const strudel = createLivecodeNode({
    kind: LIVECODE_KINDS.strudel,
    source: '$: note("c3")',
    runtime: { running: true, settings: { backgroundMode: "transparent", persistence: "clear" } },
  });
  assert.deepEqual(getLivecodeRuntimeConfig(strudel).runtime.settings, {
    backgroundMode: "transparent",
    persistence: "clear",
    evaluatedSource: '$: note("c3")',
    evaluationRevision: 0,
  });
});

test("manual-update runtimes expose the last evaluated source to adapters", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.p5,
    source: "function draw() { circle(20, 20, 10); }",
    runtime: {
      running: true,
      settings: {
        autoUpdate: false,
        evaluatedSource: "function draw() { background(0); }",
        evaluationRevision: 3,
      },
    },
  });
  assert.equal(getLivecodeRuntimeConfig(node).source, node.runtime.settings.evaluatedSource);
});

test("adapter validation retains a bad draft without declaring it runnable", () => {
  const invalidP5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function {", runtime: { running: true } });
  const invalidPlay = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main( {", runtime: { running: true } });
  const invalidShader = createLivecodeNode({ kind: LIVECODE_KINDS.shader, source: "precision highp float;", runtime: { running: true } });
  const invalidThree = createLivecodeNode({ kind: LIVECODE_KINDS.three, source: "const = nope", runtime: { running: true } });
  const invalidTixy = createLivecodeNode({ kind: LIVECODE_KINDS.tixy, source: "(t, i, x, y) =>", runtime: { running: true } });
  assert.equal(validateLivecodeNode(invalidP5).valid, false);
  assert.equal(validateLivecodeNode(invalidPlay).valid, false);
  assert.equal(validateLivecodeNode(invalidShader).valid, false);
  assert.equal(validateLivecodeNode(invalidThree).valid, false);
  assert.equal(validateLivecodeNode(invalidTixy).valid, false);
});

test("shader adapter accepts a compact Shadertoy body when the dialect is selected", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.shader,
    source: "vec3 p; o = vec4(p, 1.0);",
    runtime: { running: true, settings: { shaderDialect: "shadertoy" } },
  });
  assert.equal(validateLivecodeNode(node).valid, true);
});
