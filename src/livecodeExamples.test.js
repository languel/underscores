import test from "node:test";
import assert from "node:assert/strict";
import { getLivecodeExamples, LIVECODE_TEMPLATES } from "./livecodeExamples.js";
import { LIVECODE_KINDS } from "./livecodeNode.js";
import { ORCA_GRID_HEIGHT, ORCA_GRID_WIDTH, parseOrcaGrid, runOrcaFrame } from "./orcaEngine.js";

test("blank source templates remain available without a synthetic Barebones example", () => {
  for (const kind of Object.values(LIVECODE_KINDS)) {
    assert.ok(LIVECODE_TEMPLATES[kind], `${kind} should retain a source template`);
  }
  for (const kind of Object.values(LIVECODE_KINDS).filter(kind => kind !== LIVECODE_KINDS.shader)) {
    assert.ok(!getLivecodeExamples(kind).some(example => example.label === "Barebones"));
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
    ["starter", "four-on-the-floor", "hi-hat-grid", "slow-arpeggio", "bass-and-drums", "neon-night"],
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

test("Orca exposes full-grid note, loop, counter, and random starters", () => {
  const examples = getLivecodeExamples(LIVECODE_KINDS.orca);
  assert.deepEqual(
    examples.map(example => example.id),
    ["single-note", "clocked-note", "counter", "random-pattern", "random-melody-2bar"],
  );
  for (const example of examples) {
    const grid = parseOrcaGrid(example.source);
    assert.equal(grid.width, ORCA_GRID_WIDTH, `${example.id} should fit the Orca width`);
    assert.equal(grid.height, ORCA_GRID_HEIGHT, `${example.id} should fit the Orca height`);
  }
  assert.match(examples.find(example => example.id === "single-note").source, /\*:04Cf1/);
  assert.match(examples.find(example => example.id === "clocked-note").source, /1D4/);
  assert.match(examples.find(example => example.id === "counter").source, /1I8/);
  assert.match(examples.find(example => example.id === "random-pattern").source, /0Rf/);
  const randomMelody = examples.find(example => example.id === "random-melody-2bar");
  assert.equal(randomMelody.settings.orcaLoopFrames, 32);
  assert.match(randomMelody.source, /1D4/);
  assert.match(randomMelody.source, /:04/);
  let melodySource = randomMelody.source;
  const melodyFrames = [];
  for (let frame = 0; frame < 32; frame += 1) {
    const result = runOrcaFrame(melodySource, { frame });
    if (result.events.length) melodyFrames.push(frame);
    melodySource = result.source;
  }
  assert.deepEqual(melodyFrames, [0, 4, 8, 12, 16, 20, 24, 28]);

  const singleNote = runOrcaFrame(examples.find(example => example.id === "single-note").source, { frame: 0 });
  assert.equal(singleNote.events.length, 1);
  assert.equal(singleNote.events[0].type, "note");

  let clockedSource = examples.find(example => example.id === "clocked-note").source;
  const eventFrames = [];
  for (let frame = 0; frame <= 4; frame += 1) {
    const result = runOrcaFrame(clockedSource, { frame });
    if (result.events.length) eventFrames.push(frame);
    clockedSource = result.source;
  }
  assert.deepEqual(eventFrames, [0, 4]);
});
