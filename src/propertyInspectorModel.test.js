import test from "node:test";
import assert from "node:assert/strict";
import { getInspectableCustomData } from "./propertyInspectorModel.js";

test("raw properties retain canonical physics and score custom data", () => {
  const customData = getInspectableCustomData({
    physics: { bodyType: "dynamic", collider: { kind: "chain" } },
    score: { role: "curve" },
    draweratorPhysics: { bodyType: "fixed" },
    iannix: { role: "trigger" },
    draweratorSvg: { source: "<svg/>" },
    userValue: 7,
  });
  assert.deepEqual(customData.physics, { bodyType: "dynamic", collider: { kind: "chain" } });
  assert.deepEqual(customData.score, { role: "curve" });
  assert.equal(customData.draweratorPhysics, undefined);
  assert.equal(customData.iannix, undefined);
  assert.equal(customData.draweratorSvg, undefined);
  assert.equal(customData.userValue, 7);
});

test("legacy role data remains inspectable until a canonical record is present", () => {
  const customData = getInspectableCustomData({
    draweratorPhysics: { bodyType: "fixed" },
    iannix: { role: "curve" },
  });
  assert.deepEqual(customData.draweratorPhysics, { bodyType: "fixed" });
  assert.deepEqual(customData.iannix, { role: "curve" });
});
