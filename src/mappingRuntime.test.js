import test from "node:test";
import assert from "node:assert/strict";
import { compileMappingExpression, evaluateMappingExpression } from "./mappingExpression.js";
import { mappingTargetValue, PhysicsMappingRuntime } from "./mappingRuntime.js";
import { normalizeRelationshipGraph, remapRelationshipGraph, removeRelationshipItem, serializeRelationshipGraphForScene } from "./relationshipGraph.js";

const hit = (overrides = {}) => ({
  systemId: "world",
  step: 1,
  phase: "hit",
  collisionClass: "body-wall",
  impulse: 5,
  relativeSpeed: 3,
  point: [120, 240],
  normal: [0, -1],
  a: { id: "ball", tags: ["ball"], position: [10, 20], velocity: [30, 40] },
  b: { id: "wall", tags: ["wall"], position: [100, 200], velocity: [0, 0] },
  world: { gravityX: 0, gravityY: -900, step: 1, time: 0.1, timeScale: 1, simSpeed: 1, pixelsPerMeter: 100 },
  ...overrides,
});

test("mapping expressions evaluate only the documented arithmetic language", () => {
  const expression = compileMappingExpression("if(impulse > 2 && speed >= 3, clamp(norm * 127, 0, 127), 0)");
  assert.equal(expression.error, null);
  assert.equal(expression.evaluate({ impulse: 5, speed: 3, norm: 0.5 }), 63.5);
  assert.match(compileMappingExpression("window.alert(1)").error, /Unexpected token|Unknown/);
  assert.match(evaluateMappingExpression("raw = 2", { raw: 1 }).error, /Unexpected token/);
});

test("musical scale helpers quantize a safe pitch expression", () => {
  const expression = compileMappingExpression("major(baseNote, floor(speed / 12))");
  assert.equal(expression.error, null);
  assert.equal(expression.evaluate({ baseNote: 60, speed: 84 }), 72);
  assert.equal(evaluateMappingExpression("scale(60, 6, 0, 2, 4, 7, 9)", {}).value, 74);
  assert.equal(evaluateMappingExpression("pentatonic(60, floor(900 / 150))", {}).value, 74);
});

test("mapping target handoff uses evaluated target formulas before static fallbacks", () => {
  assert.equal(mappingTargetValue({ targetValues: { note: 74 } }, "note", 60), 74);
  assert.equal(mappingTargetValue({ targetValues: { velocity: 0 } }, "velocity", 96), 0);
  assert.equal(mappingTargetValue({}, "note", 60), 60);
});

test("legacy routes migrate to canonical mappings and are not serialized", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world" }],
    routes: [{ id: "old", systemId: "world", filter: { phases: ["hit"], classes: ["body-wall"], minImpulse: 2 }, actions: [{ kind: "event", name: "old.hit" }] }],
  });
  assert.equal(graph.mappings.length, 1);
  assert.equal(graph.mappings[0].target.kind, "legacy-action");
  assert.equal(graph.mappings[0].filter.expression, "impulse >= 2");
  assert.equal(Object.hasOwn(serializeRelationshipGraphForScene(graph), "routes"), false);
});

test("legacy route migrations still dispatch through the compatibility target", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    routes: [{ id: "old", systemId: "world", filter: { phases: ["hit"], classes: ["body-wall"] }, actions: [{ kind: "event", name: "old.hit" }] }],
  });
  const output = [];
  runtime.route(hit(), descriptor => output.push(descriptor));
  assert.equal(output.length, 1);
  assert.equal(output[0].target.kind, "legacy-action");
  assert.equal(output[0].target.action.name, "old.hit");
});

test("invalid mapping formulas are safe, silent, and report at a bounded rate", () => {
  let now = 0;
  const errors = [];
  const runtime = new PhysicsMappingRuntime({ now: () => now, onError: error => errors.push(error) });
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "invalid", source: { systemId: "world" },
      transform: { expression: "window.alert(1)" },
      target: { kind: "midi-note" },
    }],
  });
  const output = [];
  runtime.route(hit(), descriptor => output.push(descriptor));
  now = 20;
  runtime.route(hit({ step: 2 }), descriptor => output.push(descriptor));
  assert.equal(output.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Unexpected token|Unknown/);
});

test("mappings filter, transform, and enforce per-pair cooldowns", () => {
  let now = 0;
  const runtime = new PhysicsMappingRuntime({ now: () => now });
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "velocity", source: { systemId: "world", phases: ["hit"], classes: ["body-wall"], field: "impulse", range: { min: 0, max: 10 } },
      filter: { min: 2, expression: "speed >= 2" },
      transform: { outputMin: 1, outputMax: 127, scale: 1, offset: 0, clamp: true, expression: "round(value)" },
      target: { kind: "midi-note", note: 42, velocityExpression: "value" }, cooldownMs: 100, perPair: true,
    }],
  });
  const output = [];
  runtime.route(hit(), descriptor => output.push(descriptor));
  assert.equal(output.length, 1);
  assert.equal(output[0].operation, "hit");
  assert.equal(output[0].values.targetValues.note, 42);
  assert.equal(output[0].values.targetValues.velocity, 64);
  now = 20;
  runtime.route(hit({ step: 2 }), descriptor => output.push(descriptor));
  assert.equal(output.length, 1);
  now = 120;
  runtime.route(hit({ step: 3 }), descriptor => output.push(descriptor));
  assert.equal(output.length, 2);
});

test("MIDI pitch formulas receive both bodies and world collision fields", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "pitch", source: { systemId: "world", phases: ["hit"], classes: ["body-wall"], range: { min: 0, max: 10 } },
      target: {
        kind: "midi-note", note: 60,
        noteExpression: "scale(baseNote, floor(aSpeed / 10) + floor(bY / 100) + floor(gravityY / 1000), 0, 2, 4, 7, 9)",
        velocityExpression: "value",
      },
    }],
  });
  const output = [];
  runtime.route(hit(), descriptor => output.push(descriptor));
  assert.equal(output.length, 1);
  assert.equal(output[0].values.targetValues.note, 74);
});

test("MIDI pitch formulas receive authored values from both collision objects", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "object-notes", source: { systemId: "world", phases: ["hit"], classes: ["body-wall"], range: { min: 0, max: 10 } },
      target: { kind: "midi-note", note: 48, noteExpression: "pentatonic((noteA + noteB) / 2, 2)", velocityExpression: "value" },
    }],
  });
  const output = [];
  runtime.route(hit({
    a: { id: "triangle", tags: ["body"], position: [0, 0], velocity: [0, 0], mappingValues: { note: 60 } },
    b: { id: "spiral", tags: ["body"], position: [0, 0], velocity: [0, 0], mappingValues: { note: 72 } },
  }), descriptor => output.push(descriptor));
  assert.equal(output[0].values.environment.aNote, 60);
  assert.equal(output[0].values.environment.noteA, 60);
  assert.equal(output[0].values.environment.bNote, 72);
  assert.equal(output[0].values.environment.noteB, 72);
  assert.equal(output[0].values.targetValues.note, 70);
});

test("MIDI pitch formulas fall back to the pair midpoint when Rapier has no contact point", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "pitch-midpoint", source: { systemId: "world", phases: ["hit"], classes: ["body-wall"], range: { min: 0, max: 10 } },
      target: {
        kind: "midi-note", note: 60,
        noteExpression: "pentatonic(baseNote, floor(x / 150))",
        velocityExpression: "value",
      },
    }],
  });
  const output = [];
  runtime.route(hit({ point: null, a: { id: "ball", tags: ["ball"], position: [900, 0] }, b: { id: "wall", tags: ["wall"], position: [900, 0] } }), descriptor => output.push(descriptor));
  assert.equal(output[0].values.targetValues.note, 74);
});

test("pair-gate mappings always release matching begin contacts", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [{
      id: "gate", source: { systemId: "world", phases: ["begin"], classes: ["body-wall"], field: "impulse", range: { min: 0, max: 5 } },
      filter: { min: 1 }, target: { kind: "midi-note", mode: "gate", note: 64, velocityExpression: "value", minimumHold: 0.01 },
    }],
  });
  const output = [];
  runtime.route(hit({ phase: "begin", impulse: 2 }), descriptor => output.push(descriptor));
  runtime.route(hit({ phase: "end", impulse: 0, relativeSpeed: 0, step: 2 }), descriptor => output.push(descriptor));
  assert.deepEqual(output.map(item => item.operation), ["begin", "release"]);
  assert.equal(output[0].gateKey, output[1].gateKey);
});

test("mapping removal releases active gates", () => {
  const runtime = new PhysicsMappingRuntime();
  const dispatched = [];
  runtime.setGraph({ systems: [{ id: "world" }], mappings: [{ id: "gate", source: { systemId: "world", phases: ["begin"], range: { min: 0, max: 1 } }, target: { kind: "expressive-voice", mode: "gate" } }] });
  runtime.route(hit({ phase: "begin", impulse: 1 }), item => dispatched.push(item));
  runtime.setGraph({ systems: [{ id: "world" }], mappings: [] }, item => dispatched.push(item));
  assert.deepEqual(dispatched.map(item => item.operation), ["begin", "release"]);
});

test("controller and value targets retain their MIDI semantic ranges", () => {
  const runtime = new PhysicsMappingRuntime();
  runtime.setGraph({
    systems: [{ id: "world" }],
    mappings: [
      { id: "cc", source: { systemId: "world", range: { min: 0, max: 10 } }, transform: { outputMin: 0, outputMax: 127 }, target: { kind: "midi-cc", channel: 2, controller: 74, valueExpression: "round(value)" } },
      { id: "bend", source: { systemId: "world", range: { min: 0, max: 10 } }, transform: { outputMin: 0, outputMax: 16383, clamp: true }, target: { kind: "midi-bend", channel: 3, valueExpression: "round(value)" } },
    ],
  });
  const output = [];
  runtime.route(hit({ impulse: 5 }), item => output.push(item));
  assert.deepEqual(output.map(item => [item.target.kind, item.values.targetValues.value]), [
    ["midi-cc", 64],
    ["midi-bend", 8192],
  ]);
});

test("removing a source system removes its mappings before serialization", () => {
  const graph = normalizeRelationshipGraph({
    systems: [{ id: "world" }],
    mappings: [{ id: "collision", source: { systemId: "world" }, target: { kind: "midi-note" } }],
  });
  const removed = removeRelationshipItem(graph, "systems", "world");
  assert.equal(removed.mappings.length, 0);
  assert.equal(serializeRelationshipGraphForScene(removed).mappings.length, 0);
});

test("selection relationship remapping preserves mappings alongside remapped body refs", () => {
  const remapped = remapRelationshipGraph({
    systems: [{ id: "world" }],
    bodies: [{ id: "ball", systemId: "world", objectRef: { kind: "element", elementId: "old-ball" } }],
    mappings: [{ id: "collision", source: { systemId: "world" }, target: { kind: "midi-note" } }],
  }, new Map([["old-ball", "pasted-ball"]]), new Set());
  assert.equal(remapped.bodies[0].objectRef.elementId, "pasted-ball");
  assert.equal(remapped.mappings[0].source.systemId, "world");
});
