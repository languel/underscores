import test from "node:test";
import assert from "node:assert/strict";
import * as core from "@strudel/core";
import { mini } from "@strudel/mini";
import { mondo } from "@strudel/mondo";
import {
  installStrudelEvalScope,
  StrudelRuntimeManager,
  strudelBpmToCps,
  strudelMarkCss,
  strudelNextBeatCycle,
  strudelSwitchAtCycle,
} from "./strudelRuntime.js";

test("Strudel transport maps Underscores BPM to four-beat cycles", () => {
  assert.equal(strudelBpmToCps(120), 0.5);
  assert.equal(strudelBpmToCps(240), 1);
  assert.equal(strudelBpmToCps(0), 0.5);
});

test("Strudel updates choose the next scheduler-safe beat boundary", () => {
  assert.equal(strudelNextBeatCycle(1.02, 0.5, 0), 1.25);
  assert.equal(strudelNextBeatCycle(1.22, 0.5, 0.16), 1.5);
  assert.equal(strudelNextBeatCycle(0, 0.5, 0), 0);
});

test("Strudel pattern swaps preserve the old query before the beat boundary", () => {
  const pattern = strudelSwitchAtCycle(core.pure("old"), core.pure("new"), 0.25);
  assert.deepEqual(pattern.queryArc(0, 0.25).map(hap => hap.value), ["old"]);
  assert.deepEqual(pattern.queryArc(0.25, 0.5).map(hap => hap.value), ["new"]);
  assert.deepEqual(pattern.queryArc(0.2, 0.3).map(hap => hap.value), ["old", "new"]);
});

test("Strudel markcss preserves raw CSS instead of parsing it as mini notation", () => {
  const css = "background:#ff8bd155;transform:scale(1.12)";
  const hap = strudelMarkCss(css, core.pure({ note: "c3" })).queryArc(0, 1)[0];
  assert.equal(hap.value.markcss, css);
  assert.equal(hap.value.note, "c3");
});

test("Strudel runtime keeps node ownership and free-run decisions separate", () => {
  const runtime = new StrudelRuntimeManager();
  runtime.entries.set("linked", { pattern: {}, transportMode: "linked", cps: null });
  runtime.entries.set("free", { pattern: {}, transportMode: "free", cps: null });
  assert.equal(runtime._shouldPlay(), true);
  runtime.entries.delete("free");
  assert.equal(runtime._shouldPlay(), false);
  runtime.dispose();
});

test("Strudel visual notifications are bounded without throttling painters", () => {
  const runtime = new StrudelRuntimeManager();
  const states = [];
  let paints = 0;
  runtime.subscribeVisuals("node-a", state => states.push(state));
  const painter = () => { paints += 1; };
  runtime._drawFrame([], 0, [painter]);
  runtime._drawFrame([], 0.005, [painter]);
  runtime._drawFrame([], 0.02, [painter]);
  assert.equal(paints, 3);
  assert.equal(states.length, 3, "initial subscription plus two bounded frame updates");
  runtime.dispose();
});

test("Strudel Linked patterns use the Underscores score phase", () => {
  const runtime = new StrudelRuntimeManager();
  runtime.transport = { playing: true, bpm: 120, time: 0.5 };
  runtime.linkedPhaseOffset = 0.25;
  runtime.entries.set("linked", {
    pattern: mini("bd sd oh hh"),
    transportMode: "linked",
    cps: null,
    pending: null,
  });
  assert.deepEqual(
    runtime._combinedPattern().queryArc(0, 0.25).map(hap => hap.value),
    ["sd"],
  );
  runtime.dispose();
});

test("Strudel excludes stopped Linked voices while Free voices keep running", () => {
  const runtime = new StrudelRuntimeManager();
  runtime.transport = { playing: false, bpm: 120, time: 0 };
  runtime.entries.set("linked", { pattern: core.pure("linked"), transportMode: "linked", cps: null });
  runtime.entries.set("free", { pattern: core.pure("free"), transportMode: "free", cps: null });
  assert.deepEqual(runtime._combinedPattern().queryArc(0, 1).map(hap => hap.value), ["free"]);
  runtime.dispose();
});

test("Strudel reanchors Linked phase on play, rewind, and tempo changes", async () => {
  const runtime = new StrudelRuntimeManager();
  const cpsValues = [];
  runtime.scheduler = {
    now: () => 1.25,
    setCps: cps => cpsValues.push(cps),
  };
  runtime.refresh = async () => {};
  await runtime.setTransport({ playing: true, bpm: 120, time: 0 });
  assert.equal(runtime.linkedPhaseOffset, -1.25);
  await runtime.setTransport({ playing: true, bpm: 180, time: 2 });
  assert.equal(runtime.linkedPhaseOffset, 0.25);
  await runtime.setTransport({ playing: true, bpm: 180, time: 0 });
  assert.equal(runtime.linkedPhaseOffset, -1.25);
  assert.deepEqual(cpsValues, [0.5, 0.75, 0.75]);
  runtime.scheduler = null;
  runtime.dispose();
});

test("Strudel stops rather than pauses its scheduler when Linked transport stops", async () => {
  const runtime = new StrudelRuntimeManager();
  let stops = 0;
  const scheduler = {
    started: true,
    setCps: () => {},
    setPattern: async () => {},
    stop: () => { stops += 1; scheduler.started = false; },
  };
  runtime.scheduler = scheduler;
  runtime.ensureScheduler = async () => scheduler;
  runtime.entries.set("linked", { pattern: core.pure("linked"), transportMode: "linked", cps: null });
  await runtime.refresh();
  assert.equal(stops, 1);
  runtime.scheduler = null;
  runtime.dispose();
});

test("Strudel linked clock CPS commands update the shared Underscores tempo", () => {
  const runtime = new StrudelRuntimeManager();
  const tempos = [];
  const scope = runtime._nodeScope(
    "linked-node",
    { strudel: { setTempo: bpm => tempos.push(bpm) } },
    "linked",
  );
  scope.setcps(0.75);
  scope.setBpm(90);
  assert.deepEqual(tempos, [180, 90]);
  assert.equal(runtime.entries.size, 0);
  runtime.dispose();
});

test("Strudel free clock CPS commands retain a node-local override", () => {
  const runtime = new StrudelRuntimeManager();
  const tempos = [];
  const tempoState = { cps: null };
  const scope = runtime._nodeScope(
    "free-node",
    { strudel: { setTempo: bpm => tempos.push(bpm) } },
    "free",
    tempoState,
  );
  scope.setCpm(30);
  assert.equal(tempoState.cps, 0.5);
  assert.deepEqual(tempos, []);
  runtime.dispose();
});

test("Strudel runtime compiles REPL-style anonymous pattern directives", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  try {
    const { pattern, meta } = await runtime._compile("node-a", "$: pure(1)", {});
    assert.equal(typeof pattern.queryArc, "function");
    assert.equal("p" in pattern, false);
    assert.deepEqual(meta, { miniLocations: [], widgets: [], frameVisualizers: 0 });
    assert.ok(pattern.queryArc(0, 1)[0].context.tags.includes("underscores:node-a"));
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    runtime.dispose();
  }
});

test("Strudel public pianoroll uses the shared node-frame painter", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  const calls = [];
  const ctx = new Proxy({
    canvas: { width: 520, height: 300 },
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
  });
  const canvas = {
    width: 520,
    height: 300,
    getContext: () => ctx,
  };
  try {
    runtime.registerFrameCanvas("node-visual", canvas);
    const { pattern, meta } = await runtime._compile(
      "node-visual",
      "pure(60).pianoroll()",
      {},
    );
    assert.equal(meta.frameVisualizers, 1);
    const painters = [];
    const haps = pattern.queryArc(0, 2, { painters });
    assert.equal(painters.length, 1);
    painters[0](null, 0.5, haps, [-2, 2]);
    assert.ok(calls.some(([method]) => method === "clearRect"));
    assert.ok(calls.some(([method]) => method === "stroke"));
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    runtime.dispose();
  }
});

test("Strudel inline pianoroll widgets use the shared painter without a native draw loop", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  const previousInlineContext = globalThis.__inlinePianorollContext;
  globalThis.pure = core.pure;
  const calls = [];
  const inlineContext = new Proxy({
    canvas: { width: 520, height: 60 },
  }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push([key, ...args]);
    },
  });
  globalThis.__inlinePianorollContext = inlineContext;
  runtime.registerFrameCanvas("node-inline-visual", {
    width: 520,
    height: 300,
    getContext: () => inlineContext,
  });
  try {
    const { pattern, meta } = await runtime._compile(
      "node-inline-visual",
      "pure(60).pianoroll({ ctx: __inlinePianorollContext })",
      {},
    );
    assert.equal(meta.frameVisualizers, 1);
    const painters = [];
    const haps = pattern.queryArc(0, 2, { painters });
    assert.equal(painters.length, 1);
    painters[0](null, 0.5, haps, [-2, 2]);
    assert.ok(calls.some(([method]) => method === "clearRect"));
    assert.ok(calls.some(([method]) => method === "stroke"));
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    if (previousInlineContext === undefined) delete globalThis.__inlinePianorollContext;
    else globalThis.__inlinePianorollContext = previousInlineContext;
    runtime.dispose();
  }
});

test("Strudel exposes __ as the same node-local bridge", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const bridge = {
    transport: { playing: true },
    streams: { get: name => ({ name }) },
  };
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  try {
    const { pattern } = await runtime._compile(
      "node-alias",
      "$: pure(__.transport.playing && __.streams.get('Holistic').name === 'Holistic' ? 1 : 0)",
      bridge,
    );
    assert.deepEqual(pattern.queryArc(0, 1).map(hap => hap.value), [1]);
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    runtime.dispose();
  }
});

test("Strudel patterns can consume shared color params through __.params", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  try {
    const { pattern } = await runtime._compile(
      "node-param-color",
      "$: pure(1).color(pure(__.params.c1))",
      { params: { c1: "red" } },
    );
    assert.deepEqual(pattern.queryArc(0, 1).map(hap => hap.value), [{ value: 1, color: "red" }]);
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    runtime.dispose();
  }
});

test("Strudel runtime stacks every anonymous $: voice in one node", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  try {
    const { pattern } = await runtime._compile(
      "node-polyphonic",
      "$: pure(1)\n$: pure(2)\n$: pure(3)",
      {},
    );
    assert.deepEqual(
      pattern.queryArc(0, 1).map(hap => hap.value),
      [1, 2, 3],
    );
  } finally {
    if (previousPure === undefined) delete globalThis.pure;
    else globalThis.pure = previousPure;
    runtime.dispose();
  }
});

test("Strudel exposes Mini and Mondo polyphony notation", async () => {
  assert.deepEqual(
    mini("[bd sd],hh*2").queryArc(0, 1).map(hap => hap.value),
    ["bd", "sd", "hh", "hh"],
  );

  await core.evalScope(core);
  assert.deepEqual(
    mondo("$ s [bd sd]\n$ s hh*2").queryArc(0, 1).map(hap => hap.value.s),
    ["bd", "sd", "hh", "hh"],
  );
});

test("Strudel installs the documented i() XEN pattern scope", async () => {
  await installStrudelEvalScope();
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const { pattern } = await runtime._compile(
    "node-xen",
    'i("0 1 2 3 4 5").tune("hexany15").mul("220").freq()',
    {},
  );
  const frequencies = pattern.queryArc(0, 1).map(hap => hap.value.freq);
  assert.equal(frequencies.length, 6);
  assert.ok(frequencies.every(value => Number.isFinite(value) && value > 0));
  assert.equal(frequencies[0], 220);
  runtime.dispose();
});

test("Strudel visual subscribers receive evaluation metadata and live frames", () => {
  const runtime = new StrudelRuntimeManager();
  const states = [];
  const unsubscribe = runtime.subscribeVisuals("node-a", state => states.push(state));
  runtime._notifyVisual("node-a", {
    miniLocations: [[8, 10]],
    widgets: [{ type: "_pianoroll", to: 24 }],
    haps: [{ value: { s: "bd" } }],
    time: 1.25,
    evaluation: 1,
  });
  assert.equal(states.length, 2);
  assert.deepEqual(states[1].miniLocations, [[8, 10]]);
  assert.equal(states[1].widgets[0].type, "_pianoroll");
  assert.equal(states[1].haps[0].value.s, "bd");
  assert.equal(states[1].time, 1.25);
  unsubscribe();
  runtime.dispose();
});

test("Strudel establishes its time source before evaluating visualizer widgets", async () => {
  const runtime = new StrudelRuntimeManager();
  const order = [];
  runtime.ensureScheduler = async () => {
    order.push("scheduler");
    return {};
  };
  runtime._compile = async () => {
    order.push("compile");
    return { pattern: core.silence, meta: { miniLocations: [], widgets: [] } };
  };
  runtime.refresh = async () => { order.push("refresh"); };
  await runtime.upsert({ nodeId: "node-a", source: "silence", transportMode: "free" });
  assert.deepEqual(order, ["scheduler", "compile", "refresh"]);
  runtime.dispose();
});

test("Strudel upsert clears a previous tempo override when source declares none", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScheduler = async () => ({ started: false, now: () => 0 });
  runtime.refresh = async () => {};
  runtime._compile = async (_nodeId, source) => ({
    pattern: core.silence,
    meta: { miniLocations: [], widgets: [] },
    cps: source === "with tempo" ? 0.75 : null,
  });
  await runtime.upsert({ nodeId: "node-a", source: "with tempo", transportMode: "free" });
  assert.equal(runtime.entries.get("node-a").cps, 0.75);
  await runtime.upsert({ nodeId: "node-a", source: "without tempo", transportMode: "free" });
  assert.equal(runtime.entries.get("node-a").cps, null);
  runtime.dispose();
});
