import test from "node:test";
import assert from "node:assert/strict";
import {
  createDraweratorMacro,
  createDraweratorSession,
  DraweratorSessionController,
  instantiateDraweratorMacro,
  mergeSceneMutation,
  parseDraweratorSession,
} from "./sessionHistory.js";

test("session controller records monotonic command and stroke actions", () => {
  let now = 1000;
  const controller = new DraweratorSessionController({ now: () => now });
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

test("playback restores baseline and suppresses disabled and presentation actions", async () => {
  const restored = [];
  const applied = [];
  let frameCallback = null;
  const controller = new DraweratorSessionController({
    now: () => 0,
    restoreBaseline: baseline => restored.push(baseline),
    applyAction: (action, options) => applied.push([action, options]),
    requestFrame: callback => { frameCallback = callback; return 1; },
    cancelFrame: () => {},
  });
  const session = createDraweratorSession({ baseline: { marker: true } });
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
  const session = createDraweratorSession();
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
  const macro = createDraweratorMacro(session, { name: "Line" });
  const actions = instantiateDraweratorMacro(macro, { mode: "relative", anchor: { x: 100, y: 200 } });
  assert.equal(actions[0].at, 0);
  assert.equal(actions[0].args.samples[0].scene.x, 100);
  assert.equal(actions[0].args.finalElements[0].x, 100);
  assert.notEqual(actions[0].args.finalElements[0].id, "element-1");
});

test("macros can select a session time range", () => {
  const controller = new DraweratorSessionController({ now: () => 0 });
  controller.start();
  controller.record({ id: "early", at: 0, kind: "scene", args: {} });
  controller.record({ id: "middle", at: 2, kind: "scene", args: {} });
  controller.record({ id: "late", at: 5, kind: "scene", args: {} });
  const macro = createDraweratorMacro(controller.get(), { start: 1, end: 3, name: "Middle" });
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
  const migrated = parseDraweratorSession({
    type: "drawerator-session",
    version: 0,
    actions: [{ commandId: "legacy.command", time: 9, args: null }],
  });
  assert.equal(migrated.actions[0].kind, "command");
  assert.equal(migrated.actions[0].enabled, true);
  assert.deepEqual(migrated.actions[0].args, {});
});

test("session parser rejects unrelated JSON", () => {
  assert.throws(() => parseDraweratorSession({ type: "excalidraw", actions: [] }), /not a Drawerator session/);
});
