import test from "node:test";
import assert from "node:assert/strict";
import { DraweratorStreamRegistry, createUnifiedStreamsApi, normalizeStreamSample } from "./streamRuntime.js";
import { StreamGraphRuntime, normalizeStreamGraph } from "./streamGraph.js";

test("stream registry keeps capability and input/output roles independent", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 12 });
  registry.register({ id: "pointer", name: "Pointer", kind: "space", capabilities: ["space", "event"], roles: ["input", "output"] });
  assert.equal(registry.list({ kind: "space" }).length, 1);
  assert.equal(registry.list({ kind: "event" }).length, 1);
  assert.equal(registry.list({ role: "input" }).length, 1);
  assert.equal(registry.list({ role: "output" }).length, 1);
});

test("virtual streams are writable and owner cleanup is scoped", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 25 });
  const api = createUnifiedStreamsApi({ registry });
  const owned = api.forOwner("livecode-a").create({ id: "gesture", kind: "event", name: "Gesture" });
  assert.equal(owned.virtual, true);
  const writable = registry.get("gesture");
  assert.equal(writable.writable, true);
  writable.write({ kind: "event", value: "open" });
  assert.equal(writable.snapshot().value, "open");
  assert.deepEqual(api.removeOwner("livecode-a"), ["gesture"]);
  assert.equal(api.get("gesture"), null);
});

test("read-only streams reject external writes and image frames stay transient", () => {
  const registry = new DraweratorStreamRegistry();
  registry.register({ id: "camera", kind: "image", roles: ["output"], writable: false });
  assert.throws(() => registry.publish("camera", { kind: "image", image: { width: 2, height: 2 } }), /read-only/);
  const image = { width: 3, height: 2 };
  registry.publish("camera", { kind: "image", image }, { internal: true });
  assert.equal(registry.get("camera").snapshot().image, image);
});

test("stream sample normalizes typed coordinate data", () => {
  assert.deepEqual(normalizeStreamSample({ kind: "space", x: 1, y: 2, pressure: 0.7 }, { id: "p", kind: "space" }, 4).position, { x: 1, y: 2 });
  assert.throws(() => normalizeStreamSample({ kind: "space", x: 1 }, { id: "p", kind: "space" }), /finite x and y/);
});

test("graph threshold, region and curve-crossing publish ordinary event frames", () => {
  const registry = new DraweratorStreamRegistry({ now: () => 3 });
  registry.register({ id: "point", kind: "space", roles: ["output"] });
  registry.register({ id: "scalar", kind: "value", roles: ["output"] });
  const graph = normalizeStreamGraph({ processors: [
    { id: "region", type: "region", sourceId: "point", outputId: "region-events", region: { x: 0, y: 0, width: 10, height: 10 } },
    { id: "threshold", type: "threshold", sourceId: "scalar", outputId: "threshold-events", threshold: { rising: 0.8, falling: 0.2 } },
    { id: "curve", type: "curve-cross", sourceId: "point", outputId: "curve-events", curve: [[5, -5], [5, 5]] },
  ] });
  const runtime = new StreamGraphRuntime({ registry, graph, now: () => 9 });
  registry.publish("point", { kind: "space", x: -1, y: 2 }, { internal: true });
  registry.publish("point", { kind: "space", x: 6, y: 2 }, { internal: true });
  assert.equal(registry.get("region-events").snapshot().value.transition, "enter");
  assert.equal(registry.get("curve-events").snapshot().value.transition, "cross");
  registry.publish("scalar", { kind: "value", value: 0.1 }, { internal: true });
  registry.publish("scalar", { kind: "value", value: 0.9 }, { internal: true });
  assert.equal(registry.get("threshold-events").snapshot().value.transition, "rising");
  runtime.dispose();
});
