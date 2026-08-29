import assert from "node:assert/strict";
import test from "node:test";
import {
  describeLivecodeRuntime,
  getLivecodeRuntimeConfig,
  hasNativeLivecodeRuntime,
  isLivecodeNodeRunnable,
  validateLivecodeNode,
} from "./livecodeAdapters.js";
import {
  createLivecodeNode,
  defaultLivecodeSource,
  getLivecodeEditorProfile,
  LIVECODE_KINDS,
} from "./livecodeNode.js";
import { getLivecodeExamples } from "./livecodeExamples.js";

test("Manim is a first-class runnable Livecode kind", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.manim,
    source: "const c = new Circle(); await scene.play(new Create(c));",
    runtime: { running: true, transportMode: "free" },
  });
  assert.equal(node.kind, "manim");
  assert.equal(getLivecodeEditorProfile(node), "javascript");
  assert.equal(validateLivecodeNode(node).valid, true);
  assert.equal(hasNativeLivecodeRuntime(node), true);
  assert.equal(isLivecodeNodeRunnable(node), true);
  assert.match(describeLivecodeRuntime(node), /manim-web/i);
});

test("Manim adapter passes parameters and progression settings to the frame", () => {
  const node = createLivecodeNode({
    kind: LIVECODE_KINDS.manim,
    source: "// @param a = 2 (0..4)\nconst value = __.params.a;",
    parameters: { a: 3 },
    runtime: { settings: { progressionMode: "cue", allowInteraction: false } },
    revision: 7,
  });
  const config = getLivecodeRuntimeConfig(node);
  assert.deepEqual(config.parameters, { a: 3 });
  assert.equal(config.progressionMode, "cue");
  assert.equal(config.allowInteraction, false);
  assert.equal(config.reloadNonce, 7);
});

test("Manim starter and teaching examples are available", () => {
  assert.match(defaultLivecodeSource(LIVECODE_KINDS.manim), /scene\.play/);
  const examples = getLivecodeExamples(LIVECODE_KINDS.manim);
  assert.ok(examples.length >= 4);
  assert.ok(examples.some(example => /@param/.test(example.source)));
  assert.ok(examples.some(example => /await cue/.test(example.source)));
});
