import test from "node:test";
import assert from "node:assert/strict";
import { DOCUMENTATION_SECTIONS, documentationTopicSection, filterDocumentationEntries, normalizeDocumentationFontSize } from "./documentationPanelModel.js";
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
    "Three.js quick reference",
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

test("every reference topic lands in a rendered table-of-contents section", () => {
  const known = new Set(DOCUMENTATION_SECTIONS);
  for (const topic of HELP_TOPICS) {
    const section = documentationTopicSection(topic);
    assert.ok(known.has(section), `${topic.id} maps to unlisted section ${section}`);
  }
  // A section the panel never renders would silently hide its pages.
  const used = new Set(HELP_TOPICS.map(documentationTopicSection));
  for (const section of DOCUMENTATION_SECTIONS) {
    assert.ok(used.has(section), `section ${section} has no topics`);
  }
});

test("Getting started leads the contents and covers the first-session path", () => {
  assert.equal(DOCUMENTATION_SECTIONS[0], "Getting started");
  const ids = HELP_TOPICS.filter(topic => documentationTopicSection(topic) === "Getting started").map(topic => topic.id);
  assert.deepEqual(ids, [
    "start-underscores",
    "start-first-session",
    "start-canvas",
    "start-panels",
    "start-commands",
    "start-keyboard",
    "start-canvas-shortcuts",
    "start-patches",
    "start-teaching",
  ]);
});

test("the introductory page uses the Underscores sketch language", () => {
  const topic = HELP_TOPICS.find(entry => entry.id === "start-underscores");
  assert.equal(topic?.title, "What is _underscores_");
  assert.match(topic?.body || "", /^_Underscores_ is an infinite creative computation canvas for performance, teaching, exploration and research\./);
  assert.match(topic?.body || "", /single canvas _sketch_/);
});

test("Canvas shortcuts help is a dedicated Getting started page", () => {
  const topic = HELP_TOPICS.find(entry => entry.id === "start-canvas-shortcuts");
  assert.equal(topic?.title, "Canvas shortcuts");
  assert.equal(documentationTopicSection(topic), "Getting started");
  assert.match(topic?.body || "", /Press \? on the canvas/);
  assert.match(topic?.body || "", /Open the Command Palette/);
  assert.match(topic?.body || "", /Alt\+Shift\+- or >/);
  assert.match(topic?.body || "", /\| Area \| Shortcut \| Action \|/);
});

test("the three priority areas each have a conceptual page set, not one placeholder", () => {
  const bySection = section => HELP_TOPICS.filter(topic => documentationTopicSection(topic) === section);
  for (const section of ["Livecode", "Physics", "Timeline"]) {
    const topics = bySection(section);
    assert.ok(topics.length >= 7, `${section} has only ${topics.length} pages`);
    for (const topic of topics) {
      // Placeholder pages were one or two sentences with no paragraph breaks.
      assert.ok(topic.body.includes("\n\n"), `${topic.id} is still a single-paragraph stub`);
      assert.ok(topic.body.length >= 400, `${topic.id} is too thin at ${topic.body.length} characters`);
      assert.ok(topic.keywords.split(/\s+/).length >= 6, `${topic.id} needs searchable keywords`);
    }
  }
});

test("priority-area pages are reachable by the words a learner would type", () => {
  const find = query => filterDocumentationEntries(HELP_TOPICS, query).map(entry => entry.id);
  assert.ok(find("getting started first session").includes("start-first-session"));
  assert.ok(find("livecode auto update keep last frame").includes("livecode-lifecycle"));
  assert.ok(find("free linked clock quantize").includes("livecode-clock"));
  assert.ok(find("physics collision layers matrix").includes("physics-layers"));
  assert.ok(find("physics live pose reset apply").includes("physics-pose"));
  assert.ok(find("timeline bar beat sixteenth tempo").includes("timeline-time"));
  assert.ok(find("arrangement clip trim stretch").includes("timeline-clips"));
  assert.ok(find("clip lanes tracks drag history").includes("timeline-clip-lanes"));
  assert.ok(find("livecode scoped clock local clip time").includes("livecode-clock"));
});

test("topic ids are unique so the contents cannot render a duplicate row", () => {
  const ids = HELP_TOPICS.map(topic => topic.id);
  assert.equal(new Set(ids).size, ids.length);
});
