import test from "node:test";
import assert from "node:assert/strict";
import {
  PhysicsRouteRuntime,
  RelationshipWriterRegistry,
  addRelationshipItem,
  createDefaultPhysicsSystem,
  findRelationshipOrphans,
  getPhysicsCustomData,
  hydrateRelationshipGraphFromElements,
  normalizeRelationshipGraph,
  physicsRouteMatches,
  remapRelationshipGraph,
  removeRelationshipBindingsForElements,
  serializePhysicsBodyCustomData,
  serializeRelationshipGraphForScene,
  withPhysicsCustomData,
} from "./relationshipGraph.js";

test("relationship graphs normalize legacy empty data and typed items", () => {
  const system = createDefaultPhysicsSystem({ id: "system", gravity: { x: 0, y: 0 } });
  const graph = normalizeRelationshipGraph({
    systems: [system],
    bodies: [{ id: "body", systemId: "system", objectRef: "old", collider: { kind: "circle", radius: 9 } }],
  });
  assert.equal(graph.version, 2);
  assert.equal(graph.systems[0].clock.fixedHz, 60);
  assert.equal(graph.bodies[0].objectRef.elementId, "old");
  assert.equal(graph.bodies[0].tracking, "authored-rigid");
});

test("canvas Fixate and Axle constraints remain canonical graph relationships", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world" }],
    constraints: [
      { id: "fix", systemId: "world", kind: "fixate", a: { kind: "object", objectRef: "a" }, b: { kind: "world", point: [2, 3] } },
      { id: "axle", systemId: "world", kind: "axle", a: { kind: "object", objectRef: "a" }, b: { kind: "object", objectRef: "b" } },
    ],
  });
  assert.deepEqual(graph.constraints.map(item => item.kind), ["fixate", "axle"]);
  assert.equal(graph.constraints[0].b.kind, "world");
});

test("world physics defaults use real-world gravity and custom systems remain explicit", () => {
  const graph = normalizeRelationshipGraph({ systems: [{ id: "world-system" }] });
  assert.deepEqual(graph.world.gravity, { x: 0, y: -9.8 });
  assert.equal(graph.world.viscosity, 0);
  assert.equal(graph.world.simSpeed, 1);
  assert.equal(graph.world.pausedEditMode, "author");
  assert.equal(graph.systems[0].gravityMode, "world");
  const custom = createDefaultPhysicsSystem({ gravity: { x: 0, y: 500 } });
  assert.equal(custom.gravityMode, "custom");
});

test("world physics can lock authored reset poses during paused preview edits", () => {
  const graph = normalizeRelationshipGraph({ world: { pausedEditMode: "preview" } });
  assert.equal(graph.world.pausedEditMode, "preview");
});

test("physics body custom-data mirror keeps authored material and collider fields", () => {
  const mirror = serializePhysicsBodyCustomData({
    id: "body",
    bodyType: "kinematic",
    name: "Pendulum bob",
    collisionTags: ["body", "body"],
    collider: { kind: "circle", radius: 18, sensor: true },
    material: { friction: 0.4, restitution: 0.25, density: 2, linearDamping: 0.1 },
  });
  assert.equal(mirror.version, 1);
  assert.equal(mirror.id, "body");
  assert.equal(mirror.role, "body");
  assert.equal(mirror.enabled, true);
  assert.equal(mirror.bodyType, "kinematic");
  assert.equal(mirror.name, "Pendulum bob");
  assert.deepEqual(mirror.collisionTags, ["body"]);
  assert.deepEqual(mirror.collider, { kind: "circle", sensor: true, radius: 18, width: 24, height: 24, thickness: 2, contactSkin: 0, points: [], localOriginVersion: 0 });
  assert.deepEqual(mirror.material, { density: 2, friction: 0.4, restitution: 0.25, linearDamping: 0.1, angularDamping: 0.01 });
  assert.deepEqual(mirror.initial, { x: 0, y: 0, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0 });
});

test("physics metadata uses the short canonical key and reads the legacy alias", () => {
  const body = { bodyType: "fixed", collider: { kind: "box" }, material: { restitution: 0.2 } };
  const customData = { physics: serializePhysicsBodyCustomData(body) };
  assert.equal(getPhysicsCustomData({ customData }).bodyType, "fixed");
  assert.equal(getPhysicsCustomData({ customData: { draweratorPhysics: customData.physics } }).bodyType, "fixed");
});

test("authored body settings persist on the canvas object while the graph keeps its binding", () => {
  const body = {
    id: "ball",
    systemId: "world",
    objectRef: { kind: "element", elementId: "circle" },
    collider: { kind: "circle", radius: 12 },
    material: { restitution: 0.95 },
    initial: { x: 20, y: 30, velocityX: 4 },
  };
  const graph = normalizeRelationshipGraph({ systems: [{ id: "world" }], bodies: [body] });
  const element = { id: "circle", customData: withPhysicsCustomData({}, graph.bodies[0]) };
  const serialized = serializeRelationshipGraphForScene(graph);
  assert.deepEqual(serialized.bodies, [{
    id: "ball",
    systemId: "world",
    tracking: "authored-rigid",
    objectRef: { kind: "element", elementId: "circle" },
  }]);
  const hydrated = hydrateRelationshipGraphFromElements(serialized, [element]);
  assert.equal(hydrated.bodies[0].collider.kind, "circle");
  assert.equal(hydrated.bodies[0].material.restitution, 0.95);
  assert.equal(hydrated.bodies[0].initial.velocityX, 4);
});

test("object physics metadata restores a missing graph binding", () => {
  const element = {
    id: "wall",
    customData: withPhysicsCustomData({}, {
      id: "wall-body",
      systemId: "world",
      bodyType: "fixed",
      collider: { kind: "box", width: 320, height: 20 },
    }),
  };
  const hydrated = hydrateRelationshipGraphFromElements({}, [element]);
  assert.equal(hydrated.systems[0].id, "world");
  assert.deepEqual(hydrated.bodies[0].objectRef, { kind: "element", elementId: "wall" });
  assert.equal(hydrated.bodies[0].bodyType, "fixed");
  assert.equal(hydrated.bodies[0].collider.width, 320);
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

test("deleting an authored element removes its body and connected constraints", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world" }],
    bodies: [
      { id: "ball", systemId: "world", objectRef: "ball-element" },
      { id: "wall", systemId: "world", objectRef: "wall-element", bodyType: "fixed" },
    ],
    constraints: [
      { id: "ball-pin", systemId: "world", kind: "pin", a: { kind: "object", objectRef: "ball-element" }, b: { kind: "world", point: [0, 0] } },
      { id: "wall-pin", systemId: "world", kind: "pin", a: { kind: "object", objectRef: "wall-element" }, b: { kind: "world", point: [10, 0] } },
    ],
  });
  const pruned = removeRelationshipBindingsForElements(graph, ["ball-element"]);
  assert.deepEqual(pruned.bodies.map(body => body.id), ["wall"]);
  assert.deepEqual(pruned.constraints.map(constraint => constraint.id), ["wall-pin"]);
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
