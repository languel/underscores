const DEFERRED_INTERACTION_TYPES = new Set([
  "grab",
  "grab.constraint",
  "grab.move",
  "grab.commit",
  "grab.release",
]);

// A graph reload disposes the worker's current Rapier runtime before the next
// graph has finished initializing. Pointer messages received in that window
// must retain their original order or the first post-release Live-pose drag is
// silently dropped.
export const createPhysicsInteractionQueue = () => {
  const pending = [];
  return {
    defer(message, runtime) {
      if (runtime || !DEFERRED_INTERACTION_TYPES.has(message?.type)) return false;
      pending.push(message);
      return true;
    },
    drain() {
      return pending.splice(0);
    },
    reset() {
      pending.length = 0;
    },
  };
};
