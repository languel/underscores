import test from "node:test";
import assert from "node:assert/strict";
import { applyBezierSculptOperator, inferPhysicsBodyFromElement, resolvePhysicsEndpoint } from "./physicsGeometry.js";
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

test("Bezier sculpt operators preserve anchor identity and are deterministic", () => {
  const first = applyBezierSculptOperator(curve, "randomize", { seed: 9, amount: 0.01 });
  const second = applyBezierSculptOperator(curve, "randomize", { seed: 9, amount: 0.01 });
  assert.deepEqual(first.customData.draweratorGeometry.anchors, second.customData.draweratorGeometry.anchors);
  assert.deepEqual(first.customData.draweratorGeometry.anchors.map(anchor => anchor.id), ["anchor-0", "anchor-1", "anchor-2"]);
  const smoothed = applyBezierSculptOperator(curve, "smooth", { amount: 1 });
  assert.equal(smoothed.customData.draweratorGeometry.anchors[1].x, 0.5);
  assert.equal(smoothed.customData.draweratorGeometry.anchors[1].y, 0.5);
});
