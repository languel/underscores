const runtimeSources = new Map();
const runtimeResults = new Map();
const semanticFrames = new Map();
let semanticDescriptors = [];
const sessionFiles = new Map();
const listeners = new Set();
const semanticListeners = new Map();

const publish = detail => {
  listeners.forEach(listener => listener(detail));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("drawerator:media-stream-runtime", { detail }));
  }
};

export const subscribeMediaStreamRuntime = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

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
  const previous = sessionFiles.get(elementId);
  if (previous?.url) URL.revokeObjectURL(previous.url);
  const entry = file ? { file, url: URL.createObjectURL(file) } : null;
  if (entry) sessionFiles.set(elementId, entry);
  else sessionFiles.delete(elementId);
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
  publish({ type: "dispose" });
};
