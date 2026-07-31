const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};
const cleanString = (value, fallback = "") => String(value ?? "").trim() || fallback;

export const BRUSH_DESTINATIONS = Object.freeze({
  SCENE: "scene",
  VIEWPORT: "viewport",
  TARGET: "target",
});

const normalizeRange = (value, fallback) => {
  const source = value && typeof value === "object" ? value : {};
  const min = clamp(source.min, -1_000_000, 1_000_000, fallback.min);
  const max = clamp(source.max, -1_000_000, 1_000_000, fallback.max);
  return { min: Math.min(min, max - 0.000001), max: Math.max(max, min + 0.000001), auto: source.auto !== false, invert: source.invert === true, clamp: source.clamp !== false, scale: clamp(source.scale, -1000, 1000, 1), offset: clamp(source.offset, -1_000_000, 1_000_000, 0) };
};

const normalizeDebug = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    overlay: source.overlay === true,
    values: source.values !== false,
    gate: source.gate !== false,
    trail: source.trail !== false,
  };
};

export const normalizeBrushChannel = value => {
  const source = value && typeof value === "object" ? value : {};
  const destination = Object.values(BRUSH_DESTINATIONS).includes(source.destination?.kind) ? source.destination.kind : BRUSH_DESTINATIONS.SCENE;
  return {
    version: 1,
    id: cleanString(source.id, `brush_channel_${crypto.randomUUID()}`),
    name: cleanString(source.name, "Brush channel"),
    enabled: source.enabled !== false,
    nativePointer: source.nativePointer === true,
    spatialStreamId: cleanString(source.spatialStreamId),
    gateStreamId: cleanString(source.gateStreamId),
    pressureStreamId: cleanString(source.pressureStreamId),
    gate: {
      comparator: ["active", "above", "below"].includes(source.gate?.comparator) ? source.gate.comparator : "active",
      threshold: clamp(source.gate?.threshold, -1_000_000, 1_000_000, 0.5),
    },
    range: {
      x: normalizeRange(source.range?.x, { min: 0, max: 1 }),
      y: normalizeRange(source.range?.y, { min: 0, max: 1 }),
      pressure: normalizeRange(source.range?.pressure, { min: 0, max: 1 }),
    },
    destination: {
      kind: destination,
      targetId: cleanString(source.destination?.targetId),
    },
    style: {
      strokeColor: cleanString(source.style?.strokeColor),
      strokeWidth: clamp(source.style?.strokeWidth, 1, 32, 2),
      opacity: clamp(source.style?.opacity, 0, 100, 100),
    },
    debug: normalizeDebug(source.debug),
  };
};

export const DEFAULT_BRUSH_CHANNELS = Object.freeze([
  Object.freeze(normalizeBrushChannel({ id: "brush_pointer", name: "Pointer", nativePointer: true, spatialStreamId: "pointer", destination: { kind: "scene" } })),
]);

export const normalizeBrushChannels = value => {
  const ids = new Set();
  const channels = (Array.isArray(value) ? value : []).map(normalizeBrushChannel).filter(channel => !ids.has(channel.id) && ids.add(channel.id));
  return channels.length ? channels : DEFAULT_BRUSH_CHANNELS.map(channel => structuredClone(channel));
};

export const mapBrushAxis = (value, range) => {
  let normalized = (Number(value) - range.min) / (range.max - range.min);
  if (range.invert) normalized = 1 - normalized;
  if (range.clamp) normalized = Math.min(1, Math.max(0, normalized));
  return normalized * range.scale + range.offset;
};

export const mapBrushPoint = (point, channel, destination, sourceSpace = "scene") => {
  if (channel.destination.kind === BRUSH_DESTINATIONS.SCENE && sourceSpace === "scene" && channel.range.x.auto && channel.range.y.auto) {
    return { x: Number(point.x), y: Number(point.y) };
  }
  const x = mapBrushAxis(point.x, channel.range.x);
  const y = mapBrushAxis(point.y, channel.range.y);
  if (channel.destination.kind === BRUSH_DESTINATIONS.SCENE) {
    return destination ? { x: destination.x + x * destination.width, y: destination.y + y * destination.height } : { x, y };
  }
  if (!destination) return null;
  if (channel.destination.kind === BRUSH_DESTINATIONS.VIEWPORT) {
    return { x: destination.x + x * destination.width, y: destination.y + y * destination.height };
  }
  const localX = x * destination.width;
  const localY = y * destination.height;
  const angle = Number(destination.angle) || 0;
  const centerX = destination.x + destination.width / 2;
  const centerY = destination.y + destination.height / 2;
  const offsetX = localX - destination.width / 2;
  const offsetY = localY - destination.height / 2;
  return {
    x: centerX + offsetX * Math.cos(angle) - offsetY * Math.sin(angle),
    y: centerY + offsetX * Math.sin(angle) + offsetY * Math.cos(angle),
  };
};

const scalar = sample => {
  if (typeof sample?.value === "boolean") return sample.value ? 1 : 0;
  if (Number.isFinite(Number(sample?.value))) return Number(sample.value);
  if (Number.isFinite(Number(sample?.value?.value))) return Number(sample.value.value);
  return sample?.kind === "event" ? 1 : 0;
};

const gateOpen = (sample, gate) => {
  if (!sample?.available) return false;
  const phase = String(sample?.value?.phase ?? sample?.data?.phase ?? "").toLowerCase();
  if (["end", "leave", "up", "off", "close", "closed", "false"].includes(phase)) return false;
  const value = scalar(sample);
  return gate.comparator === "below" ? value < gate.threshold : gate.comparator === "above" ? value >= gate.threshold : value > 0;
};

/**
 * Source-agnostic sessions. The host decides how preview/commit use points;
 * this class guarantees that each channel owns a separate sequence.
 */
export class BrushChannelRuntime {
  constructor({ registry, channels = [], resolveDestination = () => null, onStart = () => {}, onMove = () => {}, onEnd = () => {}, onStatus = () => {} } = {}) {
    this.registry = registry;
    this.channels = normalizeBrushChannels(channels);
    this.resolveDestination = resolveDestination;
    this.onStart = onStart;
    this.onMove = onMove;
    this.onEnd = onEnd;
    this.onStatus = onStatus;
    this.samples = new Map();
    this.sessions = new Map();
    this.trails = new Map();
    this.unsubscribe = registry?.subscribe(detail => this.#handle(detail));
  }

  setChannels(channels) {
    this.finishAll("channels-updated");
    this.channels = normalizeBrushChannels(channels);
  }

  finishAll(reason = "cancel") {
    for (const [id, session] of this.sessions) {
      this.onEnd(session, reason);
      this.sessions.delete(id);
    }
  }

  dispose() { this.finishAll("dispose"); this.unsubscribe?.(); this.unsubscribe = null; }

  #handle(detail) {
    if (detail?.type !== "sample") return;
    const streamId = detail.stream?.id;
    const sample = detail.sample;
    this.samples.set(streamId, sample);
    this.channels.forEach(channel => {
      if (channel.nativePointer) return;
      if (![channel.spatialStreamId, channel.gateStreamId, channel.pressureStreamId].includes(streamId)) return;
      const position = this.samples.get(channel.spatialStreamId);
      const status = this.#statusFor(channel, position);
      this.onStatus(status);
      // Monitoring is deliberately independent of drawing. A disarmed channel
      // remains a useful signal probe, but cannot start or commit a stroke.
      if (!channel.enabled) return;
      if (channel.gateStreamId === streamId && !status.gate.open) this.#finish(channel, "gate-closed");
      if (channel.spatialStreamId !== streamId) return;
      if (!sample?.available) {
        this.#finish(channel, "source-lost");
        return;
      }
      if (sample.kind !== "space") return;
      this.#sampleChannel(channel, sample, status);
    });
  }

  #statusFor(channel, sample) {
    const gateSample = channel.gateStreamId ? this.samples.get(channel.gateStreamId) : { available: true, value: true };
    const gate = { available: Boolean(gateSample?.available), open: gateOpen(gateSample, channel.gate), value: scalar(gateSample) };
    const positionAvailable = Boolean(sample?.available && sample.kind === "space");
    const session = this.sessions.get(channel.id);
    const destination = session?.destination || (positionAvailable ? this.resolveDestination(channel, sample) : null);
    const point = positionAvailable ? mapBrushPoint(sample.position, channel, destination, sample.space) : null;
    const pressureSample = channel.pressureStreamId ? this.samples.get(channel.pressureStreamId) : null;
    const pressure = pressureSample ? mapBrushAxis(scalar(pressureSample), channel.range.pressure) : (Number(sample?.pressure) || 0.5);
    let trail = this.trails.get(channel.id) || [];
    if (point && sample?.id !== trail.at(-1)?.sampleId) {
      trail = [...trail, { x: point.x, y: point.y, sampleId: sample.id }].slice(-36);
      this.trails.set(channel.id, trail);
    }
    return {
      id: channel.id,
      name: channel.name,
      enabled: channel.enabled,
      source: { available: positionAvailable, sample: sample || null },
      gate,
      pressure: { available: Boolean(pressureSample?.available), value: pressure },
      point,
      trail: trail.map(({ sampleId, ...point }) => point),
      time: Number(sample?.time) || Date.now(),
    };
  }

  #sampleChannel(channel, sample, status = this.#statusFor(channel, sample)) {
    if (!status.gate.open) {
      this.#finish(channel, "gate-closed");
      return;
    }
    const session = this.sessions.get(channel.id);
    const destination = session?.destination || this.resolveDestination(channel, sample);
    const point = status.point || mapBrushPoint(sample.position, channel, destination, sample.space);
    if (!point) return;
    const pressure = status.pressure.value;
    if (!session) {
      const next = { id: `brush_session_${crypto.randomUUID()}`, channel, destination, startedAt: sample.time, points: [{ ...point, pressure, time: sample.time }] };
      this.sessions.set(channel.id, next);
      this.onStart(next, next.points[0]);
      return;
    }
    const previous = session.points.at(-1);
    if (Math.hypot(previous.x - point.x, previous.y - point.y) < 0.25) return;
    const nextPoint = { ...point, pressure, time: sample.time };
    session.points.push(nextPoint);
    this.onMove(session, nextPoint);
  }

  #finish(channel, reason) {
    const session = this.sessions.get(channel.id);
    if (!session) return;
    this.sessions.delete(channel.id);
    this.onEnd(session, reason);
  }
}
