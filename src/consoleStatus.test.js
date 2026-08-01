import test from "node:test";
import assert from "node:assert/strict";
import { buildConsoleLiveStatus, changedConsoleStatusRows } from "./consoleStatus.js";

test("console live status exposes brush runtime state independently from retained logs", () => {
  const rows = buildConsoleLiveStatus({
    channels: [{ id: "pinch", name: "Right pinch pen", enabled: true }],
    channelStatus: { pinch: { source: { available: true }, gate: { open: false }, point: { x: 23, y: 41 }, pressure: { value: 0.8 } } },
  });
  assert.deepEqual(rows[0], {
    id: "brush:pinch", category: "brush", label: "Right pinch pen", state: "closed", tone: "neutral",
    detail: "source live · gate closed · xy 23.00, 41.00 · pressure 0.80", logSignature: "true:true:false",
  });
});

test("console status logs transitions but not high-rate coordinate changes", () => {
  const rows = buildConsoleLiveStatus({ channels: [{ id: "pen", name: "Pen", enabled: true }], channelStatus: { pen: { source: { available: true }, gate: { open: true }, point: { x: 1, y: 2 } } } });
  const previous = new Map([[rows[0].id, rows[0].logSignature]]);
  assert.deepEqual(changedConsoleStatusRows(previous, rows), []);
  const changed = buildConsoleLiveStatus({ channels: [{ id: "pen", name: "Pen", enabled: true }], channelStatus: { pen: { source: { available: true }, gate: { open: false } } } });
  assert.equal(changedConsoleStatusRows(previous, changed)[0].state, "closed");
});
