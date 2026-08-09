import test from "node:test";
import assert from "node:assert/strict";
import { RapierPhysicsSystem } from "./rapierPhysicsCore.js";
import { normalizeRelationshipGraph } from "./relationshipGraph.js";

const graph = normalizeRelationshipGraph({
  systems: [{ id: "system", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
  bodies: [
    { id: "ball", systemId: "system", collider: { kind: "circle", radius: 8 }, initial: { x: 20, y: 50, velocityX: 180 }, collisionTags: ["particle"], mappingValues: { note: 48 } },
    { id: "wall", systemId: "system", bodyType: "fixed", collider: { kind: "box", width: 10, height: 100 }, initial: { x: 80, y: 50 }, collisionTags: ["wall"], mappingValues: { note: 84 } },
  ],
});

test("Rapier runtime advances, reports typed collisions, and resets deterministically", async () => {
  const runtime = await RapierPhysicsSystem.create(graph, "system");
  let hits = [];
  for (let index = 0; index < 60; index += 1) hits.push(...runtime.step().events);
  const impact = hits.find(event => event.phase === "hit" && event.collisionClass === "body-wall");
  assert.ok(impact);
  assert.equal(impact.a.velocity.length, 2);
  assert.equal(impact.b.position.length, 2);
  assert.equal(impact.a.mappingValues.note, 48);
  assert.equal(impact.b.mappingValues.note, 84);
  assert.equal(impact.world.gravityX, 0);
  assert.equal(impact.world.step, impact.step);
  assert.equal(runtime.queryPoint([80, 50])[0].id, "wall");
  assert.equal(runtime.castRay([70, 50], [1, 0], 200).entity.id, "wall");
  const firstRun = [...runtime.poses().values];
  runtime.reset();
  for (let index = 0; index < 60; index += 1) runtime.step();
  assert.deepEqual([...runtime.poses().values], firstRun);
  runtime.reset();
  for (let index = 0; index < 20; index += 1) runtime.step();
  const checkpoint = runtime.snapshot();
  for (let index = 0; index < 20; index += 1) runtime.step();
  const replayTarget = [...runtime.poses().values];
  runtime.restore(checkpoint, 20);
  for (let index = 0; index < 20; index += 1) runtime.step();
  assert.deepEqual([...runtime.poses().values], replayTarget);
  runtime.dispose();
});

test("a newly authored dynamic body publishes its exact initial canvas pose before stepping", async () => {
  const authoredGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: -9.8 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "new-body",
      systemId: "world",
      bodyType: "dynamic",
      collider: { kind: "box", width: 80, height: 120 },
      initial: { x: 340, y: 260, angle: 0.32 },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(authoredGraph, "world");
  const poses = runtime.poses();
  assert.equal(poses.values[0], 340);
  assert.equal(poses.values[1], 260);
  assert.ok(Math.abs(poses.values[2] - 0.32) < 1e-6);
  runtime.dispose();
});

test("an axle rotates freely by default and only locks when angular limits are enabled", async () => {
  const makeGraph = limitsEnabled => normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: -9.8 }, pixelsPerMeter: 100 },
    systems: [{ id: "pendulum", gravityMode: "world", clock: { fixedHz: 60 } }],
    bodies: [{
      id: "rod", systemId: "pendulum", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "rod" },
      collider: { kind: "box", width: 30, height: 200 },
      initial: { x: 0, y: 100, angle: 0.325 },
    }],
    constraints: [{
      id: "axle", systemId: "pendulum", kind: "axle",
      limitsEnabled, lowerLimit: limitsEnabled ? 0 : null, upperLimit: limitsEnabled ? 0 : null,
      a: { kind: "object", objectRef: { kind: "element", elementId: "rod" }, anchor: "local", localPoint: [0.5, 0] },
      b: { kind: "world", point: [31.9, 5.3] },
    }],
  });
  const free = await RapierPhysicsSystem.create(makeGraph(false), "pendulum");
  const locked = await RapierPhysicsSystem.create(makeGraph(true), "pendulum");
  for (let step = 0; step < 60; step += 1) {
    free.step();
    locked.step();
  }
  const freeAngle = free.poses().values[2];
  const lockedAngle = locked.poses().values[2];
  assert.ok(freeAngle < -0.1, `free axle did not swing: ${freeAngle}`);
  assert.ok(Math.abs(lockedAngle) < 0.02, `limited axle did not lock: ${lockedAngle}`);
  free.dispose();
  locked.dispose();
});

test("an authored axle keeps rebased body-local anchors at its visual pivot", async () => {
  // These are deliberately not centred bounding-box anchors. They mirror a
  // freehand double-pendulum: each rendered path has a local collider origin
  // that differs from its Excalidraw frame centre. If the solver falls back to
  // `localPoint * collider.width`, Rapier immediately translates both bodies
  // to repair a joint that was already visually aligned.
  const pivot = [502.604, 240.753];
  const axleGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "left", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "left" },
        collider: { kind: "box", width: 124.69, height: 84.43 },
        initial: { x: 451.866, y: 214.761 },
      },
      {
        id: "right", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "right" },
        collider: { kind: "box", width: 120.46, height: 80.21 },
        initial: { x: 546.79, y: 257.147 },
      },
    ],
    constraints: [{
      id: "visual-axle", systemId: "world", kind: "axle", collideConnected: false,
      a: {
        kind: "object", objectRef: { kind: "element", elementId: "left" }, anchor: "local",
        localPoint: [0.881926, 0.509126], localAnchor: [pivot[0] - 451.866, pivot[1] - 214.761],
      },
      b: {
        kind: "object", objectRef: { kind: "element", elementId: "right" }, anchor: "local",
        localPoint: [0.133179, 0.013328], localAnchor: [pivot[0] - 546.79, pivot[1] - 257.147],
      },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(axleGraph, "world");
  runtime.step();
  const poses = runtime.poses().values;
  assert.ok(Math.abs(poses[0] - 451.866) < 0.01, `left body jumped to ${poses[0]}`);
  assert.ok(Math.abs(poses[1] - 214.761) < 0.01, `left body jumped to ${poses[1]}`);
  assert.ok(Math.abs(poses[4] - 546.79) < 0.01, `right body jumped to ${poses[4]}`);
  assert.ok(Math.abs(poses[5] - 257.147) < 0.01, `right body jumped to ${poses[5]}`);
  runtime.dispose();
});

test("a two-body axle keeps its original attachment point rigid while the assembly falls", async () => {
  // A body-to-body axle is free in world space: gravity moves the whole
  // assembly, but its two authored local anchors must remain coincident. This
  // catches regressions that make it look like a distance spring between body
  // centres rather than a true revolute joint at the clicked pivot.
  const pivot = [502.604, 240.753];
  const leftInitial = { x: 451.866, y: 214.761, angle: 0 };
  const rightInitial = { x: 546.79, y: 257.147, angle: 0 };
  const leftAnchor = [pivot[0] - leftInitial.x, pivot[1] - leftInitial.y];
  const rightAnchor = [pivot[0] - rightInitial.x, pivot[1] - rightInitial.y];
  const graph = normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: -9.8 }, pixelsPerMeter: 100 },
    systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
    bodies: [
      { id: "left", systemId: "world", bodyType: "dynamic", objectRef: { kind: "element", elementId: "left" }, collider: { kind: "box", width: 124.69, height: 84.43 }, initial: leftInitial },
      { id: "right", systemId: "world", bodyType: "dynamic", objectRef: { kind: "element", elementId: "right" }, collider: { kind: "box", width: 120.46, height: 80.21 }, initial: rightInitial },
    ],
    constraints: [{
      id: "body-body-axle", systemId: "world", kind: "axle", collideConnected: false,
      a: { kind: "object", objectRef: { kind: "element", elementId: "left" }, anchor: "local", localAnchor: leftAnchor },
      b: { kind: "object", objectRef: { kind: "element", elementId: "right" }, anchor: "local", localAnchor: rightAnchor },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const worldAnchor = (values, offset, anchor) => {
    const angle = values[offset + 2];
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return [
      values[offset] + anchor[0] * cosine - anchor[1] * sine,
      values[offset + 1] + anchor[0] * sine + anchor[1] * cosine,
    ];
  };
  let maximumSeparation = 0;
  for (let step = 0; step < 900; step += 1) {
    runtime.step();
    const values = runtime.poses().values;
    const left = worldAnchor(values, 0, leftAnchor);
    const right = worldAnchor(values, 4, rightAnchor);
    maximumSeparation = Math.max(maximumSeparation, Math.hypot(left[0] - right[0], left[1] - right[1]));
  }
  assert.ok(maximumSeparation < 0.1, `body-body axle separated by ${maximumSeparation.toFixed(3)} px`);
  runtime.dispose();
});

test("an authored axle pins one body to its visible world pivot without making the pivot a body", async () => {
  const pivot = [502.604, 240.753];
  const initial = { x: 451.866, y: 214.761, angle: 0 };
  const localAnchor = [pivot[0] - initial.x, pivot[1] - initial.y];
  const graph = normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: -9.8 }, pixelsPerMeter: 100 },
    systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
    bodies: [{
      id: "rod", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "rod" },
      collider: { kind: "box", width: 124.69, height: 84.43 },
      initial,
    }],
    constraints: [{
      id: "world-axle", systemId: "world", kind: "axle", collideConnected: false,
      objectRef: { kind: "element", elementId: "pivot" },
      a: { kind: "object", objectRef: { kind: "element", elementId: "rod" }, anchor: "local", localPoint: [0.5, 0.5], localAnchor },
      b: { kind: "world", point: pivot },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  for (let step = 0; step < 120; step += 1) runtime.step();
  const pose = runtime.poses().values;
  const cosine = Math.cos(pose[2]);
  const sine = Math.sin(pose[2]);
  const anchor = [
    pose[0] + localAnchor[0] * cosine - localAnchor[1] * sine,
    pose[1] + localAnchor[0] * sine + localAnchor[1] * cosine,
  ];
  assert.ok(Math.hypot(anchor[0] - pivot[0], anchor[1] - pivot[1]) < 0.1, "body anchor drifted away from the visual world pivot");
  assert.ok(Math.abs(pose[2]) > 0.1, "pinned body did not swing around the pivot");
  runtime.dispose();
});

test("paused constraint posing follows joints without advancing the simulation clock", async () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      { id: "anchor", systemId: "world", bodyType: "dynamic", objectRef: { kind: "element", elementId: "anchor" }, collider: { kind: "box", width: 40, height: 20 }, initial: { x: 0, y: 0 } },
      { id: "arm", systemId: "world", bodyType: "dynamic", objectRef: { kind: "element", elementId: "arm" }, collider: { kind: "box", width: 120, height: 20 }, initial: { x: 70, y: 0 } },
    ],
    constraints: [{
      id: "joint", systemId: "world", kind: "axle", collideConnected: false,
      a: { kind: "object", objectRef: { kind: "element", elementId: "anchor" }, anchor: "local", localAnchor: [20, 0] },
      b: { kind: "object", objectRef: { kind: "element", elementId: "arm" }, anchor: "local", localAnchor: [-50, 0] },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const anchor = runtime.bodyById.get("anchor").rigidBody;
  anchor.setTranslation({ x: 0, y: 0.8 }, true);
  const initialStep = runtime.stepIndex;
  const poses = runtime.relaxConstraints(["anchor"], 32);
  const arm = poses.find(pose => pose.bodyId === "arm");
  assert.ok(arm.y > 40, `connected arm did not follow posed anchor: ${arm.y}`);
  assert.equal(runtime.stepIndex, initialStep, "paused posing must not advance simulation time");
  runtime.dispose();
});

test("live pose grabs solve bodies and world pivots without advancing authored time", async () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "arm", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "arm" },
      collider: { kind: "box", width: 160, height: 20 }, initial: { x: 80, y: 0 },
    }],
    constraints: [{
      id: "pivot", systemId: "world", kind: "axle", collideConnected: false,
      objectRef: { kind: "element", elementId: "pivot" },
      a: { kind: "object", objectRef: { kind: "element", elementId: "arm" }, anchor: "local", localAnchor: [-80, 0] },
      b: { kind: "world", point: [0, 0] },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const startStep = runtime.stepIndex;
  assert.equal(runtime.grab("arm", [160, 0], 600, 45, { livePose: true }), true);
  assert.equal(runtime.moveGrab([80, 120], { livePose: true, iterations: 72 }), true);
  const values = runtime.poses().values;
  const angle = values[2];
  const pivot = [
    values[0] - 80 * Math.cos(angle),
    values[1] - 80 * Math.sin(angle),
  ];
  assert.ok(Math.hypot(pivot[0], pivot[1]) < 0.5, `live pose detached pivot: ${pivot}`);
  assert.ok(Math.abs(angle) > 0.2, `live pose did not rotate the arm: ${angle}`);
  assert.equal(runtime.stepIndex, startStep, "live pose must not advance the public simulation clock");
  runtime.releaseGrab();
  assert.equal(runtime.grabConstraint("pivot", [0, 0], 600, 45, { livePose: true }), true);
  runtime.moveGrab([25, 15], { livePose: true, iterations: 48 });
  const moved = runtime.poses().values;
  const movedAngle = moved[2];
  const movedPivot = [
    moved[0] - 80 * Math.cos(movedAngle),
    moved[1] - 80 * Math.sin(movedAngle),
  ];
  assert.ok(Math.hypot(movedPivot[0] - 25, movedPivot[1] - 15) < 0.75, `live pose did not move world pivot: ${movedPivot}`);
  runtime.releaseGrab();
  runtime.reset();
  assert.equal(runtime.grabConstraint("pivot", [0, 0], 600, 45, { livePose: true }), true, "Reset must retain a live-grabbable pivot");
  assert.equal(runtime.moveGrab([12, -18], { livePose: true, iterations: 48 }), true);
  const resetValues = runtime.poses().values;
  const resetAngle = resetValues[2];
  const resetPivot = [
    resetValues[0] - 80 * Math.cos(resetAngle),
    resetValues[1] - 80 * Math.sin(resetAngle),
  ];
  assert.ok(Math.hypot(resetPivot[0] - 12, resetPivot[1] + 18) < 0.75, `Reset lost the pivot constraint: ${resetPivot}`);
  runtime.dispose();
});

test("live pose does not advance unrelated axle motors", async () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "motor-arm", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "motor-arm" },
        collider: { kind: "box", width: 120, height: 20 }, initial: { x: 60, y: 0 },
      },
      {
        id: "dragged", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "dragged" },
        collider: { kind: "circle", radius: 12 }, initial: { x: 240, y: 80 },
      },
    ],
    constraints: [{
      id: "motor", systemId: "world", kind: "axle",
      a: { kind: "object", objectRef: { kind: "element", elementId: "motor-arm" }, anchor: "local", localAnchor: [-60, 0] },
      b: { kind: "world", point: [0, 0] },
      motorEnabled: true,
      motorSpeed: 180,
      motorTorque: 100,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const startStep = runtime.stepIndex;
  const motorAngle = runtime.poses().values[2];
  assert.equal(runtime.grab("dragged", [240, 80], 600, 45, { livePose: true }), true);
  assert.equal(runtime.moveGrab([310, 170], { livePose: true, iterations: 72 }), true);
  assert.ok(Math.abs(runtime.poses().values[2] - motorAngle) < 1e-6, "live posing must not run axle motors");
  assert.equal(runtime.stepIndex, startStep, "live posing must not advance simulation time");
  runtime.releaseGrab();
  runtime.dispose();
});

test("a live pose committed at transport zero becomes the next reset baseline", async () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "arm", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "arm" },
      collider: { kind: "box", width: 160, height: 20 }, initial: { x: 80, y: 0 },
    }],
    constraints: [{
      id: "pivot", systemId: "world", kind: "axle", collideConnected: false,
      objectRef: { kind: "element", elementId: "pivot" },
      a: { kind: "object", objectRef: { kind: "element", elementId: "arm" }, anchor: "local", localAnchor: [-80, 0] },
      b: { kind: "world", point: [0, 0] },
    }],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  runtime.grab("arm", [160, 0], 600, 45, { livePose: true });
  runtime.moveGrab([70, 120], { livePose: true, iterations: 72 });
  const posed = runtime.poses().values;
  const committed = normalizeRelationshipGraph({
    ...graph,
    bodies: graph.bodies.map(body => body.id === "arm" ? {
      ...body,
      initial: { ...body.initial, x: posed[0], y: posed[1], angle: posed[2] },
    } : body),
  });
  runtime.dispose();

  const rebuilt = await RapierPhysicsSystem.create(committed, "world");
  const resetPose = rebuilt.poses().values;
  assert.ok(Math.abs(resetPose[0] - posed[0]) < 1e-4, `reset x did not keep live pose: ${resetPose[0]}`);
  assert.ok(Math.abs(resetPose[1] - posed[1]) < 1e-4, `reset y did not keep live pose: ${resetPose[1]}`);
  assert.ok(Math.abs(resetPose[2] - posed[2]) < 1e-4, `reset angle did not keep live pose: ${resetPose[2]}`);
  rebuilt.reset();
  assert.deepEqual([...rebuilt.poses().values], [...resetPose], "Reset must retain the committed live pose");
  rebuilt.dispose();
});

test("seeded populations produce identical pose and collision sequences", async () => {
  const populationGraph = normalizeRelationshipGraph({
    systems: [{ id: "gas", gravity: { x: 0, y: 0 }, seed: 7 }],
    bodies: [{ id: "wall", systemId: "gas", bodyType: "fixed", collider: { kind: "box", width: 8, height: 200 }, initial: { x: 120, y: 100 }, collisionTags: ["wall"] }],
    populations: [{ id: "particles", systemId: "gas", seed: 23, count: 12, bounds: { x: 10, y: 10, width: 80, height: 180 }, prototype: { collider: { kind: "circle", radius: 4 }, collisionTags: ["particle"] }, spawn: { speedMin: 80, speedMax: 120 } }],
  });
  const first = await RapierPhysicsSystem.create(populationGraph, "gas");
  const second = await RapierPhysicsSystem.create(populationGraph, "gas");
  const firstEvents = [];
  const secondEvents = [];
  for (let index = 0; index < 90; index += 1) {
    firstEvents.push(...first.step().events.map(event => [event.step, event.phase, event.collisionClass, event.a.id, event.b.id]));
    secondEvents.push(...second.step().events.map(event => [event.step, event.phase, event.collisionClass, event.a.id, event.b.id]));
  }
  assert.deepEqual([...first.poses().values], [...second.poses().values]);
  assert.deepEqual(firstEvents, secondEvents);
  first.dispose();
  second.dispose();
});

test("moving path chains report a deterministic body-body impact", async () => {
  const chainGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "triangle",
        systemId: "world",
        bodyType: "dynamic",
        collider: { kind: "chain", points: [[-20, 20], [0, -20], [20, 20], [-20, 20]], thickness: 3 },
        initial: { x: 0, y: 0, velocityX: 80 },
        collisionTags: ["body"],
        material: { restitution: 0.7 },
      },
      {
        id: "spiral",
        systemId: "world",
        bodyType: "dynamic",
        collider: { kind: "chain", points: [[-20, 0], [-10, -15], [5, -15], [15, 0], [5, 15], [-10, 15], [-20, 0]], thickness: 3 },
        initial: { x: 80, y: 0, velocityX: -80 },
        collisionTags: ["body"],
        material: { restitution: 0.7 },
      },
    ],
  });
  const first = await RapierPhysicsSystem.create(chainGraph, "world");
  const second = await RapierPhysicsSystem.create(chainGraph, "world");
  const run = runtime => {
    const events = [];
    for (let index = 0; index < 60; index += 1) events.push(...runtime.step().events);
    return events.filter(event => event.phase === "hit" && event.collisionClass === "body-body");
  };
  const firstHits = run(first);
  const secondHits = run(second);
  assert.ok(firstHits.some(event => event.impulse > 0.01 && event.a.id === "triangle" && event.b.id === "spiral"));
  assert.deepEqual(
    firstHits.map(event => [event.step, event.a.id, event.b.id, event.impulse]),
    secondHits.map(event => [event.step, event.a.id, event.b.id, event.impulse]),
  );
  // Chains are compound bodies. Snapshot reset must reindex every segment so
  // their later contacts still resolve to the authored bodies and mappings.
  first.reset();
  const resetHits = run(first);
  assert.deepEqual(
    resetHits.map(event => [event.step, event.a.id, event.b.id, event.impulse]),
    firstHits.map(event => [event.step, event.a.id, event.b.id, event.impulse]),
  );
  first.dispose();
  second.dispose();
});

test("rounded path chains use stroke thickness and CCD to stop a fast small body", async () => {
  const chainGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "fast-ball",
        systemId: "world",
        bodyType: "dynamic",
        collider: { kind: "circle", radius: 2, contactSkin: 1 },
        initial: { x: 0, y: -40, velocityY: 9000 },
        collisionTags: ["body"],
        material: { restitution: 0 },
      },
      {
        id: "stroke-wall",
        systemId: "world",
        bodyType: "fixed",
        collider: { kind: "chain", points: [[-120, 0], [120, 0]], thickness: 8, contactSkin: 1 },
        initial: { x: 0, y: 0 },
        collisionTags: ["wall"],
        material: { restitution: 0 },
      },
    ],
  });
  const runtime = await RapierPhysicsSystem.create(chainGraph, "world");
  const events = [];
  for (let index = 0; index < 6; index += 1) events.push(...runtime.step().events);
  assert.ok(events.some(event => event.phase === "hit" && event.collisionClass === "body-wall"));
  const poses = runtime.poses();
  const ballIndex = poses.metadata.findIndex(pose => pose.id === "fast-ball");
  const ballY = poses.values[ballIndex * 4 + 1];
  // The wall is centred on y=0. A body that tunneled would be far below it
  // after a single fixed step; CCD plus its and the wall's skins hold it at
  // the visible side of the thick stroke instead.
  assert.ok(ballIndex >= 0);
  assert.ok(ballY < 12, `ball crossed the solid path chain: y=${ballY}`);
  runtime.dispose();
});

test("rope constraints generate jointed links while publishing one rendered rope path", async () => {
  const ropeGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    constraints: [{
      id: "rope", systemId: "world", kind: "rope",
      a: { kind: "world", point: [0, 0] },
      b: { kind: "world", point: [120, 0] },
      pathPoints: [[0, 0], [30, 20], [90, 20], [120, 0]],
      segmentLength: 24,
      thickness: 4,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(ropeGraph, "world");
  const initial = runtime.poses();
  assert.deepEqual(initial.metadata, [], "generated rope links must stay out of the canvas pose transfer");
  assert.equal(initial.ropePaths.length, 1);
  assert.deepEqual(initial.ropePaths[0].points[0].map(value => Math.abs(Math.round(value))), [0, 0]);
  assert.deepEqual(initial.ropePaths[0].points.at(-1).map(value => Math.abs(Math.round(value))), [120, 0]);
  assert.ok(runtime.bodyById.has("rope:rope:0"), "rope should create runtime link bodies");

  runtime.bodyById.get("rope:rope:1").rigidBody.setTranslation({ x: 0.45, y: 0.45 }, true);
  runtime.step();
  const displaced = runtime.poses().ropePaths[0].points;
  assert.notDeepEqual(displaced, initial.ropePaths[0].points, "the rendered rope path should follow the link chain");

  runtime.reset();
  const reset = runtime.poses().ropePaths[0].points;
  assert.deepEqual(
    reset.map(point => point.map(value => Math.abs(Math.round(value)))),
    initial.ropePaths[0].points.map(point => point.map(value => Math.abs(Math.round(value)))),
  );
  runtime.dispose();
});

test("rope constraints leave explicit None endpoints free", async () => {
  const ropeGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 9.8 }, clock: { fixedHz: 60 } }],
    constraints: [{
      id: "free-rope", systemId: "world", kind: "rope",
      a: { kind: "none" },
      b: { kind: "none" },
      pathPoints: [[0, 0], [60, 0], [120, 0]],
      segmentLength: 24,
      thickness: 4,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(ropeGraph, "world");
  const initial = runtime.poses().ropePaths[0].points;
  for (let index = 0; index < 30; index += 1) runtime.step();
  const fallen = runtime.poses().ropePaths[0].points;
  assert.ok(
    fallen.every((point, index) => point[1] > initial[index][1]),
    "a rope with no endpoints should remain unpinned and fall under gravity",
  );
  runtime.dispose();
});

test("a free rope can be grabbed through its authored constraint", async () => {
  const ropeGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    constraints: [{
      id: "free-rope", systemId: "world", kind: "rope",
      a: { kind: "none" }, b: { kind: "none" },
      pathPoints: [[0, 0], [60, 0], [120, 0]], segmentLength: 24, thickness: 4,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(ropeGraph, "world");
  const initial = runtime.poses().ropePaths[0].points;
  assert.equal(runtime.grabConstraint("free-rope", [60, 0], 280, 28, { livePose: true }), true);
  runtime.moveGrab([60, 40], { livePose: true, iterations: 36 });
  const posed = runtime.poses().ropePaths[0].points;
  assert.notDeepEqual(posed, initial, "grabbing a free rope should move its generated links");
  runtime.releaseGrab();
  runtime.dispose();
});

test("rope-attached pivots publish their live joint anchor", async () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    constraints: [
      { id: "rope", systemId: "world", kind: "rope", a: { kind: "none" }, b: { kind: "none" }, pathPoints: [[0, 0], [60, 0], [120, 0]], segmentLength: 24, thickness: 4 },
      { id: "pivot", systemId: "world", kind: "fixate", a: { kind: "rope", objectRef: { kind: "element", elementId: "rope-visual" }, constraintId: "rope", point: [60, 0] }, b: { kind: "world", point: [60, 0] } },
    ],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const anchor = runtime.poses().constraintAnchors.find(value => value.constraintId === "pivot");
  assert.deepEqual(anchor?.point.map(value => Math.round(value)), [60, 0]);
  assert.equal(runtime.grabConstraint("pivot", [60, 0], 280, 28, { livePose: true }), true);
  runtime.moveGrab([95, 45], { livePose: true, iterations: 96 });
  const movedAnchor = runtime.poses().constraintAnchors.find(value => value.constraintId === "pivot");
  assert.deepEqual(movedAnchor?.point.map(value => Math.round(value)), [95, 45]);
  assert.equal(movedAnchor?.ropeAttachments?.[0]?.side, "a");
  assert.equal(movedAnchor?.ropeAttachments?.[0]?.linkIndex, 2);
  assert.equal(movedAnchor?.ropeAttachments?.[0]?.ropeProgress, 0.5);
  assert.ok(Array.isArray(movedAnchor?.ropeAttachments?.[0]?.point));
  assert.ok(Math.hypot(
    movedAnchor.point[0] - movedAnchor.ropeAttachments[0].point[0],
    movedAnchor.point[1] - movedAnchor.ropeAttachments[0].point[1],
  ) < 0.5, "the release-grade solve must keep the axle on its rope point");
  const posedPath = runtime.poses().ropePaths.find(value => value.constraintId === "rope")?.points;
  const persistedAttachment = movedAnchor.ropeAttachments[0];
  runtime.dispose();

  const rebuiltGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    constraints: [
      { id: "rope", systemId: "world", kind: "rope", a: { kind: "none" }, b: { kind: "none" }, pathPoints: posedPath, segmentLength: 24, thickness: 4 },
      {
        id: "pivot",
        systemId: "world",
        kind: "fixate",
        a: {
          kind: "rope",
          objectRef: { kind: "element", elementId: "rope-visual" },
          constraintId: "rope",
          point: persistedAttachment.point,
          linkIndex: persistedAttachment.linkIndex,
          ropeProgress: persistedAttachment.ropeProgress,
        },
        b: { kind: "world", point: movedAnchor.point },
      },
    ],
  });
  const rebuilt = await RapierPhysicsSystem.create(rebuiltGraph, "world");
  const rebuiltAttachment = rebuilt.poses().constraintAnchors
    .find(value => value.constraintId === "pivot")?.ropeAttachments?.[0];
  assert.equal(rebuiltAttachment?.side, "a");
  assert.ok(Math.abs(rebuiltAttachment.ropeProgress - 0.5) < 1e-6);
  rebuilt.dispose();
});

test("two rope-bound world pivots clamp Live pose without stretching or jitter", async () => {
  const restLength = 130;
  const graph = normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: 0 }, pixelsPerMeter: 100 },
    systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
    constraints: [
      {
        id: "rope", systemId: "world", kind: "rope", a: { kind: "none" }, b: { kind: "none" },
        pathPoints: [[0, 0], [60, 25], [120, 0]], restLength, segmentLength: 24, thickness: 4,
      },
      {
        id: "left", systemId: "world", kind: "axle",
        a: { kind: "rope", objectRef: { kind: "element", elementId: "rope-visual" }, constraintId: "rope", point: [0, 0], ropeProgress: 0 },
        b: { kind: "world", point: [0, 0] },
      },
      {
        id: "right", systemId: "world", kind: "axle",
        a: { kind: "rope", objectRef: { kind: "element", elementId: "rope-visual" }, constraintId: "rope", point: [120, 0], ropeProgress: 1 },
        b: { kind: "world", point: [120, 0] },
      },
    ],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const pathLength = points => points.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point[0] - points[index][0], point[1] - points[index][1])
  ), 0);
  assert.equal(runtime.grabConstraint("left", [0, 0], 280, 28, { livePose: true }), true);
  runtime.moveGrab([-40, 40], { livePose: true, iterations: 36 });
  const firstPose = runtime.poses();
  const firstPath = firstPose.ropePaths[0].points;
  const leftAnchor = firstPose.constraintAnchors.find(anchor => anchor.constraintId === "left")?.point;
  assert.ok(leftAnchor);
  assert.ok(pathLength(firstPath) <= restLength + 1, `rope stretched to ${pathLength(firstPath).toFixed(3)} px`);
  assert.ok(Math.hypot(leftAnchor[0] - 120, leftAnchor[1]) <= restLength + 0.5, "drag target exceeded rope reach");

  runtime.moveGrab([-40, 40], { livePose: true, iterations: 36 });
  const secondPath = runtime.poses().ropePaths[0].points;
  const jitter = firstPath.reduce((maximum, point, index) => Math.max(
    maximum,
    Math.hypot(point[0] - secondPath[index][0], point[1] - secondPath[index][1]),
  ), 0);
  assert.ok(jitter < 0.01, `repeated drag target moved the rope by ${jitter.toFixed(3)} px`);
  runtime.releaseGrab();
  runtime.dispose();
});

test("rope-bound axle pivots preserve rope length while dragging", async () => {
  const restLength = 120;
  const graph = normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: 0 }, pixelsPerMeter: 100 },
    systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "left-body", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "left-body" },
        collider: { kind: "circle", width: 20, height: 20 }, initial: { x: 0, y: 0 },
      },
      {
        id: "right-body", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "right-body" },
        collider: { kind: "circle", width: 20, height: 20 }, initial: { x: 120, y: 0 },
      },
    ],
    constraints: [
      {
        id: "rope", systemId: "world", kind: "rope", a: { kind: "none" }, b: { kind: "none" },
        pathPoints: [[0, 0], [60, 0], [120, 0]], restLength, segmentLength: 20, thickness: 4,
      },
      {
        id: "left-axle", systemId: "world", kind: "axle",
        a: { kind: "rope", objectRef: { kind: "element", elementId: "rope-visual" }, constraintId: "rope", point: [0, 0], ropeProgress: 0 },
        b: { kind: "object", objectRef: { kind: "element", elementId: "left-body" }, anchor: "local", localAnchor: [0, 0] },
      },
      {
        id: "right-axle", systemId: "world", kind: "axle",
        a: { kind: "rope", objectRef: { kind: "element", elementId: "rope-visual" }, constraintId: "rope", point: [120, 0], ropeProgress: 1 },
        b: { kind: "object", objectRef: { kind: "element", elementId: "right-body" }, anchor: "local", localAnchor: [0, 0] },
      },
    ],
  });
  const runtime = await RapierPhysicsSystem.create(graph, "world");
  const pathLength = points => points.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point[0] - points[index][0], point[1] - points[index][1])
  ), 0);
  assert.equal(runtime.grabConstraint("left-axle", [0, 0], 280, 28, { livePose: true }), true);
  runtime.moveGrab([-200, 200], { livePose: true, iterations: 36 });
  const pose = runtime.poses();
  const ropePath = pose.ropePaths[0].points;
  const leftAnchor = pose.constraintAnchors.find(anchor => anchor.constraintId === "left-axle")?.point;
  const rightAnchor = pose.constraintAnchors.find(anchor => anchor.constraintId === "right-axle")?.point;
  assert.ok(leftAnchor && rightAnchor);
  assert.ok(pathLength(ropePath) <= restLength + 1, `rope stretched to ${pathLength(ropePath).toFixed(3)} px`);
  assert.ok(
    Math.hypot(leftAnchor[0] - rightAnchor[0], leftAnchor[1] - rightAnchor[1]) <= restLength + 0.5,
    "drag target exceeded the rope's available length",
  );
  runtime.moveGrab([-200, 200], { livePose: true, iterations: 36 });
  const repeatedPath = runtime.poses().ropePaths[0].points;
  const jitter = ropePath.reduce((maximum, point, index) => Math.max(
    maximum,
    Math.hypot(point[0] - repeatedPath[index][0], point[1] - repeatedPath[index][1]),
  ), 0);
  assert.ok(jitter < 0.01, `repeated axle drag moved the rope by ${jitter.toFixed(3)} px`);
  runtime.releaseGrab();
  runtime.dispose();
});

test("dense authored rope paths are simplified to their requested link spacing", async () => {
  // Freehand input can contain hundreds of points a few pixels apart. Those
  // points are visual detail, not an instruction to create one rigid body and
  // two joints for every input sample.
  const pathPoints = Array.from({ length: 601 }, (_, index) => [index * 2, 100 + Math.sin(index * 0.08) * 20]);
  const ropeGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    constraints: [{
      id: "dense-rope", systemId: "world", kind: "rope",
      a: { kind: "world", point: pathPoints[0] },
      b: { kind: "world", point: pathPoints.at(-1) },
      pathPoints,
      segmentLength: 24,
      thickness: 4,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(ropeGraph, "world");
  const links = [...runtime.bodyById.values()].filter(entity => entity.ropeLink);
  // The curve is roughly 1.2k canvas px long, so a 24 px simulation spacing
  // should create roughly 50 links rather than 600 raw-pointer samples.
  // Keep a little room for the curve's true arc length, while preserving the
  // critical guarantee: no raw-pointer-sized rope explosion.
  assert.ok(links.length <= 64, `dense rope created ${links.length} links`);
  runtime.dispose();
});

test("excluded runtime instances keep stable population identities", async () => {
  const excludedGraph = normalizeRelationshipGraph({
    systems: [{ id: "gas", gravity: { x: 0, y: 0 } }],
    populations: [{ id: "particles", systemId: "gas", seed: 3, count: 4, excludedInstanceIds: ["particles:1"], prototype: { collider: { kind: "circle", radius: 3 } } }],
  });
  const runtime = await RapierPhysicsSystem.create(excludedGraph, "gas");
  assert.deepEqual(runtime.poses().metadata.map(metadata => metadata.instanceId), ["particles:0", "particles:2", "particles:3"]);
  runtime.dispose();
});

test("authored attractors apply fixed-step forces only to matching dynamic bodies", async () => {
  const attractorGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [
      {
        id: "target", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "target" },
        collider: { kind: "circle", radius: 16 }, initial: { x: 180, y: 0 },
        collisionTags: ["attracted"],
      },
      {
        id: "ignored", systemId: "world", bodyType: "dynamic",
        objectRef: { kind: "element", elementId: "ignored" },
        collider: { kind: "circle", radius: 16 }, initial: { x: -180, y: 0 },
        collisionTags: ["ignored"],
      },
    ],
    constraints: [{
      id: "attractor", systemId: "world", kind: "attractor",
      a: { kind: "world", point: [0, 0] },
      b: { kind: "world", point: [0, 0] },
      attractionStrength: 1,
      attractionRadius: 400,
      attractionFalloff: 0,
      attractionMode: "attract",
      targetTags: ["attracted"],
    }],
  });
  const runtime = await RapierPhysicsSystem.create(attractorGraph, "world");
  // Keep this short enough that the pulled body cannot subsequently collide
  // with the deliberately non-target body and move it through contact.
  for (let step = 0; step < 3; step += 1) runtime.step();
  const poses = runtime.poses();
  const targetIndex = poses.metadata.findIndex(pose => pose.id === "target");
  const ignoredIndex = poses.metadata.findIndex(pose => pose.id === "ignored");
  assert.ok(poses.values[targetIndex * 4] < 180, "matching target should move toward the attractor");
  assert.ok(Math.abs(poses.values[ignoredIndex * 4] + 180) < 0.001, "tag-filtered body should remain still");
  runtime.dispose();
});

test("authored thrusters push their dynamic host and publish their current path", async () => {
  const thrusterGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "host", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "host" },
      collider: { kind: "box", width: 60, height: 24 }, initial: { x: 100, y: 100 },
    }],
    constraints: [{
      id: "thruster", systemId: "world", kind: "thruster",
      objectRef: { kind: "element", elementId: "thruster-visual" },
      a: { kind: "object", objectRef: { kind: "element", elementId: "host" }, anchor: "local", localAnchor: [0, 0] },
      b: { kind: "world", point: [220, 100] },
      thrusterForce: 1,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(thrusterGraph, "world");
  const initialPath = runtime.poses().thrusterPaths[0]?.points;
  assert.deepEqual(initialPath?.map(point => Math.round(point[1])), [100, 100]);
  for (let step = 0; step < 30; step += 1) runtime.step();
  const poses = runtime.poses();
  assert.ok(poses.values[0] > 100, "thruster should accelerate its host along the authored direction");
  assert.equal(poses.thrusterPaths.length, 1, "thruster visual should be returned separately from body poses");
  assert.ok(poses.thrusterPaths[0].points[0][0] > initialPath[0][0], "thruster path should follow its host");
  runtime.dispose();
});

test("axle motors drive revolute joints in authored degrees per second", async () => {
  const motorGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "arm", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "arm" },
      collider: { kind: "box", width: 120, height: 20 }, initial: { x: 60, y: 0 },
    }],
    constraints: [{
      id: "motor", systemId: "world", kind: "axle",
      a: { kind: "object", objectRef: { kind: "element", elementId: "arm" }, anchor: "local", localAnchor: [-60, 0] },
      b: { kind: "world", point: [0, 0] },
      motorEnabled: true,
      motorSpeed: 180,
      motorTorque: 100,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(motorGraph, "world");
  for (let step = 0; step < 30; step += 1) runtime.step();
  const angle = runtime.poses().values[2];
  assert.ok(Math.abs(angle) > 0.2, `motor did not rotate its axle: ${angle}`);
  runtime.dispose();
});

test("free axle motors spin their host without pinning it to the world", async () => {
  const motorGraph = normalizeRelationshipGraph({
    systems: [{ id: "world", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
    bodies: [{
      id: "wheel", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "wheel" },
      collider: { kind: "circle", radius: 30 }, initial: { x: 120, y: 80 },
    }],
    constraints: [{
      id: "free-motor", systemId: "world", kind: "axle",
      a: { kind: "object", objectRef: { kind: "element", elementId: "wheel" }, anchor: "center", localPoint: [0.5, 0.5] },
      b: { kind: "none" },
      motorEnabled: true,
      motorSpeed: 180,
      motorTorque: 100,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(motorGraph, "world");
  for (let step = 0; step < 60; step += 1) runtime.step();
  const poses = runtime.poses();
  assert.ok(Math.abs(poses.values[2]) > 0.2, `free axle motor did not rotate its host: ${poses.values[2]}`);
  assert.ok(Math.abs(poses.values[0] - 120) < 0.01, "free axle motor must not create a world pin");
  assert.ok(Math.abs(poses.values[1] - 80) < 0.01, "free axle motor must not create a world pin");
  runtime.reset();
  for (let step = 0; step < 30; step += 1) runtime.step();
  assert.ok(Math.abs(runtime.poses().values[2]) > 0.1, "free axle motor should survive reset");
  runtime.dispose();
});

test("low-speed axle motors stay awake at zero gravity", async () => {
  const motorGraph = normalizeRelationshipGraph({
    world: { gravity: { x: 0, y: 0 }, pixelsPerMeter: 100 },
    systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
    bodies: [{
      id: "wheel", systemId: "world", bodyType: "dynamic",
      objectRef: { kind: "element", elementId: "wheel" },
      collider: { kind: "circle", radius: 185 },
      material: { density: 0.1 },
      initial: { x: 240, y: 538 },
    }],
    constraints: [{
      id: "motor", systemId: "world", kind: "axle",
      a: { kind: "object", objectRef: { kind: "element", elementId: "wheel" }, anchor: "local", localAnchor: [-100, -15] },
      b: { kind: "world", point: [140, 522] },
      motorEnabled: true,
      motorSpeed: 10,
      motorTorque: 100,
    }],
  });
  const runtime = await RapierPhysicsSystem.create(motorGraph, "world");
  for (let step = 0; step < 120; step += 1) runtime.step();
  const firstAngle = runtime.poses().values[2];
  for (let step = 0; step < 120; step += 1) runtime.step();
  const secondAngle = runtime.poses().values[2];
  assert.ok(Math.abs(secondAngle - firstAngle) > 0.2, `low-speed motor fell asleep: ${firstAngle} -> ${secondAngle}`);
  runtime.dispose();
});

test("world gravity keeps metre units when pixels per metre changes", async () => {
  const fallDistance = async pixelsPerMeter => {
    const fallGraph = normalizeRelationshipGraph({
      world: { gravity: { x: 0, y: -9.8 }, pixelsPerMeter },
      systems: [{ id: "world", gravityMode: "world", clock: { fixedHz: 60 } }],
      bodies: [{
        id: "ball", systemId: "world", bodyType: "dynamic",
        collider: { kind: "circle", radius: 12 }, initial: { x: 0, y: 0 },
      }],
    });
    const runtime = await RapierPhysicsSystem.create(fallGraph, "world");
    for (let step = 0; step < 60; step += 1) runtime.step();
    const y = runtime.poses().values[1];
    runtime.dispose();
    return y;
  };
  const at100 = await fallDistance(100);
  const at200 = await fallDistance(200);
  assert.ok(at100 > 400, `expected roughly 4.9 m of falling at 100 px/m, got ${at100}px`);
  assert.ok(Math.abs(at200 / at100 - 2) < 0.05, `pixels-per-metre did not scale world gravity: ${at100}px vs ${at200}px`);
});
