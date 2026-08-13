import test from "node:test";
import assert from "node:assert/strict";
import {
  createBezierGeometryFromElement,
  createBezierGeometryFromWorldAnchors,
  createBezierHostGeometry,
  flattenBezierGeometry,
  getBezierPathLengthFromAnchors,
  getBezierWorldPath,
  normalizeBezierHostElement,
  reframeBezierElement,
  sampleBezierElement,
  splitBezierSegment,
} from "./bezierGeometry.js";

test("converts a line into canonical cubic geometry", () => {
  const geometry = createBezierGeometryFromElement({ type: "line", width: 100, height: 100, roundness: { type: 2 }, points: [[0, 0], [50, 100], [100, 0]] });
  assert.equal(geometry.kind, "cubicBezierPath");
  assert.equal(geometry.anchors.length, 3);
  assert.equal(geometry.anchors[1].mode, "smooth");
});

test("sharp Excalidraw lines remain straight after conversion", () => {
  const geometry = createBezierGeometryFromElement({ type: "line", width: 100, height: 100, roundness: null, points: [[0, 0], [50, 100], [100, 0]] });
  assert.equal(geometry.anchors[1].mode, "corner");
  assert.equal(geometry.anchors[1].in, null);
  assert.equal(geometry.anchors[1].out, null);
});

test("adaptive flattening preserves endpoints", () => {
  const { geometry } = createBezierHostGeometry([
    { x: 0, y: 0, out: [40, 0] },
    { x: 100, y: 100, in: [-40, 0] },
  ]);
  const path = flattenBezierGeometry(geometry, 0.001);
  assert.deepEqual(path[0].map(value => Math.round(value * 1000) / 1000), [0, 0]);
  assert.deepEqual(path.at(-1).map(value => Math.round(value * 1000) / 1000), [1, 1]);
  assert.ok(path.length > 2);
});

test("Excalidraw host geometry starts at the element origin even when handles extend past it", () => {
  const host = createBezierHostGeometry([
    { x: 10, y: 20, out: [0, -80] },
    { x: 110, y: 80, in: [-30, 0] },
  ]);
  assert.ok(Math.abs(host.points[0][0]) < 0.000001);
  assert.ok(Math.abs(host.points[0][1]) < 0.000001);
  assert.equal(host.bounds.x, 10);
  assert.equal(host.bounds.y, 20);

  const element = { id: "host", ...host.bounds, angle: 0, points: host.points, customData: { underscoresGeometry: host.geometry } };
  const start = sampleBezierElement(element, 0);
  const end = sampleBezierElement(element, 1);
  assert.ok(Math.hypot(start.point[0] - 10, start.point[1] - 20) < 0.01);
  assert.ok(Math.hypot(end.point[0] - 110, end.point[1] - 80) < 0.01);
});

test("legacy bounding-box-based hosts migrate without moving their canonical curve", () => {
  const legacy = createBezierGeometryFromWorldAnchors([
    { x: 10, y: 20, out: [0, -80] },
    { x: 110, y: 80, in: [-30, 0] },
  ]);
  const legacyPoints = flattenBezierGeometry(legacy.geometry, 0.001).map(point => [
    point[0] * legacy.bounds.width,
    point[1] * legacy.bounds.height,
  ]);
  assert.ok(Math.abs(legacyPoints[0][1]) > 0.000001);
  const element = { id: "legacy", ...legacy.bounds, angle: Math.PI / 8, points: legacyPoints, customData: { underscoresGeometry: legacy.geometry } };
  const before = getBezierWorldPath(element, 0.05);
  const migrated = normalizeBezierHostElement(element);
  const after = getBezierWorldPath(migrated, 0.05);
  assert.ok(Math.abs(migrated.points[0][0]) < 0.000001);
  assert.ok(Math.abs(migrated.points[0][1]) < 0.000001);
  assert.equal(before.length, after.length);
  for (let index = 0; index < before.length; index += 1) {
    assert.ok(Math.hypot(before[index][0] - after[index][0], before[index][1] - after[index][1]) < 0.01);
  }
});

test("de Casteljau insertion does not change the curve", () => {
  const { geometry } = createBezierHostGeometry([
    { x: 0, y: 0, out: [80, 0] },
    { x: 100, y: 100, in: [-80, 0] },
  ]);
  const before = flattenBezierGeometry(geometry, 0.0005);
  const afterGeometry = splitBezierSegment(geometry, 0, 0.5);
  const after = flattenBezierGeometry(afterGeometry, 0.0005);
  assert.equal(afterGeometry.anchors.length, 3);
  const beforeMid = before[Math.floor(before.length / 2)];
  const inserted = afterGeometry.anchors[1];
  assert.ok(Math.hypot(beforeMid[0] - inserted.x, beforeMid[1] - inserted.y) < 0.02);
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(after.at(-1), before.at(-1));
});

test("de Casteljau insertion preserves the closing segment and anchor order", () => {
  const geometry = {
    version: 1,
    kind: "cubicBezierPath",
    closed: true,
    anchors: [
      { x: 0, y: 0, in: [0, 0.4], out: [0.4, 0], mode: "smooth" },
      { x: 1, y: 0, in: [-0.4, 0], out: [0, 0.4], mode: "smooth" },
      { x: 0.5, y: 1, in: [0.4, 0], out: [-0.4, 0], mode: "smooth" },
    ],
  };
  const before = flattenBezierGeometry(geometry, 0.0005);
  const split = splitBezierSegment(geometry, 2, 0.5);
  const after = flattenBezierGeometry(split, 0.0005);
  assert.deepEqual(split.anchors[0].x, geometry.anchors[0].x);
  assert.deepEqual(split.anchors[0].y, geometry.anchors[0].y);
  const length = path => path.slice(1).reduce((total, point, index) => total + Math.hypot(point[0] - path[index][0], point[1] - path[index][1]), 0);
  assert.ok(Math.abs(length(before) - length(after)) < 0.001);
});

test("arc-length sampling reaches both ends", () => {
  const host = createBezierHostGeometry([
    { x: 10, y: 20, out: [50, -20] },
    { x: 110, y: 80, in: [-20, 40] },
  ]);
  const element = { id: "curve", ...host.bounds, angle: 0, customData: { underscoresGeometry: host.geometry } };
  const start = sampleBezierElement(element, 0);
  const end = sampleBezierElement(element, 1);
  assert.ok(Math.hypot(start.point[0] - 10, start.point[1] - 20) < 0.01);
  assert.ok(Math.hypot(end.point[0] - 110, end.point[1] - 80) < 0.01);
  assert.ok(end.length > Math.hypot(100, 60));
});

test("path length includes cubic handles", () => {
  const straight = getBezierPathLengthFromAnchors([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const curved = getBezierPathLengthFromAnchors([{ x: 0, y: 0, out: [0, 100] }, { x: 100, y: 0, in: [0, 100] }]);
  assert.ok(Math.abs(straight - 100) < 0.01);
  assert.ok(curved > straight);
});

test("reframing preserves a rotated curve in world space", () => {
  const host = createBezierHostGeometry([
    { x: 0, y: 0, out: [30, -20] },
    { x: 100, y: 80, in: [-20, 30] },
  ]);
  const element = { id: "rotated", ...host.bounds, angle: Math.PI / 5, points: host.points, customData: { underscoresGeometry: host.geometry } };
  const geometry = { ...host.geometry, anchors: host.geometry.anchors.map((anchor, index) => index === 0 ? { ...anchor, x: anchor.x - 0.25 } : anchor) };
  const edited = { ...element, customData: { underscoresGeometry: geometry } };
  const before = getBezierWorldPath(edited, 0.05);
  const reframed = reframeBezierElement(edited);
  const after = getBezierWorldPath(reframed, 0.05);
  assert.ok(Math.hypot(before[0][0] - after[0][0], before[0][1] - after[0][1]) < 0.01);
  assert.ok(Math.hypot(before.at(-1)[0] - after.at(-1)[0], before.at(-1)[1] - after.at(-1)[1]) < 0.01);
});
