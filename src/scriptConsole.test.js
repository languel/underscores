import test from "node:test";
import assert from "node:assert/strict";
import { DraweratorEventBus } from "./commandSystem.js";
import {
  createScriptConsole,
  serializeScriptConsoleArgs,
  serializeScriptConsoleValue,
} from "./scriptConsole.js";

test("serializes script console values without throwing on complex input", () => {
  const circular = { name: "node" };
  circular.self = circular;
  assert.deepEqual(serializeScriptConsoleValue(circular), { name: "node", self: "[Circular]" });
  assert.deepEqual(serializeScriptConsoleArgs([1, Infinity, 2n, () => {}]), [1, "Infinity", "2n", "[Function anonymous]"]);
});

test("routes node-local console methods through the script event bus", () => {
  const eventBus = new DraweratorEventBus({ now: () => 42 });
  const events = [];
  eventBus.subscribe("script.log", event => events.push(event));
  const runtimeRef = { current: { emitScriptLog: (elementId, level, args) => eventBus.emit("script.log", { elementId, level, args }, { source: "livecode" }) } };
  const scriptConsole = createScriptConsole(runtimeRef, "node-1");
  scriptConsole.log("hello", { value: 3 });
  scriptConsole.warn("careful");
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].detail, { elementId: "node-1", level: "log", args: ["hello", { value: 3 }] });
  assert.equal(events[1].detail.level, "warn");
});
