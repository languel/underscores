import test from "node:test";
import assert from "node:assert/strict";
import {
  ORCA_GRID_HEIGHT,
  ORCA_GRID_MIN_HEIGHT,
  ORCA_GRID_MIN_WIDTH,
  ORCA_GRID_WIDTH,
  createEmptyOrcaSource,
  normalizeOrcaGridSize,
  normalizeOrcaSelection,
  orcaNoteToMidi,
  parseOrcaGrid,
  patchOrcaSelection,
  runOrcaFrame,
  serializeOrcaGrid,
} from "./orcaEngine.js";

test("Orca defaults expose the full editable grid", () => {
  const grid = parseOrcaGrid(createEmptyOrcaSource());
  assert.equal(grid.width, ORCA_GRID_WIDTH);
  assert.equal(grid.height, ORCA_GRID_HEIGHT);
  assert.equal(grid.cells.flat().length, ORCA_GRID_WIDTH * ORCA_GRID_HEIGHT);
});

test("Orca grid text has stable dimensions and editable cells", () => {
  const grid = parseOrcaGrid("A.\n..", { width: 3, height: 2 });
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 2);
  assert.equal(serializeOrcaGrid(grid), "A..\n...");
  assert.equal(patchOrcaSelection("...\n...", { x: 1, y: 0, width: 1, height: 1 }, "X", { width: 3, height: 2 }), ".XX\n.XX");
});

test("Orca grid dimensions can be explicitly resized without inheriting source bounds", () => {
  const grid = parseOrcaGrid("ABCDEFG\nHIJKLMN\nOPQRSTU", { width: 5, height: 2 });
  assert.equal(grid.width, 5);
  assert.equal(grid.height, 2);
  assert.equal(serializeOrcaGrid(grid), "ABCDE\nHIJKL");
  assert.deepEqual(normalizeOrcaGridSize({ width: 1, height: 1 }), { width: ORCA_GRID_MIN_WIDTH, height: ORCA_GRID_MIN_HEIGHT });
  assert.deepEqual(normalizeOrcaGridSize({ width: 999, height: 999 }), { width: 128, height: 128 });
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

test("Orca random stays within its inclusive base-36 range and advances by frame", () => {
  const values = Array.from({ length: 8 }, (_, frame) => {
    const result = runOrcaFrame("0Rf\n...", { frame, width: 3, height: 2 });
    return Number.parseInt(result.source.split("\n")[1][1], 36);
  });
  assert.ok(values.every(value => value >= 0 && value <= 15));
  assert.ok(new Set(values).size > 1);
});

test("Orca MIDI notes preserve the upstream base-36 note mapping", () => {
  assert.equal(orcaNoteToMidi("C", 5), 84);
  assert.equal(runOrcaFrame(".:25C.\n......", { frame: 0, width: 6, height: 2 }).events.length, 0);
  const result = runOrcaFrame("*:25C.\n......", { frame: 0, width: 6, height: 2 });
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], { type: "note", mono: false, channel: 3, note: 84, velocity: 55, durationFrames: 1 });
});
