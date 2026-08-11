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

test("adapter validation retains a bad draft without declaring it runnable", () => {
  const invalidP5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function {", runtime: { running: true } });
  const invalidPlay = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main( {", runtime: { running: true } });
  const invalidShader = createLivecodeNode({ kind: LIVECODE_KINDS.shader, source: "precision highp float;", runtime: { running: true } });
  assert.equal(validateLivecodeNode(invalidP5).valid, false);
  assert.equal(validateLivecodeNode(invalidPlay).valid, false);
  assert.equal(validateLivecodeNode(invalidShader).valid, false);
});
