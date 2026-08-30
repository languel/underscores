// Manim scenes are disposable runtime state, but presentation controls need a
// small read-only way to ask whether a mounted node is waiting at a cue. Keep
// that query outside React so Playlist, shortcuts, and future remotes can use
// the shared command path without persisting renderer or promise state.
const runtimes = new Map();

export const registerManimRuntime = (elementId, runtime) => {
  const id = String(elementId || "");
  if (!id || !runtime || typeof runtime.getPendingCue !== "function") return () => {};
  runtimes.set(id, runtime);
  return () => {
    if (runtimes.get(id) === runtime) runtimes.delete(id);
  };
};

export const getPendingManimCue = elementId => {
  const id = String(elementId || "");
  const runtime = runtimes.get(id);
  if (!runtime) return null;
  try {
    const cue = runtime.getPendingCue();
    return cue ? { elementId: id, cue } : null;
  } catch {
    return null;
  }
};

export const findPendingManimCue = elementIds => {
  for (const elementId of Array.isArray(elementIds) ? elementIds : []) {
    const pending = getPendingManimCue(elementId);
    if (pending) return pending;
  }
  return null;
};

export const clearManimRuntimes = () => runtimes.clear();
