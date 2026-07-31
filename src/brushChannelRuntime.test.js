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

test("normalized spatial streams map across the visible scene while scene streams pass through", () => {
  const channel = normalizeBrushChannel({ destination: { kind: "scene" }, range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } } });
  const viewport = { x: 100, y: 200, width: 800, height: 600 };
  assert.deepEqual(mapBrushPoint({ x: 0.25, y: 0.5 }, channel, viewport, "normalized"), { x: 300, y: 500 });
  assert.deepEqual(mapBrushPoint({ x: 300, y: 500 }, channel, viewport, "scene"), { x: 300, y: 500 });
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

test("channel status reports the same mapped point and held gate used by a session", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 1 });
  registry.register({ id: "hand", kind: "space", roles: ["output"] });
  registry.register({ id: "pinch", kind: "value", roles: ["output"] });
  const statuses = [];
  const runtime = new BrushChannelRuntime({
    registry,
    channels: [{ id: "pen", spatialStreamId: "hand", gateStreamId: "pinch", destination: { kind: "scene" }, range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } } }],
    resolveDestination: () => ({ x: 10, y: 20, width: 100, height: 50 }),
    onStatus: status => statuses.push(status),
  });
  registry.publish("pinch", { kind: "value", value: true }, { internal: true });
  registry.publish("hand", { kind: "space", x: 0.2, y: 0.4, space: "normalized" }, { internal: true });
  const status = statuses.at(-1);
  assert.equal(status.gate.open, true);
  assert.deepEqual(status.point, { x: 30, y: 40 });
  runtime.dispose();
});

test("a disarmed channel continues reporting debug status without starting a stroke", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 1 });
  registry.register({ id: "hand", kind: "space", roles: ["output"] });
  registry.register({ id: "pinch", kind: "value", roles: ["output"] });
  const statuses = [];
  const started = [];
  const runtime = new BrushChannelRuntime({
    registry,
    channels: [{ id: "monitor", enabled: false, spatialStreamId: "hand", gateStreamId: "pinch", destination: { kind: "scene" }, range: { x: { min: 0, max: 1 }, y: { min: 0, max: 1 } } }],
    resolveDestination: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    onStatus: status => statuses.push(status),
    onStart: session => started.push(session),
  });
  registry.publish("pinch", { kind: "value", value: true }, { internal: true });
  registry.publish("hand", { kind: "space", x: 0.2, y: 0.4, space: "normalized" }, { internal: true });
  assert.equal(statuses.at(-1).gate.open, true);
  assert.deepEqual(statuses.at(-1).point, { x: 20, y: 40 });
  assert.equal(started.length, 0);
  runtime.dispose();
});
