// A stopped Livecode node can keep one small, in-memory copy of its last
// rendered canvas.  The scene stays lightweight: snapshots are deliberately
// not written into customData or exported scene JSON.
const snapshots = new Map();
const MAX_SNAPSHOTS = 32;

const finiteDimension = value => Math.max(0, Math.round(Number(value) || 0));

export const getLivecodeFrameSnapshot = elementId => snapshots.get(String(elementId)) || "";

export const setLivecodeFrameSnapshot = (elementId, dataUrl) => {
  const id = String(elementId || "");
  if (!id || typeof dataUrl !== "string" || !dataUrl) return false;
  snapshots.set(id, dataUrl);
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
  return true;
};

export const clearLivecodeFrameSnapshot = elementId => snapshots.delete(String(elementId));

// Read back only when a node is being stopped and the author opted into the
// thumbnail.  A bounded copy keeps the cache useful for teaching demos without
// retaining full-resolution render targets in memory.
export const captureLivecodeFrameSnapshot = (elementId, {
  root = globalThis.document,
  maxDimension = 640,
} = {}) => {
  if (!root?.querySelectorAll || !root?.createElement) return "";
  const id = String(elementId || "");
  let source = null;
  for (const host of root.querySelectorAll("[data-livecode-node-id]")) {
    if (host.getAttribute("data-livecode-node-id") !== id) continue;
    source = host.querySelector("canvas");
    break;
  }
  const width = finiteDimension(source?.width);
  const height = finiteDimension(source?.height);
  if (!source || width < 1 || height < 1 || typeof source.toDataURL !== "function") return "";
  try {
    const scale = Math.min(1, Math.max(1, Number(maxDimension) || 640) / Math.max(width, height));
    const target = root.createElement("canvas");
    target.width = Math.max(1, Math.round(width * scale));
    target.height = Math.max(1, Math.round(height * scale));
    const context = target.getContext?.("2d");
    if (!context) return "";
    context.drawImage(source, 0, 0, target.width, target.height);
    const dataUrl = target.toDataURL("image/png");
    setLivecodeFrameSnapshot(id, dataUrl);
    return dataUrl;
  } catch {
    // WebGL/cross-origin canvases may deny readback.  Stopping the node should
    // still work; it simply has no retained thumbnail for this frame.
    return "";
  }
};
