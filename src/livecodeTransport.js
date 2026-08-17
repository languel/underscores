// Linked livecode follows the shared score transport. Free livecode keeps its
// own clock and remains runnable even while the score is paused.
export const isLivecodeTransportPlaying = (transportMode, transport) => (
  transportMode === "free" || Boolean(transport?.playing)
);
