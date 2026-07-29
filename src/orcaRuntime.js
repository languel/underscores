import { parseOrcaGrid, runOrcaFrame, serializeOrcaGrid } from "./orcaEngine.js";

const normalizeSource = source => serializeOrcaGrid(parseOrcaGrid(source));

class OrcaRuntimeManager {
  constructor() {
    this.records = new Map();
  }

  ensure(nodeId, source) {
    const id = String(nodeId || "");
    let record = this.records.get(id);
    if (!record) {
      const canonicalSource = normalizeSource(source);
      record = {
        id,
        canonicalSource,
        runtimeSource: canonicalSource,
        revision: -1,
        pendingSource: null,
        frame: 0,
        running: false,
        transportMode: "linked",
        transport: { playing: false, bpm: 120 },
        onMidiEvents: null,
        listeners: new Set(),
        timer: null,
      };
      this.records.set(id, record);
    }
    return record;
  }

  snapshot(record) {
    const grid = parseOrcaGrid(record.runtimeSource);
    return { source: record.runtimeSource, frame: record.frame, width: grid.width, height: grid.height };
  }

  emit(record) {
    const snapshot = this.snapshot(record);
    record.listeners.forEach(listener => listener(snapshot));
  }

  clearTimer(record) {
    if (record.timer !== null) window.clearInterval(record.timer);
    record.timer = null;
  }

  schedule(record) {
    this.clearTimer(record);
    const active = record.running && (record.transportMode === "free" || record.transport.playing);
    if (!active || record.listeners.size === 0) return;
    const bpm = Math.max(20, Math.min(400, Number(record.transport.bpm) || 120));
    record.timer = window.setInterval(() => this.tick(record.id), Math.max(16, 60000 / bpm / 4));
  }

  upsert({ nodeId, source, revision = 0, running = false, transportMode = "linked", transport, onMidiEvents } = {}) {
    const record = this.ensure(nodeId, source);
    const nextSource = normalizeSource(source);
    const acceptsPendingSource = record.pendingSource !== null && record.pendingSource === nextSource;
    if (record.revision !== revision && !acceptsPendingSource) {
      record.canonicalSource = nextSource;
      record.runtimeSource = nextSource;
      record.frame = 0;
    }
    if (acceptsPendingSource) record.pendingSource = null;
    record.revision = revision;
    record.running = Boolean(running);
    record.transportMode = transportMode === "free" ? "free" : "linked";
    record.transport = { playing: Boolean(transport?.playing), bpm: Number(transport?.bpm) || 120 };
    record.onMidiEvents = onMidiEvents || record.onMidiEvents;
    this.schedule(record);
    this.emit(record);
    return this.snapshot(record);
  }

  subscribe(nodeId, listener) {
    const record = this.ensure(nodeId, "");
    record.listeners.add(listener);
    listener(this.snapshot(record));
    this.schedule(record);
    return () => {
      record.listeners.delete(listener);
      if (record.listeners.size === 0) {
        this.clearTimer(record);
        this.records.delete(record.id);
      }
    };
  }

  patchSource(nodeId, source) {
    const record = this.ensure(nodeId, source);
    const canonicalSource = normalizeSource(source);
    record.canonicalSource = canonicalSource;
    record.pendingSource = canonicalSource;
    record.runtimeSource = canonicalSource;
    record.frame = 0;
    this.emit(record);
    return this.snapshot(record);
  }

  tick(nodeId) {
    const record = this.records.get(String(nodeId || ""));
    if (!record) return null;
    const result = runOrcaFrame(record.runtimeSource, { frame: record.frame });
    record.runtimeSource = result.source;
    record.frame = result.frame;
    this.emit(record);
    if (result.events.length) record.onMidiEvents?.(result.events, { frame: result.frame - 1 });
    return this.snapshot(record);
  }

  dispose() {
    this.records.forEach(record => this.clearTimer(record));
    this.records.clear();
  }
}

let singleton = null;

export const getOrcaRuntimeManager = () => {
  if (!singleton) singleton = new OrcaRuntimeManager();
  return singleton;
};

export const createOrcaRuntimeManager = () => new OrcaRuntimeManager();
