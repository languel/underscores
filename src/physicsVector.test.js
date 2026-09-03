import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhysicsVector } from "./relationshipGraph.js";

test("physics vectors accept both the solver and public spellings", () => {
  // The solver reads [x, y]. An {x, y} object used to arrive as undefined
  // indices and apply nothing at all, which is invisible from a script.
  assert.deepEqual(normalizePhysicsVector({ x: 3, y: -4 }), [3, -4]);
  assert.deepEqual(normalizePhysicsVector([3, -4]), [3, -4]);
  assert.deepEqual(normalizePhysicsVector(null), [0, 0]);
  assert.deepEqual(normalizePhysicsVector({}), [0, 0]);
  assert.deepEqual(normalizePhysicsVector(["a", "b"]), [0, 0]);
});
