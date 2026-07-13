import test from "node:test";
import assert from "node:assert/strict";

import { inferAxisFlipSign, mapTrackPointToElement, removeModifierAt, resampleStrokeByDistance, resolveBakedTracks } from "./modifierStack.js";

const base = [[0, 0], [10, 10]];
const left = [[-2, 0], [8, 10]];
const right = [[2, 0], [12, 10]];

test("filter-only output remains on the parent", () => {
  assert.deepEqual(resolveBakedTracks({
    primaryPoints: base,
    allLines: [base],
    hasAccumulated: false,
  }), {
    parentTrack: base,
    childTracks: [],
  });
});

test("brush primary track is owned by the parent and is not duplicated", () => {
  assert.deepEqual(resolveBakedTracks({
    primaryPoints: base,
    allLines: [base, left, right],
    hasAccumulated: true,
  }), {
    parentTrack: base,
    childTracks: [left, right],
  });
});

test("a brush without a baseline uses its first generated track as the parent", () => {
  assert.deepEqual(resolveBakedTracks({
    primaryPoints: base,
    allLines: [left, right],
    hasAccumulated: true,
  }), {
    parentTrack: left,
    childTracks: [right],
  });
});

test("invalid single-point tracks are not baked", () => {
  assert.deepEqual(resolveBakedTracks({
    primaryPoints: base,
    allLines: [base, [[4, 4]], right],
    hasAccumulated: true,
  }), {
    parentTrack: base,
    childTracks: [right],
  });
});

test("freedraw overlay anchors to the evaluated baseline bounds", () => {
  assert.deepEqual(mapTrackPointToElement({
    point: [24, 28],
    elementType: "freedraw",
    elementX: 100,
    elementY: 200,
    evaluatedBaseline: [[20, 25], [40, 35]],
  }), [104, 203]);
});

test("line overlay anchors to the evaluated baseline start point", () => {
  assert.deepEqual(mapTrackPointToElement({
    point: [24, 28],
    elementType: "line",
    elementX: 100,
    elementY: 200,
    elementFirstPoint: [3, 4],
    evaluatedBaseline: [[20, 25], [40, 35]],
    scaleX: 2,
    scaleY: 3,
  }), [111, 213]);
});

test("resampling a curve does not look like an axis flip", () => {
  const original = [[0, 0], [10, -8], [20, 7], [30, -4], [40, 10]];
  const resampled = [[0, 0], [5, -4], [10, -8], [15, 0], [20, 7], [25, 2], [30, -4], [35, 3], [40, 10]];
  assert.equal(inferAxisFlipSign(original, resampled, 0), 1);
  assert.equal(inferAxisFlipSign(original, resampled, 1), 1);
});

test("reversed axis direction is detected as a flip", () => {
  const original = [[0, 0], [10, 5], [20, 10]];
  const flippedX = [[20, 0], [10, 5], [0, 10]];
  assert.equal(inferAxisFlipSign(original, flippedX, 0), -1);
  assert.equal(inferAxisFlipSign(original, flippedX, 1), 1);
});

test("applying one modifier preserves every other modifier in stack order", () => {
  const modifiers = [
    { id: "rdp" },
    { id: "hairy" },
    { id: "simple" },
  ];

  assert.deepEqual(
    removeModifierAt(modifiers, 1).map(modifier => modifier.id),
    ["rdp", "simple"],
  );
});

test("distance sampling is independent of source point density", () => {
  const sparse = [[0, 0], [10, 0], [20, 0]];
  const dense = [[0, 0], [2, 0], [5, 0], [9, 0], [10, 0], [16, 0], [20, 0]];

  assert.deepEqual(
    resampleStrokeByDistance(sparse, 4).map(point => point.slice(0, 2)),
    resampleStrokeByDistance(dense, 4).map(point => point.slice(0, 2)),
  );
});

test("distance sampling interpolates temporal metadata", () => {
  const start = [0, 0];
  start.strokeTime = 0;
  const end = [10, 0];
  end.strokeTime = 100;

  const samples = resampleStrokeByDistance([start, end], 5);
  assert.equal(samples[1].strokeTime, 50);
  assert.equal(samples[1].sourceSegmentIndex, 0);
});
