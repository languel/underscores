import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIPT_EDITOR_PROFILES,
  getScriptEditorCompletions,
  getScriptEditorProfile,
} from "./scriptEditorProfiles.js";
import { getIannixCommandAtSourcePosition } from "./iannixCommandReference.js";

test("every script adapter has one editor language profile", () => {
  assert.deepEqual(Object.keys(SCRIPT_EDITOR_PROFILES), ["brush", "iannix", "p5", "svg"]);
  assert.equal(getScriptEditorProfile("brush").language, "javascript");
  assert.equal(getScriptEditorProfile("iannix").language, "javascript");
  assert.equal(getScriptEditorProfile("p5").language, "javascript");
  assert.equal(getScriptEditorProfile("svg").language, "html");
});

test("script editor profiles expose runtime-aware completions", () => {
  assert.ok(getScriptEditorCompletions("brush").some(item => item.label === "points"));
  assert.ok(getScriptEditorCompletions("iannix").some(item => item.label === "setpointat"));
  assert.ok(getScriptEditorCompletions("p5").some(item => item.label === "drawerator.canvas"));
  assert.ok(getScriptEditorCompletions("svg").some(item => item.label === "viewBox"));
});

test("IanniX command completions include command-specific syntax and examples", () => {
  const clear = getScriptEditorCompletions("iannix").find(item => item.label === "clear");
  const point = getScriptEditorCompletions("iannix").find(item => item.label === "setpointat");
  assert.equal(clear.detail, "clear");
  assert.match(clear.info, /Remove every score object/);
  assert.match(clear.info, /run\("clear"\)/);
  assert.equal(point.detail, "setPointAt <target> <index> <x> <y> [z] [c1x c1y c2x c2y]");
  assert.match(point.info, /cubic control handles/);
});

test("IanniX source cursor resolves the command-specific help entry", () => {
  const source = 'run("clear");\nrun("setPointAt current 1 20 30");';
  assert.equal(getIannixCommandAtSourcePosition(source, 7)?.command, "clear");
  assert.equal(getIannixCommandAtSourcePosition(source, source.length - 3)?.command, "setpointat");
});

test("unknown editor profiles use the Brush contract", () => {
  assert.equal(getScriptEditorProfile("unknown"), SCRIPT_EDITOR_PROFILES.brush);
});
