import test from "node:test";
import assert from "node:assert/strict";
import {
  getGmProgramName,
  isPercussionChannel,
  makeProgramChange,
  normalizeGmPrograms,
} from "./generalMidi.js";

test("GM helpers use zero-based programs and one-based UI channels", () => {
  assert.equal(getGmProgramName(0), "Acoustic Grand Piano");
  assert.equal(getGmProgramName(32), "Acoustic Bass");
  assert.deepEqual(makeProgramChange(1, 0), [0xc0, 0]);
  assert.deepEqual(makeProgramChange(3, 32), [0xc2, 32]);
  assert.equal(isPercussionChannel(10), true);
  assert.equal(isPercussionChannel(9), false);
});

test("GM program persistence normalizes invalid and percussion values", () => {
  const programs = normalizeGmPrograms({ 1: 40, 2: 999, 3: 32, 10: 12 });
  assert.equal(programs[1], 40);
  assert.equal(programs[2], 0);
  assert.equal(programs[3], 32);
  assert.equal(programs[10], null);
});
