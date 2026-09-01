import test from "node:test";
import assert from "node:assert/strict";
import { filterDocumentationEntries, normalizeDocumentationFontSize } from "./documentationPanelModel.js";
import { HELP_TOPICS } from "./helpTopics.js";

test("documentation font size remains within the readable control range", () => {
  assert.equal(normalizeDocumentationFontSize(8), 10);
  assert.equal(normalizeDocumentationFontSize(17.6), 18);
  assert.equal(normalizeDocumentationFontSize(42), 24);
  assert.equal(normalizeDocumentationFontSize(null), 12);
  assert.equal(normalizeDocumentationFontSize("not-a-number"), 12);
});

test("documentation search matches every term across metadata and prose", () => {
  const entries = [
    { id: "physics", title: "Physics mappings", body: "Connect collision speed to MIDI", tags: ["sound"] },
    { id: "p5", title: "p5 Livecode", summary: "Draw a sketch" },
  ];
  assert.deepEqual(filterDocumentationEntries(entries, "physics midi").map(entry => entry.id), ["physics"]);
  assert.deepEqual(filterDocumentationEntries(entries, "sound speed").map(entry => entry.id), ["physics"]);
  assert.deepEqual(filterDocumentationEntries(entries, "missing"), []);
});

test("script quick-reference links resolve to one documentation page", () => {
  const titles = [
    "SVG quick reference",
    "p5 quick reference",
    "GLSL quick reference",
    "Play Core quick reference",
    "Orca quick reference",
    "Score quick reference",
    "Brush quick reference",
    "Media streams quick reference",
    "Strudel quick reference",
    "Manim quick reference",
    "Markdown quick reference",
    "LaTeX quick reference",
    "HTML quick reference",
    "Tixy quick reference",
  ];
  for (const title of titles) {
    assert.equal(filterDocumentationEntries(HELP_TOPICS, title).filter(entry => entry.title === title).length, 1, title);
  }
});

test("Livecode compositing guide is searchable by controls and Fluid emission", () => {
  assert.ok(filterDocumentationEntries(HELP_TOPICS, "livecode layer blend").some(entry => entry.id === "livecode-compositing"));
  assert.deepEqual(filterDocumentationEntries(HELP_TOPICS, "fluid emission geometry").map(entry => entry.id), ["livecode-compositing", "script-glsl"]);
});
