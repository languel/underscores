import test from "node:test";
import assert from "node:assert/strict";
import {
  WalkthroughRunner,
  appendWalkthroughTraceEvent,
  createWalkthrough,
  createWalkthroughRunTrace,
  evaluateWalkthroughAssertion,
  parseWalkthrough,
  requiresWalkthroughLearnerGate,
  updateWalkthroughRevision,
  walkthroughFromSession,
} from "./walkthroughSystem.js";

test("permission-sensitive walkthrough commands require a learner gate", () => {
  assert.equal(requiresWalkthroughLearnerGate("livecode.node.create"), false);
  assert.equal(requiresWalkthroughLearnerGate("expressiveSynth.demo.create"), true);
  assert.equal(requiresWalkthroughLearnerGate("excalidraw.scene.clear"), true);
});

test("walkthrough normalization rejects unknown documents and normalizes steps", () => {
  assert.throws(() => parseWalkthrough({ type: "other", steps: [] }));
  const walkthrough = createWalkthrough({ title: "Tour", steps: [{ title: "Hello", cues: [{ type: "ui", action: "script", target: "#bad" }] }] });
  assert.equal(walkthrough.steps[0].advance.mode, "continue");
  assert.equal(walkthrough.steps[0].cues[0].action, "click");
});

test("walkthrough revisions use optimistic concurrency", () => {
  const walkthrough = createWalkthrough({ revision: 3 });
  assert.throws(() => updateWalkthroughRevision(walkthrough, { title: "No" }, 2), /revision conflict/);
  assert.equal(updateWalkthroughRevision(walkthrough, { title: "Yes" }, 3).revision, 4);
});

test("history conversion preserves command groups and leaves narration blank", () => {
  const walkthrough = walkthroughFromSession({ name: "Demo", actions: [
    { id: "1", at: 0, kind: "command", commandId: "panel-script", args: {}, groupId: "g" },
    { id: "2", at: 0.2, kind: "command", commandId: "livecode.node.create", args: { kind: "p5" }, groupId: "g" },
    { id: "3", at: 1, kind: "command", commandId: "panel-info", args: {} },
  ] }, { describeCommand: id => ({ name: `Command ${id}` }) });
  assert.equal(walkthrough.steps.length, 2);
  assert.equal(walkthrough.steps[0].cues.length, 2);
  assert.equal(walkthrough.steps[0].narration, "");
  assert.equal(walkthrough.steps[1].focusTarget, "panel.info");
});

test("allowlisted assertions evaluate panel, scene, selection, livecode, and events", () => {
  const element = { id: "node", type: "rectangle", customData: { underscoresLivecode: { kind: "p5", runtime: { running: true } } } };
  const context = { panels: { info: { open: true, active: true } }, elements: [element], selectedElementIds: ["node"], livecodeStatus: { node: { compiled: true } }, events: [{ name: "done" }] };
  assert.equal(evaluateWalkthroughAssertion({ type: "panel.state", panelId: "info", open: true }, context).passed, true);
  assert.equal(evaluateWalkthroughAssertion({ type: "scene.exists", kind: "p5" }, context).passed, true);
  assert.equal(evaluateWalkthroughAssertion({ type: "selection.includes", elementId: "node" }, context).passed, true);
  assert.equal(evaluateWalkthroughAssertion({ type: "livecode.status", elementId: "node", compiled: true }, context).passed, true);
  assert.equal(evaluateWalkthroughAssertion({ type: "event.observed", name: "done" }, context).passed, true);
});

test("run traces redact secrets and transcripts", () => {
  const walkthrough = createWalkthrough();
  const trace = appendWalkthroughTraceEvent(createWalkthroughRunTrace({ walkthrough }), { args: { apiKey: "secret", nested: { transcript: "private", okay: 1 } } });
  assert.equal(trace.events[0].args.apiKey, "[redacted]");
  assert.equal(trace.events[0].args.nested.transcript, "[redacted]");
  assert.equal(trace.events[0].args.nested.okay, 1);
});

test("runner executes cues, waits for Continue, and restores baseline", async () => {
  const commands = [];
  let restored = null;
  const runner = new WalkthroughRunner({
    executeCommand: async id => commands.push(id),
    captureBaseline: () => ({ scene: "before" }),
    restoreBaseline: baseline => { restored = baseline; },
    wait: async () => undefined,
  });
  const walkthrough = createWalkthrough({ steps: [
    { title: "One", cues: [{ type: "command", commandId: "first" }], advance: { mode: "continue" } },
    { title: "Two", cues: [{ type: "command", commandId: "second" }], advance: { mode: "continue" } },
  ] });
  await runner.start(walkthrough, { instant: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(commands, ["first"]);
  assert.equal(runner.snapshot().status, "waiting");
  await runner.next();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(commands, ["first", "second"]);
  await runner.stop({ restore: true });
  assert.deepEqual(restored, { scene: "before" });
  assert.equal(runner.snapshot().trace.outcome, "restored");
});

test("runner pacing uses a fake clock and instant mode swaps arguments", async () => {
  const waits = [];
  const calls = [];
  const runner = new WalkthroughRunner({
    executeCommand: async (id, args) => calls.push({ id, args }),
    performUiAction: async cue => calls.push({ action: cue.action }),
    wait: async milliseconds => waits.push(milliseconds),
  });
  const walkthrough = createWalkthrough({ steps: [{
    title: "Paced",
    cues: [
      { type: "command", commandId: "create", at: 2, args: { source: "draft" }, instantArgs: { source: "final" } },
      { type: "ui", action: "type", target: "editor.livecode", at: 3, skipInInstant: true },
    ],
    advance: { mode: "continue" },
  }] });
  await runner.start(walkthrough, { rate: 2 });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(waits, [1000, 500]);
  assert.deepEqual(calls, [{ id: "create", args: { source: "draft" } }, { action: "type" }]);
  calls.length = 0;
  waits.length = 0;
  await runner.stop();
  await runner.start(walkthrough, { instant: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(waits, []);
  assert.deepEqual(calls, [{ id: "create", args: { source: "final" } }]);
});

test("runner cancellation prevents delayed cues and linked seeks select logical steps", async () => {
  let release;
  const calls = [];
  const runner = new WalkthroughRunner({
    executeCommand: async id => calls.push(id),
    wait: () => new Promise(resolve => { release = resolve; }),
  });
  const walkthrough = createWalkthrough({ clockMode: "linked", steps: [
    { id: "a", title: "A", at: 0, cues: [{ type: "command", commandId: "late", at: 2 }] },
    { id: "b", title: "B", at: 5, cues: [] },
  ] });
  await runner.start(walkthrough);
  await new Promise(resolve => setImmediate(resolve));
  await runner.stop();
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, []);
  await runner.start(walkthrough, { instant: true });
  runner.seekTime(6, { play: false });
  assert.equal(runner.snapshot().step.id, "b");
  assert.equal(runner.snapshot().status, "paused");
});

test("runner persists and clears reload recovery checkpoints", async () => {
  const recoveries = [];
  let cleared = 0;
  const runner = new WalkthroughRunner({
    captureBaseline: () => ({ sceneJson: "before" }),
    persistRecovery: value => recoveries.push(value),
    clearRecovery: () => { cleared += 1; },
    wait: async () => undefined,
  });
  await runner.start(createWalkthrough({ steps: [] }));
  assert.equal(recoveries[0].baseline.sceneJson, "before");
  await runner.stop();
  assert.equal(cleared, 1);
});

test("runner records Do it and advances a waiting learner step", async () => {
  const runner = new WalkthroughRunner({ wait: async () => undefined });
  const walkthrough = createWalkthrough({ steps: [
    { id: "try-it", title: "Try it", advance: { mode: "continue" } },
    { id: "next", title: "Next", advance: { mode: "continue" } },
  ] });
  await runner.start(walkthrough, { instant: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runner.snapshot().status, "waiting");
  await runner.doIt();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runner.snapshot().step.id, "next");
  assert.equal(runner.snapshot().trace.events.some(event => event.kind === "doIt"), true);
});
