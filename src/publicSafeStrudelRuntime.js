// Deliberately tiny adapter used by the student/public-safe bundle. The full
// native Strudel runtime remains available in local development, but its
// AGPL code and network sample loading are not included in this artifact.
const unavailable = () => Promise.reject(new Error("Strudel is omitted from this student build."));

const runtime = Object.freeze({
  unlock: unavailable,
  upsert: unavailable,
  remove: async () => {},
  setTransport: () => {},
  setNodeTransportMode: () => {},
  registerFrameCanvas: () => () => {},
  setFrameCanvasActive: () => {},
  subscribeVisuals: (_nodeId, listener) => {
    listener?.({ status: "Unavailable", error: "Strudel is omitted from this student build." });
    return () => {};
  },
});

export const getStrudelRuntimeManager = () => runtime;
