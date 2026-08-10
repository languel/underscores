import assert from "node:assert/strict";
import test from "node:test";
import { pathColliderCapsuleGeometry } from "./rapierPhysicsCore.js";

test("path collider capsules preserve the requested visible thickness", () => {
  const geometry = pathColliderCapsuleGeometry([0, 0], [20, 0], 4, 0.01);
  assert.equal(geometry.radius * 2 / 0.01, 4);
  assert.equal((geometry.halfHeight + geometry.radius) * 2 / 0.01, 20);
  assert.deepEqual(geometry.translation, [0.1, 0]);
});
