const runtimeSources = new Map();
const runtimeResults = new Map();
const semanticFrames = new Map();
let semanticDescriptors = [];
const sessionFiles = new Map();
const listeners = new Set();
const semanticListeners = new Map();
const segmentationConsumers = new Map();
const SESSION_FILE_DB_NAME = "underscores_media_files_v1";
const SESSION_FILE_STORE_NAME = "files";
let sessionFileDbPromise = null;
const sessionFileOverrides = new Set();

const publish = detail => {
  listeners.forEach(listener => listener(detail));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("underscores:media-stream-runtime", { detail }));
  }
};

export const subscribeMediaStreamRuntime = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const expireSegmentationConsumer = elementId => {
  const entry = segmentationConsumers.get(elementId);
  if (!entry) return;
  const remaining = entry.expiresAt - Date.now();
  if (remaining > 0) {
    entry.timer = setTimeout(() => expireSegmentationConsumer(elementId), remaining + 8);
    return;
  }
  segmentationConsumers.delete(elementId);
  publish({ type: "segmentation-demand", elementId, requested: false });
};

export const requestMediaSegmentation = (elementId, ttlMs = 750) => {
  const id = String(elementId || "");
  if (!id) return false;
  const ttl = Math.max(100, Number(ttlMs) || 750);
  const existing = segmentationConsumers.get(id);
  if (existing) {
    existing.expiresAt = Date.now() + ttl;
    return true;
  }
  const entry = { expiresAt: Date.now() + ttl, timer: 0 };
  segmentationConsumers.set(id, entry);
  entry.timer = setTimeout(() => expireSegmentationConsumer(id), ttl + 8);
  publish({ type: "segmentation-demand", elementId: id, requested: true });
  return true;
};

export const getMediaSegmentationConsumerIds = () => new Set(segmentationConsumers.keys());

export const registerMediaRuntimeSource = (elementId, source) => {
  runtimeSources.set(elementId, source);
  publish({ type: "source", elementId, available: true });
  return () => {
    if (runtimeSources.get(elementId) !== source) return;
    runtimeSources.delete(elementId);
    publish({ type: "source", elementId, available: false });
  };
};

export const getMediaRuntimeSource = elementId => runtimeSources.get(elementId) || null;

const openSessionFileDb = () => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (sessionFileDbPromise) return sessionFileDbPromise;
  sessionFileDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(SESSION_FILE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SESSION_FILE_STORE_NAME)) request.result.createObjectStore(SESSION_FILE_STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return sessionFileDbPromise;
};

const persistSessionFile = async (elementId, file) => {
  const db = await openSessionFileDb();
  if (!db) return;
  try {
    const transaction = db.transaction(SESSION_FILE_STORE_NAME, "readwrite");
    if (file) transaction.objectStore(SESSION_FILE_STORE_NAME).put({ id: elementId, blob: file });
    else transaction.objectStore(SESSION_FILE_STORE_NAME).delete(elementId);
  } catch {
    // IndexedDB is an optional durability layer; the in-memory URL remains usable.
  }
};

const hydrateSessionFiles = async () => {
  const db = await openSessionFileDb();
  if (!db) return;
  try {
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(SESSION_FILE_STORE_NAME, "readonly").objectStore(SESSION_FILE_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    records.forEach(record => {
      if (!record?.id || !record.blob || sessionFileOverrides.has(record.id) || sessionFiles.has(record.id)) return;
      const url = URL.createObjectURL(record.blob);
      sessionFiles.set(record.id, { file: record.blob, url });
      publish({ type: "file", elementId: record.id, available: true, hydrated: true });
    });
  } catch {
    // A private or quota-restricted browser may reject IndexedDB reads.
  }
};

export const setMediaRuntimeResult = (elementId, result) => {
  runtimeResults.set(elementId, result);
  publish({ type: "result", elementId, result });
};

export const getMediaRuntimeResult = elementId => runtimeResults.get(elementId) || null;

export const clearMediaRuntimeResult = elementId => {
  runtimeResults.delete(elementId);
  semanticFrames.delete(elementId);
  publish({ type: "result", elementId, result: null });
  publishSemantic(elementId, null);
};

const publishSemantic = (elementId, frame) => {
  for (const listener of semanticListeners.get(elementId) || []) listener(frame);
  for (const listener of semanticListeners.get("*") || []) listener({ elementId, frame });
  publish({ type: "semantic-frame", elementId, frame });
};

export const setMediaSemanticFrame = (elementId, frame) => {
  if (frame) semanticFrames.set(elementId, frame);
  else semanticFrames.delete(elementId);
  publishSemantic(elementId, frame || null);
  return frame || null;
};

export const getMediaSemanticFrame = elementId => semanticFrames.get(elementId) || null;

export const setMediaStreamDescriptors = descriptors => {
  semanticDescriptors = Array.isArray(descriptors)
    ? descriptors.map(descriptor => Object.freeze({ ...descriptor }))
    : [];
  publish({ type: "semantic-descriptors", descriptors: semanticDescriptors });
};

export const subscribeMediaSemanticFrame = (elementId, listener) => {
  const key = String(elementId || "*");
  const entries = semanticListeners.get(key) || new Set();
  entries.add(listener);
  semanticListeners.set(key, entries);
  return () => {
    entries.delete(listener);
    if (!entries.size) semanticListeners.delete(key);
  };
};

const streamSnapshot = descriptor => {
  if (!descriptor) return null;
  const frame = semanticFrames.get(descriptor.id);
  return Object.freeze({
    id: descriptor.id,
    name: descriptor.name,
    kind: descriptor.kind || "holistic",
    sourceId: descriptor.sourceId || "",
    available: Boolean(frame?.available),
    updatedAt: frame?.updatedAt || 0,
    get ageMs() {
      return frame ? Math.max(0, performance.now() - frame.updatedAt) : Infinity;
    },
    feature(featureId, options = {}) {
      const feature = semanticFrames.get(descriptor.id)?.feature?.(featureId) || null;
      if (!feature || !options.space) return feature;
      return Object.freeze({ ...feature, position: feature[options.space] || feature.scene || null });
    },
    features(query) {
      return semanticFrames.get(descriptor.id)?.features?.(query) || [];
    },
    subscribe(listener) {
      return subscribeMediaSemanticFrame(descriptor.id, listener);
    },
  });
};

export const createMediaStreamsApi = () => Object.freeze({
  list() {
    return semanticDescriptors.map(descriptor => streamSnapshot(descriptor));
  },
  get(reference) {
    const query = typeof reference === "object" && reference
      ? String(reference.id || "")
      : String(reference || "").trim();
    const descriptor = semanticDescriptors.find(candidate => (
      candidate.id === query || candidate.name === query
    ));
    return streamSnapshot(descriptor);
  },
  subscribe(listener) {
    return subscribeMediaSemanticFrame("*", listener);
  },
});

export const setMediaSessionFile = (elementId, file) => {
  sessionFileOverrides.add(elementId);
  const previous = sessionFiles.get(elementId);
  if (previous?.url) URL.revokeObjectURL(previous.url);
  const entry = file ? { file, url: URL.createObjectURL(file) } : null;
  if (entry) sessionFiles.set(elementId, entry);
  else sessionFiles.delete(elementId);
  void persistSessionFile(elementId, file);
  publish({ type: "file", elementId, available: Boolean(entry) });
  return entry?.url || "";
};

export const getMediaSessionFileUrl = elementId => sessionFiles.get(elementId)?.url || "";

export const disposeMediaStreamRuntime = () => {
  sessionFiles.forEach(entry => entry?.url && URL.revokeObjectURL(entry.url));
  sessionFiles.clear();
  runtimeSources.clear();
  runtimeResults.clear();
  semanticFrames.clear();
  semanticDescriptors = [];
  semanticListeners.clear();
  segmentationConsumers.forEach(entry => clearTimeout(entry.timer));
  segmentationConsumers.clear();
  sessionFileOverrides.clear();
  publish({ type: "dispose" });
};

void hydrateSessionFiles();
