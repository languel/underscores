import test from "node:test";
import assert from "node:assert/strict";
import {
  PhysicsRouteRuntime,
  RelationshipWriterRegistry,
  addRelationshipItem,
  createDefaultPhysicsSystem,
  findRelationshipOrphans,
  normalizeRelationshipGraph,
  physicsRouteMatches,
  remapRelationshipGraph,
} from "./relationshipGraph.js";

test("relationship graphs normalize legacy empty data and typed items", () => {
  const system = createDefaultPhysicsSystem({ id: "system", gravity: { x: 0, y: 0 } });
  const graph = normalizeRelationshipGraph({
    systems: [system],
    bodies: [{ id: "body", systemId: "system", objectRef: "old", collider: { kind: "circle", radius: 9 } }],
  });
  assert.equal(graph.version, 1);
  assert.equal(graph.systems[0].clock.fixedHz, 60);
  assert.equal(graph.bodies[0].objectRef.elementId, "old");
  assert.equal(graph.bodies[0].tracking, "authored-rigid");
});

test("relationship imports remap object and endpoint references", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "system" }],
    bodies: [{ id: "body", systemId: "system", objectRef: "old" }],
    constraints: [{ id: "spring", systemId: "system", kind: "spring", a: { kind: "object", objectRef: "old" }, b: { kind: "world", point: [1, 2] } }],
  });
  const remapped = remapRelationshipGraph(graph, new Map([["old", "new"]]));
  assert.equal(remapped.bodies[0].objectRef.elementId, "new");
  assert.equal(remapped.constraints[0].a.objectRef.elementId, "new");
  assert.deepEqual(findRelationshipOrphans(remapped, [{ id: "new" }]), []);
  assert.equal(findRelationshipOrphans(remapped, [])[0].id, "body");
});

test("deleted stable Bezier anchors orphan only their participating endpoint", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "geometry", adapter: "geometry" }],
    constraints: [{
      id: "anchor-spring",
      systemId: "geometry",
      kind: "spring",
      a: { kind: "bezier-anchor", objectRef: "curve", anchorId: "anchor-a" },
      b: { kind: "world", point: [10, 20] },
    }],
  });
  const element = {
    id: "curve",
    customData: { draweratorGeometry: { anchors: [{ id: "anchor-a" }, { id: "anchor-b" }] } },
  };
  assert.deepEqual(findRelationshipOrphans(graph, [element]), []);
  element.customData.draweratorGeometry.anchors.splice(0, 1);
  assert.deepEqual(findRelationshipOrphans(graph, [element]), [
    { kind: "constraint", id: "anchor-spring", endpoint: "a" },
  ]);
});

test("collision routes filter and enforce cooldown per pair", () => {
  const graph = addRelationshipItem({ systems: [{ id: "system" }] }, "routes", {
    id: "notes",
    systemId: "system",
    filter: { phases: ["hit"], classes: ["body-wall"], tagsB: ["wall"], minImpulse: 2 },
    cooldownMs: 100,
    actions: [{ kind: "event", name: "note" }],
  });
  const event = { systemId: "system", phase: "hit", collisionClass: "body-wall", impulse: 3, relativeSpeed: 4, a: { id: "a", tags: ["particle"] }, b: { id: "b", tags: ["wall"] } };
  assert.equal(physicsRouteMatches(graph.routes[0], event), true);
  let now = 10;
  const runtime = new PhysicsRouteRuntime({ now: () => now });
  assert.equal(runtime.route(graph, event).length, 1);
  now = 50;
  assert.equal(runtime.route(graph, event).length, 0);
  now = 120;
  assert.equal(runtime.route(graph, event).length, 1);
});

test("writer registry exposes transform ownership conflicts", () => {
  const registry = new RelationshipWriterRegistry();
  assert.equal(registry.claim("physics", "object", "transform").ok, true);
  const conflict = registry.claim("automation", "object", "transform");
  assert.equal(conflict.ok, false);
  assert.equal(conflict.ownerId, "physics");
  registry.release("physics");
  assert.equal(registry.claim("automation", "object", "transform").ok, true);
});

test("population exclusions and deformable reset geometry survive normalization", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "geometry", adapter: "geometry" }],
    bodies: [{ id: "curve", systemId: "geometry", tracking: "authored-deformable", objectRef: "curve", initialGeometry: { version: 2, anchors: [{ id: "a", x: 0, y: 0 }] } }],
    populations: [{ id: "gas", systemId: "geometry", count: 3, excludedInstanceIds: ["gas:1", "gas:1"] }],
  });
  assert.equal(graph.bodies[0].initialGeometry.anchors[0].id, "a");
  assert.deepEqual(graph.populations[0].excludedInstanceIds, ["gas:1"]);
});

test("route dispatch guards nested response recursion", () => {
  const runtime = new PhysicsRouteRuntime({ maxDepth: 1 });
  assert.equal(runtime.dispatch({}, () => {
    assert.equal(runtime.dispatch({}, () => assert.fail("nested route should not run")), false);
  }), true);
});
