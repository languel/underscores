const runtimeSources = new Map();
const runtimeResults = new Map();
const sessionFiles = new Map();
const listeners = new Set();

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
  publish({ type: "result", elementId, result: null });
};

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
  publish({ type: "dispose" });
};
