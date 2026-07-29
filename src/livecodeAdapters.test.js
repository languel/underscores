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

test("p5 and Play Core nodes resolve through the native adapter registry", () => {
  const p5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function setup() {}", runtime: { running: true } });
  const play = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main() { return '.'; }", runtime: { running: true } });
  assert.equal(hasNativeLivecodeRuntime(p5), true);
  assert.equal(hasNativeLivecodeRuntime(play), true);
  assert.equal(isLivecodeNodeRunnable(p5), true);
  assert.equal(isLivecodeNodeRunnable(play), true);
  assert.equal(getLivecodeP5SourceMode(p5), "global");
  assert.equal(getLivecodeRuntimeConfig(play).source, play.source);
});

test("adapter validation retains a bad draft without declaring it runnable", () => {
  const invalidP5 = createLivecodeNode({ kind: LIVECODE_KINDS.p5, source: "function {", runtime: { running: true } });
  const invalidPlay = createLivecodeNode({ kind: LIVECODE_KINDS.playcore, source: "export function main( {", runtime: { running: true } });
  assert.equal(validateLivecodeNode(invalidP5).valid, false);
  assert.equal(validateLivecodeNode(invalidPlay).valid, false);
});
