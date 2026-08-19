import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceTransportPlaybackTime,
  advanceMidiClockReceiver,
  createMidiClockReceiverState,
  createTimelineTicks,
  followTimelineViewRange,
  getTimelineSubdivision,
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
  snapTimelineTime,
  nextTransportLaunchTime,
  normalizeTransportLaunchQuantization,
  transportLaunchQuantizationSeconds,
  TRANSPORT_LAUNCH_QUANTIZATION_OPTIONS,
} from "./transport.js";

test("playback advances continuously between lower-rate timeline commits", () => {
  let time = 0;
  const physicsTimes = [];
  const timelineTimes = [];
  for (let frame = 1; frame <= 60; frame += 1) {
    time = advanceTransportPlaybackTime(time, 1 / 60, { rate: 1 });
    physicsTimes.push(time);
    if (frame % 2 === 0) timelineTimes.push(time);
  }
  assert.equal(new Set(physicsTimes).size, 60, "physics receives one distinct time per display frame");
  assert.equal(timelineTimes.length, 30, "the timeline may still render at its configured 30 fps");
  assert.ok(Math.abs(physicsTimes.at(-1) - 1) < 1e-9);
});

test("continuous playback preserves transport loop wrapping", () => {
  assert.ok(Math.abs(advanceTransportPlaybackTime(3.99, 0.02, {
    rate: 1,
    loopEnabled: true,
    loopStart: 1,
    loopEnd: 4,
  }) - 1.01) < 1e-9);
});

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

test("launch quantization resolves musical intervals and the next strict boundary", () => {
  assert.equal(TRANSPORT_LAUNCH_QUANTIZATION_OPTIONS.at(-1).value, "custom");
  assert.equal(transportLaunchQuantizationSeconds({ enabled: true, interval: "bar" }, {
    tempo: 120,
    signature: { numerator: 4, denominator: 4 },
  }), 2);
  assert.equal(nextTransportLaunchTime(1.1, { enabled: true, interval: "bar" }, {
    tempo: 120,
    signature: { numerator: 4, denominator: 4 },
  }), 2);
  assert.equal(nextTransportLaunchTime(2, { enabled: true, interval: "bar" }, {
    tempo: 120,
    signature: { numerator: 4, denominator: 4 },
  }), 4);
  assert.equal(transportLaunchQuantizationSeconds({ enabled: true, interval: "custom", customBeats: 1.5 }, {
    tempo: 120,
    signature: { numerator: 4, denominator: 4 },
  }), 0.75);
  assert.deepEqual(normalizeTransportLaunchQuantization({ enabled: true, interval: "invalid", customBeats: -1 }), {
    enabled: true,
    interval: "bar",
    customBeats: 4,
  });
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
  assert.equal(parseTimelinePosition("1.2.0", "beats", options), 3);
  assert.equal(formatTimelinePosition(3, "beats", options), "1.2.0");
});

test("timeline ticks cover the complete visible range", () => {
  const ticks = createTimelineTicks(12, 6);
  assert.equal(ticks.length, 7);
  assert.deepEqual(ticks[0], { time: 0, percent: 0 });
  assert.deepEqual(ticks.at(-1), { time: 12, percent: 100 });
});

test("timeline follow preserves zoom and moves only when the playhead exits", () => {
  const view = { start: 0, end: 10 };
  assert.deepEqual(followTimelineViewRange(view, 5, 100), view);
  assert.deepEqual(followTimelineViewRange(view, 12, 100), { start: 4.5, end: 14.5 });
  assert.deepEqual(followTimelineViewRange(view, 15, 10), { start: 5, end: 15 });
  assert.deepEqual(followTimelineViewRange({ start: 20, end: 30 }, 12, 100), { start: 9.5, end: 19.5 });
  assert.deepEqual(followTimelineViewRange(view, 12, 100, false), view);
});

test("beat timeline uses bars as major ticks and meter beats as subdivisions", () => {
  const options = { mode: "beats", tempo: 120, signature: { numerator: 4, denominator: 4 } };
  const ticks = createTimelineTicks(4, 12, options);
  assert.deepEqual(ticks.map(tick => [tick.time, tick.major]), [
    [0, true], [0.5, false], [1, false], [1.5, false], [2, true],
    [2.5, false], [3, false], [3.5, false], [4, true],
  ]);
  assert.deepEqual(getTimelineSubdivision(4, "beats", options), { minor: 0.5, major: 2 });
});

test("timeline modifier snapping follows the active display subdivision", () => {
  const beatOptions = { tempo: 120, signature: { numerator: 4, denominator: 4 } };
  assert.equal(snapTimelineTime(1.26, 8, "beats", beatOptions, "major"), 2);
  assert.equal(snapTimelineTime(1.26, 8, "beats", beatOptions, "minor"), 1.5);
  assert.ok(Math.abs(snapTimelineTime(1.26, 8, "frame", { fps: 30 }, "minor") - 38 / 30) < 1e-8);
  assert.equal(snapTimelineTime(1.26, 8, "timecode", { fps: 30 }, "minor"), 1);
});

test("frame timeline uses FPS multiples as majors and individual frames as minors", () => {
  const options = { mode: "frame", fps: 30 };
  const divisions = getTimelineSubdivision(10, "frame", options);
  assert.deepEqual(divisions, { minor: 1 / 30, major: 1 });
  const ticks = createTimelineTicks(2, 12, options);
  assert.equal(ticks.length, 61);
  assert.deepEqual(ticks.filter(tick => tick.major).map(tick => tick.time), [0, 1, 2]);
  assert.deepEqual(ticks.filter(tick => tick.showLabel).map(tick => secondsToFrame(tick.time, 30)), [0, 30, 60]);
});

test("timeline ticks use the visible window and adapt detail to its pixel width", () => {
  const options = { mode: "frame", fps: 30, rangeStart: 10, rangeEnd: 12, pixelWidth: 600 };
  const zoomed = createTimelineTicks(60, 12, options);
  assert.equal(zoomed[0].time, 10);
  assert.equal(zoomed.at(-1).time, 12);
  assert.equal(zoomed.length, 61, "two visible seconds retain individual frame lines");
  assert.deepEqual(zoomed.filter(tick => tick.major).map(tick => tick.time), [10, 11, 12]);

  const fitted = createTimelineTicks(60, 12, { ...options, rangeStart: 0, rangeEnd: 60 });
  assert.ok(fitted.length < 200, `expected adaptive detail, received ${fitted.length} ticks`);
  assert.ok(fitted.every(tick => tick.time >= 0 && tick.time <= 60));
});

test("beat timeline labels bars when beats are too dense and beats when zoomed in", () => {
  const base = { mode: "beats", tempo: 120, signature: { numerator: 4, denominator: 4 }, pixelWidth: 400 };
  const fitted = createTimelineTicks(20, 12, { ...base, rangeStart: 0, rangeEnd: 20 });
  assert.ok(fitted.filter(tick => tick.showLabel).every(tick => tick.major));

  const zoomed = createTimelineTicks(20, 12, { ...base, rangeStart: 4, rangeEnd: 6 });
  assert.ok(zoomed.some(tick => tick.showLabel && !tick.major));
  assert.equal(zoomed[0].percent, 0);
  assert.equal(zoomed.at(-1).percent, 100);
});
