import test from "node:test";
import assert from "node:assert/strict";
import { getInspectableCustomData } from "./propertyInspectorModel.js";

test("raw properties retain canonical physics and score custom data", () => {
  const customData = getInspectableCustomData({
    physics: { bodyType: "dynamic", collider: { kind: "chain" } },
    score: { role: "curve" },
    underscoresPhysics: { bodyType: "fixed" },
    iannix: { role: "trigger" },
    underscoresSvg: { source: "<svg/>" },
    userValue: 7,
  });
  assert.deepEqual(customData.physics, { bodyType: "dynamic", collider: { kind: "chain" } });
  assert.deepEqual(customData.score, { role: "curve" });
  assert.equal(customData.underscoresPhysics, undefined);
  assert.equal(customData.iannix, undefined);
  assert.equal(customData.underscoresSvg, undefined);
  assert.equal(customData.userValue, 7);
});

test("legacy role data remains inspectable until a canonical record is present", () => {
  const customData = getInspectableCustomData({
    underscoresPhysics: { bodyType: "fixed" },
    iannix: { role: "curve" },
  });
  assert.deepEqual(customData.underscoresPhysics, { bodyType: "fixed" });
  assert.deepEqual(customData.iannix, { role: "curve" });
});
