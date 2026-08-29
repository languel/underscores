import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheManimFrameConfig,
  compileManimSource,
  createManimCueController,
  createManimTransportGate,
  normalizeManimFrame,
  validateManimSource,
} from "./manimFrame.js";

test("Manim frame config stays referentially stable across equivalent scene normalization", () => {
  const first = cacheManimFrameConfig(null, {
    source: "scene.add(new Circle());",
    parameters: { radius: 1.5 },
    width: 640,
    height: 360,
  });
  const repeated = cacheManimFrameConfig(first, {
    source: "scene.add(new Circle());",
    parameters: { radius: 1.5 },
    width: 640,
    height: 360,
  });
  const edited = cacheManimFrameConfig(repeated, {
    source: "scene.add(new Square());",
    parameters: { radius: 1.5 },
    width: 640,
    height: 360,
  });

  assert.equal(repeated, first);
  assert.notEqual(edited, first);
});

test("normalizeManimFrame supplies stable defaults", () => {
  const frame = normalizeManimFrame({ width: 800, height: 450, progressionMode: "cue" });
  assert.equal(frame.width, 800);
  assert.equal(frame.height, 450);
  assert.equal(frame.progressionMode, "cue");
  assert.equal(frame.transparent, true);
});

test("validateManimSource accepts top-level await", () => {
  assert.equal(validateManimSource("await scene.play(Create(new Circle()));").valid, true);
  assert.equal(validateManimSource("const = nope").valid, false);
});

test("compileManimSource injects public Manim names and bridge", async () => {
  class Circle {}
  const calls = [];
  const run = compileManimSource("calls.push([Circle.name, __.params.a]);", { Circle, calls });
  await run({ scene: {}, bridge: { params: { a: 2 } }, cue: async () => {} });
  assert.deepEqual(calls, [["Circle", 2]]);
});

test("cue controller blocks only in cue mode", async () => {
  const cues = [];
  const controller = createManimCueController({ mode: "cue", onCue: cue => cues.push(cue) });
  let resolved = false;
  const pending = controller.cue("Reveal").then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(controller.pendingCue.label, "Reveal");
  controller.next();
  await pending;
  assert.equal(resolved, true);
  assert.equal(cues.length, 1);
});

test("linked transport gate waits for play while free mode runs", async () => {
  const gate = createManimTransportGate({ mode: "linked", transport: { playing: false } });
  let resolved = false;
  const pending = gate.wait().then(value => { resolved = value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  gate.update({ playing: true, time: 1 });
  await pending;
  assert.equal(resolved, true);

  const free = createManimTransportGate({ mode: "free", transport: { playing: false } });
  assert.equal(await free.wait(), true);
});
