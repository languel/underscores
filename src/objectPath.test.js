import assert from "node:assert/strict";
import test from "node:test";
import { objectPathForElement, objectPathForId, objectReferenceFromPath } from "./objectPath.js";

test("formats canonical canvas object paths", () => {
  assert.equal(objectPathForId("curve-1"), '__.canvas.get("curve-1")');
  assert.equal(objectPathForElement({ id: "with space" }), '__.canvas.get("with space")');
});

test("unwraps quoted canvas and object paths for lookup", () => {
  assert.equal(objectReferenceFromPath('__.canvas.get("curve-1")'), "curve-1");
  assert.equal(objectReferenceFromPath("__.objects.get('curve-2')"), "curve-2");
  assert.equal(objectReferenceFromPath("Main curve"), "Main curve");
});
