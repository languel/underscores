import test from "node:test";
import assert from "node:assert/strict";
import { chooseConstraintPivot, getPhysicsElementCenter, getSpringEndpointWorldPoints, getSpringGeometricLength, getSpringVisualGeometryPatch, resolveConstraintPivot, resolveSpringConstraint } from "./physicsConstraintAuthoring.js";
import { getPhysicsElementWorldPoints } from "./physicsGeometry.js";

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

test("a spring resolves its rendered start and end independently", () => {
  const left = body("left", -20, -20, 40, 40);
  const right = body("right", 80, -20, 40, 40);
  const spring = { id: "spring", type: "line", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], angle: 0 };
  const result = resolveSpringConstraint({ spring, elements: [left, right, spring], bodies: [binding("left"), binding("right")], systemId: "world" });
  assert.equal(result.constraint.kind, "spring");
  assert.equal(result.constraint.a.objectRef.elementId, "left");
  assert.equal(result.constraint.b.objectRef.elementId, "right");
  assert.equal(result.constraint.restLength, 100);
});

test("a spring attaches an unoccupied endpoint to World", () => {
  const left = body("left", -20, -20, 40, 40);
  const spring = { id: "spring", type: "line", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], angle: 0 };
  const result = resolveSpringConstraint({ spring, elements: [left, spring], bodies: [binding("left")], systemId: "world" });
  assert.equal(result.constraint.a.objectRef.elementId, "left");
  assert.equal(result.constraint.b.kind, "world");
  assert.deepEqual(result.constraint.b.point, [100, 0]);
});

test("a spring resolves rotated rendered endpoints", () => {
  const spring = {
    id: "rotated-spring",
    type: "arrow",
    x: 10,
    y: 20,
    width: 100,
    height: 0,
    points: [[0, 0], [100, 0]],
    angle: Math.PI / 2,
  };
  const endpoints = getSpringEndpointWorldPoints(spring);
  assert.ok(endpoints);
  assert.deepEqual(endpoints.start.map(value => Math.round(value)), [60, -30]);
  assert.deepEqual(endpoints.end.map(value => Math.round(value)), [60, 70]);
});

test("a spring's geometric rest length follows its rendered endpoints", () => {
  const spring = {
    id: "diagonal-spring",
    type: "line",
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    points: [[0, 0], [30, 40]],
    angle: 0,
  };
  assert.equal(getSpringGeometricLength(spring), 50);
});

test("a spring visual patch follows its two resolved anchors", () => {
  const spring = {
    id: "rotated-spring",
    type: "line",
    x: 10,
    y: 20,
    width: 100,
    height: 0,
    points: [[0, 0], [100, 0]],
    angle: Math.PI / 2,
  };
  const patch = getSpringVisualGeometryPatch(spring, [15, 30], [240, 90]);
  assert.ok(patch);
  const endpoints = getPhysicsElementWorldPoints({ ...spring, ...patch });
  assert.deepEqual(endpoints[0].map(value => Math.round(value)), [15, 30]);
  assert.deepEqual(endpoints.at(-1).map(value => Math.round(value)), [240, 90]);
  assert.equal(patch.angle, 0);
});

test("a spring needs two distinct rendered endpoints", () => {
  const spring = { id: "flat", type: "line", x: 0, y: 0, width: 0, height: 0, points: [[0, 0], [0, 0]], angle: 0 };
  assert.equal(getSpringEndpointWorldPoints(spring), null);
  assert.equal(resolveSpringConstraint({ spring }).error, "Spring needs two distinct endpoints.");
});
