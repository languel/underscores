import test from "node:test";
import assert from "node:assert/strict";
import {
  createUnderscoresMacro,
  createUnderscoresSession,
  UnderscoresSessionController,
  instantiateUnderscoresMacro,
  mergeSceneMutation,
  normalizeSessionAction,
  parseUnderscoresSession,
} from "./sessionHistory.js";

test("session controller records monotonic command and stroke actions", () => {
  let now = 1000;
  const controller = new UnderscoresSessionController({ now: () => now });
  controller.start({ baseline: { elements: [] } });
  now = 1250;
  controller.recordCommand({
    id: "panel.open",
    version: 1,
    args: { panelId: "history" },
    metadata: { record: true, source: "shortcut", presentation: true },
  });
  now = 1500;
  controller.record({ kind: "stroke", duration: 0.3, args: { samples: [] } });
  controller.stop();
  const session = controller.get();
  assert.equal(session.actions.length, 2);
  assert.equal(session.actions[0].at, 0.25);
  assert.equal(session.actions[0].track, "presentation");
  assert.equal(session.actions[1].at, 0.5);
});

test("session clocks persist score sample rate and migrate legacy sessions", () => {
  const session = createUnderscoresSession({ clock: { fps: 25, tempo: 90, sampleRate: 96000 } });
  assert.equal(session.version, 2);
  assert.equal(session.clock.sampleRate, 96000);
  const legacy = { ...session, version: 1, clock: { fps: 30, tempo: 120, signature: { numerator: 4, denominator: 4 } } };
  assert.equal(parseUnderscoresSession(legacy).clock.sampleRate, 48000);
});

test("history actions retain authored time expressions while keeping numeric compatibility", () => {
  const action = normalizeSessionAction({ kind: "command", at: 1, duration: 0.5, atValue: { version: 1, expression: "2 beats", fallbackSeconds: 1 } });
  assert.equal(action.at, 1);
  assert.equal(action.atValue.expression, "2 beats");
  assert.equal(action.durationValue.expression, "0.5 s");
});

test("input capture is opt-in and preserves sampled pointer metadata", () => {
  let now = 1000;
  const controller = new UnderscoresSessionController({ now: () => now });
  controller.start({ includeInput: true });
  now = 1200;
  const recorded = controller.record({
    kind: "input",
    duration: 0.2,
    args: {
      eventType: "laser",
      phase: "gesture",
      samples: [{ scene: { x: 10, y: 20 }, pointerType: "mouse", pressure: 0.5 }],
    },
  });
  assert.equal(recorded.track, "input");
  assert.equal(recorded.args.eventType, "laser");
  assert.equal(recorded.args.samples[0].scene.x, 10);
  const parsed = parseUnderscoresSession(controller.export());
  assert.equal(parsed.includeInput, true);
  assert.equal(parsed.actions[0].args.samples[0].pointerType, "mouse");

  const disabled = new UnderscoresSessionController({ now: () => now });
  disabled.start({ includeInput: false });
  assert.equal(disabled.record({ kind: "input", args: { samples: [] } }), null);
});

test("input capture scopes migrate the legacy aggregate switch", () => {
  const legacy = parseUnderscoresSession({
    type: "underscores-session",
    version: 2,
    includeInput: true,
    actions: [],
  });
  assert.equal(legacy.includeCanvasInput, true);
  assert.equal(legacy.includeUiInput, true);

  const scoped = createUnderscoresSession({ includeCanvasInput: true, includeUiInput: false });
  assert.equal(scoped.includeInput, true);
  assert.equal(scoped.includeCanvasInput, true);
  assert.equal(scoped.includeUiInput, false);

  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start({ includeCanvasInput: true, includeUiInput: false });
  assert.equal(controller.record({ kind: "input", args: { scope: "ui", samples: [] } }), null);
  assert.notEqual(controller.record({ kind: "input", args: { scope: "canvas", samples: [] } }), null);
});

test("continuous UI moves share one clip while clicks remain separate clips", () => {
  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start({ includeUiInput: true, includeCanvasInput: false });
  controller.record({
    kind: "input",
    at: 0.1,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 10, y: 10 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.15,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 15, y: 15 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.18,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 18, y: 18 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.2,
    duration: 0.02,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "click", samples: [{ time: 0, viewport: { x: 20, y: 20 } }] },
  });
  let session = controller.get();
  assert.equal(session.actions.length, 2);
  assert.ok(Math.abs(session.actions[0].duration - 0.08) < 1e-9);
  assert.equal(session.actions[0].args.samples.length, 3);
  assert.ok(Math.abs(session.actions[0].args.samples[1].time - 50) < 1e-9);
  assert.ok(Math.abs(session.actions[0].args.samples[2].time - 80) < 1e-9);
  assert.equal(session.actions[1].args.phase, "click");
  assert.equal(session.actions[1].args.samples.length, 1);

  controller.record({ kind: "command", at: 0.4, commandId: "panel.open", args: {} });
  controller.record({
    kind: "input",
    at: 0.5,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 30, y: 30 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.6,
    args: { scope: "ui", eventType: "pointer", pointerType: "touch", phase: "move", samples: [{ time: 0, viewport: { x: 40, y: 40 } }] },
  });
  session = controller.get();
  assert.equal(session.actions.length, 5);
  assert.equal(session.actions[3].args.samples.length, 1);
  assert.equal(session.actions[4].args.pointerType, "touch");
});

test("adjacent canvas hover samples share one clip without crossing the UI boundary", () => {
  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start({ includeCanvasInput: true, includeUiInput: true });
  controller.record({
    kind: "input",
    at: 0.1,
    args: { scope: "canvas", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 10, y: 10 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.2,
    args: { scope: "canvas", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 20, y: 20 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.3,
    args: { scope: "canvas", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 30, y: 30 } }] },
  });
  controller.record({
    kind: "input",
    at: 0.4,
    args: { scope: "ui", eventType: "mouse", pointerType: "mouse", phase: "move", samples: [{ time: 0, viewport: { x: 40, y: 40 } }] },
  });
  const session = controller.get();
  assert.equal(session.actions.length, 2);
  assert.equal(session.actions[0].args.scope, "canvas");
  assert.equal(session.actions[0].args.samples.length, 3);
  assert.ok(Math.abs(session.actions[0].duration - 0.2) < 1e-9);
  assert.ok(Math.abs(session.actions[0].args.samples[1].time - 100) < 1e-9);
  assert.ok(Math.abs(session.actions[0].args.samples[2].time - 200) < 1e-9);
  assert.equal(session.actions[1].args.scope, "ui");
});

test("laser move samples share one canvas clip while a click stays separate", () => {
  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start({ includeCanvasInput: true, includeUiInput: false });
  for (const [at, x, y] of [[0.1, 10, 12], [0.16, 16, 18], [0.24, 24, 26]]) {
    controller.record({
      kind: "input",
      at,
      args: {
        scope: "canvas",
        eventType: "laser",
        pointerType: "mouse",
        pointerId: 1,
        phase: "move",
        tool: "laser",
        samples: [{ time: 0, viewport: { x, y }, tool: "laser" }],
      },
    });
  }
  controller.record({
    kind: "input",
    at: 0.3,
    duration: 0.01,
    args: {
      scope: "canvas",
      eventType: "laser",
      pointerType: "mouse",
      pointerId: 1,
      phase: "click",
      tool: "laser",
      samples: [{ time: 0, viewport: { x: 30, y: 32 }, tool: "laser" }],
    },
  });
  const session = controller.get();
  assert.equal(session.actions.length, 2);
  assert.equal(session.actions[0].args.eventType, "laser");
  assert.equal(session.actions[0].args.samples.length, 3);
  assert.equal(session.actions[0].args.tool, "laser");
  assert.ok(Math.abs(session.actions[0].duration - 0.14) < 1e-9);
  assert.equal(session.actions[1].args.phase, "click");
});

test("starting a fresh take does not restore the previous action list", () => {
  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start({ baseline: { marker: "old" }, includeInput: true });
  controller.record({ kind: "command", at: 0.25, commandId: "old.action", args: {} });
  controller.stop();

  controller.start({ append: false, baseline: { marker: "new" }, includeInput: true });
  const session = controller.get();
  assert.deepEqual(session.baseline, { marker: "new" });
  assert.equal(session.actions.length, 0);
  assert.equal(controller.playhead, 0);
});

test("clearing a session stops an active playback transport", async () => {
  let nextFrame = null;
  const cancelled = [];
  const controller = new UnderscoresSessionController({
    now: () => 0,
    requestFrame: callback => { nextFrame = callback; return 17; },
    cancelFrame: handle => cancelled.push(handle),
  });
  const session = createUnderscoresSession({ baseline: { marker: true } });
  session.actions = [{ id: "action", kind: "command", at: 1, duration: 0, enabled: true }];
  controller.load(session);
  await controller.play({ restoreBaseline: false });
  assert.equal(controller.snapshot().status, "playing");
  controller.clear();
  assert.equal(controller.snapshot().status, "idle");
  assert.equal(controller.snapshot().session.actions.length, 0);
  assert.deepEqual(cancelled, [17]);
  assert.equal(nextFrame !== null, true);
});

test("playback restores baseline and suppresses disabled and presentation actions", async () => {
  const restored = [];
  const applied = [];
  let frameCallback = null;
  const controller = new UnderscoresSessionController({
    now: () => 0,
    restoreBaseline: baseline => restored.push(baseline),
    applyAction: (action, options) => applied.push([action, options]),
    requestFrame: callback => { frameCallback = callback; return 1; },
    cancelFrame: () => {},
  });
  const session = createUnderscoresSession({ baseline: { marker: true } });
  session.actions = [
    { id: "a", kind: "command", at: 0.1, enabled: true, presentation: false },
    { id: "b", kind: "command", at: 0.2, enabled: true, presentation: true },
    { id: "c", kind: "command", at: 0.3, enabled: false, presentation: false },
  ];
  controller.load(session);
  await controller.play({ includePresentation: false });
  frameCallback(400);
  await Promise.resolve();
  assert.deepEqual(restored[0], { marker: true });
  assert.deepEqual(applied.map(([action]) => action.id), ["a"]);
});

test("macros remap element IDs and insert relative to their origin", () => {
  const session = createUnderscoresSession();
  session.actions = [{
    id: "stroke-action",
    kind: "stroke",
    at: 2,
    duration: 1,
    args: {
      samples: [{ scene: { x: 10, y: 20 } }],
      finalElements: [{ id: "element-1", x: 10, y: 20, width: 5, height: 5 }],
    },
  }];
  const macro = createUnderscoresMacro(session, { name: "Line" });
  const actions = instantiateUnderscoresMacro(macro, { mode: "relative", anchor: { x: 100, y: 200 } });
  assert.equal(actions[0].at, 0);
  assert.equal(actions[0].args.samples[0].scene.x, 100);
  assert.equal(actions[0].args.finalElements[0].x, 100);
  assert.notEqual(actions[0].args.finalElements[0].id, "element-1");
});

test("macros can select a session time range", () => {
  const controller = new UnderscoresSessionController({ now: () => 0 });
  controller.start();
  controller.record({ id: "early", at: 0, kind: "scene", args: {} });
  controller.record({ id: "middle", at: 2, kind: "scene", args: {} });
  controller.record({ id: "late", at: 5, kind: "scene", args: {} });
  const macro = createUnderscoresMacro(controller.get(), { start: 1, end: 3, name: "Middle" });
  assert.equal(macro.actions.length, 1);
  assert.equal(macro.actions[0].at, 0);
});

test("scene mutations coalesce create, update, and delete intent", () => {
  const existing = { id: "existing", version: 1, x: 0 };
  const previous = new Map([[existing.id, existing]]);
  let mutation = mergeSceneMutation(null, {
    previousElements: previous,
    changedElements: [
      { id: "created", version: 1, x: 10 },
      { id: "ephemeral", version: 1, x: 12 },
      { id: "existing", version: 2, x: 20 },
    ],
    now: () => 100,
  });
  mutation = mergeSceneMutation(mutation, {
    previousElements: new Map([...previous, ["created", { id: "created", version: 1, x: 10 }]]),
    changedElements: [{ id: "created", version: 2, x: 30 }],
    removedElementIds: ["existing", "ephemeral"],
  });
  assert.equal(mutation.startedAt, 100);
  assert.equal(mutation.created.get("created").x, 30);
  assert.equal(mutation.updated.has("created"), false);
  assert.equal(mutation.created.has("ephemeral"), false);
  assert.equal(mutation.updated.has("existing"), false);
  assert.deepEqual([...mutation.deletedElementIds], ["existing"]);
});

test("older session actions migrate to normalized v1 fields", () => {
  const migrated = parseUnderscoresSession({
    type: "underscores-session",
    version: 0,
    actions: [{ commandId: "legacy.command", time: 9, args: null }],
  });
  assert.equal(migrated.actions[0].kind, "command");
  assert.equal(migrated.actions[0].enabled, true);
  assert.deepEqual(migrated.actions[0].args, {});
});

test("session parser rejects unrelated JSON", () => {
  assert.throws(() => parseUnderscoresSession({ type: "excalidraw", actions: [] }), /not a Underscores session/);
});
