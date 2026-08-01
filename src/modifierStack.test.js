import test from "node:test";
import assert from "node:assert/strict";

import { composePreviewTracks, composeRuntimeCursorTracks, inferAxisFlipSign, mapEvaluatedTrackToElement, mapTrackPointToElement, removeModifierAt, replaceModifierBrushAt, resampleStrokeByDistance, resolveBakedTracks, resolveBrushId, resolveDrawingModifiers, resolveHideOriginalControl } from "./modifierStack.js";

const base = [[0, 0], [10, 10]];
const left = [[-2, 0], [8, 10]];
const right = [[2, 0], [12, 10]];

test("baked brush tracks inherit a copied and resized source transform", () => {
  const track = [[8, 20], [18, 30]];
  track[0].pressure = 0.25;
  const mapped = mapEvaluatedTrackToElement({
    track,
    evaluatedBaseline: [[10, 20], [20, 30]],
    originalPoints: [[10, 20], [20, 30]],
    element: {
      type: "freedraw",
      x: 110,
      y: 220,
      width: 20,
      height: 20,
      angle: 0,
      points: [[0, 0], [20, 20]],
      customData: { lastWidth: 10, lastHeight: 10 },
    },
  });
  assert.deepEqual(mapped.map(point => [...point]), [[106, 220], [126, 240]]);
  assert.equal(mapped[0].pressure, 0.25);
});

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

test("brush preview includes the source path when it is visible", () => {
  assert.deepEqual(composePreviewTracks({
    primaryPoints: base,
    allLines: [left, right],
    hasAccumulated: true,
    hideOriginal: false,
  }), [base, left, right]);
});

test("brush preview omits the source path when that stroke hides it", () => {
  assert.deepEqual(composePreviewTracks({
    primaryPoints: base,
    allLines: [left, right],
    hasAccumulated: true,
    hideOriginal: true,
  }), [left, right]);
});

test("filter-only preview does not duplicate its primary path", () => {
  assert.deepEqual(composePreviewTracks({
    primaryPoints: base,
    allLines: [base],
    hasAccumulated: false,
    hideOriginal: false,
  }), [base]);
});

test("runtime cursor owns its source and every generated brush track", () => {
  assert.deepEqual(composeRuntimeCursorTracks({
    sourcePaths: [base],
    evaluatedTracks: [left, right],
    hasAccumulated: true,
    hideOriginal: false,
    muteModifiers: false,
  }), [base, left, right]);
});

test("runtime cursor respects hide-original and bypass semantics", () => {
  assert.deepEqual(composeRuntimeCursorTracks({
    sourcePaths: [base],
    evaluatedTracks: [left, right],
    hasAccumulated: true,
    hideOriginal: true,
    muteModifiers: false,
  }), [left, right]);
  assert.deepEqual(composeRuntimeCursorTracks({
    sourcePaths: [base],
    evaluatedTracks: [left, right],
    hasAccumulated: true,
    hideOriginal: false,
    muteModifiers: true,
  }), [base]);
});

test("hide original edits the selected stroke when one is selected", () => {
  assert.deepEqual(resolveHideOriginalControl({
    hasSelection: true,
    selectedHideOriginal: true,
    customBrushActive: true,
    nextStrokeHideOriginal: false,
  }), {
    checked: true,
    disabled: false,
    target: "selectedStroke",
  });
});

test("hide original arms only the next stroke in Mod Pen mode", () => {
  assert.deepEqual(resolveHideOriginalControl({
    hasSelection: false,
    selectedHideOriginal: false,
    customBrushActive: true,
    nextStrokeHideOriginal: true,
  }), {
    checked: true,
    disabled: false,
    target: "nextStroke",
  });
});

test("hide original has no target without a selection or Mod Pen", () => {
  assert.deepEqual(resolveHideOriginalControl({
    hasSelection: false,
    selectedHideOriginal: false,
    customBrushActive: false,
    nextStrokeHideOriginal: false,
  }), {
    checked: false,
    disabled: true,
    target: null,
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

test("modifier IDs resolve preset and user brush IDs without double-prefix ambiguity", () => {
  const brushes = [{ id: "growingHairy" }, { id: "custom-123" }];
  assert.equal(resolveBrushId("custom-growingHairy", brushes), "growingHairy");
  assert.equal(resolveBrushId("custom-custom-123", brushes), "custom-123");
  assert.equal(resolveBrushId("custom-123", brushes), "custom-123");
});

test("save-as retargets one modifier and clears its inline script override", () => {
  const modifiers = [
    { id: "custom-growingHairy", name: "Growing", params: { spacing: 3 }, codeOverride: "draft" },
    { id: "custom-simple", name: "Simple", params: {} },
  ];
  const replacement = { id: "user-42", name: "My Growing", code: "code", type: "brush" };
  const updated = replaceModifierBrushAt(modifiers, 0, replacement, { spacing: 7 });

  assert.equal(updated[0].id, "custom-user-42");
  assert.equal(updated[0].name, "My Growing");
  assert.deepEqual(updated[0].params, { spacing: 7 });
  assert.equal(updated[0].codeOverride, undefined);
  assert.equal(updated[1], modifiers[1]);
});

test("a visible global stack does not receive a hidden active brush modifier", () => {
  const rake = { id: "custom-rake", name: "Rake", enabled: true, params: { teeth: 5 } };
  const modifiers = resolveDrawingModifiers({
    activeBrushId: "growingHairy",
    activeBrush: { id: "growingHairy", name: "Growing Hairy" },
    activeParams: { spacing: 3 },
    globalModifiers: [rake],
  });

  assert.deepEqual(modifiers, [rake]);
});

test("an empty visible stack stays empty regardless of the editor brush", () => {
  const modifiers = resolveDrawingModifiers({
    activeBrushId: "growingHairy",
    activeBrush: { id: "growingHairy", name: "Growing Hairy" },
    activeParams: { spacing: 3 },
    globalModifiers: [],
  });

  assert.deepEqual(modifiers, []);
});
