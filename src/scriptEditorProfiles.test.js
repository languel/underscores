import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIPT_EDITOR_PROFILES,
  getScriptEditorCompletions,
  getScriptEditorProfile,
} from "./scriptEditorProfiles.js";

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

test("unknown editor profiles use the Brush contract", () => {
  assert.equal(getScriptEditorProfile("unknown"), SCRIPT_EDITOR_PROFILES.brush);
});
