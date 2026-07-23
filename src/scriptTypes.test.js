import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCRIPT_TYPE, normalizeScriptType, SCRIPT_TYPES } from "./scriptTypes.js";

test("script type registry exposes brush and IanniX adapters", () => {
  assert.equal(SCRIPT_TYPES.brush.label, "Brush / modifier");
  assert.equal(SCRIPT_TYPES.iannix.label, "IanniX");
  assert.equal(normalizeScriptType("iannix"), "iannix");
});

test("unknown script types fall back without corrupting stored state", () => {
  assert.equal(normalizeScriptType("future-language"), DEFAULT_SCRIPT_TYPE);
  assert.equal(normalizeScriptType(null), DEFAULT_SCRIPT_TYPE);
});
