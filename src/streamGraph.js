const STREAM_GRAPH_VERSION = 2;

const PROCESSOR_TYPES = Object.freeze({
  CURVE_CROSS: "curve-cross",
  REGION: "region",
  THRESHOLD: "threshold",
  DISTANCE: "distance",
  MIDPOINT: "midpoint",
  DELTA: "delta",
  MAP: "map",
  COMBINE: "combine",
  FILTER: "filter",
  VELOCITY: "velocity",
  SPEED: "speed",
  DWELL: "dwell",
  GATE: "gate",
  EDGE: "edge",
});

const INPUT_SOURCE_TYPES = Object.freeze(["pointer", "keyboard", "clock", "mediapipe", "iannix", "midi", "serial", "websocket", "osc-websocket", "virtual"]);
const SPACE_PROCESSORS = new Set([PROCESSOR_TYPES.MIDPOINT, PROCESSOR_TYPES.DELTA]);
const EVENT_PROCESSORS = new Set([PROCESSOR_TYPES.CURVE_CROSS, PROCESSOR_TYPES.REGION, PROCESSOR_TYPES.THRESHOLD, PROCESSOR_TYPES.EDGE]);

const cleanString = (value, fallback = "") => String(value ?? "").trim() || fallback;
const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};
const pointInRect = (point, rect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
const orientation = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const segmentsIntersect = (a, b, c, d) => orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);
const normalizePoints = value => (Array.isArray(value) ? value : []).map(point => ({ x: Number(point?.x ?? point?.[0]), y: Number(point?.y ?? point?.[1]) })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

const processorLabel = type => ({
  [PROCESSOR_TYPES.CURVE_CROSS]: "Curve crossing",
  [PROCESSOR_TYPES.REGION]: "Enter / leave region",
  [PROCESSOR_TYPES.THRESHOLD]: "Threshold event",
  [PROCESSOR_TYPES.DISTANCE]: "Distance",
  [PROCESSOR_TYPES.MIDPOINT]: "Midpoint",
  [PROCESSOR_TYPES.DELTA]: "Delta",
  [PROCESSOR_TYPES.MAP]: "Map value",
  [PROCESSOR_TYPES.COMBINE]: "Combine values",
  [PROCESSOR_TYPES.FILTER]: "Filter / envelope",
  [PROCESSOR_TYPES.VELOCITY]: "Velocity",
  [PROCESSOR_TYPES.SPEED]: "Speed",
  [PROCESSOR_TYPES.DWELL]: "Dwell",
  [PROCESSOR_TYPES.GATE]: "Gate",
  [PROCESSOR_TYPES.EDGE]: "Value edge",
}[type] || "Processor");

export const processorPrimaryKind = type => (
  SPACE_PROCESSORS.has(type) ? "space" : EVENT_PROCESSORS.has(type) ? "event" : "value"
);

export const normalizeStreamProcessor = value => {
  const source = value && typeof value === "object" ? value : {};
  const type = Object.values(PROCESSOR_TYPES).includes(source.type) ? source.type : PROCESSOR_TYPES.THRESHOLD;
  const id = cleanString(source.id, `stream_processor_${crypto.randomUUID()}`);
  const inputs = source.inputs && typeof source.inputs === "object" ? source.inputs : {};
  const region = source.region && typeof source.region === "object" ? source.region : {};
  const threshold = source.threshold && typeof source.threshold === "object" ? source.threshold : {};
  const transform = source.transform && typeof source.transform === "object" ? source.transform : {};
  const filter = source.filter && typeof source.filter === "object" ? source.filter : {};
  const motion = source.motion && typeof source.motion === "object" ? source.motion : {};
  const gate = source.gate && typeof source.gate === "object" ? source.gate : {};
  const primarySourceId = cleanString(source.sourceId || inputs.a);
  const legacyEvent = EVENT_PROCESSORS.has(type);
  const outputId = cleanString(source.outputId, `${legacyEvent ? "stream_event" : "stream_value"}_${id}`);
  return {
    version: 2,
    id,
    name: cleanString(source.name, processorLabel(type)),
    type,
    enabled: source.enabled !== false,
    // sourceId stays as a compatibility alias for version-one graph records.
    sourceId: primarySourceId,
    targetId: cleanString(source.targetId),
    inputs: {
      a: primarySourceId,
      b: cleanString(inputs.b || source.secondaryId),
      reset: cleanString(inputs.reset || source.resetStreamId),
    },
    outputId,
    eventOutputId: cleanString(source.eventOutputId, legacyEvent ? outputId : `stream_event_${id}`),
    curve: normalizePoints(source.curve),
    region: {
      x: clamp(region.x, -1_000_000, 1_000_000, 0),
      y: clamp(region.y, -1_000_000, 1_000_000, 0),
      width: clamp(region.width, 0, 1_000_000, 1),
      height: clamp(region.height, 0, 1_000_000, 1),
    },
    threshold: {
      rising: clamp(threshold.rising, -1_000_000, 1_000_000, 0.75),
      falling: clamp(threshold.falling, -1_000_000, 1_000_000, 0.25),
    },
    transform: {
      inputMin: clamp(transform.inputMin, -1_000_000, 1_000_000, 0),
      inputMax: clamp(transform.inputMax, -1_000_000, 1_000_000, 1),
      outputMin: clamp(transform.outputMin, -1_000_000, 1_000_000, 0),
      outputMax: clamp(transform.outputMax, -1_000_000, 1_000_000, 1),
      invert: transform.invert === true,
      clamp: transform.clamp !== false,
      scale: clamp(transform.scale, -1_000_000, 1_000_000, 1),
      offset: clamp(transform.offset, -1_000_000, 1_000_000, 0),
      operator: ["add", "subtract", "multiply", "divide", "min", "max", "and", "or"].includes(transform.operator) ? transform.operator : "add",
    },
    filter: {
      mode: filter.mode === "envelope" ? "envelope" : "smoothing",
      smoothingMs: clamp(filter.smoothingMs, 0, 60_000, 40),
      attackMs: clamp(filter.attackMs, 0, 60_000, 40),
      releaseMs: clamp(filter.releaseMs, 0, 60_000, 120),
    },
    motion: {
      dwellMs: clamp(motion.dwellMs, 0, 60_000, 350),
      radius: clamp(motion.radius, 0, 1_000_000, 8),
    },
    gate: {
      comparator: ["active", "above", "below"].includes(gate.comparator) ? gate.comparator : "active",
      rising: clamp(gate.rising ?? threshold.rising, -1_000_000, 1_000_000, 0.75),
      falling: clamp(gate.falling ?? threshold.falling, -1_000_000, 1_000_000, 0.25),
      debounceMs: clamp(gate.debounceMs, 0, 60_000, 0),
      missingGraceMs: clamp(gate.missingGraceMs, 0, 60_000, 120),
      mode: ["momentary", "toggle", "reset"].includes(gate.mode) ? gate.mode : "momentary",
    },
  };
};

export const normalizeInputSource = value => {
  const source = value && typeof value === "object" ? value : {};
  const type = INPUT_SOURCE_TYPES.includes(source.type) ? source.type : "virtual";
  const fields = Array.isArray(source.fields) ? source.fields.map(field => ({ name: cleanString(field?.name), path: cleanString(field?.path), kind: ["space", "value", "event", "time"].includes(field?.kind) ? field.kind : "value" })).filter(field => field.name) : [];
  const mediaMode = ["position", "value", "active"].includes(source.mediaMode) ? source.mediaMode : "position";
  const defaultKind = type === "pointer" ? "space" : type === "clock" ? "time" : type === "keyboard" ? "event" : type === "mediapipe" ? (mediaMode === "position" ? "space" : "value") : "value";
  return {
    version: 2,
    id: cleanString(source.id, `input_source_${crypto.randomUUID()}`),
    name: cleanString(source.name, type === "mediapipe" ? "MediaPipe feature" : type === "osc-websocket" ? "OSC WebSocket" : type === "websocket" ? "WebSocket JSON" : type === "serial" ? "Serial" : type === "midi" ? "MIDI" : type === "clock" ? "Clock" : type === "pointer" ? "Pointer" : "Virtual stream"),
    type,
    enabled: source.enabled !== false,
    streamId: cleanString(source.streamId, `input_${source.id || crypto.randomUUID()}`),
    roles: ["input", "output"],
    kind: ["space", "time", "value", "event", "image"].includes(source.kind) ? source.kind : defaultKind,
    portId: cleanString(source.portId),
    endpoint: cleanString(source.endpoint),
    protocol: source.protocol === "osc-json" ? "osc-json" : "json",
    serial: { mode: source.serial?.mode === "delimited" ? "delimited" : "json-lines", delimiter: cleanString(source.serial?.delimiter, ","), baudRate: Math.round(clamp(source.serial?.baudRate, 300, 4_000_000, 115200)) },
    fields,
    featureId: cleanString(source.featureId),
    targetId: cleanString(source.targetId),
    mediaMode,
    metadata: source.metadata && typeof source.metadata === "object" ? structuredClone(source.metadata) : {},
  };
};

export const normalizeStreamGraph = value => {
  const source = value && typeof value === "object" ? value : {};
  const sourceIds = new Set();
  const sources = (Array.isArray(source.sources) ? source.sources : []).map(normalizeInputSource).filter(input => !sourceIds.has(input.id) && sourceIds.add(input.id));
  const ids = new Set();
  const processors = (Array.isArray(source.processors) ? source.processors : []).map(normalizeStreamProcessor).filter(processor => !ids.has(processor.id) && ids.add(processor.id));
  return { version: STREAM_GRAPH_VERSION, sources, processors };
};

const samplePosition = sample => {
  const point = sample?.position || sample?.scene || null;
  const x = Number(point?.x); const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, ...(Number.isFinite(Number(point?.z)) ? { z: Number(point.z) } : {}) } : null;
};
const sampleIsAvailable = sample => Boolean(sample) && sample.available !== false;
const sampleScalar = sample => {
  if (typeof sample?.value === "boolean") return sample.value ? 1 : 0;
  if (sample?.value !== null && sample?.value !== undefined && Number.isFinite(Number(sample.value))) return Number(sample.value);
  if (typeof sample?.value?.active === "boolean") return sample.value.active ? 1 : 0;
  if (Number.isFinite(Number(sample?.value?.value))) return Number(sample.value.value);
  if (typeof sample?.data?.active === "boolean") return sample.data.active ? 1 : 0;
  return null;
};
const sampleActive = sample => {
  if (typeof sample?.value === "boolean") return sample.value;
  if (typeof sample?.value?.active === "boolean") return sample.value.active;
  if (typeof sample?.data?.active === "boolean") return sample.data.active;
  const scalar = sampleScalar(sample);
  return scalar === null ? false : scalar > 0;
};
const sampleTime = (sample, fallback) => Number.isFinite(Number(sample?.time)) ? Number(sample.time) : fallback;
const processorInputs = processor => [...new Set([processor.inputs?.a || processor.sourceId, processor.inputs?.b, processor.inputs?.reset].filter(Boolean))];

/** Runtime-only control graph evaluator. Definitions persist; samples and state do not. */
export class StreamGraphRuntime {
  constructor({ registry, graph = null, now = () => performance.now() } = {}) {
    if (!registry) throw new Error("StreamGraphRuntime requires a stream registry.");
    this.registry = registry;
    this.now = now;
    this.states = new Map();
    this.graph = normalizeStreamGraph(graph);
    this.unsubscribe = registry.subscribe(detail => this.#handle(detail));
    this.#syncOutputs();
  }

  dispose() { this.unsubscribe?.(); this.unsubscribe = null; }
  setGraph(graph) { this.graph = normalizeStreamGraph(graph); this.states.clear(); this.#syncOutputs(); return this.graph; }
  snapshot() { return structuredClone(this.graph); }

  #syncOutputs() {
    const desired = new Set();
    this.graph.processors.forEach(processor => {
      const kind = processorPrimaryKind(processor.type);
      desired.add(processor.outputId);
      this.#ensureOutput(processor.outputId, processor.name, kind, processor, "primary");
      if (!EVENT_PROCESSORS.has(processor.type) && processor.eventOutputId) {
        desired.add(processor.eventOutputId);
        this.#ensureOutput(processor.eventOutputId, `${processor.name} edges`, "event", processor, "events");
      }
    });
    this.registry.list().filter(stream => stream.metadata?.processorId && !desired.has(stream.id)).forEach(stream => this.registry.remove(stream.id));
  }

  #ensureOutput(id, name, kind, processor, output) {
    const current = this.registry.get(id);
    this.registry.register({
      id, name, kind, capabilities: [kind], roles: ["input", "output"], writable: false,
      metadata: { ...(current?.metadata || {}), processorId: processor.id, processorType: processor.type, processorOutput: output },
    });
  }

  #emit(processor, sample, transition, scene = null, extra = {}) {
    const payload = Object.freeze({ processorId: processor.id, processorType: processor.type, sourceId: processor.sourceId, targetId: processor.targetId || null, scene, transition, phase: transition, timestamp: sampleTime(sample, this.now()), sampleId: sample?.id || null, ...extra });
    this.registry.publish(processor.eventOutputId, { kind: "event", time: payload.timestamp, value: payload, data: payload }, { internal: true });
  }

  #publishValue(processor, sample, value, data = {}) {
    this.registry.publish(processor.outputId, { kind: "value", value, time: sampleTime(sample, this.now()), data: { processorId: processor.id, ...data } }, { internal: true });
  }

  #publishSpace(processor, sample, point, space = "normalized", data = {}) {
    this.registry.publish(processor.outputId, { kind: "space", ...point, space, time: sampleTime(sample, this.now()), data: { processorId: processor.id, ...data } }, { internal: true });
  }

  #input(id) { return id ? this.registry.get(id)?.snapshot?.() || null : null; }
  #state(id) { const current = this.states.get(id) || {}; this.states.set(id, current); return current; }

  #handle(detail) {
    if (detail?.type !== "sample") return;
    const streamId = detail.stream?.id;
    const sample = detail.sample;
    if (!streamId) return;
    this.graph.processors.filter(processor => processor.enabled && processorInputs(processor).includes(streamId)).forEach(processor => this.#evaluate(processor, streamId, sample));
  }

  #evaluate(processor, changedStreamId, changedSample) {
    const source = this.#input(processor.inputs.a || processor.sourceId);
    const secondary = this.#input(processor.inputs.b);
    const reset = this.#input(processor.inputs.reset);
    const state = this.#state(processor.id);
    const now = sampleTime(changedSample, this.now());
    const point = samplePosition(source);
    const secondPoint = samplePosition(secondary);

    if (processor.type === PROCESSOR_TYPES.REGION && point && sampleIsAvailable(source)) {
      const inside = pointInRect(point, processor.region);
      if (state.inside !== undefined && inside !== state.inside) this.#emit(processor, source, inside ? "enter" : "leave", point);
      state.inside = inside; return;
    }
    if (processor.type === PROCESSOR_TYPES.CURVE_CROSS && point && sampleIsAvailable(source)) {
      const crossed = state.point && processor.curve.slice(1).some((curvePoint, index) => segmentsIntersect(state.point, point, processor.curve[index], curvePoint));
      if (crossed) this.#emit(processor, source, "cross", point);
      state.point = point; return;
    }
    if (processor.type === PROCESSOR_TYPES.THRESHOLD) {
      const scalar = sampleScalar(source);
      if (scalar === null) return;
      const active = state.active === true ? scalar > processor.threshold.falling : scalar >= processor.threshold.rising;
      if (state.active !== undefined && active !== state.active) this.#emit(processor, source, active ? "rising" : "falling", point);
      state.active = active; return;
    }
    if (processor.type === PROCESSOR_TYPES.DISTANCE && point && secondPoint) {
      this.#publishValue(processor, changedSample, Math.hypot(point.x - secondPoint.x, point.y - secondPoint.y), { a: point, b: secondPoint }); return;
    }
    if (processor.type === PROCESSOR_TYPES.MIDPOINT && point && secondPoint) {
      this.#publishSpace(processor, changedSample, { x: (point.x + secondPoint.x) / 2, y: (point.y + secondPoint.y) / 2 }, source?.space || "normalized", { a: point, b: secondPoint }); return;
    }
    if (processor.type === PROCESSOR_TYPES.DELTA && point && secondPoint) {
      this.#publishSpace(processor, changedSample, { x: point.x - secondPoint.x, y: point.y - secondPoint.y }, "vector", { a: point, b: secondPoint }); return;
    }
    if (processor.type === PROCESSOR_TYPES.MAP) {
      const value = sampleScalar(source); if (value === null) return;
      const inputRange = Math.max(1e-9, processor.transform.inputMax - processor.transform.inputMin);
      let mapped = (value - processor.transform.inputMin) / inputRange;
      if (processor.transform.invert) mapped = 1 - mapped;
      if (processor.transform.clamp) mapped = Math.min(1, Math.max(0, mapped));
      mapped = (processor.transform.outputMin + mapped * (processor.transform.outputMax - processor.transform.outputMin)) * processor.transform.scale + processor.transform.offset;
      this.#publishValue(processor, source, mapped, { input: value }); return;
    }
    if (processor.type === PROCESSOR_TYPES.COMBINE) {
      const a = sampleScalar(source); const b = sampleScalar(secondary); if (a === null || b === null) return;
      const op = processor.transform.operator;
      const value = op === "subtract" ? a - b : op === "multiply" ? a * b : op === "divide" ? a / (Math.abs(b) < 1e-9 ? 1e-9 : b) : op === "min" ? Math.min(a, b) : op === "max" ? Math.max(a, b) : op === "and" ? Number(Boolean(a) && Boolean(b)) : op === "or" ? Number(Boolean(a) || Boolean(b)) : a + b;
      this.#publishValue(processor, changedSample, value, { a, b, operator: op }); return;
    }
    if (processor.type === PROCESSOR_TYPES.FILTER) {
      const value = sampleScalar(source); if (value === null) return;
      const elapsed = Math.max(0, now - (state.time || now));
      const previous = Number.isFinite(state.value) ? state.value : value;
      const duration = processor.filter.mode === "envelope" ? (value > previous ? processor.filter.attackMs : processor.filter.releaseMs) : processor.filter.smoothingMs;
      const alpha = duration <= 0 ? 1 : 1 - Math.exp(-elapsed / duration);
      state.value = previous + (value - previous) * alpha; state.time = now;
      this.#publishValue(processor, source, state.value, { input: value, mode: processor.filter.mode }); return;
    }
    if ((processor.type === PROCESSOR_TYPES.VELOCITY || processor.type === PROCESSOR_TYPES.SPEED) && point) {
      const previous = state.point; const elapsed = Math.max(1, now - (state.time || now));
      state.point = point; state.time = now; if (!previous) return;
      const vector = { x: (point.x - previous.x) / (elapsed / 1000), y: (point.y - previous.y) / (elapsed / 1000) };
      this.#publishValue(processor, changedSample, Math.hypot(vector.x, vector.y), { vector, unit: "per-second" }); return;
    }
    if (processor.type === PROCESSOR_TYPES.DWELL && point) {
      if (!state.point || Math.hypot(point.x - state.point.x, point.y - state.point.y) > processor.motion.radius) { state.point = point; state.startedAt = now; state.active = false; }
      const active = now - (state.startedAt || now) >= processor.motion.dwellMs;
      if (active && !state.active) this.#emit(processor, changedSample, "dwell", point);
      state.active = active; this.#publishValue(processor, changedSample, active, { durationMs: now - (state.startedAt || now), point }); return;
    }
    if (processor.type === PROCESSOR_TYPES.EDGE) {
      const active = sampleActive(source);
      if (state.active !== undefined && active !== state.active) this.#emit(processor, source, active ? "rising" : "falling", point);
      state.active = active; return;
    }
    if (processor.type === PROCESSOR_TYPES.GATE) {
      const resetId = reset?.id;
      const resetTriggered = Boolean(reset && resetId !== state.lastResetId && (reset.kind === "event" || sampleActive(reset)));
      if (resetId) state.lastResetId = resetId;
      let desired = false;
      if (sampleIsAvailable(source)) {
        state.lastAvailableAt = now;
        const scalar = sampleScalar(source);
        desired = processor.gate.comparator === "active" ? sampleActive(source) : scalar === null ? false : (processor.gate.comparator === "below" ? (state.condition ? scalar <= processor.gate.falling : scalar <= processor.gate.rising) : (state.condition ? scalar >= processor.gate.falling : scalar >= processor.gate.rising));
      } else desired = Boolean(state.condition && now - (state.lastAvailableAt || 0) <= processor.gate.missingGraceMs);
      if (desired !== state.condition) {
        if (state.pending !== desired) { state.pending = desired; state.pendingAt = now; }
        if (now - state.pendingAt >= processor.gate.debounceMs) { state.condition = desired; state.pending = undefined; }
      } else state.pending = undefined;
      const rising = state.condition === true && state.previousCondition !== true;
      state.previousCondition = state.condition;
      let active = Boolean(state.active);
      if (processor.gate.mode === "momentary") active = Boolean(state.condition);
      else if (processor.gate.mode === "toggle" && rising) active = !active;
      else if (processor.gate.mode === "reset") { if (resetTriggered) active = false; else if (rising) active = true; }
      if (active !== state.active) this.#emit(processor, changedSample, active ? "open" : "close", point, { mode: processor.gate.mode });
      state.active = active;
      this.#publishValue(processor, changedSample, active, { active, condition: Boolean(state.condition), mode: processor.gate.mode });
    }
  }
}

export const STREAM_PROCESSOR_TYPES = PROCESSOR_TYPES;
export const STREAM_INPUT_SOURCE_TYPES = INPUT_SOURCE_TYPES;
