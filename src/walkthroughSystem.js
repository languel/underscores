export const UNDERSCORES_WALKTHROUGH_TYPE = "underscores-walkthrough";
export const UNDERSCORES_WALKTHROUGH_VERSION = 1;
export const UNDERSCORES_WALKTHROUGH_RUN_TYPE = "underscores-walkthrough-run";
export const UNDERSCORES_WALKTHROUGH_RUN_VERSION = 1;

const clone = value => value === undefined ? undefined : structuredClone(value);
const createId = prefix => `${prefix}-${crypto.randomUUID()}`;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = value => typeof value === "string" ? value : "";

export const WALKTHROUGH_ADVANCE_MODES = Object.freeze(["auto", "continue", "assertion"]);
export const WALKTHROUGH_CLOCK_MODES = Object.freeze(["free", "linked"]);
export const WALKTHROUGH_UI_ACTIONS = Object.freeze(["click", "focus", "type", "select", "shortcut"]);
export const WALKTHROUGH_ASSERTION_TYPES = Object.freeze([
  "panel.state",
  "scene.exists",
  "selection.includes",
  "livecode.status",
  "physics.state",
  "event.observed",
]);

const LEARNER_GATE_COMMAND = /(?:^excalidraw\.(?:file|scene\.clear|selection\.delete)|delete$|\.delete$|^collaboration\.room\.(?:create|join)|audio|midi|expressiveSynth\.demo|^strudel\.demo)/i;
export const requiresWalkthroughLearnerGate = commandId => LEARNER_GATE_COMMAND.test(String(commandId || ""));

export const normalizeWalkthroughCue = (cue = {}) => {
  const type = cue.type === "ui" ? "ui" : cue.type === "input" ? "input" : "command";
  const normalized = {
    id: text(cue.id) || createId("cue"),
    type,
    at: Math.max(0, finite(cue.at)),
    skipInInstant: cue.skipInInstant === true,
  };
  if (type === "command") {
    normalized.commandId = text(cue.commandId);
    normalized.args = clone(cue.args && typeof cue.args === "object" ? cue.args : {});
    normalized.instantArgs = clone(cue.instantArgs && typeof cue.instantArgs === "object" ? cue.instantArgs : null);
  } else if (type === "ui") {
    normalized.action = WALKTHROUGH_UI_ACTIONS.includes(cue.action) ? cue.action : "click";
    normalized.target = text(cue.target);
    normalized.value = text(cue.value);
    normalized.keys = Array.isArray(cue.keys) ? cue.keys.map(text).filter(Boolean) : [];
    normalized.typingDelay = Math.max(0, finite(cue.typingDelay, 8));
  } else {
    normalized.eventType = text(cue.eventType) || text(cue.args?.eventType) || "pointer";
    normalized.scope = cue.scope === "ui" || cue.args?.scope === "ui" ? "ui" : "canvas";
    normalized.phase = text(cue.phase) || text(cue.args?.phase) || "gesture";
    normalized.pointerId = finite(cue.pointerId ?? cue.args?.pointerId);
    normalized.pointerType = text(cue.pointerType) || text(cue.args?.pointerType) || "mouse";
    normalized.tool = text(cue.tool) || text(cue.args?.tool);
    normalized.color = text(cue.color) || text(cue.args?.color);
    normalized.opacity = Math.max(0, Math.min(100, finite(cue.opacity ?? cue.args?.opacity, 100)));
    normalized.duration = Math.max(0, finite(cue.duration ?? cue.args?.duration));
    normalized.samples = clone(Array.isArray(cue.samples) ? cue.samples : (Array.isArray(cue.args?.samples) ? cue.args.samples : []));
    normalized.args = clone(cue.args && typeof cue.args === "object" ? cue.args : {
      eventType: normalized.eventType,
      scope: normalized.scope,
      phase: normalized.phase,
      pointerId: normalized.pointerId,
      pointerType: normalized.pointerType,
      tool: normalized.tool,
      color: normalized.color,
      opacity: normalized.opacity,
      samples: normalized.samples,
    });
  }
  return normalized;
};

export const normalizeWalkthroughAssertion = assertion => {
  if (!assertion || typeof assertion !== "object") return null;
  const type = WALKTHROUGH_ASSERTION_TYPES.includes(assertion.type) ? assertion.type : "scene.exists";
  return { ...clone(assertion), type };
};

export const normalizeWalkthroughStep = (step = {}, index = 0) => {
  const advanceMode = WALKTHROUGH_ADVANCE_MODES.includes(step.advance?.mode) ? step.advance.mode : "continue";
  return {
    id: text(step.id) || createId("step"),
    title: text(step.title) || `Step ${index + 1}`,
    showTitle: step.showTitle !== false,
    narration: text(step.narration),
    info: text(step.info),
    focusTarget: text(step.focusTarget),
    at: Math.max(0, finite(step.at, index)),
    cues: (Array.isArray(step.cues) ? step.cues : []).map(normalizeWalkthroughCue).sort((a, b) => a.at - b.at),
    advance: {
      mode: advanceMode,
      delay: Math.max(0, finite(step.advance?.delay, 0.8)),
      assertion: normalizeWalkthroughAssertion(step.advance?.assertion),
    },
    hint: text(step.hint),
    failureText: text(step.failureText),
    allowSkip: step.allowSkip !== false,
  };
};

export const createWalkthrough = (value = {}) => ({
  type: UNDERSCORES_WALKTHROUGH_TYPE,
  version: UNDERSCORES_WALKTHROUGH_VERSION,
  id: text(value.id) || createId("walkthrough"),
  revision: Math.max(1, Math.floor(finite(value.revision, 1))),
  title: text(value.title) || "Untitled walkthrough",
  description: text(value.description),
  clockMode: WALKTHROUGH_CLOCK_MODES.includes(value.clockMode) ? value.clockMode : "free",
  defaultRate: Math.max(0.05, finite(value.defaultRate, 1)),
  createdAt: text(value.createdAt) || new Date().toISOString(),
  updatedAt: text(value.updatedAt) || new Date().toISOString(),
  steps: (Array.isArray(value.steps) ? value.steps : []).map(normalizeWalkthroughStep),
});

export const parseWalkthrough = payload => {
  const value = typeof payload === "string" ? JSON.parse(payload) : clone(payload);
  if (!value || value.type !== UNDERSCORES_WALKTHROUGH_TYPE || !Array.isArray(value.steps)) {
    throw new Error("This is not an Underscores walkthrough document.");
  }
  if (finite(value.version) > UNDERSCORES_WALKTHROUGH_VERSION) {
    throw new Error(`Walkthrough version ${value.version} is newer than this Underscores build.`);
  }
  return createWalkthrough(value);
};

export const normalizeWalkthroughs = value => {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach(entry => {
    try {
      const walkthrough = parseWalkthrough(entry);
      const current = byId.get(walkthrough.id);
      if (!current || walkthrough.revision >= current.revision) byId.set(walkthrough.id, walkthrough);
    } catch {
      // Invalid authored records are omitted rather than preventing patch load.
    }
  });
  return [...byId.values()];
};

export const updateWalkthroughRevision = (current, patch, expectedRevision = null) => {
  const normalized = parseWalkthrough(current);
  if (expectedRevision != null && finite(expectedRevision) !== normalized.revision) {
    throw new Error(`Walkthrough revision conflict: expected ${expectedRevision}, found ${normalized.revision}.`);
  }
  return createWalkthrough({
    ...normalized,
    ...clone(patch || {}),
    id: normalized.id,
    revision: normalized.revision + 1,
    updatedAt: new Date().toISOString(),
  });
};

const commandTitle = (action, describeCommand) => {
  if (action.commandId) return describeCommand?.(action.commandId)?.name || action.commandId;
  if (action.kind === "input") return `${action.args?.eventType || "Pointer"} input`;
  return action.args?.label || `${action.kind || "Action"}`;
};

const inferFocusTarget = action => {
  if (action.commandId?.startsWith("panel-")) return `panel.${action.commandId.slice(6)}`;
  if ((action.commandId === "panel.open" || action.commandId === "panel.close") && action.args?.panelId) return `panel.${action.args.panelId}`;
  if (action.commandId === "presentation.panels") return "app.panels";
  const id = action.args?.elementId || action.args?.elementIds?.[0] || action.args?.finalElements?.[0]?.id || action.args?.elements?.[0]?.id;
  return id ? `canvas.element:${id}` : "";
};

export const walkthroughFromSession = (session, { title, describeCommand } = {}) => {
  if (!session || !Array.isArray(session.actions)) throw new Error("A recorded History session is required.");
  const groups = [];
  const grouped = new Map();
  [...session.actions].sort((a, b) => a.at - b.at || a.sequence - b.sequence).forEach(action => {
    if (action.enabled === false) return;
    if (action.groupId) {
      let group = grouped.get(action.groupId);
      if (!group) {
        group = { id: action.groupId, actions: [] };
        grouped.set(action.groupId, group);
        groups.push(group);
      }
      group.actions.push(action);
    } else {
      groups.push({ id: action.id || createId("history"), actions: [action] });
    }
  });
  const start = groups[0]?.actions[0]?.at || 0;
  return createWalkthrough({
    title: title || `${session.name || "History session"} walkthrough`,
    description: "Drafted from recorded History actions.",
    steps: groups.map(group => {
      const first = group.actions[0];
      const groupStart = first.at || 0;
      return {
        id: `step-${group.id}`,
        title: commandTitle(first, describeCommand),
        narration: "",
        focusTarget: inferFocusTarget(first),
        at: Math.max(0, groupStart - start),
        cues: group.actions.flatMap(action => {
          const at = Math.max(0, finite(action.at) - groupStart);
          if (action.kind === "input") return [{
            type: "input",
            eventType: action.args?.eventType,
            scope: action.args?.scope,
            phase: action.args?.phase,
            pointerId: action.args?.pointerId,
            pointerType: action.args?.pointerType,
            tool: action.args?.tool,
            color: action.args?.color,
            opacity: action.args?.opacity,
            duration: action.duration,
            samples: clone(action.args?.samples || []),
            args: clone(action.args || {}),
            at,
          }];
          if (!action.commandId) return [];
          return [{ type: "command", commandId: action.commandId, args: clone(action.args || {}), at }];
        }),
        advance: { mode: "continue" },
        allowSkip: true,
      };
    }),
  });
};

export const evaluateWalkthroughAssertion = (assertion, context = {}) => {
  const normalized = normalizeWalkthroughAssertion(assertion);
  if (!normalized) return { passed: true, reason: "No assertion." };
  if (normalized.type === "panel.state") {
    const panel = context.panels?.[normalized.panelId];
    const passed = Boolean(panel?.open) === (normalized.open !== false)
      && (normalized.active == null || Boolean(panel?.active) === Boolean(normalized.active));
    return { passed, reason: passed ? "Panel state matches." : `Panel ${normalized.panelId || "unknown"} is not in the expected state.` };
  }
  if (normalized.type === "scene.exists") {
    const elements = (context.elements || []).filter(element => !element?.isDeleted);
    const matches = elements.filter(element => {
      const node = element.customData?.underscoresLivecode;
      return (!normalized.elementId || element.id === normalized.elementId)
        && (!normalized.kind || element.type === normalized.kind || node?.kind === normalized.kind)
        && (!normalized.name || node?.name === normalized.name || element.customData?.name === normalized.name);
    });
    const passed = matches.length >= Math.max(1, finite(normalized.minCount, 1));
    return { passed, reason: passed ? "Required object exists." : "The required canvas object was not found.", matches: matches.map(element => element.id) };
  }
  if (normalized.type === "selection.includes") {
    const selected = new Set(context.selectedElementIds || []);
    const ids = Array.isArray(normalized.elementIds) ? normalized.elementIds : [normalized.elementId].filter(Boolean);
    const passed = ids.every(id => selected.has(id));
    return { passed, reason: passed ? "Selection matches." : "Select the requested object before continuing." };
  }
  if (normalized.type === "livecode.status") {
    const element = (context.elements || []).find(candidate => candidate.id === normalized.elementId);
    const node = element?.customData?.underscoresLivecode;
    const passed = Boolean(node)
      && (!normalized.kind || node.kind === normalized.kind)
      && (normalized.running == null || Boolean(node.runtime?.running) === Boolean(normalized.running))
      && (normalized.compiled == null || Boolean(context.livecodeStatus?.[element.id]?.compiled) === Boolean(normalized.compiled));
    return { passed, reason: passed ? "Livecode state matches." : "The Livecode node has not reached the requested state." };
  }
  if (normalized.type === "physics.state") {
    const physics = context.physics || {};
    const systems = Array.isArray(physics.systems) ? physics.systems : [];
    const bodies = Array.isArray(physics.bodies) ? physics.bodies : [];
    const constraints = Array.isArray(physics.constraints) ? physics.constraints : [];
    const mappings = Array.isArray(physics.mappings) ? physics.mappings : [];
    const systemId = normalized.systemId || null;
    const systemMatches = system => !systemId || system.id === systemId;
    const bodyCount = bodies.filter(body => systemMatches(body)).length;
    const constraintCount = constraints.filter(constraint => systemMatches(constraint)).length;
    const mappingCount = mappings.filter(mapping => systemMatches(mapping)).length;
    const systemCount = systems.filter(systemMatches).length;
    const playing = context.physicsPlaying == null ? null : Boolean(context.physicsPlaying);
    const passed = systemCount >= Math.max(0, finite(normalized.minSystems, 0))
      && bodyCount >= Math.max(0, finite(normalized.minBodies, 0))
      && constraintCount >= Math.max(0, finite(normalized.minConstraints, 0))
      && mappingCount >= Math.max(0, finite(normalized.minMappings, 0))
      && (normalized.playing == null || playing === Boolean(normalized.playing));
    return {
      passed,
      reason: passed
        ? "Physics state matches."
        : "The physics world has not reached the requested state.",
      counts: { systems: systemCount, bodies: bodyCount, constraints: constraintCount, mappings: mappingCount },
      ...(playing == null ? {} : { playing }),
    };
  }
  const events = context.events || [];
  const passed = events.some(event => event.name === normalized.name || event.type === normalized.name);
  return { passed, reason: passed ? "Required event was observed." : `Waiting for ${normalized.name || "the required event"}.` };
};

const redactValue = (value, key = "") => {
  if (/credential|password|secret|token|api[-_]?key|transcript|prompt/i.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey)]));
  return value;
};

export const createWalkthroughRunTrace = ({ walkthrough, rate = 1, mode = "local" } = {}) => ({
  type: UNDERSCORES_WALKTHROUGH_RUN_TYPE,
  version: UNDERSCORES_WALKTHROUGH_RUN_VERSION,
  id: createId("walkthrough-run"),
  walkthroughId: walkthrough?.id || "",
  walkthroughRevision: walkthrough?.revision || 1,
  startedAt: new Date().toISOString(),
  completedAt: null,
  rate,
  mode,
  outcome: "running",
  events: [],
});

export const appendWalkthroughTraceEvent = (trace, event) => ({
  ...trace,
  events: [...(trace.events || []), { at: new Date().toISOString(), ...redactValue(clone(event || {})) }],
});

export const completeWalkthroughRunTrace = (trace, outcome) => ({
  ...trace,
  outcome: text(outcome) || "completed",
  completedAt: new Date().toISOString(),
});

export class WalkthroughRunner {
  constructor({ executeCommand, performUiAction, performInput, evaluateAssertion, captureBaseline, restoreBaseline, persistRecovery, clearRecovery, onChange, onInfo, wait } = {}) {
    this.executeCommand = executeCommand || (async () => undefined);
    this.performUiAction = performUiAction || (async () => undefined);
    this.performInput = performInput || (async () => undefined);
    this.evaluateAssertion = evaluateAssertion || (assertion => evaluateWalkthroughAssertion(assertion));
    this.captureBaseline = captureBaseline || (() => null);
    this.restoreBaseline = restoreBaseline || (async () => undefined);
    this.persistRecovery = persistRecovery || (async () => undefined);
    this.clearRecovery = clearRecovery || (async () => undefined);
    this.onChange = onChange || (() => undefined);
    this.onInfo = onInfo || (() => undefined);
    this.wait = wait || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.generation = 0;
    this.state = this.emptyState();
  }

  emptyState() {
    return { status: "idle", walkthrough: null, stepIndex: -1, step: null, rate: 1, instant: false, assertion: null, baseline: null, trace: null };
  }

  snapshot() { return clone(this.state); }
  publish(patch = {}) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  async start(value, { rate, instant = false, stepId = "" } = {}) {
    const walkthrough = parseWalkthrough(value);
    const baseline = await this.captureBaseline();
    const resolvedRate = Math.max(0.05, finite(rate, walkthrough.defaultRate));
    const trace = createWalkthroughRunTrace({ walkthrough, rate: resolvedRate });
    const requestedStepIndex = stepId ? walkthrough.steps.findIndex(step => step.id === stepId) : 0;
    const stepIndex = requestedStepIndex >= 0 ? requestedStepIndex : 0;
    this.generation += 1;
    const generation = this.generation;
    this.publish({ status: "running", walkthrough, stepIndex, step: walkthrough.steps[stepIndex] || null, rate: resolvedRate, instant: Boolean(instant), assertion: null, baseline, trace });
    await this.persistRecovery({ baseline, walkthroughId: walkthrough.id, runId: trace.id });
    if (!walkthrough.steps.length) return this.finish("completed");
    void this.runStep(generation);
    return this.snapshot();
  }

  async runStep(generation = this.generation) {
    const step = this.state.walkthrough?.steps[this.state.stepIndex];
    if (!step || generation !== this.generation) return;
    this.publish({ status: "running", step, assertion: null });
    this.onInfo({ title: step.title, body: step.info || step.narration, source: "walkthrough" });
    let previousAt = 0;
    for (const cue of step.cues) {
      if (generation !== this.generation || ["stopped", "idle"].includes(this.state.status)) return;
      while (this.state.status === "paused") await this.wait(25);
      if (this.state.instant && cue.skipInInstant) continue;
      const delay = this.state.instant ? 0 : Math.max(0, cue.at - previousAt) * 1000 / this.state.rate;
      if (delay) await this.wait(delay);
      if (generation !== this.generation) return;
      try {
        if (cue.type === "command") await this.executeCommand(cue.commandId, clone(this.state.instant && cue.instantArgs ? cue.instantArgs : cue.args || {}), { source: "walkthrough", record: false });
        else if (cue.type === "input") await this.performInput(clone(cue));
        else await this.performUiAction(clone(cue));
        this.publish({ trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "cue", stepId: step.id, cueId: cue.id, cueType: cue.type, commandId: cue.commandId, action: cue.action, target: cue.target, args: cue.args }) });
      } catch (error) {
        this.publish({ status: "waiting", assertion: { passed: false, reason: error?.message || "Walkthrough action failed." }, trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "cue.error", stepId: step.id, cueId: cue.id, message: error?.message || String(error) }) });
        return;
      }
      previousAt = cue.at;
    }
    if (step.advance.mode === "auto") {
      if (!this.state.instant && step.advance.delay) await this.wait(step.advance.delay * 1000 / this.state.rate);
      if (generation === this.generation) await this.next({ automatic: true });
      return;
    }
    if (step.advance.mode === "assertion") {
      const result = await this.evaluateAssertion(step.advance.assertion);
      this.publish({ status: result.passed ? "running" : "waiting", assertion: result, trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "assertion", stepId: step.id, ...result }) });
      if (result.passed) await this.next({ automatic: true });
      return;
    }
    this.publish({ status: "waiting" });
  }

  pause() { if (this.state.status === "running") this.publish({ status: "paused" }); return this.snapshot(); }
  resume() { if (this.state.status === "paused") this.publish({ status: "running" }); return this.snapshot(); }
  setRate(rate, { instant = false } = {}) { this.publish({ rate: Math.max(0.05, finite(rate, 1)), instant: Boolean(instant) }); return this.snapshot(); }

  async check() {
    const step = this.state.step;
    if (!step?.advance.assertion) return { passed: true, reason: "No assertion." };
    const result = await this.evaluateAssertion(step.advance.assertion);
    this.publish({ assertion: result, trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "assertion.retry", stepId: step.id, ...result }) });
    if (result.passed) await this.next({ automatic: true });
    return result;
  }

  async next({ automatic = false, skipped = false } = {}) {
    const nextIndex = this.state.stepIndex + 1;
    this.publish({ trace: appendWalkthroughTraceEvent(this.state.trace, { kind: skipped ? "skip" : automatic ? "advance.auto" : "advance", stepId: this.state.step?.id }) });
    if (nextIndex >= (this.state.walkthrough?.steps.length || 0)) return this.finish("completed");
    this.generation += 1;
    const generation = this.generation;
    this.publish({ status: "running", stepIndex: nextIndex, step: this.state.walkthrough.steps[nextIndex], assertion: null });
    void this.runStep(generation);
    return this.snapshot();
  }

  async previous() {
    if (!this.state.walkthrough) return this.snapshot();
    this.generation += 1;
    const generation = this.generation;
    const stepIndex = Math.max(0, this.state.stepIndex - 1);
    this.publish({ status: "running", stepIndex, step: this.state.walkthrough.steps[stepIndex], assertion: null });
    void this.runStep(generation);
    return this.snapshot();
  }

  seekTime(time, { play = this.state.status !== "paused" } = {}) {
    const steps = this.state.walkthrough?.steps || [];
    if (!steps.length) return this.snapshot();
    const seconds = Math.max(0, finite(time));
    let stepIndex = 0;
    for (let index = 0; index < steps.length; index += 1) {
      if (steps[index].at <= seconds) stepIndex = index;
      else break;
    }
    if (stepIndex === this.state.stepIndex) return this.snapshot();
    this.generation += 1;
    const generation = this.generation;
    this.publish({ status: play ? "running" : "paused", stepIndex, step: steps[stepIndex], assertion: null });
    if (play) void this.runStep(generation);
    else this.onInfo({ title: steps[stepIndex].title, body: steps[stepIndex].info || steps[stepIndex].narration, source: "walkthrough" });
    return this.snapshot();
  }

  hint() {
    this.publish({ trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "hint", stepId: this.state.step?.id }) });
    return this.state.step?.hint || "";
  }

  async doIt() {
    const step = this.state.step;
    if (!step || !["waiting", "paused"].includes(this.state.status)) return this.snapshot();
    this.publish({ trace: appendWalkthroughTraceEvent(this.state.trace, { kind: "doIt", stepId: step.id }) });
    if (step.advance.mode === "assertion") {
      await this.check();
      return this.snapshot();
    }
    return this.next({ automatic: true });
  }

  async finish(outcome = "completed") {
    this.generation += 1;
    const trace = completeWalkthroughRunTrace(this.state.trace, outcome);
    this.publish({ status: "completed", trace });
    return this.snapshot();
  }

  async stop({ restore = false, outcome = restore ? "restored" : "kept" } = {}) {
    this.generation += 1;
    if (restore && this.state.baseline) await this.restoreBaseline(this.state.baseline);
    await this.clearRecovery();
    const trace = completeWalkthroughRunTrace(this.state.trace, outcome);
    this.publish({ status: "stopped", trace });
    return this.snapshot();
  }
}
