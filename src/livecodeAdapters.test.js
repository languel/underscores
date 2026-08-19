import test from "node:test";
import assert from "node:assert/strict";
import {
  getLivecodeP5SourceMode,
  getLivecodeRuntimeConfig,
  hasNativeLivecodeRuntime,
  isLivecodeNodeRunnable,
  validateLivecodeNode,
} from "./livecodeAdapters.js";
import { createLivecodeNode, LIVECODE_KINDS } from "./livecodeNode.js";

test("p5, Play Core, and shader nodes resolve through the native adapter registry", () => {
  const p5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function setup() {}", runtime: { running: true } });
  const play = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main() { return '.'; }", runtime: { running: true } });
  const shader = createLivecodeNode({ kind: LIVECODE_KINDS.shader, source: "#version 300 es\nvoid main() {}", runtime: { running: true } });
  assert.equal(hasNativeLivecodeRuntime(p5), true);
  assert.equal(hasNativeLivecodeRuntime(play), true);
  assert.equal(hasNativeLivecodeRuntime(shader), true);
  assert.equal(isLivecodeNodeRunnable(p5), true);
  assert.equal(isLivecodeNodeRunnable(play), true);
  assert.equal(isLivecodeNodeRunnable(shader), true);
  assert.equal(getLivecodeP5SourceMode(p5), "global");
  assert.equal(getLivecodeRuntimeConfig(play).source, play.source);
  assert.equal(getLivecodeRuntimeConfig(shader).source, shader.source);
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

test("adapter validation retains a bad draft without declaring it runnable", () => {
  const invalidP5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function {", runtime: { running: true } });
  const invalidPlay = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main( {", runtime: { running: true } });
  const invalidShader = createLivecodeNode({ kind: LIVECODE_KINDS.shader, source: "precision highp float;", runtime: { running: true } });
  assert.equal(validateLivecodeNode(invalidP5).valid, false);
  assert.equal(validateLivecodeNode(invalidPlay).valid, false);
  assert.equal(validateLivecodeNode(invalidShader).valid, false);
});

test("shader adapter accepts a compact Shadertoy body when the dialect is selected", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.shader,
    source: "vec3 p; o = vec4(p, 1.0);",
    runtime: { running: true, settings: { shaderDialect: "shadertoy" } },
  });
  assert.equal(validateLivecodeNode(node).valid, true);
});
