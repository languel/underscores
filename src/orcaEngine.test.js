import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrcaSelection,
  orcaNoteToMidi,
  parseOrcaGrid,
  patchOrcaSelection,
  runOrcaFrame,
  serializeOrcaGrid,
} from "./orcaEngine.js";

test("Orca grid text has stable dimensions and editable cells", () => {
  const grid = parseOrcaGrid("A.\n..", { width: 3, height: 2 });
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
  assert.equal(serializeOrcaGrid(grid), "A..\n...");
  assert.equal(patchOrcaSelection("...\n...", { x: 1, y: 0, width: 1, height: 1 }, "X", { width: 3, height: 2 }), ".XX\n.XX");
});

test("Orca selection remains within its grid", () => {
  const grid = parseOrcaGrid("...\n...", { width: 3, height: 2 });
  assert.deepEqual(normalizeOrcaSelection({ x: 8, y: -2, width: 8, height: -8 }, grid), { x: 2, y: 0, width: 0, height: 0 });
});

test("Orca clock writes its modulo output on a frame", () => {
  const result = runOrcaFrame("C2.\n...", { frame: 5, width: 3, height: 2 });
  assert.equal(result.source, "C2.\n1..");
  assert.equal(result.frame, 6);
});

test("Orca MIDI notes preserve the upstream base-36 note mapping", () => {
  assert.equal(orcaNoteToMidi("C", 5), 84);
  assert.equal(runOrcaFrame(".:25C.\n......", { frame: 0, width: 6, height: 2 }).events.length, 0);
  const result = runOrcaFrame("*:25C.\n......", { frame: 0, width: 6, height: 2 });
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], { type: "note", mono: false, channel: 3, note: 84, velocity: 55, durationFrames: 1 });
});
