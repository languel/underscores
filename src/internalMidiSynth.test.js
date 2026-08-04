import test from "node:test";
import assert from "node:assert/strict";
import { createInternalMidiSynth, createTinySynthBackend } from "./internalMidiSynth.js";

const makeHarness = () => {
  const sent = [];
  let resumes = 0;
  let closes = 0;
  let factoryCalls = 0;
  let now = 100;
  let timerId = 0;
  const timers = new Map();
  const backend = {
    send: data => sent.push([...data]),
    resume: async () => { resumes += 1; },
    getState: () => "running",
    close: async () => { closes += 1; },
  };
  const output = createInternalMidiSynth({
    programs: { 1: 0, 3: 32 },
    backendFactory: async () => { factoryCalls += 1; return backend; },
    now: () => now,
    setTimer: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimer: id => timers.delete(id),
  });
  return { output, sent, timers, setNow: value => { now = value; }, counts: () => ({ resumes, closes, factoryCalls }) };
};

test("initialization is repeat-safe and applies melodic programs", async () => {
  const harness = makeHarness();
  await Promise.all([harness.output.initialize(), harness.output.initialize()]);
  assert.equal(harness.counts().factoryCalls, 1);
  assert.ok(harness.sent.some(message => message[0] === 0xc0 && message[1] === 0));
  assert.ok(harness.sent.some(message => message[0] === 0xc2 && message[1] === 32));
  assert.equal(harness.sent.some(message => message[0] === 0xc9), false);
});

test("raw messages forward, future timestamps schedule, and realtime is ignored", async () => {
  const harness = makeHarness();
  await harness.output.initialize();
  harness.sent.length = 0;
  harness.output.send([0x90, 60, 100]);
  harness.output.send(new Uint8Array([0x82, 40, 0]), 150);
  harness.output.send([0xf8]);
  assert.deepEqual(harness.sent, [[0x90, 60, 100]]);
  assert.equal(harness.timers.size, 1);
  [...harness.timers.values()][0].callback();
  assert.deepEqual(harness.sent[1], [0x82, 40, 0]);
});

test("resume reapplies programs; clear panics and cancels schedules; dispose closes once", async () => {
  const harness = makeHarness();
  await harness.output.initialize();
  harness.sent.length = 0;
  await harness.output.resume();
  assert.equal(harness.counts().resumes, 1);
  assert.ok(harness.sent.some(message => message[0] === 0xc2 && message[1] === 32));
  harness.output.send([0x90, 64, 100], 200);
  harness.output.clear();
  assert.equal(harness.timers.size, 0);
  assert.ok(harness.sent.some(message => message[0] === 0xb0 && message[1] === 120));
  await Promise.all([harness.output.close(), harness.output.close()]);
  assert.equal(harness.counts().closes, 1);
});

test("disposing while initialization is pending tears down the late backend", async () => {
  let resolveBackend;
  let closes = 0;
  const lateBackend = {
    send() {},
    resume: async () => {},
    getState: () => "running",
    close: async () => { closes += 1; },
  };
  const output = createInternalMidiSynth({
    backendFactory: () => new Promise(resolve => { resolveBackend = resolve; }),
  });
  const initialization = output.initialize();
  const closing = output.close();
  resolveBackend(lateBackend);
  await closing;
  await assert.rejects(initialization, /disposed/);
  assert.equal(closes, 1);
});

test("resetting a TinySynth port preserves JZZ's shared AudioContext", async () => {
  let closedPort = 0;
  let closedContext = 0;
  const context = { state: "running", resume: async () => {} };
  const JZZ = {
    synth: {},
    lib: {
      getAudioContext: () => context,
      closeAudioContext: () => { closedContext += 1; },
    },
  };
  const backend = await createTinySynthBackend({
    loadModules: async () => ({
      JZZ,
      installTinySynth: target => {
        target.synth.Tiny = async () => ({
          send() {},
          close: async () => { closedPort += 1; },
        });
      },
    }),
  });

  await backend.close();

  assert.equal(closedPort, 1);
  assert.equal(closedContext, 0);
});
