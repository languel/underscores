import test from "node:test";
import assert from "node:assert/strict";
import { BrushChannelRuntime, mapBrushPoint, normalizeBrushChannel } from "./brushChannelRuntime.js";
import { DraweratorStreamRegistry } from "./streamRuntime.js";

test("brush mapping supports target-local rotated coordinate spaces", () => {
  const channel = normalizeBrushChannel({ range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } }, destination: { kind: "target" } });
  const point = mapBrushPoint({ x: 0, y: 0 }, channel, { x: 10, y: 20, width: 100, height: 50, angle: Math.PI / 2 });
  assert.ok(Math.abs(point.x - 85) < 0.001);
  assert.ok(Math.abs(point.y - -5) < 0.001);
});

test("parallel brush channels own independent source-agnostic sessions", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 1 });
  ["a", "b", "gate"].forEach(id => registry.register({ id, kind: id === "gate" ? "value" : "space", roles: ["output"] }));
  const started = [];
  const finished = [];
  const runtime = new BrushChannelRuntime({
    registry,
    channels: [
      { id: "first", spatialStreamId: "a", gateStreamId: "gate", range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } }, destination: { kind: "viewport" } },
      { id: "second", spatialStreamId: "b", gateStreamId: "gate", range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } }, destination: { kind: "viewport" } },
    ],
    resolveDestination: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    onStart: session => started.push(session.id),
    onEnd: (session, reason) => finished.push([session.id, reason]),
  });
  registry.publish("gate", { kind: "value", value: 1 }, { internal: true });
  registry.publish("a", { kind: "space", x: 0.2, y: 0.2 }, { internal: true });
  registry.publish("b", { kind: "space", x: 0.3, y: 0.3 }, { internal: true });
  assert.equal(started.length, 2);
  registry.publish("gate", { kind: "value", value: 0 }, { internal: true });
  assert.equal(finished.length, 2);
  runtime.dispose();
});
