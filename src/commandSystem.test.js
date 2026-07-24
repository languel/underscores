import test from "node:test";
import assert from "node:assert/strict";
import { DraweratorCommandRegistry, DraweratorEventBus, DraweratorInputBus, normalizeInputSample, parseGenericCommandSlash } from "./commandSystem.js";

test("command registry validates, executes, and publishes metadata", async () => {
  const bus = new DraweratorEventBus({ now: () => 10 });
  const registry = new DraweratorCommandRegistry({ eventBus: bus, contextProvider: () => ({ value: 2 }) });
  const completed = [];
  registry.subscribe(detail => completed.push(detail));
  registry.register({
    id: "math.add",
    title: "Add",
    aliases: ["/add"],
    description: "Add two values.",
    ai: { expose: true, description: "Add a value." },
    validate: args => ({ amount: Number(args.amount) }),
    execute: (args, context) => args.amount + context.value,
  });

  assert.equal(await registry.execute("math.add", { amount: "3" }, { source: "slash" }), 5);
  assert.equal(registry.find("/add")[0].id, "math.add");
  assert.equal(completed[0].metadata.source, "slash");
  assert.equal(completed[0].args.amount, 3);
  assert.equal(registry.describe("math.add").description, "Add two values.");
  assert.deepEqual(registry.describe("math.add").ai, { expose: true, description: "Add a value." });
  assert.deepEqual(bus.recent().map(event => event.name), ["command.before", "command.after"]);
});

test("input bus normalizes scene-space samples and adapter events", () => {
  const bus = new DraweratorEventBus({ now: () => 50 });
  const input = new DraweratorInputBus({ eventBus: bus, now: () => 50 });
  let emit;
  const unregister = input.registerAdapter({ id: "mediamime", start: next => { emit = next; } });
  emit({ x: 12, y: 18, phase: "move", pressure: 0.75 });
  const event = bus.recent()[0];
  assert.equal(event.name, "input.mediamime.move");
  assert.deepEqual(event.detail.scene, { x: 12, y: 18 });
  assert.equal(event.detail.pressure, 0.75);
  unregister();
});

test("normalizeInputSample rejects viewport-only or invalid coordinates", () => {
  assert.throws(() => normalizeInputSample({ clientX: 1, clientY: 2 }), /scene coordinates/);
});

test("command events redact fields marked sensitive without changing execution args", async () => {
  const registry = new DraweratorCommandRegistry();
  let executed;
  let recorded;
  registry.register({
    id: "settings.secret",
    sensitiveArgs: ["api.token"],
    execute: args => { executed = args; },
  });
  registry.subscribe(detail => { recorded = detail.args; });
  await registry.execute("settings.secret", { api: { token: "secret", model: "local" } });
  assert.equal(executed.api.token, "secret");
  assert.equal(recorded.api.token, "[REDACTED]");
  assert.equal(recorded.api.model, "local");
});

test("generic slash commands expose every stable command id with typed JSON", () => {
  assert.deepEqual(
    parseGenericCommandSlash('/command transport.seek {"seconds":2.5}', ["transport.seek"]),
    { id: "transport.seek", args: { seconds: 2.5 } },
  );
  assert.match(parseGenericCommandSlash("/command missing", ["transport.seek"]).error, /Unknown/);
  assert.match(parseGenericCommandSlash("/command transport.seek nope", ["transport.seek"]).error, /Invalid command JSON/);
});
