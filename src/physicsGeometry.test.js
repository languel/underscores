import test from "node:test";
import assert from "node:assert/strict";
import { applyBezierSculptOperator, getPhysicsColliderSelectionValue, getPhysicsElementCenter, getPhysicsElementLocalCenter, getPhysicsElementLocalPoints, getPhysicsElementWorldPoints, inferPhysicsBodyFromElement, inferPhysicsColliderForBody, inferPhysicsColliderFromElement, resolvePhysicsEndpoint } from "./physicsGeometry.js";
import { normalizeBezierGeometry } from "./bezierGeometry.js";

const curve = {
  id: "curve",
  type: "line",
  x: 10,
  y: 20,
  width: 100,
  height: 100,
  angle: 0,
  points: [[0, 0], [100, 100]],
  customData: {
    draweratorGeometry: normalizeBezierGeometry({
      anchors: [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }, { x: 1, y: 1 }],
    }),
  },
};

test("canonical Bezier anchors receive stable ids and resolve as endpoints", () => {
  const anchors = curve.customData.draweratorGeometry.anchors;
  assert.deepEqual(anchors.map(anchor => anchor.id), ["anchor-0", "anchor-1", "anchor-2"]);
  const resolved = resolvePhysicsEndpoint({ kind: "bezier-anchor", objectRef: "curve", anchorId: "anchor-1" }, { elements: [curve] });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.point, [60, 45]);
});

test("shape inference treats curves as fixed polylines and ellipses as circles", () => {
  const lineBody = inferPhysicsBodyFromElement(curve, { systemId: "system" });
  assert.equal(lineBody.bodyType, "fixed");
  assert.equal(lineBody.collider.kind, "polyline");
  const circle = inferPhysicsBodyFromElement({ id: "circle", type: "ellipse", x: 0, y: 0, width: 20, height: 20, angle: 0 }, { systemId: "system" });
  assert.equal(circle.collider.kind, "circle");
  assert.equal(circle.collider.radius, 10);
});

test("closed round freehand strokes infer solid dynamic circle colliders", () => {
  const freehand = {
    id: "freehand-circle",
    type: "freedraw",
    x: 100,
    y: 200,
    width: 40,
    height: 38,
    angle: 0,
    points: [[0, 19], [5, 6], [20, 0], [35, 6], [40, 19], [35, 32], [20, 38], [5, 32], [0, 19]],
  };
  const body = inferPhysicsBodyFromElement(freehand, { systemId: "system", bodyType: "dynamic" });
  assert.equal(body.bodyType, "dynamic");
  assert.equal(body.collider.kind, "circle");
  assert.equal(body.collider.radius, 19);
  assert.equal(getPhysicsColliderSelectionValue(body.collider), "ellipse");
  assert.equal(getPhysicsColliderSelectionValue({ kind: "chain" }, { allowPath: false }), "box");
});

test("paused authored edits preserve a selected collider kind while refreshing its geometry", () => {
  const ellipse = { id: "ellipse", type: "ellipse", x: 10, y: 20, width: 60, height: 30, angle: 0 };
  const existing = inferPhysicsBodyFromElement(ellipse, { systemId: "system", bodyType: "dynamic" });
  const box = inferPhysicsColliderForBody({ ...ellipse, width: 90, height: 40 }, {
    ...existing,
    collider: { kind: "box", sensor: false },
  });
  assert.deepEqual(box, { kind: "box", width: 90, height: 40, sensor: false });

  const convex = inferPhysicsColliderForBody({ ...ellipse, width: 90, height: 40 }, {
    ...existing,
    collider: { kind: "convex", sensor: false },
  });
  assert.equal(convex.kind, "convex");
  assert.equal(convex.points.length, 24);
});

test("path-chain collider points remain local when their drawing is rotated", () => {
  const rotatedLine = {
    id: "rotated-line",
    type: "line",
    x: 100,
    y: 200,
    width: 80,
    height: 20,
    angle: Math.PI / 2,
    points: [[0, 0], [80, 20]],
    strokeWidth: 4,
  };
  assert.deepEqual(getPhysicsElementLocalPoints(rotatedLine), [[-40, -10], [40, 10]]);
  const chain = inferPhysicsColliderFromElement(rotatedLine, "chain", "dynamic");
  assert.deepEqual(chain.points, [[-40, -10], [40, 10]]);
  assert.equal(chain.localOriginVersion, 2);
  const fixed = inferPhysicsBodyFromElement(rotatedLine, { systemId: "system" });
  assert.deepEqual(fixed.collider.points, [[-40, -10], [40, 10]]);
  assert.equal(fixed.collider.localOriginVersion, 2);
});

test("path collider and body pose share an edited freehand path's actual bounds center", () => {
  const freehand = {
    id: "asymmetric-freehand",
    type: "freedraw",
    x: 300,
    y: 400,
    // This deliberately does not match the bounds of `points`, as can happen
    // after an imported or point-edited Excalidraw freehand path.
    width: 160,
    height: 120,
    angle: Math.PI / 6,
    points: [[-20, 10], [140, 30], [80, 110]],
  };
  assert.deepEqual(getPhysicsElementLocalCenter(freehand), [60, 60]);
  assert.deepEqual(getPhysicsElementCenter(freehand), [360, 460]);
  assert.deepEqual(getPhysicsElementLocalPoints(freehand), [[-80, -50], [80, -30], [20, 50]]);
  const body = inferPhysicsBodyFromElement(freehand, { systemId: "system", bodyType: "dynamic" });
  assert.deepEqual([body.initial.x, body.initial.y], [360, 460]);
  const chain = inferPhysicsColliderFromElement(freehand, "chain", "dynamic");
  assert.deepEqual(chain.points, [[-80, -50], [80, -30], [20, 50]]);
  assert.equal(chain.localOriginVersion, 2);
});

test("a rotated convex freehand stays coincident with its Rapier-local collider", () => {
  const freehand = {
    id: "rotated-asymmetric-freehand",
    type: "freedraw",
    x: 300,
    y: 400,
    width: 160,
    height: 120,
    angle: Math.PI / 3,
    points: [[-20, 10], [140, 30], [80, 110]],
  };
  const body = inferPhysicsBodyFromElement(freehand, { systemId: "system", bodyType: "dynamic" });
  const collider = inferPhysicsColliderFromElement(freehand, "convex", "dynamic");
  const rotateLocalPoint = point => {
    const cos = Math.cos(body.initial.angle);
    const sin = Math.sin(body.initial.angle);
    return [
      body.initial.x + point[0] * cos - point[1] * sin,
      body.initial.y + point[0] * sin + point[1] * cos,
    ];
  };
  const expected = getPhysicsElementWorldPoints(freehand);
  const actual = collider.points.map(rotateLocalPoint);
  actual.forEach((point, index) => {
    assert.ok(Math.abs(point[0] - expected[index][0]) < 1e-8);
    assert.ok(Math.abs(point[1] - expected[index][1]) < 1e-8);
  });
});

test("Bezier sculpt operators preserve anchor identity and are deterministic", () => {
  const first = applyBezierSculptOperator(curve, "randomize", { seed: 9, amount: 0.01 });
  const second = applyBezierSculptOperator(curve, "randomize", { seed: 9, amount: 0.01 });
  assert.deepEqual(first.customData.draweratorGeometry.anchors, second.customData.draweratorGeometry.anchors);
  assert.deepEqual(first.customData.draweratorGeometry.anchors.map(anchor => anchor.id), ["anchor-0", "anchor-1", "anchor-2"]);
  const smoothed = applyBezierSculptOperator(curve, "smooth", { amount: 1 });
  assert.equal(smoothed.customData.draweratorGeometry.anchors[1].x, 0.5);
  assert.equal(smoothed.customData.draweratorGeometry.anchors[1].y, 0.5);
});
