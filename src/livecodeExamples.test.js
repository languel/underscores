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

test("Strudel exposes basics, grooves, and a composed theme", () => {
  const examples = getLivecodeExamples(LIVECODE_KINDS.strudel);
  assert.deepEqual(
    examples.map(example => example.id),
    ["bare", "starter", "four-on-the-floor", "hi-hat-grid", "slow-arpeggio", "bass-and-drums", "neon-night"],
  );
  for (const example of examples) {
    assert.ok(example.name, `${example.id} should have a name`);
    assert.ok(example.source.includes("$:"), `${example.id} should contain a runnable Strudel voice`);
  }
  const theme = examples.find(example => example.id === "neon-night");
  assert.match(theme.source, /_pianoroll/);
  assert.match(theme.source, /color\(/);
  assert.match(theme.source, /s\("bd/);
});
