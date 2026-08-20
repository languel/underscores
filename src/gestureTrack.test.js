import test from "node:test";
import assert from "node:assert/strict";
import { createGestureTrack, getGesturePlaybackState, gesturePathProgressAtElapsed, sliceGesturePath } from "./gestureTrack.js";

const track = createGestureTrack({
  id: "gesture-a",
  duration: 2,
  startTime: 1,
  loopStart: 0,
  loopEnd: 4,
  enabled: true,
  samples: [
    { time: 0, pathProgress: 0 },
    { time: 500, pathProgress: 0.25 },
    { time: 2000, pathProgress: 1 },
  ],
});

test("gesture timing preserves recorded sample cadence", () => {
  assert.equal(gesturePathProgressAtElapsed(track, 0.5), 0.25);
  assert.equal(gesturePathProgressAtElapsed(track, 1.25), 0.625);
});

test("gesture timing maps sample cadence to travelled path length", () => {
  const paced = createGestureTrack({
    duration: 2,
    enabled: true,
    samples: [
      { time: 0, scene: { x: 0, y: 0 } },
      { time: 1000, scene: { x: 2, y: 0 } },
      { time: 2000, scene: { x: 10, y: 0 } },
    ],
  });
  assert.equal(gesturePathProgressAtElapsed(paced, 1), 0.2);
  assert.ok(Math.abs(gesturePathProgressAtElapsed(paced, 1.5) - 0.6) < 1e-9);
});

test("loop playback hides before its recorded phase and holds after completion", () => {
  assert.deepEqual(getGesturePlaybackState(track, 0.5), { visible: false, progress: 0, elapsed: 0, complete: false });
  assert.equal(getGesturePlaybackState(track, 1.5).progress, 0.25);
  assert.deepEqual(getGesturePlaybackState(track, 3.5), { visible: true, progress: 1, elapsed: 2.5, complete: true });
  assert.equal(getGesturePlaybackState(track, 4.5).visible, false);
});

test("loop playback can continue a stroke recorded across the loop boundary", () => {
  const crossing = createGestureTrack({
    duration: 1,
    startTime: 3.5,
    loopStart: 0,
    loopEnd: 4,
    enabled: true,
    samples: [{ time: 0 }, { time: 1000 }],
  });
  assert.equal(getGesturePlaybackState(crossing, 3.75).visible, true);
  assert.equal(getGesturePlaybackState(crossing, 0.25).progress, 0.75);
});

test("path slicing interpolates the reveal endpoint by arc length", () => {
  assert.deepEqual(sliceGesturePath([[0, 0], [10, 0], [10, 10]], 0.75), [[0, 0], [10, 0], [10, 5]]);
});
