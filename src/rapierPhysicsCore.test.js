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

test("excluded runtime instances keep stable population identities", async () => {
  const excludedGraph = normalizeRelationshipGraph({
    systems: [{ id: "gas", gravity: { x: 0, y: 0 } }],
    populations: [{ id: "particles", systemId: "gas", seed: 3, count: 4, excludedInstanceIds: ["particles:1"], prototype: { collider: { kind: "circle", radius: 3 } } }],
  });
  const runtime = await RapierPhysicsSystem.create(excludedGraph, "gas");
  assert.deepEqual(runtime.poses().metadata.map(metadata => metadata.instanceId), ["particles:0", "particles:2", "particles:3"]);
  runtime.dispose();
});
