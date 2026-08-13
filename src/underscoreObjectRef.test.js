import test from "node:test";
import assert from "node:assert/strict";
import {
  underscoreObjectRefKey,
  elementObjectRef,
  migrateLegacyCurveReference,
  normalizeUnderscoreObjectRef,
  sameUnderscoreObjectRef,
  svgNodeObjectRef,
} from "./underscoreObjectRef.js";

test("normalizes native and SVG node references", () => {
  assert.deepEqual(normalizeUnderscoreObjectRef("curve-a"), elementObjectRef("curve-a"));
  assert.deepEqual(
    normalizeUnderscoreObjectRef({ kind: "svg-node", elementId: "svg-a", nodeId: "path-a", subpathId: 2 }),
    svgNodeObjectRef("svg-a", "path-a", "2"),
  );
  assert.equal(underscoreObjectRefKey(svgNodeObjectRef("svg-a", "path-a", "2")), "svg-node:svg-a:path-a:2");
  assert.equal(sameUnderscoreObjectRef("curve-a", elementObjectRef("curve-a")), true);
});

test("migrates curveId while retaining backward-compatible serialization", () => {
  const migrated = migrateLegacyCurveReference({ curveId: "curve-a", followTangent: true });
  assert.equal(migrated.curveId, "curve-a");
  assert.deepEqual(migrated.curveRef, elementObjectRef("curve-a"));
});
