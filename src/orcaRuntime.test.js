import test from "node:test";
import assert from "node:assert/strict";
import { createOrcaRuntimeManager } from "./orcaRuntime.js";

test("Orca runtime shares one frame state between canvas and docked subscribers", () => {
  const runtime = createOrcaRuntimeManager();
  const snapshots = [];
  runtime.upsert({ nodeId: "orca-1", source: "C2.\n...", revision: 1, running: false });
  const unsubscribeCanvas = runtime.subscribe("orca-1", snapshot => snapshots.push(["canvas", snapshot]));
  const unsubscribeDock = runtime.subscribe("orca-1", snapshot => snapshots.push(["dock", snapshot]));
  runtime.tick("orca-1");
  assert.equal(snapshots.at(-2)[1].frame, 1);
  assert.equal(snapshots.at(-1)[1].frame, 1);
  assert.equal(snapshots.at(-1)[1].source.split("\n")[1].slice(0, 3), "0..");
  unsubscribeCanvas();
  unsubscribeDock();
});

test("Orca runtime accepts a pending grid edit without resetting it on canonical sync", () => {
  const runtime = createOrcaRuntimeManager();
  runtime.upsert({ nodeId: "orca-2", source: "...", revision: 1, running: false });
  runtime.patchSource("orca-2", "A..");
  const snapshot = runtime.upsert({ nodeId: "orca-2", source: "A..", revision: 2, running: false });
  assert.equal(snapshot.source.slice(0, 3), "A..");
  runtime.dispose();
});

test("Orca runtime wraps a configured loop in frame space", () => {
  const runtime = createOrcaRuntimeManager();
  runtime.upsert({ nodeId: "orca-loop", source: "C2.\n...", revision: 1, running: false, loopFrames: 2 });
  assert.equal(runtime.tick("orca-loop").frame, 1);
  assert.equal(runtime.tick("orca-loop").frame, 0);
  assert.equal(runtime.tick("orca-loop").frame, 1);
  runtime.dispose();
});

test("Orca runtime preserves configured grid dimensions while ticking", () => {
  const runtime = createOrcaRuntimeManager();
  const snapshot = runtime.upsert({ nodeId: "orca-size", source: "C2.\n...", revision: 1, running: false, gridWidth: 8, gridHeight: 4 });
  assert.equal(snapshot.width, 8);
  assert.equal(snapshot.height, 4);
  assert.equal(snapshot.source.split("\n").length, 4);
  assert.equal(snapshot.source.split("\n")[0].length, 8);
  const ticked = runtime.tick("orca-size");
  assert.equal(ticked.width, 8);
  assert.equal(ticked.height, 4);
  runtime.dispose();
});

test("Orca runtime preserves the unwrapped event frame for MIDI tracing", () => {
  const runtime = createOrcaRuntimeManager();
  const callbacks = [];
  runtime.upsert({
    nodeId: "orca-events",
    source: "*:01C1.",
    revision: 1,
    running: false,
    onMidiEvents: (events, metadata) => callbacks.push({ events, metadata }),
  });
  runtime.tick("orca-events");
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].events[0].type, "note");
  assert.equal(callbacks[0].metadata.frame, 0);
  runtime.dispose();
});
