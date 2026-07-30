import test from "node:test";
import assert from "node:assert/strict";
import * as core from "@strudel/core";
import { mini } from "@strudel/mini";
import { mondo } from "@strudel/mondo";
import {
  StrudelRuntimeManager,
  strudelBpmToCps,
  strudelMarkCss,
  strudelNextBeatCycle,
  strudelSwitchAtCycle,
} from "./strudelRuntime.js";

test("Strudel transport maps Drawerator BPM to four-beat cycles", () => {
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

test("Strudel runtime compiles REPL-style anonymous pattern directives", async () => {
  const runtime = new StrudelRuntimeManager();
  runtime.ensureScope = async () => {};
  const previousPure = globalThis.pure;
  globalThis.pure = core.pure;
  try {
    const { pattern, meta } = await runtime._compile("node-a", "$: pure(1)", {});
    assert.equal(typeof pattern.queryArc, "function");
    assert.equal("p" in pattern, false);
    assert.deepEqual(meta, { miniLocations: [], widgets: [] });
    assert.ok(pattern.queryArc(0, 1)[0].context.tags.includes("drawerator:node-a"));
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
