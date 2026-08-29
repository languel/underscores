import test from "node:test";
import assert from "node:assert/strict";
import { createReichPendulumExample } from "./physicsExamples.js";

test("Reich pendulum demo creates native geometry and stable physics relationships", () => {
  const demo = createReichPendulumExample({ x: 10, y: 20, width: 760, height: 520, count: 4, idPrefix: "test-reich" });
  assert.equal(demo.id, "reich-pendulum");
  assert.equal(demo.voiceCount, 4);
  assert.equal(demo.pendulums.length, 4);
  assert.equal(demo.graph.systems.length, 1);
  assert.equal(demo.graph.bodies.length, 12);
  assert.equal(demo.graph.constraints.length, 8);
  assert.equal(demo.graph.mappings.length, 8);
  assert.equal(demo.elements.length, 17);
  assert.equal(new Set(demo.elements.map(element => element.id)).size, demo.elements.length);
});

test("Reich pendulum demo maps both collision orientations into expressive voices", () => {
  const demo = createReichPendulumExample({ count: 2, idPrefix: "test-mapping" });
  const [forward, reverse] = demo.graph.mappings.slice(0, 2);
  assert.deepEqual(forward.source.tagsA, ["pendulum-1-bob"]);
  assert.deepEqual(forward.source.tagsB, ["speaker-1"]);
  assert.deepEqual(reverse.source.tagsA, ["speaker-1"]);
  assert.deepEqual(reverse.source.tagsB, ["pendulum-1-bob"]);
  assert.equal(forward.target.kind, "expressive-voice");
  assert.match(forward.target.pressureExpression, /aSpeed/);
  assert.match(reverse.target.brightnessExpression, /bAngularVelocity/);
});

test("Reich pendulum rods visibly span their fixed pivots and bobs", () => {
  const demo = createReichPendulumExample({ count: 1, idPrefix: "test-geometry" });
  const pendulum = demo.pendulums[0];
  const rod = demo.elements.find(element => element.id === pendulum.rodId);
  const bob = demo.elements.find(element => element.id === pendulum.bobId);
  const pivot = demo.elements.find(element => element.id === pendulum.pivotId);
  const rodBody = demo.graph.bodies.find(body => body.objectRef?.elementId === rod.id);
  const axle = demo.graph.constraints.find(constraint => constraint.id.includes("axle"));
  const mount = demo.graph.constraints.find(constraint => constraint.id.includes("bob-weld"));
  const center = [rod.x + rod.width / 2, rod.y + rod.height / 2];
  const direction = [Math.cos(rod.angle), Math.sin(rod.angle)];
  const start = [center[0] - direction[0] * rod.width / 2, center[1] - direction[1] * rod.width / 2];
  const end = [center[0] + direction[0] * rod.width / 2, center[1] + direction[1] * rod.width / 2];
  const near = (left, right) => Math.hypot(left[0] - right[0], left[1] - right[1]) < 0.01;

  assert.equal(near(start, [pivot.x + pivot.width / 2, pivot.y + pivot.height / 2]), true);
  assert.equal(near(end, [bob.x + bob.width / 2, bob.y + bob.height / 2]), true);
  assert.equal(rodBody.initial.angle, Math.PI / 2 - pendulum.angle);
  assert.deepEqual(axle.b.localPoint, [0, 0.5]);
  assert.deepEqual(mount.a.localPoint, [1, 0.5]);
});

test("Reich pendulum demo clamps author-facing count and duration", () => {
  const demo = createReichPendulumExample({ count: 99, duration: -2, idPrefix: "test-clamp" });
  assert.equal(demo.voiceCount, 8);
  assert.equal(demo.duration, 1);
  assert.equal(demo.graph.systems[0].name, "Pendulum music");
});
