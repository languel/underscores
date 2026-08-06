import test from "node:test";
import assert from "node:assert/strict";
import { chooseConstraintPivot, getPhysicsElementCenter, resolveConstraintPivot } from "./physicsConstraintAuthoring.js";

const body = (id, x, y, width, height, angle = 0) => ({ id, type: "rectangle", x, y, width, height, angle });
const binding = id => ({ id: `body-${id}`, systemId: "world", enabled: true, objectRef: { kind: "element", elementId: id } });

test("an axle pivot discovers one overlapping body and attaches it to World", () => {
  const arm = body("arm", 100, 100, 80, 20);
  const pivot = body("pivot", 105, 105, 10, 10);
  const result = resolveConstraintPivot({ pivot, elements: [arm, pivot], bodies: [binding("arm")], systemId: "world", kind: "axle" });
  assert.equal(result.constraint.a.objectRef.elementId, "arm");
  assert.equal(result.constraint.b.kind, "world");
  assert.equal(result.constraint.objectRef.elementId, "pivot");
  assert.equal(result.constraint.limitsEnabled, false);
});

test("a partially overlapping pivot is accepted even when its centre sits outside the body", () => {
  const arm = body("arm", 100, 100, 80, 40);
  // The visual pivot overlaps the top edge of the arm by three pixels, but its
  // centre intentionally lies above it. Constraint authoring is object-based,
  // so this must be accepted rather than requiring a centre-point hit.
  const pivot = { ...body("pivot", 120, 80, 20, 23), type: "ellipse" };
  const result = resolveConstraintPivot({ pivot, elements: [arm, pivot], bodies: [binding("arm")], systemId: "world", kind: "axle" });
  assert.equal(result.constraint.a.objectRef.elementId, "arm");
  assert.equal(result.constraint.b.kind, "world");
});

test("an axle pivot discovers two bodies and uses rotated local anchors", () => {
  const armA = body("a", 80, 135, 140, 30, Math.PI / 4);
  const armB = body("b", 100, 135, 100, 30, -Math.PI / 4);
  const pivot = body("pivot", 150, 145, 10, 10);
  const result = resolveConstraintPivot({ pivot, elements: [armA, armB, pivot], bodies: [binding("a"), binding("b")], systemId: "world", kind: "axle" });
  assert.equal(result.constraint.a.kind, "object");
  assert.equal(result.constraint.b.kind, "object");
  assert.notDeepEqual(result.constraint.a.localPoint, [0.5, 0.5]);
});

test("constraint authoring prefers the separate pivot over a stacked body", () => {
  const arm = {
    ...body("arm", 100, 100, 80, 20),
    customData: { physics: { role: "body" } },
  };
  const pivot = body("pivot", 105, 105, 10, 10);

  // Excalidraw returns scene hits from front to back. The arm may be visually
  // above the tiny pivot even though the user deliberately clicked the pivot.
  assert.equal(chooseConstraintPivot([arm, pivot])?.id, "pivot");
});

test("constraint authoring uses a freehand's rendered physics centre, not its Excalidraw frame centre", () => {
  const freehand = {
    id: "asymmetric-path",
    type: "freedraw",
    x: 100,
    y: 200,
    width: 100,
    height: 100,
    points: [[0, 0], [10, 10]],
    angle: 0,
  };
  // The frame centre would be (150, 250); the rendered path centre is (105, 205).
  assert.deepEqual(getPhysicsElementCenter(freehand), { x: 105, y: 205 });
});
