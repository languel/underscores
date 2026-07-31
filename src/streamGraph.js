const STREAM_GRAPH_VERSION = 1;
const PROCESSOR_TYPES = Object.freeze({
  CURVE_CROSS: "curve-cross",
  REGION: "region",
  THRESHOLD: "threshold",
});
const INPUT_SOURCE_TYPES = Object.freeze(["pointer", "keyboard", "clock", "mediapipe", "iannix", "midi", "serial", "websocket", "osc-websocket", "virtual"]);

const cleanString = (value, fallback = "") => {
  const next = String(value ?? "").trim();
  return next || fallback;
};

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

const pointInRect = (point, rect) => point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

const orientation = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const segmentsIntersect = (a, b, c, d) => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC !== abD && cdA !== cdB;
};

const normalizePoints = value => (Array.isArray(value) ? value : []).map(point => ({ x: Number(point?.x ?? point?.[0]), y: Number(point?.y ?? point?.[1]) })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

export const normalizeStreamProcessor = value => {
  const source = value && typeof value === "object" ? value : {};
  const type = Object.values(PROCESSOR_TYPES).includes(source.type) ? source.type : PROCESSOR_TYPES.THRESHOLD;
  const region = source.region && typeof source.region === "object" ? source.region : {};
  const threshold = source.threshold && typeof source.threshold === "object" ? source.threshold : {};
  return {
    version: 1,
    id: cleanString(source.id, `stream_processor_${crypto.randomUUID()}`),
    name: cleanString(source.name, type === PROCESSOR_TYPES.REGION ? "Region event" : type === PROCESSOR_TYPES.CURVE_CROSS ? "Curve crossing" : "Threshold event"),
    type,
    enabled: source.enabled !== false,
    sourceId: cleanString(source.sourceId),
    targetId: cleanString(source.targetId),
    outputId: cleanString(source.outputId, `stream_event_${source.id || crypto.randomUUID()}`),
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
  };
};

export const normalizeInputSource = value => {
  const source = value && typeof value === "object" ? value : {};
  const type = INPUT_SOURCE_TYPES.includes(source.type) ? source.type : "virtual";
  const fields = Array.isArray(source.fields) ? source.fields.map(field => ({
    name: cleanString(field?.name),
    path: cleanString(field?.path),
    kind: ["space", "value", "event", "time"].includes(field?.kind) ? field.kind : "value",
  })).filter(field => field.name) : [];
  return {
    version: 1,
    id: cleanString(source.id, `input_source_${crypto.randomUUID()}`),
    name: cleanString(source.name, type === "osc-websocket" ? "OSC WebSocket" : type === "websocket" ? "WebSocket JSON" : type === "serial" ? "Serial" : type === "midi" ? "MIDI" : type === "clock" ? "Clock" : type === "pointer" ? "Pointer" : "Virtual stream"),
    type,
    enabled: source.enabled !== false,
    streamId: cleanString(source.streamId, `input_${source.id || crypto.randomUUID()}`),
    roles: ["input", "output"],
    kind: ["space", "time", "value", "event", "image"].includes(source.kind) ? source.kind : (type === "pointer" ? "space" : type === "clock" ? "time" : type === "keyboard" ? "event" : "value"),
    portId: cleanString(source.portId),
    endpoint: cleanString(source.endpoint),
    protocol: source.protocol === "osc-json" ? "osc-json" : "json",
    serial: {
      mode: source.serial?.mode === "delimited" ? "delimited" : "json-lines",
      delimiter: cleanString(source.serial?.delimiter, ","),
      baudRate: Math.round(clamp(source.serial?.baudRate, 300, 4_000_000, 115200)),
    },
    fields,
    featureId: cleanString(source.featureId),
    targetId: cleanString(source.targetId),
    metadata: source.metadata && typeof source.metadata === "object" ? structuredClone(source.metadata) : {},
  };
};

export const normalizeStreamGraph = value => {
  const source = value && typeof value === "object" ? value : {};
  const sourceIds = new Set();
  const sources = (Array.isArray(source.sources) ? source.sources : [])
    .map(normalizeInputSource)
    .filter(input => !sourceIds.has(input.id) && sourceIds.add(input.id));
  const ids = new Set();
  const processors = (Array.isArray(source.processors) ? source.processors : [])
    .map(normalizeStreamProcessor)
    .filter(processor => !ids.has(processor.id) && ids.add(processor.id));
  return { version: STREAM_GRAPH_VERSION, sources, processors };
};

const samplePosition = sample => {
  const position = sample?.position || sample?.scene || null;
  const x = Number(position?.x);
  const y = Number(position?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const sampleScalar = sample => {
  const value = sample?.value;
  if (Number.isFinite(Number(value))) return Number(value);
  if (Number.isFinite(Number(value?.value))) return Number(value.value);
  return null;
};

/** Runtime-only processor evaluator. Graph definitions persist, transitions do not. */
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

  setGraph(graph) {
    this.graph = normalizeStreamGraph(graph);
    this.states.clear();
    this.#syncOutputs();
    return this.graph;
  }

  snapshot() { return structuredClone(this.graph); }

  #syncOutputs() {
    const desired = new Set(this.graph.processors.map(item => item.outputId));
    this.graph.processors.forEach(processor => {
      const current = this.registry.get(processor.outputId);
      if (!current) this.registry.register({
        id: processor.outputId,
        name: processor.name,
        kind: "event",
        capabilities: ["event"],
        roles: ["input", "output"],
        writable: false,
        metadata: { processorId: processor.id, processorType: processor.type },
      });
    });
    this.registry.list().filter(stream => stream.metadata?.processorId && !desired.has(stream.id)).forEach(stream => this.registry.remove(stream.id));
  }

  #emit(processor, sample, transition, scene = null) {
    const payload = Object.freeze({
      processorId: processor.id,
      processorType: processor.type,
      sourceId: processor.sourceId,
      targetId: processor.targetId || null,
      scene,
      transition,
      timestamp: Number.isFinite(sample?.time) ? sample.time : this.now(),
      sampleId: sample?.id || null,
    });
    this.registry.publish(processor.outputId, { kind: "event", time: payload.timestamp, value: payload, data: payload }, { internal: true });
  }

  #handle(detail) {
    if (detail?.type !== "sample" || !detail.sample?.available) return;
    const streamId = detail.stream?.id;
    this.graph.processors.filter(processor => processor.enabled && processor.sourceId === streamId).forEach(processor => {
      const state = this.states.get(processor.id) || {};
      const point = samplePosition(detail.sample);
      if (processor.type === PROCESSOR_TYPES.REGION && point) {
        const inside = pointInRect(point, processor.region);
        if (state.inside !== undefined && inside !== state.inside) this.#emit(processor, detail.sample, inside ? "enter" : "leave", point);
        this.states.set(processor.id, { inside });
      }
      if (processor.type === PROCESSOR_TYPES.THRESHOLD) {
        const scalar = sampleScalar(detail.sample);
        if (scalar === null) return;
        const active = state.active === true
          ? scalar > processor.threshold.falling
          : scalar >= processor.threshold.rising;
        if (state.active !== undefined && active !== state.active) this.#emit(processor, detail.sample, active ? "rising" : "falling", point);
        this.states.set(processor.id, { active, scalar });
      }
      if (processor.type === PROCESSOR_TYPES.CURVE_CROSS && point) {
        const previous = state.point;
        const crossed = previous && processor.curve.slice(1).some((curvePoint, index) => segmentsIntersect(previous, point, processor.curve[index], curvePoint));
        if (crossed) this.#emit(processor, detail.sample, "cross", point);
        this.states.set(processor.id, { point });
      }
    });
  }
}

export const STREAM_PROCESSOR_TYPES = PROCESSOR_TYPES;
export const STREAM_INPUT_SOURCE_TYPES = INPUT_SOURCE_TYPES;
