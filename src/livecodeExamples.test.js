import test from "node:test";
import assert from "node:assert/strict";
import { getLivecodeExamples, LIVECODE_TEMPLATES } from "./livecodeExamples.js";
import { LIVECODE_KINDS } from "./livecodeNode.js";

test("every Livecode kind exposes a selectable barebones template", () => {
  for (const kind of Object.values(LIVECODE_KINDS).filter(kind => kind !== LIVECODE_KINDS.shader)) {
    const examples = getLivecodeExamples(kind);
    const bare = examples.find(example => example.id === "bare");
    assert.ok(bare, `${kind} should expose a barebones example`);
    assert.equal(bare.source, LIVECODE_TEMPLATES[kind]);
    assert.ok(bare.source.length > 0, `${kind} template should not be empty`);
  }
});

test("kind-specific example catalogs retain their existing starters", () => {
  assert.ok(getLivecodeExamples(LIVECODE_KINDS.p5).length > 1);
  assert.ok(getLivecodeExamples(LIVECODE_KINDS.playcore).length > 1);
  assert.ok(getLivecodeExamples(LIVECODE_KINDS.shader).some(example => example.id === "hello"));
});
