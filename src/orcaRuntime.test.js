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
