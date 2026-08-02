import test from "node:test";
import assert from "node:assert/strict";
import { RapierPhysicsSystem } from "./rapierPhysicsCore.js";
import { normalizeRelationshipGraph } from "./relationshipGraph.js";

const graph = normalizeRelationshipGraph({
  systems: [{ id: "system", gravity: { x: 0, y: 0 }, clock: { fixedHz: 60 } }],
  bodies: [
    { id: "ball", systemId: "system", collider: { kind: "circle", radius: 8 }, initial: { x: 20, y: 50, velocityX: 180 }, collisionTags: ["particle"] },
    { id: "wall", systemId: "system", bodyType: "fixed", collider: { kind: "box", width: 10, height: 100 }, initial: { x: 80, y: 50 }, collisionTags: ["wall"] },
  ],
});

test("Rapier runtime advances, reports typed collisions, and resets deterministically", async () => {
  const runtime = await RapierPhysicsSystem.create(graph, "system");
  let hits = [];
  for (let index = 0; index < 60; index += 1) hits.push(...runtime.step().events);
  assert.ok(hits.some(event => event.phase === "hit" && event.collisionClass === "body-wall"));
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

test("excluded runtime instances keep stable population identities", async () => {
  const excludedGraph = normalizeRelationshipGraph({
    systems: [{ id: "gas", gravity: { x: 0, y: 0 } }],
    populations: [{ id: "particles", systemId: "gas", seed: 3, count: 4, excludedInstanceIds: ["particles:1"], prototype: { collider: { kind: "circle", radius: 3 } } }],
  });
  const runtime = await RapierPhysicsSystem.create(excludedGraph, "gas");
  assert.deepEqual(runtime.poses().metadata.map(metadata => metadata.instanceId), ["particles:0", "particles:2", "particles:3"]);
  runtime.dispose();
});
