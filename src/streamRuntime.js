const STREAM_KINDS = Object.freeze(["space", "time", "value", "event", "image", "path"]);
const STREAM_ROLES = Object.freeze(["input", "output"]);

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const cleanString = (value, fallback = "") => {
  const next = String(value ?? "").trim();
  return next || fallback;
};

const cloneData = value => {
  if (value === undefined || value === null) return value;
  // ImageData, media elements, and canvases are intentionally transient. They
  // must remain by-reference in runtime samples rather than being serialized.
  if (typeof ImageData !== "undefined" && value instanceof ImageData) return value;
  if (typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement) return value;
  if (typeof HTMLImageElement !== "undefined" && value instanceof HTMLImageElement) return value;
  if (typeof HTMLVideoElement !== "undefined" && value instanceof HTMLVideoElement) return value;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch { /* non-cloneable runtime handle */ }
  }
  return value;
};

const cleanRoles = value => {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(source.map(item => String(item).toLowerCase()).filter(item => STREAM_ROLES.includes(item)))];
};

const cleanCapabilities = (value, kind) => {
  const source = Array.isArray(value) ? value : value ? [value] : [kind];
  return [...new Set(source.map(item => String(item).toLowerCase()).filter(item => STREAM_KINDS.includes(item)))];
};

export const normalizeStreamDescriptor = (value, { requireId = true } = {}) => {
  const source = value && typeof value === "object" ? value : {};
  const kind = STREAM_KINDS.includes(source.kind) ? source.kind : "value";
  const id = cleanString(source.id, requireId ? "" : `virtual_${crypto.randomUUID()}`);
  if (requireId && !id) throw new Error("Streams require an id.");
  const roles = cleanRoles(source.roles ?? source.role ?? "output");
  return Object.freeze({
    id,
    name: cleanString(source.name, id || "Virtual stream"),
    kind,
    capabilities: cleanCapabilities(source.capabilities, kind),
    roles: roles.length ? roles : ["output"],
    writable: source.writable === true,
    virtual: source.virtual === true,
    ownerId: cleanString(source.ownerId),
    available: source.available !== false,
    metadata: cloneData(source.metadata || {}),
  });
};

export const normalizeStreamSample = (sample, descriptor = {}, time = nowMs()) => {
  const source = sample && typeof sample === "object" ? sample : {};
  const kind = STREAM_KINDS.includes(source.kind) ? source.kind : descriptor.kind || "value";
  const timestamp = Number(source.time ?? source.timestamp);
  const normalized = {
    id: cleanString(source.id, crypto.randomUUID()),
    streamId: descriptor.id || cleanString(source.streamId),
    kind,
    time: Number.isFinite(timestamp) ? timestamp : time,
    available: source.available !== false,
    value: source.value ?? null,
    data: cloneData(source.data ?? null),
  };
  if (kind === "space") {
    const position = source.position || source.scene || source.local || source.normalized || source;
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Space stream samples require finite x and y coordinates.");
    normalized.position = { x, y, ...(Number.isFinite(Number(position.z)) ? { z: Number(position.z) } : {}) };
    normalized.space = cleanString(source.space, "scene");
    normalized.pressure = Number.isFinite(Number(source.pressure)) ? Number(source.pressure) : undefined;
  }
  if (kind === "image") {
    const image = source.image ?? source.frame ?? source.value;
    if (!image) throw new Error("Image stream samples require an image frame.");
    normalized.image = image;
    normalized.width = Math.max(0, Number(source.width ?? image.width ?? image.videoWidth) || 0);
    normalized.height = Math.max(0, Number(source.height ?? image.height ?? image.videoHeight) || 0);
  }
  if (kind === "path") {
    const points = Array.isArray(source.points) ? source.points : Array.isArray(source.value) ? source.value : [];
    if (points.length < 2) throw new Error("Path stream samples require at least two points.");
    normalized.points = points.map((item, index) => {
      const x = Number(item?.x ?? item?.[0]);
      const y = Number(item?.y ?? item?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Path stream point ${index} requires finite x and y coordinates.`);
      return {
        x,
        y,
        ...(Number.isFinite(Number(item?.z)) ? { z: Number(item.z) } : {}),
        ...(Number.isFinite(Number(item?.pressure)) ? { pressure: Number(item.pressure) } : {}),
        ...(Number.isFinite(Number(item?.width)) ? { width: Number(item.width) } : {}),
        ...(item?.role ? { role: String(item.role) } : {}),
      };
    });
    normalized.space = cleanString(source.space, "scene");
    normalized.closed = source.closed === true;
    normalized.bounds = cloneData(source.bounds || null);
    normalized.style = cleanString(source.style);
    normalized.sourceId = cleanString(source.sourceId);
    const sourceTimestamp = Number(source.sourceTimestamp);
    normalized.sourceTimestamp = Number.isFinite(sourceTimestamp) ? sourceTimestamp : normalized.time;
  }
  return Object.freeze(normalized);
};

const matchesFilter = (descriptor, filter = {}) => {
  if (filter.kind && descriptor.kind !== filter.kind && !descriptor.capabilities.includes(filter.kind)) return false;
  if (filter.role && !descriptor.roles.includes(filter.role)) return false;
  if (filter.ownerId && descriptor.ownerId !== filter.ownerId) return false;
  return true;
};

/**
 * The registry contains ordinary typed streams. It deliberately keeps sample
 * frames out of scene data: descriptors can be persisted, browser handles and
 * runtime frames cannot.
 */
export class UnderscoresStreamRegistry {
  constructor({ now = nowMs } = {}) {
    this.now = now;
    this.entries = new Map();
    this.listeners = new Set();
  }

  register(descriptor) {
    const normalized = normalizeStreamDescriptor(descriptor);
    const previous = this.entries.get(normalized.id);
    this.entries.set(normalized.id, { descriptor: normalized, sample: previous?.sample || null, listeners: previous?.listeners || new Set() });
    const snapshot = this.get(normalized.id);
    this.#notify({ type: previous ? "update" : "register", stream: snapshot });
    return snapshot;
  }

  create(descriptor, ownerId = "") {
    const source = descriptor && typeof descriptor === "object" ? descriptor : {};
    const id = cleanString(source.id, `virtual_${crypto.randomUUID()}`);
    if (this.entries.has(id)) throw new Error(`A stream named ${id} already exists.`);
    return this.register({ ...source, id, virtual: true, writable: true, ownerId: ownerId || source.ownerId || "", roles: source.roles || ["input", "output"] });
  }

  update(id, patch) {
    const previous = this.entries.get(String(id));
    if (!previous) throw new Error(`Unknown stream: ${id}`);
    return this.register({ ...previous.descriptor, ...patch, id: previous.descriptor.id });
  }

  remove(id) {
    const entry = this.entries.get(String(id));
    if (!entry) return false;
    this.entries.delete(String(id));
    const detail = Object.freeze({ type: "remove", id: String(id), stream: this.#snapshotEntry(entry) });
    entry.listeners.forEach(listener => listener(null, detail));
    this.#notify(detail);
    return true;
  }

  removeOwner(ownerId) {
    const owner = String(ownerId || "");
    return [...this.entries.values()]
      .filter(entry => entry.descriptor.ownerId === owner && entry.descriptor.virtual)
      .map(entry => entry.descriptor.id)
      .filter(id => this.remove(id));
  }

  publish(id, sample, { internal = false } = {}) {
    const entry = this.entries.get(String(id));
    if (!entry) throw new Error(`Unknown stream: ${id}`);
    if (!internal && !entry.descriptor.writable) throw new Error(`Stream ${id} is read-only.`);
    const normalized = normalizeStreamSample(sample, entry.descriptor, this.now());
    entry.sample = normalized;
    const snapshot = this.#snapshotEntry(entry);
    const detail = Object.freeze({ type: "sample", stream: snapshot, sample: normalized });
    entry.listeners.forEach(listener => listener(normalized, detail));
    this.#notify(detail);
    return normalized;
  }

  get(reference) {
    const query = typeof reference === "object" && reference ? String(reference.id || "") : String(reference || "").trim();
    if (!query) return null;
    const entry = this.entries.get(query) || [...this.entries.values()].find(candidate => candidate.descriptor.name === query);
    return entry ? this.#snapshotEntry(entry) : null;
  }

  list(filter = {}) {
    return [...this.entries.values()].filter(entry => matchesFilter(entry.descriptor, filter)).map(entry => this.#snapshotEntry(entry));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStream(id, listener) {
    const entry = this.entries.get(String(id));
    if (!entry) return () => {};
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  #snapshotEntry(entry) {
    const descriptor = entry.descriptor;
    const registry = this;
    return Object.freeze({
      ...descriptor,
      sample: entry.sample,
      snapshot() { return entry.sample; },
      subscribe(listener) { return registry.subscribeStream(descriptor.id, listener); },
      write(sample) {
        if (!descriptor.virtual || !descriptor.writable) throw new Error(`Stream ${descriptor.id} is not a writable virtual stream.`);
        return registry.publish(descriptor.id, sample);
      },
    });
  }

  #notify(detail) { this.listeners.forEach(listener => listener(detail)); }
}

const createFacetedApi = (registry, mediaStreams, ownerId = "") => {
  const own = action => ownerId ? (...args) => action(...args, ownerId) : action;
  const list = filter => {
    const local = registry.list(filter);
    const media = !filter?.kind || filter.kind === "space" || filter.kind === "event"
      ? (mediaStreams?.list?.() || []).filter(stream => !filter?.role || ["input", "output"].includes(filter.role))
      : [];
    return [...media, ...local];
  };
  const get = reference => registry.get(reference) || mediaStreams?.get?.(reference) || null;
  const api = {
    list,
    get,
    create: own((descriptor, sourceOwnerId = "") => registry.create(descriptor, sourceOwnerId)),
    remove: id => registry.remove(id),
    subscribe: listener => {
      const stopRegistry = registry.subscribe(listener);
      const stopMedia = mediaStreams?.subscribe?.(detail => listener({ type: "media", detail })) || (() => {});
      return () => { stopRegistry(); stopMedia(); };
    },
    inputs: Object.freeze({ list: filter => list({ ...(filter || {}), role: "input" }) }),
    outputs: Object.freeze({ list: filter => list({ ...(filter || {}), role: "output" }) }),
  };
  return Object.freeze(api);
};

export const createUnifiedStreamsApi = ({ registry = new UnderscoresStreamRegistry(), mediaStreams = null } = {}) => {
  const root = createFacetedApi(registry, mediaStreams);
  return Object.freeze({
    ...root,
    registry,
    forOwner(ownerId) { return createFacetedApi(registry, mediaStreams, String(ownerId || "")); },
    removeOwner(ownerId) { return registry.removeOwner(ownerId); },
    publish(id, sample) { return registry.publish(id, sample, { internal: true }); },
  });
};

export const STREAM_TYPES = Object.freeze({ kinds: STREAM_KINDS, roles: STREAM_ROLES });
