import test from "node:test";
import assert from "node:assert/strict";
import { chooseConstraintPivot, getPhysicsElementCenter, getRopeVisualGeometryPatch, getRopeWorldPoints, getSpringEndpointWorldPoints, getSpringGeometricLength, getSpringVisualGeometryPatch, persistConstraintRopeAttachments, persistConstraintWorldAnchor, resolveAttractorConstraint, resolveConstraintPivot, resolveRopeConstraint, resolveSpringConstraint, resolveThrusterConstraint } from "./physicsConstraintAuthoring.js";
import { getPhysicsElementWorldPoints } from "./physicsGeometry.js";

const body = (id, x, y, width, height, angle = 0) => ({ id, type: "rectangle", x, y, width, height, angle });
const binding = (id, patch = {}) => ({ id: `body-${id}`, systemId: "world", enabled: true, bodyType: "dynamic", objectRef: { kind: "element", elementId: id }, ...patch });

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

test("an axle authored on a rope control point stores its stable path progress", () => {
  const ropeElement = body("rope-path", 0, 0, 100, 10);
  const pivot = { ...body("pivot", 95, -5, 10, 10), type: "ellipse" };
  const ropeConstraint = {
    id: "rope",
    systemId: "world",
    kind: "rope",
    enabled: true,
    objectRef: { kind: "element", elementId: ropeElement.id },
    pathPoints: [[0, 0], [20, 0], [100, 0]],
  };
  const result = resolveConstraintPivot({
    pivot,
    elements: [ropeElement, pivot],
    constraints: [ropeConstraint],
    systemId: "world",
    kind: "axle",
  });
  assert.equal(result.constraint.a.kind, "rope");
  assert.equal(result.constraint.a.ropeProgress, 1);
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

test("an attractor persists its visual centre as a World force origin", () => {
  const attractor = { ...body("attractor", 80, 160, 40, 20), type: "ellipse" };
  const result = resolveAttractorConstraint({ attractor, systemId: "world" });
  assert.equal(result.constraint.kind, "attractor");
  assert.deepEqual(result.constraint.a, { kind: "world", point: [100, 170] });
  assert.deepEqual(result.constraint.b, { kind: "world", point: [100, 170] });
  assert.equal(result.constraint.attractionStrength, 20);
});

test("a thruster binds its start endpoint to an overlapping dynamic body", () => {
  const host = body("host", -20, -20, 60, 60);
  const thruster = { id: "thruster", type: "line", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], angle: 0 };
  const result = resolveThrusterConstraint({ thruster, elements: [host, thruster], bodies: [binding("host")], systemId: "world" });
  assert.equal(result.constraint.kind, "thruster");
  assert.equal(result.constraint.a.objectRef.elementId, "host");
  assert.deepEqual(result.constraint.b, { kind: "world", point: [100, 0] });
  assert.equal(result.constraint.thrusterForce, 20);
});

test("a thruster ignores static shapes and reports a missing dynamic attachment", () => {
  const wall = body("wall", -20, -20, 60, 60);
  const thruster = { id: "thruster", type: "line", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], angle: 0 };
  const result = resolveThrusterConstraint({
    thruster,
    elements: [wall, thruster],
    bodies: [binding("wall", { bodyType: "fixed" })],
    systemId: "world",
  });
  assert.equal(result.error, "Place the thruster start point on a dynamic body.");
});

test("a rope preserves its full rendered path while leaving both endpoints free", () => {
  const left = body("left", -20, -20, 40, 40);
  const right = body("right", 180, -20, 40, 40);
  const rope = {
    id: "rope",
    type: "freedraw",
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    strokeWidth: 3,
    points: [[0, 0], [60, 60], [140, 20], [200, 0]],
    angle: 0,
  };
  const result = resolveRopeConstraint({ rope, elements: [left, right, rope], bodies: [binding("left"), binding("right")], systemId: "world" });
  assert.equal(result.constraint.kind, "rope");
  assert.deepEqual(result.constraint.a, { kind: "none" });
  assert.deepEqual(result.constraint.b, { kind: "none" });
  assert.deepEqual(result.constraint.pathPoints, getRopeWorldPoints(rope));
  assert.ok(result.constraint.restLength > 200);
});

test("a rope visual patch exactly follows simulated world points", () => {
  const rope = {
    id: "rope",
    type: "line",
    x: 20,
    y: 20,
    width: 100,
    height: 0,
    points: [[0, 0], [100, 0]],
    angle: 0,
  };
  const worldPoints = [[15, 30], [90, 95], [240, 90]];
  const patch = getRopeVisualGeometryPatch(rope, worldPoints);
  assert.ok(patch);
  const patched = getPhysicsElementWorldPoints({ ...rope, ...patch });
  assert.deepEqual(patched.map(point => point.map(value => Math.round(value))), worldPoints);
  assert.equal(patch.angle, 0);
});

test("a solved rope pivot persists its moved World endpoint", () => {
  const constraint = {
    id: "axle-rope",
    kind: "axle",
    a: { kind: "rope", constraintId: "rope-1", point: [100, 50] },
    b: { kind: "world", point: [100, 50] },
  };
  const next = persistConstraintWorldAnchor(constraint, [180, 125]);
  assert.equal(next.a, constraint.a);
  assert.deepEqual(next.b, { kind: "world", point: [180, 125] });
});

test("a solved rope pivot persists the same generated rope link", () => {
  const constraint = {
    id: "axle-rope",
    kind: "axle",
    a: { kind: "rope", constraintId: "rope-1", point: [100, 50] },
    b: { kind: "world", point: [100, 50] },
  };
  const next = persistConstraintRopeAttachments(constraint, [{
    side: "a",
    point: [176, 121],
    linkIndex: 7,
    ropeProgress: 0.35,
  }]);
  assert.deepEqual(next.a, {
    kind: "rope",
    constraintId: "rope-1",
    point: [176, 121],
    linkIndex: 7,
    ropeProgress: 0.35,
  });
  assert.equal(next.b, constraint.b);
});
