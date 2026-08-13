import test from "node:test";
import assert from "node:assert/strict";
import { applyBezierSculptOperator, getPhysicsColliderSelectionValue, getPhysicsElementCenter, getPhysicsElementLocalCenter, getPhysicsElementLocalPoints, getPhysicsElementWorldPoints, inferPhysicsBodyFromElement, inferPhysicsColliderForBody, inferPhysicsColliderFromElement, needsLegacyPhysicsColliderOriginRebase, resolvePhysicsEndpoint, resolvePhysicsEndpointAtPose } from "./physicsGeometry.js";
import { createBezierGeometryFromElement, getBezierWorldPath, normalizeBezierGeometry } from "./bezierGeometry.js";

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
    underscoreGeometry: normalizeBezierGeometry({
      anchors: [{ x: 0, y: 0 }, { x: 0.5, y: 0.25 }, { x: 1, y: 1 }],
    }),
  },
};

test("canonical Bezier anchors receive stable ids and resolve as endpoints", () => {
  const anchors = curve.customData.underscoreGeometry.anchors;
  assert.deepEqual(anchors.map(anchor => anchor.id), ["anchor-0", "anchor-1", "anchor-2"]);
  const resolved = resolvePhysicsEndpoint({ kind: "bezier-anchor", objectRef: "curve", anchorId: "anchor-1" }, { elements: [curve] });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.point, [60, 45]);
});

test("unbound endpoints remain unresolved without dereferencing an object", () => {
  const resolved = resolvePhysicsEndpoint({ kind: "none" });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, "unbound-endpoint");
  assert.deepEqual(resolved.endpoint, { kind: "none" });
});

test("running constraint diagnostics use the precise hydrated body-local anchor", () => {
  const body = {
    id: "freehand-body",
    objectRef: { kind: "element", elementId: "freehand" },
  };
  const resolved = resolvePhysicsEndpointAtPose({
    kind: "object",
    objectRef: { kind: "element", elementId: "freehand" },
    anchor: "local",
    // This legacy frame point intentionally differs from the collider origin.
    localPoint: [0.1, 0.1],
    localAnchor: [50, -20],
  }, {
    bodies: [body],
    poseByBodyId: new Map([[body.id, { x: 300, y: 200, angle: Math.PI / 2 }]]),
  });
  assert.equal(resolved.ok, true);
  assert.ok(Math.abs(resolved.point[0] - 320) < 1e-8);
  assert.ok(Math.abs(resolved.point[1] - 250) < 1e-8);
});

test("shape inference treats curves as solid fixed chains and ellipses as circles", () => {
  const lineBody = inferPhysicsBodyFromElement(curve, { systemId: "system" });
  assert.equal(lineBody.bodyType, "fixed");
  assert.equal(lineBody.collider.kind, "chain");
  assert.equal(lineBody.collider.thickness, 2);
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

test("new closed freehand bodies mark their convex points as already centred", () => {
  const freehand = {
    id: "offset-closed-freehand",
    type: "freedraw",
    x: 320,
    y: 180,
    // Deliberately make the Excalidraw frame larger than the rendered path,
    // matching imported/edited freehands that used to jump when made a body.
    width: 260,
    height: 180,
    angle: 0,
    points: [[20, 30], [190, 0], [220, 90], [120, 130], [20, 30]],
  };
  const body = inferPhysicsBodyFromElement(freehand, {
    systemId: "system",
    bodyType: "dynamic",
  });
  assert.equal(body.collider.kind, "convex");
  // `localOriginVersion: 2` tells hydration these points already use the
  // rendered path centre. Without it, the legacy migration rebases this new
  // body a second time against the element frame.
  assert.equal(body.collider.localOriginVersion, 2);
  assert.deepEqual([body.initial.x, body.initial.y], [440, 245]);
});

test("legacy path-origin migration never rebases a reset pose already at the rendered centre", () => {
  const legacyCollider = { kind: "convex", points: [[0, 0], [1, 0], [0, 1]] };
  const renderedInitial = { x: 440, y: 245 };
  assert.equal(needsLegacyPhysicsColliderOriginRebase(legacyCollider, renderedInitial, renderedInitial), false);
  assert.equal(needsLegacyPhysicsColliderOriginRebase(
    legacyCollider,
    { x: 450, y: 270 },
    renderedInitial,
  ), true);
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
  assert.equal(chain.thickness, 4);
  assert.equal(chain.localOriginVersion, 2);
  const fixed = inferPhysicsBodyFromElement(rotatedLine, { systemId: "system" });
  assert.equal(fixed.collider.kind, "chain");
  assert.equal(fixed.collider.thickness, 4);
  assert.deepEqual(fixed.collider.points, [[-40, -10], [40, 10]]);
  assert.equal(fixed.collider.localOriginVersion, 2);
});

test("rounded native curves use their smoothed path for convex and chain colliders", () => {
  const roundedLine = {
    id: "rounded-line",
    type: "line",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    angle: 0,
    roundness: { type: 2 },
    strokeWidth: 4,
    points: [[0, 0], [50, 100], [100, 0]],
  };
  const geometry = createBezierGeometryFromElement(roundedLine);
  const renderedPath = getBezierWorldPath({
    ...roundedLine,
    customData: { underscoreGeometry: geometry },
  }, 1.2);
  const chain = inferPhysicsColliderFromElement(roundedLine, "chain", "fixed");
  const convex = inferPhysicsColliderFromElement(roundedLine, "convex", "dynamic");
  assert.equal(chain.points.length, renderedPath.length);
  assert.equal(convex.points.length, renderedPath.length);
  assert.notDeepEqual(chain.points, [[-50, -50], [0, 50], [50, -50]]);
  assert.ok(chain.points.some(([x, y]) => Math.abs(x + 28.125) < 1e-8 && Math.abs(y - 6.25) < 1e-8));
  assert.equal(roundedLine.customData, undefined);
  assert.deepEqual(roundedLine.points, [[0, 0], [50, 100], [100, 0]]);
});

test("path collider refresh preserves an authored collision skin", () => {
  const line = {
    id: "skinned-path",
    type: "line",
    x: 0,
    y: 0,
    width: 80,
    height: 20,
    angle: 0,
    strokeWidth: 6,
    points: [[0, 0], [80, 20]],
  };
  const body = inferPhysicsBodyFromElement(line, { systemId: "system" });
  const refreshed = inferPhysicsColliderForBody({ ...line, strokeWidth: 10 }, {
    ...body,
    collider: { ...body.collider, contactSkin: 2.5 },
  });
  assert.equal(refreshed.kind, "chain");
  assert.equal(refreshed.thickness, 10);
  assert.equal(refreshed.contactSkin, 2.5);
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
  assert.deepEqual(first.customData.underscoreGeometry.anchors, second.customData.underscoreGeometry.anchors);
  assert.deepEqual(first.customData.underscoreGeometry.anchors.map(anchor => anchor.id), ["anchor-0", "anchor-1", "anchor-2"]);
  const smoothed = applyBezierSculptOperator(curve, "smooth", { amount: 1 });
  assert.equal(smoothed.customData.underscoreGeometry.anchors[1].x, 0.5);
  assert.equal(smoothed.customData.underscoreGeometry.anchors[1].y, 0.5);
});
