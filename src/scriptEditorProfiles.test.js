import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIPT_EDITOR_PROFILES,
  getScriptEditorCompletionResult,
  getScriptEditorCompletions,
  getScriptEditorHover,
  getScriptEditorProfile,
  getScriptEditorReference,
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
  assert.ok(getScriptEditorCompletions("p5").some(item => item.label === "__.canvas"));
  assert.ok(getScriptEditorCompletions("p5").some(item => item.label === "__.transport"));
  assert.equal(getScriptEditorCompletions("play").some(item => item.label === "underscores.params"), false);
  assert.ok(getScriptEditorCompletions("play").some(item => item.label === "__.params"));
  assert.ok(getScriptEditorCompletions("strudel").some(item => item.label === "note"));
  assert.ok(getScriptEditorCompletions("markdown").some(item => item.label === "inline math"));
  assert.ok(getScriptEditorCompletions("shader").some(item => item.label === "u_resolution"));
  assert.ok(getScriptEditorCompletions("shader").some(item => item.label === "FC"));
  assert.ok(getScriptEditorCompletions("shader").some(item => item.label === "backbuffer"));
  assert.ok(getScriptEditorCompletions("shader").some(item => item.label === "hsv"));
  assert.ok(getScriptEditorCompletions("svg").some(item => item.label === "viewBox"));
});

test("p5 language service exposes signatures, contextual members, hover, and reference data", () => {
  const global = getScriptEditorCompletions("p5").find(item => item.label === "circle");
  assert.equal(global.detail, "circle(x, y, diameter)");
  assert.match(global.info, /Draws a circle/);

  const source = "p.cir";
  const member = getScriptEditorCompletionResult("p5", {
    pos: source.length,
    state: { sliceDoc: () => source },
  });
  assert.equal(member.from, 2);
  assert.ok(member.options.some(item => item.label === "circle"));
  assert.equal(member.options.some(item => item.label === "p.circle"), false);

  const globalSource = "background";
  const globalModeResult = getScriptEditorCompletionResult("p5", {
    pos: globalSource.length,
    state: { sliceDoc: () => globalSource, doc: { toString: () => globalSource } },
  }, { p5Mode: "global" });
  assert.ok(globalModeResult.options.some(item => item.label === "background"));

  const instanceSource = "background";
  const instanceModeResult = getScriptEditorCompletionResult("p5", {
    pos: instanceSource.length,
    state: { sliceDoc: () => instanceSource, doc: { toString: () => instanceSource } },
  }, { p5Mode: "instance" });
  assert.equal(instanceModeResult.options.some(item => item.label === "background"), false);

  const hover = getScriptEditorHover("p5", "circle(10, 10, 20)", 6);
  assert.equal(hover?.name, "circle");
  assert.equal(hover?.signature, "circle(x, y, diameter)");
  assert.match(hover?.referenceUrl, /p5js\.org\/reference\/p5\/circle/);
  const midWordHover = getScriptEditorHover("p5", "stroke(220);", 2);
  assert.deepEqual({ from: midWordHover?.from, to: midWordHover?.to }, { from: 0, to: 6 });
  const instanceHover = getScriptEditorHover("p5", "p.stroke(220);", 4);
  assert.deepEqual({ from: instanceHover?.from, to: instanceHover?.to }, { from: 2, to: 8 });
  assert.ok(getScriptEditorReference("p5").some(item => item.name === "createCanvas"));
});

test("Underscores bridge paths expose contextual Info-panel documentation", () => {
  const root = getScriptEditorHover("p5", "__.element.width", 0);
  assert.equal(root?.name, "__");

  const hoveredElement = getScriptEditorHover("p5", "__.element.width", 5);
  assert.equal(hoveredElement?.name, "__.element");

  const element = getScriptEditorHover("p5", "const size = __.element.width;", 18);
  assert.equal(element?.name, "__.element");
  assert.match(element?.description, /host snapshot/);

  const events = getScriptEditorHover("strudel", "__.events.latest(\"media.*\");", 0, "__.events".length);
  assert.equal(events?.name, "__.events");
  assert.match(events?.signature, /EventApi/);

  const api = getScriptEditorHover("play", "await __.api.commands.execute(\"grid.global.update\");", 13);
  assert.equal(api?.name, "__.api.commands");
  assert.match(api?.description, /public application commands/);

  assert.ok(getScriptEditorReference("strudel").some(item => item.name === "__.canvas.selected"));
});

test("Strudel language service exposes documented hover and completion metadata", () => {
  const hover = getScriptEditorHover("strudel", 'note("c3").slow(2)', 15);
  assert.equal(hover?.name, "slow");
  assert.match(hover?.referenceUrl, /strudel\.cc/);
  assert.equal(getScriptEditorHover("strudel", 'note("c3")', 2)?.name, "note");
  const note = getScriptEditorCompletions("strudel").find(item => item.label === "note");
  assert.match(note.info, /Reference: https:\/\/strudel\.cc/);
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
