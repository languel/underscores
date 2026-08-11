import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIPT_EDITOR_PROFILES,
  getScriptEditorCompletions,
  getScriptEditorProfile,
} from "./scriptEditorProfiles.js";
import { getIannixCommandAtSourcePosition } from "./iannixCommandReference.js";

test("every script adapter has one editor language profile", () => {
  assert.deepEqual(Object.keys(SCRIPT_EDITOR_PROFILES), ["brush", "iannix", "p5", "play", "livecode", "strudel", "markdown", "latex", "orca", "shader", "html", "svg"]);
  assert.equal(getScriptEditorProfile("brush").language, "javascript");
  assert.equal(getScriptEditorProfile("iannix").language, "javascript");
  assert.equal(getScriptEditorProfile("p5").language, "javascript");
  assert.equal(getScriptEditorProfile("play").language, "javascript");
  assert.equal(getScriptEditorProfile("strudel").language, "javascript");
  assert.equal(getScriptEditorProfile("markdown").language, "plain");
  assert.equal(getScriptEditorProfile("shader").language, "plain");
  assert.equal(getScriptEditorProfile("html").language, "html");
  assert.equal(getScriptEditorProfile("svg").language, "html");
});

test("script editor profiles expose runtime-aware completions", () => {
  assert.ok(getScriptEditorCompletions("brush").some(item => item.label === "points"));
  assert.ok(getScriptEditorCompletions("iannix").some(item => item.label === "setpointat"));
  assert.ok(getScriptEditorCompletions("p5").some(item => item.label === "drawerator.canvas"));
  assert.ok(getScriptEditorCompletions("p5").some(item => item.label === "__.transport"));
  assert.ok(getScriptEditorCompletions("play").some(item => item.label === "drawerator.params"));
  assert.ok(getScriptEditorCompletions("play").some(item => item.label === "__.params"));
  assert.ok(getScriptEditorCompletions("strudel").some(item => item.label === "note"));
  assert.ok(getScriptEditorCompletions("markdown").some(item => item.label === "inline math"));
  assert.ok(getScriptEditorCompletions("shader").some(item => item.label === "u_resolution"));
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
