import test from "node:test";
import assert from "node:assert/strict";
import { createPhysicsExample, createWayangMobileExample } from "./physicsExamples.js";
import { getP5Example } from "./p5Frame.js";

const example = () => createWayangMobileExample({ x: 0, y: 0, idPrefix: "w" });
const centre = spec => ({ x: spec.x + spec.width / 2, y: spec.y + spec.height / 2 });
const rotatedExtent = spec => {
  // Arms are authored rotated about their centre, so an axis-aligned box on
  // the raw x/y/width/height would describe the wrong footprint.
  const half = Math.abs(Math.cos(spec.angle || 0)) * spec.width / 2 + Math.abs(Math.sin(spec.angle || 0)) * spec.height / 2;
  const halfY = Math.abs(Math.sin(spec.angle || 0)) * spec.width / 2 + Math.abs(Math.cos(spec.angle || 0)) * spec.height / 2;
  const middle = centre(spec);
  return { left: middle.x - half, right: middle.x + half, top: middle.y - halfY, bottom: middle.y + halfY };
};

test("the wayang example is reachable through the physics example dispatcher", () => {
  for (const kind of ["wayang", "wayang-mobile", "mobile"]) {
    assert.equal(createPhysicsExample(kind, { idPrefix: "w" }).name, "Wayang and mobile", kind);
  }
});

test("the rig is fully named so Outliner and scripts can address it", () => {
  const ex = example();
  assert.equal(ex.elements.length, 17);
  assert.equal(ex.graph.bodies.length, 17);
  for (const element of ex.elements) {
    // Outliner and Properties read `underscoresLabel`; the script canvas API
    // reads `label`. Both are required or the controller cannot find the rig.
    assert.ok(element.customData.label, element.id);
    assert.equal(element.customData.underscoresLabel, element.customData.label, element.id);
    assert.notEqual(element.customData.label, "Wayang part", `${element.id} has no authored name`);
  }
  const names = ex.elements.map(element => element.customData.label);
  for (const required of ["Puppet body", "Left hand", "Right hand", "Red chime", "Mobile top bar"]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
});

test("the puppet has two-segment arms hinged at shoulder and elbow", () => {
  const ex = example();
  const kinds = ex.graph.constraints.map(item => `${item.kind}:${item.name}`);
  assert.ok(kinds.includes("revolute:Body rod"));
  assert.ok(kinds.includes("weld:Neck"));
  for (const joint of ["Left shoulder", "Left elbow", "Right shoulder", "Right elbow"]) {
    assert.ok(kinds.includes(`revolute:${joint}`), `missing ${joint}`);
  }
  // One segment can only sweep an arc; two can place a hand on a point.
  const arms = ex.elements.filter(element => /upper|fore/.test(element.id));
  assert.equal(arms.length, 4);
  for (const arm of arms) assert.equal(Math.abs(Math.abs(arm.angle) - Math.PI / 2) < 1e-9, true, `${arm.id} is not authored hanging`);
});

test("every mobile wire is a body hinged at both ends", () => {
  const ex = example();
  const wires = ex.elements.filter(element => element.id.includes("-wire-"));
  assert.equal(wires.length, 5);
  for (const wire of wires) {
    // A bar hung from one link is free to spin about that single point.
    assert.ok(ex.graph.constraints.some(item => item.id === `${wire.id}-top` && item.kind === "revolute"), `${wire.id} top`);
    assert.ok(ex.graph.constraints.some(item => item.id === `${wire.id}-bottom` && item.kind === "revolute"), `${wire.id} bottom`);
    assert.equal(wire.width, 3, "wires stay thin enough to read as wire");
  }
  assert.ok(ex.graph.constraints.some(item => item.name === "Mobile hook" && item.kind === "revolute"));
});

test("the mobile hook sits at the centre of mass of what the bar carries", () => {
  const ex = example();
  const hook = ex.graph.constraints.find(item => item.name === "Mobile hook");
  const topBar = ex.elements.find(element => element.id === "w-top-bar");
  const u = (hook.a.point[0] - topBar.x) / topBar.width;
  // Derived, not hand-tuned: a bar pivoted away from its load's centre of mass
  // tips over instead of balancing.
  assert.ok(u > 0.2 && u < 0.8, `hook at u=${u} is off the bar's useful span`);
  assert.ok(Math.abs(u - 0.5) > 0.01, "a real mobile does not balance at its bar's midpoint");
});

test("exactly one chime is inside the arm's reach", () => {
  const ex = example();
  const { shoulder, radius } = ex.reach;
  const reachable = ex.elements
    .filter(element => element.id.includes("-disc-"))
    .filter(element => {
      const middle = centre(element);
      const surface = Math.hypot(middle.x - shoulder.x, middle.y - shoulder.y) - Math.min(element.width, element.height) / 2;
      return surface <= radius;
    });
  // The near chime is playable by hand; the rest ring because the mobile
  // swings into itself, which is what the chime-to-chime mapping is for.
  assert.deepEqual(reachable.map(element => element.customData.label), ["Red chime"]);
});

test("nothing is interpenetrating at step zero", () => {
  const ex = example();
  const puppet = ex.elements.filter(element => /head|torso|upper|fore/.test(element.id)).map(rotatedExtent);
  const mobile = ex.elements.filter(element => /bar|wire|disc/.test(element.id)).map(rotatedExtent);
  for (const a of puppet) {
    for (const b of mobile) {
      const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.equal(overlaps, false, "the authored rest pose must not start inside the mobile");
    }
  }
});

test("puppet and mobile collide with each other but the puppet does not collide with itself", () => {
  const ex = example();
  const bodyFor = id => ex.graph.bodies.find(body => body.objectRef.elementId === id);
  const hand = bodyFor("w-fore-right");
  const chime = bodyFor("w-disc-red");
  const head = bodyFor("w-head");
  const collides = (a, b) => Boolean(a.collisionGroup & b.collisionMask) && Boolean(b.collisionGroup & a.collisionMask);
  assert.equal(collides(hand, chime), true, "a hand must be able to strike a chime");
  assert.equal(collides(chime, bodyFor("w-disc-blue")), true, "chimes clink together");
  assert.equal(collides(hand, head), false, "puppet parts pass through each other");
  // Named layers are not used: example graphs are merged without `world`.
  for (const body of ex.graph.bodies) assert.equal(body.collisionLayers, null);
});

test("collision mappings target the tagged pairs the rig actually produces", () => {
  const ex = example();
  assert.equal(ex.graph.mappings.length, 2);
  const [strike, chime] = ex.graph.mappings;
  assert.deepEqual(strike.source.tagsA, ["wayang-hand"]);
  assert.deepEqual(strike.source.tagsB, ["mobile-chime"]);
  assert.deepEqual(chime.source.tagsA, ["mobile-chime"]);
  assert.deepEqual(chime.source.tagsB, ["mobile-chime"]);
  const tags = new Set(ex.graph.bodies.flatMap(body => body.collisionTags));
  for (const mapping of ex.graph.mappings) {
    for (const tag of [...mapping.source.tagsA, ...mapping.source.tagsB]) {
      assert.ok(tags.has(tag), `no body carries ${tag}`);
    }
    assert.equal(mapping.target.kind, "expressive-voice");
    assert.equal(mapping.target.program, "fm");
    assert.equal(mapping.perPair, true, "a resting contact must not retrigger");
    assert.ok(mapping.cooldownMs > 0);
  }
});

test("every part damps, so the rig settles instead of swinging forever", () => {
  for (const body of example().graph.bodies) {
    assert.ok(body.material.linearDamping > 0, body.name);
    assert.ok(body.material.angularDamping > 0, body.name);
  }
});

test("the rod controller drives the rig through the public API", () => {
  const controller = getP5Example("wayang-rod-controller");
  assert.ok(controller, "controller example is registered");
  assert.equal(controller.mode, "instance");
  new Function("p", "__", controller.source);
  // It must move the arms with forces, not by setting positions, or the joints
  // stop meaning anything.
  assert.match(controller.source, /__\.api\.physics\.impulse\(/);
  assert.doesNotMatch(controller.source, /\.set(Position|Pose)\(/);
  // Both control schemes, and the names the example authors.
  assert.match(controller.source, /pose\.left_wrist/);
  assert.match(controller.source, /pose\.right_wrist/);
  assert.match(controller.source, /p\.mouseX/);
  assert.match(controller.source, /Wayang and mobile/);
  assert.match(controller.source, /Puppet hand/);
  assert.match(controller.source, /Puppet body/);
});
