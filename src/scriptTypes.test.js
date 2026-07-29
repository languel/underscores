import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCRIPT_TYPE, normalizeScriptType, SCRIPT_TYPES } from "./scriptTypes.js";

test("script type registry exposes brush, IanniX, p5, Play Core, and SVG adapters", () => {
  assert.equal(SCRIPT_TYPES.brush.label, "Brush / modifier");
  assert.equal(SCRIPT_TYPES.iannix.label, "IanniX");
  assert.equal(SCRIPT_TYPES.p5.label, "p5 sketch");
  assert.equal(SCRIPT_TYPES.play.label, "Play Core");
  assert.equal(SCRIPT_TYPES.svg.label, "SVG");
  assert.equal(normalizeScriptType("iannix"), "iannix");
  assert.equal(normalizeScriptType("play"), "play");
});

test("unknown script types fall back without corrupting stored state", () => {
  assert.equal(normalizeScriptType("future-language"), DEFAULT_SCRIPT_TYPE);
  assert.equal(normalizeScriptType(null), DEFAULT_SCRIPT_TYPE);
});
