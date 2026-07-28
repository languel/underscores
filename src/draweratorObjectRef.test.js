import test from "node:test";
import assert from "node:assert/strict";
import {
  draweratorObjectRefKey,
  elementObjectRef,
  migrateLegacyCurveReference,
  normalizeDraweratorObjectRef,
  sameDraweratorObjectRef,
  svgNodeObjectRef,
} from "./draweratorObjectRef.js";

test("normalizes native and SVG node references", () => {
  assert.deepEqual(normalizeDraweratorObjectRef("curve-a"), elementObjectRef("curve-a"));
  assert.deepEqual(
    normalizeDraweratorObjectRef({ kind: "svg-node", elementId: "svg-a", nodeId: "path-a", subpathId: 2 }),
    svgNodeObjectRef("svg-a", "path-a", "2"),
  );
  assert.equal(draweratorObjectRefKey(svgNodeObjectRef("svg-a", "path-a", "2")), "svg-node:svg-a:path-a:2");
  assert.equal(sameDraweratorObjectRef("curve-a", elementObjectRef("curve-a")), true);
});

test("migrates curveId while retaining backward-compatible serialization", () => {
  const migrated = migrateLegacyCurveReference({ curveId: "curve-a", followTangent: true });
  assert.equal(migrated.curveId, "curve-a");
  assert.deepEqual(migrated.curveRef, elementObjectRef("curve-a"));
});
