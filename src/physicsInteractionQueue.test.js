import assert from "node:assert/strict";
import test from "node:test";
import { createPhysicsInteractionQueue } from "./physicsInteractionQueue.js";

test("a grab that starts during a physics graph rebuild is replayed in pointer order", () => {
  const queue = createPhysicsInteractionQueue();
  const messages = [
    { type: "grab.constraint", systemId: "world", constraintId: "rope" },
    { type: "grab.move", systemId: "world", point: [30, 40] },
    { type: "grab.commit", systemId: "world" },
  ];

  for (const message of messages) assert.equal(queue.defer(message, null), true);
  assert.equal(queue.defer({ type: "play", systemId: "world" }, null), false);
  assert.deepEqual(queue.drain(), messages);
  assert.deepEqual(queue.drain(), []);
});

test("a later graph rebuild discards deferred interactions for its predecessor", () => {
  const queue = createPhysicsInteractionQueue();
  queue.defer({ type: "grab.constraint", systemId: "world", constraintId: "rope" }, null);
  queue.reset();
  assert.deepEqual(queue.drain(), []);
});
