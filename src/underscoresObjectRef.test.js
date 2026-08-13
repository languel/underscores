import test from "node:test";
import assert from "node:assert/strict";
import {
  underscoresObjectRefKey,
  elementObjectRef,
  migrateLegacyCurveReference,
  normalizeUnderscoresObjectRef,
  sameUnderscoresObjectRef,
  svgNodeObjectRef,
} from "./underscoresObjectRef.js";

test("normalizes native and SVG node references", () => {
  assert.deepEqual(normalizeUnderscoresObjectRef("curve-a"), elementObjectRef("curve-a"));
  assert.deepEqual(
    normalizeUnderscoresObjectRef({ kind: "svg-node", elementId: "svg-a", nodeId: "path-a", subpathId: 2 }),
    svgNodeObjectRef("svg-a", "path-a", "2"),
  );
  assert.equal(underscoresObjectRefKey(svgNodeObjectRef("svg-a", "path-a", "2")), "svg-node:svg-a:path-a:2");
  assert.equal(sameUnderscoresObjectRef("curve-a", elementObjectRef("curve-a")), true);
});

test("migrates curveId while retaining backward-compatible serialization", () => {
  const migrated = migrateLegacyCurveReference({ curveId: "curve-a", followTangent: true });
  assert.equal(migrated.curveId, "curve-a");
  assert.deepEqual(migrated.curveRef, elementObjectRef("curve-a"));
});
