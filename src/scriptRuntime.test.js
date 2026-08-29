import assert from "node:assert/strict";
import test from "node:test";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { createDefaultIannixData } from "./iannixEngine.js";

const curve = {
  id: "curve-1",
  type: "line",
  x: 10,
  y: 20,
  width: 180,
  height: 0,
  angle: 0,
  points: [[0, 0], [180, 0]],
  isDeleted: false,
  customData: {
    iannix: createDefaultIannixData({
      role: "curve",
      label: "Main curve",
      time: { start: 1, duration: 4 },
    }),
    iannixImport: { group: "orbits" },
  },
};

const trigger = {
  id: "trigger-1",
  type: "line",
  x: 30,
  y: 40,
  width: 20,
  height: 0,
  angle: 0,
  points: [[0, 0], [20, 0]],
  isDeleted: false,
  customData: {
    iannix: createDefaultIannixData({ role: "trigger", label: "Pulse" }),
    iannixImport: { group: "pulses" },
  },
};

test("script canvas resolves canvas objects by id, label, and IanniX group", () => {
  const events = [{ name: "trigger.enter", elementId: "trigger-1" }];
  const runtimeRef = {
    current: {
      getElements: () => [curve, trigger],
      getSelectedIds: () => ["curve-1"],
      getTime: () => 3,
      getTimeContext: () => ({ tempo: 120, signature: { beats: 4, beatUnit: 4 }, fps: 30, sampleRate: 48000 }),
      getGrid: () => null,
      eventBus: {
        recent: () => events,
        subscribe: () => () => {},
      },
    },
  };
  const canvas = createScriptCanvasApi(runtimeRef);
  assert.equal(canvas.get("curve-1").label, "Main curve");
  assert.equal(canvas.get("Main curve").id, "curve-1");
  assert.equal(canvas.get("orbits").id, "curve-1");
  assert.equal(canvas.get("pulses").id, "trigger-1");
  assert.deepEqual(canvas.selected().map(object => object.id), ["curve-1"]);
  assert.equal(canvas.get("Main curve").time.progress, 0.5);
  assert.equal(canvas.events.latest("trigger.*").elementId, "trigger-1");
});

test("script canvas can emit namespaced runtime events", () => {
  const emitted = [];
  const runtimeRef = {
    current: {
      getElements: () => [],
      eventBus: {
        emit: (...args) => emitted.push(args),
      },
    },
  };
  const canvas = createScriptCanvasApi(runtimeRef);
  canvas.events.emit("manim.cue.next", { elementId: "manim-1" });
  assert.deepEqual(emitted, [["manim.cue.next", { elementId: "manim-1" }, { source: "livecode" }]]);
});

test("object parameters remain live views of the assigned canvas object", () => {
  let time = 1;
  const runtimeRef = {
    current: {
      getElements: () => [curve],
      getTime: () => time,
      getTimeContext: () => ({ tempo: 120, signature: { beats: 4, beatUnit: 4 }, fps: 30, sampleRate: 48000 }),
      getGrid: () => null,
    },
  };
  const canvas = createScriptCanvasApi(runtimeRef);
  const params = resolveScriptParameterValues([{
    name: "driver",
    type: "object",
    value: "Main curve",
    default: "",
  }], runtimeRef, canvas);
  assert.equal(params.driver.id, "curve-1");
  assert.equal(params.driver.time.progress, 0);
  time = 5;
  assert.equal(params.driver.time.progress, 1);
});

test("object parameters accept canonical __ canvas paths", () => {
  const runtimeRef = {
    current: {
      getElements: () => [curve],
      getTime: () => 0,
      getTimeContext: () => ({}),
      getGrid: () => null,
    },
  };
  const canvas = createScriptCanvasApi(runtimeRef);
  const params = resolveScriptParameterValues([{
    name: "driver",
    type: "object",
    value: '__.canvas.get("curve-1")',
    default: "",
  }], runtimeRef, canvas);
  assert.equal(params.driver.id, "curve-1");
});

test("resolves typed parameters without numeric coercion", () => {
  const params = resolveScriptParameterValues([
    { name: "title", type: "string", default: "Hello", value: "World" },
    { name: "tint", type: "color", default: "#000000", value: "#ff3366" },
    { name: "enabled", type: "boolean", default: true, value: false },
    { name: "options", type: "json", default: {}, value: { mode: "soft" } },
  ], { current: {} });
  assert.deepEqual(params, {
    title: "World",
    tint: "#ff3366",
    enabled: false,
    options: { mode: "soft" },
  });
});

test("resolves color parameters against the live appearance", () => {
  const runtimeRef = {
    current: {
      getAppearance: () => ({
        currentColor: "#f0f0f0",
        colors: { accent: { color: "#ff3366", css: "rgba(255, 51, 102, 1)" } },
      }),
    },
  };
  const params = resolveScriptParameterValues([{
    name: "tint",
    type: "color",
    default: "__.currentColor",
    value: "__.colors.accent.css",
  }], runtimeRef);
  assert.deepEqual(params, { tint: "rgba(255, 51, 102, 1)" });
});

test("keeps color parameter references live after the Excalidraw palette changes", () => {
  let currentColor = "#fab005";
  const runtimeRef = {
    current: {
      getAppearance: () => ({ currentColor, colors: {} }),
    },
  };
  const params = resolveScriptParameterValues([{
    name: "tint",
    type: "color",
    default: "__.currentColor",
    value: "__.currentColor",
  }], runtimeRef);
  assert.equal(params.tint, "#fab005");
  currentColor = "#e8590c";
  assert.equal(params.tint, "#e8590c");
});
