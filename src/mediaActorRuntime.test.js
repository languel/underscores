import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaBindingRuntimeState,
  mediaBindingRuntimeHasExpired,
  mediaDrivenElementPosition,
  resolveMediaBindingGate,
  resolveMediaBindingSignal,
  shouldAppendMediaStrokePoint,
} from "./mediaActorRuntime.js";
import { createMediaBinding } from "./mediaStream.js";

const frameWith = features => ({ feature: id => features[id] || null });

test("binding smoothing and missing grace are per-binding and reset after loss", () => {
  const binding = createMediaBinding("drive-position", {
    signal: { smoothingMs: 40, missingGraceMs: 120, confidenceMin: 0.5 },
  });
  const state = createMediaBindingRuntimeState();
  let frame = frameWith({ "right_hand.palm": { available: true, confidence: null, scene: { x: 0, y: 0 } } });
  assert.deepEqual(resolveMediaBindingSignal(binding, frame, state, 100).point, { x: 0, y: 0 });
  frame = frameWith({ "right_hand.palm": { available: true, confidence: 0.9, scene: { x: 100, y: 0 } } });
  const smoothed = resolveMediaBindingSignal(binding, frame, state, 140).point;
  assert.ok(smoothed.x > 60 && smoothed.x < 70);
  assert.equal(resolveMediaBindingSignal(binding, frameWith({}), state, 200).stale, true);
  assert.equal(resolveMediaBindingSignal(binding, frameWith({}), state, 300).point, null);
  frame = frameWith({ "right_hand.palm": { available: true, scene: { x: 300, y: 10 } } });
  assert.deepEqual(resolveMediaBindingSignal(binding, frame, state, 310).point, { x: 300, y: 10 });
});

test("binding gates hold briefly through missing frames then release", () => {
  const binding = createMediaBinding("freedraw-actor", { signal: { missingGraceMs: 120 } });
  const state = createMediaBindingRuntimeState();
  const active = frameWith({ "right_hand.pinch": { available: true, active: true } });
  assert.equal(resolveMediaBindingGate(binding, active, state, 10), true);
  assert.equal(resolveMediaBindingGate(binding, frameWith({}), state, 100), true);
  assert.equal(resolveMediaBindingGate(binding, frameWith({}), state, 200), false);
});

test("active strokes expire when a processor stops producing frames", () => {
  const binding = createMediaBinding("freedraw-actor", { signal: { missingGraceMs: 120 } });
  const state = {
    ...createMediaBindingRuntimeState(),
    binding,
    stroke: { points: [{ x: 1, y: 1 }] },
    lastPointAt: 100,
    lastGateAt: 110,
  };
  assert.equal(mediaBindingRuntimeHasExpired(state, 220), false);
  assert.equal(mediaBindingRuntimeHasExpired(state, 231), true);
});

test("driven positions honor target anchors and stroke sampling avoids duplicates", () => {
  const binding = createMediaBinding("drive-position", { anchor: "center", offset: { x: 2, y: -3 } });
  assert.deepEqual(
    mediaDrivenElementPosition({ width: 20, height: 10 }, binding, { x: 50, y: 60 }),
    { x: 42, y: 52 },
  );
  const topLeftBinding = createMediaBinding("drive-position", { anchor: "top-left", offset: { x: 0, y: 0 } });
  assert.deepEqual(
    mediaDrivenElementPosition({ width: 20, height: 10, angle: Math.PI / 2 }, topLeftBinding, { x: 50, y: 60 }),
    { x: 35, y: 65 },
  );
  assert.equal(shouldAppendMediaStrokePoint([], { x: 1, y: 1 }), true);
  assert.equal(shouldAppendMediaStrokePoint([{ x: 1, y: 1 }], { x: 1.2, y: 1.2 }), false);
});
