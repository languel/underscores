import test from "node:test";
import assert from "node:assert/strict";
import { applyUnicursalFeatureGrace, contourFromSegmentation, drawUnicursalFrame, generateUnicursalPath, getUnicursalSnapshotStrokeWidth, normalizeUnicursalOptions, resamplePath, smoothUnicursalFrame, transformUnicursalFrame, transformUnicursalPoint } from "./unicursalPath.js";

const landmark = (x, y) => ({ x, y, z: 0, visibility: 1, presence: 1 });
const fixture = () => ({
  poseLandmarks: Array.from({ length: 33 }, (_, index) => landmark(0.25 + (index % 4) * 0.16, 0.12 + Math.floor(index / 4) * 0.09)),
  leftHandLandmarks: Array.from({ length: 21 }, (_, index) => landmark(0.12 + (index % 5) * 0.025, 0.32 - Math.floor(index / 5) * 0.045)),
  rightHandLandmarks: Array.from({ length: 21 }, (_, index) => landmark(0.76 + (index % 5) * 0.025, 0.32 - Math.floor(index / 5) * 0.045)),
  faceLandmarks: Array.from({ length: 478 }, (_, index) => {
    const angle = index / 478 * Math.PI * 2;
    return landmark(0.5 + Math.cos(angle) * 0.12, 0.22 + Math.sin(angle) * 0.15);
  }),
  sourceId: "camera-a",
  updatedAt: 123,
});

test("normalizes the four stable artistic presets", () => {
  for (const preset of ["smooth", "cubist", "ornate", "messy"]) assert.equal(normalizeUnicursalOptions({ preset }).preset, preset);
  assert.equal(normalizeUnicursalOptions({ preset: "unknown" }).preset, "smooth");
  assert.equal(normalizeUnicursalOptions().motion.echoes, false);
  assert.equal(normalizeUnicursalOptions().background.mode, "transparent");
  assert.equal(normalizeUnicursalOptions().geometry.maxSegments, 1);
});

test("semantic segment budget remains bounded and preserves the full point stream", () => {
  for (const maxSegments of [1, 2, 5, 12]) {
    const frame = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 192, maxSegments } } });
    assert.ok(frame.segments.length >= 1 && frame.segments.length <= maxSegments);
    const renderedCount = frame.segments.reduce((sum, segment) => sum + segment.points.length, 0);
    assert.ok(renderedCount <= frame.points.length && renderedCount >= frame.points.length * 0.7);
  }
});

test("canvas rendering batches a portrait into one operation per semantic segment", () => {
  const calls = { stroke: 0, fill: 0, bezier: 0 };
  const context = {
    globalAlpha: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() { calls.bezier += 1; }, closePath() {},
    stroke() { calls.stroke += 1; }, fill() { calls.fill += 1; },
  };
  const one = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 384, maxSegments: 1 } } });
  drawUnicursalFrame(context, one, 640, 480);
  assert.equal(calls.stroke + calls.fill, 1);
  assert.ok(calls.bezier > 0, "the variable-width ribbon should use the selected smooth interpolator");
  calls.stroke = 0; calls.fill = 0;
  const many = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 384, maxSegments: 5 } } });
  drawUnicursalFrame(context, many, 640, 480);
  assert.equal(calls.stroke + calls.fill, many.segments.length);
  assert.ok(calls.stroke + calls.fill <= 5);
});

test("manual expressive values may exceed their suggested panel ranges", () => {
  const options = normalizeUnicursalOptions({ geometry: { abstraction: 24 }, ink: { widthVariation: 3.5 } });
  assert.equal(options.geometry.abstraction, 24);
  assert.equal(options.ink.widthVariation, 3.5);
  const frame = generateUnicursalPath({ result: fixture(), options });
  assert.ok(Math.max(...frame.points.map(point => point.pressure)) > 1);
});

test("abstraction affects smooth presets as well as cubist", () => {
  const restrained = generateUnicursalPath({ result: fixture(), options: { preset: "smooth", geometry: { abstraction: 0, pointBudget: 192 } } });
  const abstract = generateUnicursalPath({ result: fixture(), options: { preset: "smooth", geometry: { abstraction: 24, pointBudget: 192 } } });
  assert.notDeepEqual(restrained.points, abstract.points);
});

test("frames expose the exact raw silhouette and its source", () => {
  const frame = generateUnicursalPath({ result: fixture(), options: { silhouette: { mode: "envelope" } } });
  assert.equal(frame.silhouette.source, "envelope");
  assert.ok(frame.silhouette.points.length >= 3);
});

test("resampling keeps endpoints and exact topology", () => {
  const output = resamplePath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 17);
  assert.equal(output.length, 17);
  assert.deepEqual(output[0], { x: 0, y: 0, z: 0 });
  assert.deepEqual(output.at(-1), { x: 1, y: 1, z: 0 });
});

test("generates one deterministic fixed-budget path", () => {
  const options = { preset: "messy", geometry: { pointBudget: 384 }, ornament: { seed: 42 } };
  const first = generateUnicursalPath({ result: fixture(), options });
  const second = generateUnicursalPath({ result: fixture(), options });
  assert.equal(first.available, true);
  assert.equal(first.points.length, 384);
  assert.deepEqual(first.points, second.points);
  assert.ok(first.points.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && item.pressure > 0));
});

test("missing regions collapse without changing point count", () => {
  const complete = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 192 } } });
  const missing = generateUnicursalPath({ result: { poseLandmarks: fixture().poseLandmarks }, options: { geometry: { pointBudget: 192 } } });
  assert.equal(complete.points.length, missing.points.length);
  assert.ok(missing.points.every(item => Number.isFinite(item.x) && Number.isFinite(item.y)));
});

test("holds each missing semantic feature for its grace window", () => {
  const complete = fixture();
  const initial = applyUnicursalFeatureGrace(complete, {}, 1000, 260);
  const withoutHands = { ...complete, leftHandLandmarks: [], rightHandLandmarks: [] };
  const held = applyUnicursalFeatureGrace(withoutHands, initial.state, 1180, 260);
  assert.equal(held.result.leftHandLandmarks, complete.leftHandLandmarks);
  assert.equal(held.result.rightHandLandmarks, complete.rightHandLandmarks);
  const expired = applyUnicursalFeatureGrace(withoutHands, initial.state, 1400, 260);
  assert.deepEqual(expired.result.leftHandLandmarks, []);
  assert.deepEqual(expired.result.rightHandLandmarks, []);
});

test("presets materially alter a stable anatomical route", () => {
  const smooth = generateUnicursalPath({ result: fixture(), options: { preset: "smooth", geometry: { pointBudget: 192 } } });
  const cubist = generateUnicursalPath({ result: fixture(), options: { preset: "cubist", geometry: { pointBudget: 192 } } });
  const ornate = generateUnicursalPath({ result: fixture(), options: { preset: "ornate", geometry: { pointBudget: 192 } } });
  assert.notDeepEqual(smooth.points, cubist.points);
  assert.notDeepEqual(smooth.points, ornate.points);
  assert.equal(smooth.points.length, cubist.points.length);
});

test("extracts a normalized contour from a segmentation mask", () => {
  const width = 20;
  const height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 4; y < 17; y += 1) for (let x = 5; x < 16; x += 1) data[(y * width + x) * 4 + 3] = 255;
  const contour = contourFromSegmentation({ width, height, data }, 0.5, 32);
  assert.ok(contour.length >= 12);
  assert.ok(contour.every(item => item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1));
});

test("transforms to scene coordinates and smooths by point index", () => {
  const frame = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 96 } } });
  const scene = transformUnicursalFrame(frame, { x: 100, y: 50, width: 400, height: 300, angle: 0 }, "scene");
  assert.equal(scene.space, "scene");
  assert.ok(scene.points.every(item => item.x >= 0 && item.x <= 600 && item.y >= -50 && item.y <= 450));
  const shifted = { ...frame, points: frame.points.map(item => ({ ...item, x: item.x + 0.1 })) };
  const smoothed = smoothUnicursalFrame(frame, shifted, 16, 140);
  assert.ok(smoothed.points[0].x > frame.points[0].x && smoothed.points[0].x < shifted.points[0].x);
});

test("snapshot point projection follows the host rotation", () => {
  const projected = transformUnicursalPoint(
    { x: 0, y: 0.5 },
    { x: 100, y: 50, width: 400, height: 200, angle: Math.PI / 2 },
    "scene",
  );
  assert.ok(Math.abs(projected.x - 300) < 1e-9);
  assert.ok(Math.abs(projected.y + 50) < 1e-9);
});

test("snapshot stroke width matches the live short-edge scale", () => {
  const frame = { options: { ink: { width: 3 } }, points: [{ width: 2 }, { width: 4 }] };
  assert.equal(getUnicursalSnapshotStrokeWidth(frame, { width: 300, height: 600 }), 3);
});

test("motion dynamics retain uncertain features and slow sticky semantic joins", () => {
  const frame = generateUnicursalPath({ result: fixture(), options: { geometry: { pointBudget: 96 } } });
  const shifted = { ...frame, points: frame.points.map(item => ({ ...item, x: item.x + 0.2, confidence: 0.05 })) };
  const responsive = smoothUnicursalFrame(frame, shifted, 16, 140, { inertia: 0, confidenceWeight: 0 });
  const retained = smoothUnicursalFrame(frame, shifted, 16, 140, { inertia: 0.8, confidenceWeight: 1, stickiness: 0.8 });
  assert.ok(retained.points[0].x < responsive.points[0].x);
  assert.ok(retained.points[0].x > frame.points[0].x);
  assert.equal(normalizeUnicursalOptions().motion.inertia, 0.28);
  assert.equal(normalizeUnicursalOptions().motion.confidenceWeight, 0.72);
  assert.equal(normalizeUnicursalOptions().motion.stickiness, 0.35);
});
