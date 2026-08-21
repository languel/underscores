import test from "node:test";
import assert from "node:assert/strict";
import {
  addElementArrangementClip,
  advanceArrangementRecordingClock,
  createArrangementClip,
  createArrangementIndex,
  createArrangementState,
  evaluateClipAtTime,
  getArrangementProjectEnd,
  getElementArrangementClips,
  migrateGestureToArrangement,
  queryArrangementLaneAtTime,
  remapArrangementForDuplicate,
  removeElementArrangementClip,
  selectArrangementClipAtTime,
  splitClipAcrossLoop,
} from "./arrangementClips.js";

const clip = overrides => createArrangementClip({
  id: overrides?.id || "clip-a",
  takeId: overrides?.takeId || "take-a",
  timing: {
    start: 2,
    duration: 4,
    durationMode: "fixed",
    sourceOffset: 0,
    rate: 1,
    loopMode: "once",
    ...(overrides?.timing || {}),
  },
  recording: { recordingId: "recording-a", ...(overrides?.recording || {}) },
});

test("fixed and hold clips evaluate without mutating authored timing", () => {
  assert.deepEqual(evaluateClipAtTime(clip(), 1, { intrinsicDuration: 3, projectEnd: 20 }), {
    active: false, localTime: 0, progress: 0, iteration: 0, complete: false, start: 2, end: 6,
  });
  const held = clip({ timing: { durationMode: "hold" } });
  assert.equal(evaluateClipAtTime(held, 19, { projectEnd: 20 }).active, true);
  assert.equal(evaluateClipAtTime(held, 20, { projectEnd: 20 }).active, false);
});

test("trim, rate, once completion, and loop evaluation map global to local time", () => {
  const trimmed = clip({ timing: { sourceOffset: 1, rate: 2 } });
  const state = evaluateClipAtTime(trimmed, 3, { intrinsicDuration: 2.5 });
  assert.equal(state.localTime, 2.5);
  assert.equal(state.complete, true);
  const looped = clip({ timing: { sourceOffset: 1, rate: 2, loopMode: "loop" } });
  assert.equal(evaluateClipAtTime(looped, 4, { intrinsicDuration: 2.5 }).localTime, 0);
  assert.equal(evaluateClipAtTime(looped, 4, { intrinsicDuration: 2.5 }).iteration, 2);
});

test("latest-started overlapping clip wins and an earlier clip resumes", () => {
  const early = clip({ id: "early", timing: { start: 0, duration: 10 } });
  const late = clip({ id: "late", timing: { start: 3, duration: 2 } });
  assert.equal(selectArrangementClipAtTime([early, late], 4)?.clip.id, "late");
  assert.equal(selectArrangementClipAtTime([early, late], 6)?.clip.id, "early");
});

test("take mute and solo participate in deterministic overlap selection", () => {
  const state = createArrangementState({ takes: [
    { id: "take-a", order: 0 },
    { id: "take-b", order: 1, solo: true },
  ] });
  const a = clip({ id: "a", takeId: "take-a", timing: { start: 0 } });
  const b = clip({ id: "b", takeId: "take-b", timing: { start: 0 } });
  assert.equal(selectArrangementClipAtTime([a, b], 1, { arrangementState: state })?.clip.id, "b");
});

test("project end includes fixed clips but hold clips do not extend it", () => {
  const element = addElementArrangementClip({ id: "one" }, clip({ timing: { start: 12, duration: 5 } }));
  const held = addElementArrangementClip({ id: "two" }, clip({ id: "hold", timing: { start: 30, duration: 50, durationMode: "hold" } }));
  assert.equal(getArrangementProjectEnd({ elements: [element, held], minimum: 10 }), 17);
});

test("first clip opts in and removing the final clip restores always-present semantics", () => {
  const arranged = addElementArrangementClip({ id: "one", customData: { keep: true } }, clip());
  assert.equal(getElementArrangementClips(arranged).length, 1);
  const restored = removeElementArrangementClip(arranged, "clip-a");
  assert.equal(getElementArrangementClips(restored).length, 0);
  assert.equal(restored.customData.keep, true);
});

test("enabled legacy gesture playback migrates to one equivalent clip", () => {
  const migrated = migrateGestureToArrangement({ id: "stroke", customData: { underscoresGesture: {
    id: "gesture-a", duration: 2, startTime: 3, durationValue: { version: 1, expression: "2 s", fallbackSeconds: 2 },
    loop: { start: 0, end: 4 }, playback: { enabled: true, mode: "loop" },
  } } });
  const [result] = getElementArrangementClips(migrated);
  assert.equal(result.timing.start, 3);
  assert.equal(result.timing.duration, 2);
  assert.equal(result.timing.loopMode, "loop");
});

test("duplicating an arranged object remaps clip and recording ids", () => {
  const original = addElementArrangementClip({ id: "one" }, clip({ takeId: "take-a" }));
  const duplicate = remapArrangementForDuplicate(original, { takeIdMap: new Map([["take-a", "take-copy"]]) });
  assert.notEqual(getElementArrangementClips(duplicate)[0].id, "clip-a");
  assert.notEqual(getElementArrangementClips(duplicate)[0].recording.recordingId, "recording-a");
  assert.equal(getElementArrangementClips(duplicate)[0].takeId, "take-copy");
});

test("cross-loop recordings split into linked source-continuous segments", () => {
  const crossing = clip({ timing: { start: 3.5, duration: 1, rate: 2 } });
  const parts = splitClipAcrossLoop(crossing, 0, 4);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].timing.duration, 0.5);
  assert.equal(parts[1].timing.start, 0);
  assert.equal(parts[1].timing.sourceOffset, 1);
  assert.equal(parts[0].recording.recordingId, parts[1].recording.recordingId);
});

test("recording clock preserves monotonic time and loop phase across wraps", () => {
  const clock = advanceArrangementRecordingClock({ unwrappedTime: 3.8, transportTime: 3.8, loopIteration: 0 }, 0.2, { enabled: true, start: 0, end: 4 });
  assert.ok(Math.abs(clock.unwrappedTime - 4.2) < 1e-9);
  assert.equal(clock.loopIteration, 1);
  assert.ok(Math.abs(clock.loopPhase - 0.2) < 1e-9);
});

test("index derives lanes only from clip-bearing objects", () => {
  const arranged = addElementArrangementClip({ id: "arranged" }, clip());
  const index = createArrangementIndex([{ id: "static" }, arranged]);
  assert.equal(index.lanes.length, 1);
  assert.equal(index.lanes[0].elementId, "arranged");
});

test("indexed schedule limits a 500 clip project to playhead-near candidates", () => {
  const elements = Array.from({ length: 100 }, (_, laneIndex) => ({
    id: `lane-${laneIndex}`,
    customData: {
      underscoresArrangement: {
        mode: "clips",
        clips: Array.from({ length: 5 }, (_, clipIndex) => createArrangementClip({
          id: `clip-${laneIndex}-${clipIndex}`,
          timing: { start: clipIndex * 10, duration: 2, durationMode: "fixed" },
        })),
      },
    },
  }));
  const index = createArrangementIndex(elements);
  assert.equal(index.lanes.length, 100);
  assert.equal(index.clips.length, 500);
  const candidates = index.lanes.flatMap(lane => queryArrangementLaneAtTime(lane, 10.5));
  assert.equal(candidates.length, 100);
  assert.ok(candidates.every(clip => clip.timing.start === 10));
});
