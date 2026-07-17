import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceMidiClockReceiver,
  createMidiClockReceiverState,
  createTimelineTicks,
  estimateMidiClockTempo,
  formatMusicalPosition,
  formatTimelinePosition,
  formatTimecode,
  frameToSeconds,
  midiClockIntervalMs,
  parseTimelinePosition,
  parseTimecode,
  secondsToFrame,
  secondsToMusicalPosition,
  songPositionToSeconds,
} from "./transport.js";

test("formats non-drop timecode at common frame rates", () => {
  assert.equal(formatTimecode(3661.5, 30), "01:01:01:15");
  assert.equal(formatTimecode(1, 24), "00:00:01:00");
});

test("projects seconds into bars, beats, and subdivisions", () => {
  assert.deepEqual(secondsToMusicalPosition(0, 120, { numerator: 4, denominator: 4 }), {
    bar: 1, beat: 1, sixteenth: 1, quarterNotes: 0,
  });
  assert.equal(formatMusicalPosition(2, 120, { numerator: 4, denominator: 4 }), "2.1.1");
  assert.equal(formatMusicalPosition(1.5, 120, { numerator: 3, denominator: 4 }), "2.1.1");
});

test("MIDI clock uses 24 PPQN and Song Position Pointer uses sixteenth notes", () => {
  assert.equal(midiClockIntervalMs(120), 20.833333333333332);
  assert.equal(songPositionToSeconds(8, 0, 120), 1);
});

test("incoming MIDI clock tempo estimation is damped", () => {
  const estimate = estimateMidiClockTempo(1000, 1020.8333333333, 120);
  assert.ok(Math.abs(estimate - 120) < 0.001);
});

test("incoming MIDI clock keeps the configured tempo unless tempo following is armed", () => {
  let state = createMidiClockReceiverState(120);
  for (const timestamp of [1000, 1001, 1021, 1042, 1043, 1063]) {
    const result = advanceMidiClockReceiver(state, timestamp, { followTempo: false });
    state = result.state;
    assert.equal(result.tempo, 120);
    assert.ok(Math.abs(result.secondsPerPulse - 1 / 48) < 1e-9);
  }
});

test("optional MIDI clock tempo following rejects rogue pulse intervals", () => {
  let state = createMidiClockReceiverState(120);
  let timestamp = 1000;
  const intervals = Array.from({ length: 40 }, (_, index) => index === 18 ? 1 : 20.833 + (index % 3 - 1) * 0.35);
  let result;
  for (const interval of intervals) {
    timestamp += interval;
    result = advanceMidiClockReceiver(state, timestamp, { followTempo: true });
    state = result.state;
  }
  assert.equal(result.ready, true);
  assert.ok(Math.abs(result.tempo - 120) < 1.5, `expected ~120 BPM, got ${result.tempo}`);
});

test("frame and timecode conversions share the selected FPS", () => {
  assert.equal(secondsToFrame(2.5, 24), 60);
  assert.equal(frameToSeconds(60, 24), 2.5);
  assert.equal(parseTimecode("00:00:02:12", 24), 2.5);
  assert.equal(formatTimelinePosition(2.5, "frame", { fps: 24 }), "60");
});

test("loop positions round-trip through every timeline display mode", () => {
  const options = { fps: 30, tempo: 120, signature: { numerator: 4, denominator: 4 } };
  assert.equal(parseTimelinePosition("90", "frame", options), 3);
  assert.equal(parseTimelinePosition("00:00:03:00", "timecode", options), 3);
  assert.equal(parseTimelinePosition("2.3.1", "beats", options), 3);
});

test("timeline ticks cover the complete visible range", () => {
  const ticks = createTimelineTicks(12, 6);
  assert.equal(ticks.length, 7);
  assert.deepEqual(ticks[0], { time: 0, percent: 0 });
  assert.deepEqual(ticks.at(-1), { time: 12, percent: 100 });
});
