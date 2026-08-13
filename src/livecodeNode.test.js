import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVECODE_KINDS,
  createLivecodeNode,
  defaultLivecodeSource,
  getLivecodeFont,
  getLivecodeEditorProfile,
  getLivecodeViewForDoubleClick,
  isLivecodeNodeElement,
  normalizeLivecodeTypography,
  normalizeLivecodeNode,
  patchLivecodeNode,
  replaceLivecodeNodeProgram,
  shouldRenderLivecodeNode,
} from "./livecodeNode.js";
import { HELLO_GLSL_FRAGMENT_SOURCE } from "./shaderLivecode.js";

test("maps Livecode double-click modifiers to explicit views", () => {
  assert.equal(getLivecodeViewForDoubleClick({}), null);
  assert.equal(getLivecodeViewForDoubleClick({ shiftKey: true }), "code");
  assert.equal(getLivecodeViewForDoubleClick({ shiftKey: true, altKey: true }), "source");
  assert.equal(getLivecodeViewForDoubleClick({ metaKey: true }), "preview");
  assert.equal(getLivecodeViewForDoubleClick({ ctrlKey: true }), "preview");
  assert.equal(getLivecodeViewForDoubleClick({ metaKey: true, shiftKey: true }), null);
});

test("creates a versioned, self-contained Livecode Node with a stable runtime contract", () => {
  const node = createLivecodeNode({
    nodeId: "node-1",
    kind: "markdown",
    name: "  Intro  ",
    source: "# Hello",
    parameters: { heading: "Hello" },
    runtime: { running: true, transportMode: "free" },
    typography: { font: "sans", fontSize: 18, lineHeight: 1.7 },
    createdAt: 1,
    updatedAt: 2,
  });
  assert.deepEqual(node, {
    version: 1,
    nodeId: "node-1",
    kind: "markdown",
    name: "Intro",
    source: "# Hello",
    parameters: { heading: "Hello" },
    runtime: { running: true, enabled: true, transportMode: "free", settings: {} },
    view: "code",
    typography: {
      font: "sans",
      fontSize: 18,
      lineHeight: 1.7,
      fontWeight: 400,
      letterSpacing: 0,
      ligatures: true,
      showLineNumbers: false,
      showFoldGutter: false,
      codeOverlayOpacity: 0,
      glyphOnlyOverlay: true,
    },
    revision: 0,
    createdAt: 1,
    updatedAt: 2,
  });
});

test("normalization keeps unsupported values bounded and preserves authored source", () => {
  const node = normalizeLivecodeNode({
    nodeId: "test",
    kind: "unknown",
    source: "  raw source  ",
    runtime: { transportMode: "invalid", enabled: false, settings: [] },
    typography: { font: "nope", fontSize: 900, lineHeight: 0.1, fontWeight: 900, letterSpacing: -9 },
  });
  assert.equal(node.kind, LIVECODE_KINDS.strudel);
  assert.equal(node.source, "  raw source  ");
  assert.equal(node.view, "code");
  assert.deepEqual(node.runtime, { running: false, enabled: false, transportMode: "linked", settings: {} });
  assert.deepEqual(node.typography, {
    font: "mono",
    fontSize: 72,
    lineHeight: 0.8,
    fontWeight: 400,
    letterSpacing: -2,
    ligatures: true,
    showLineNumbers: false,
    showFoldGutter: false,
    codeOverlayOpacity: 0,
    glyphOnlyOverlay: true,
  });
});

test("supports raw Code mode while retaining legacy code-overlay values", () => {
  assert.equal(createLivecodeNode({ kind: "shader", view: "source" }).view, "source");
  assert.equal(createLivecodeNode({ kind: "shader", view: "overlay" }).view, "code");
});

test("Strudel nodes always use the in-code visualization surface", () => {
  const node = createLivecodeNode({ kind: "strudel", view: "split" });
  assert.equal(node.view, "code");
  assert.equal(node.runtime.transportMode, "linked");
  assert.equal(createLivecodeNode({ kind: "strudel", view: "preview" }).view, "code");
  assert.equal(createLivecodeNode({ kind: "strudel", runtime: { transportMode: "linked" } }).runtime.transportMode, "linked");
  assert.equal(createLivecodeNode({ kind: "strudel", runtime: { transportMode: "free" } }).runtime.transportMode, "free");
  assert.equal(patchLivecodeNode({ kind: "strudel" }, { view: "split" }).view, "code");
});

test("running legacy Strudel nodes snapshot their active source before draft edits", () => {
  const node = createLivecodeNode({
    kind: "strudel",
    source: "s(\"bd\")",
    runtime: { running: true },
  });
  assert.equal(node.runtime.settings.evaluatedSource, "s(\"bd\")");
  assert.equal(node.runtime.settings.evaluationRevision, 0);
  const edited = patchLivecodeNode(node, { source: "s(\"hh\")" });
  assert.equal(edited.source, "s(\"hh\")");
  assert.equal(edited.runtime.settings.evaluatedSource, "s(\"bd\")");
});

test("patches retain node identity, source ownership, and bump the document revision", () => {
  const initial = createLivecodeNode({ nodeId: "node-1", kind: "p5", source: "function draw() {}", revision: 4 });
  const patched = patchLivecodeNode(initial, {
    source: "function draw() { background(0); }",
    runtime: { running: true },
    typography: { fontSize: 16 },
  });
  assert.equal(patched.nodeId, "node-1");
  assert.equal(patched.source, "function draw() { background(0); }");
  assert.equal(patched.revision, 5);
  assert.equal(patched.runtime.running, true);
  assert.equal(patched.typography.fontSize, 16);
});

test("runtime start and stop patches preserve the authored view", () => {
  const node = createLivecodeNode({ kind: "p5", view: "split", runtime: { running: false } });
  assert.equal(patchLivecodeNode(node, { runtime: { running: true } }).view, "split");
  assert.equal(patchLivecodeNode({ ...node, runtime: { ...node.runtime, running: true } }, { runtime: { running: false } }).view, "split");
});

test("runtime setting patches preserve the last evaluated Strudel source", () => {
  const initial = createLivecodeNode({
    kind: "strudel",
    source: "s(\"bd\")",
    runtime: {
      running: true,
      settings: {
        evaluatedSource: "s(\"hh\")",
        evaluationRevision: 2,
        syncTransport: false,
      },
    },
  });
  const patched = patchLivecodeNode(initial, {
    runtime: { settings: { syncTransport: true } },
  });
  assert.equal(patched.runtime.settings.evaluatedSource, "s(\"hh\")");
  assert.equal(patched.runtime.settings.evaluationRevision, 2);
  assert.equal(patched.runtime.settings.syncTransport, true);
});

test("replacing a node program retargets its canonical adapter and clears incompatible state", () => {
  const initial = createLivecodeNode({
    nodeId: "node-1",
    kind: "strudel",
    name: "Beat",
    source: "s(\"bd\")",
    parameters: { gain: 0.8 },
    runtime: {
      running: true,
      transportMode: "free",
      settings: { evaluatedSource: "s(\"bd\")", syncTransport: true },
    },
    revision: 4,
  });
  const replaced = replaceLivecodeNodeProgram(initial, {
    kind: "p5",
    name: "Orbit",
    source: "function draw() { circle(10, 10, 10); }",
    runtimeSettings: { mode: "global" },
  });
  assert.equal(replaced.nodeId, "node-1");
  assert.equal(replaced.kind, LIVECODE_KINDS.p5);
  assert.equal(replaced.name, "Orbit");
  assert.equal(replaced.source, "function draw() { circle(10, 10, 10); }");
  assert.deepEqual(replaced.parameters, {});
  assert.deepEqual(replaced.runtime, {
    running: true,
    enabled: true,
    transportMode: "free",
    settings: { mode: "global" },
  });
  assert.equal(replaced.revision, 5);
});

test("replacing a same-kind program preserves its host settings and parameters", () => {
  const initial = createLivecodeNode({
    kind: "p5",
    name: "Original",
    source: "p.draw = () => {};",
    parameters: { speed: 2 },
    runtime: { settings: { fps: 24, transparent: false, mode: "instance" } },
  });
  const replaced = replaceLivecodeNodeProgram(initial, {
    kind: "p5",
    source: "function draw() {}",
    runtimeSettings: { mode: "global" },
  });
  assert.equal(replaced.name, "Original");
  assert.deepEqual(replaced.parameters, { speed: 2 });
  assert.deepEqual(replaced.runtime.settings, {
    fps: 24,
    transparent: false,
    mode: "global",
  });
});

test("detects scene nodes and maps their source to established CodeMirror profiles", () => {
  const element = { id: "node", customData: { underscoreLivecode: { kind: "html" } } };
  assert.equal(isLivecodeNodeElement(element), true);
  assert.equal(shouldRenderLivecodeNode(element), true);
  assert.equal(shouldRenderLivecodeNode({ ...element, customData: { ...element.customData, outlinerHidden: true } }), false);
  assert.equal(getLivecodeEditorProfile({ kind: "html" }), "html");
  assert.equal(getLivecodeEditorProfile({ kind: "orca" }), "orca");
  assert.equal(getLivecodeEditorProfile({ kind: "shader" }), "shader");
  assert.match(getLivecodeFont("mono").family, /Fira Mono/);
  assert.match(getLivecodeFont("sans").family, /Inter/);
  assert.match(getLivecodeFont("monaspace-neon").family, /Monaspace Neon/);
  assert.equal(getLivecodeFont("monaspace-neon").supportsLigatures, true);
  assert.match(getLivecodeFont("monaspace-neon").featureSettings, /"ss01" 1/);
  assert.equal(normalizeLivecodeTypography({ font: "monaspace-neon", ligatures: false }).ligatures, false);
});

test("shader nodes expose the editable Hello GLSL starter without injecting it into blank generic nodes", () => {
  assert.equal(defaultLivecodeSource(LIVECODE_KINDS.shader), HELLO_GLSL_FRAGMENT_SOURCE);
  assert.equal(createLivecodeNode({ kind: LIVECODE_KINDS.shader }).source, "");
});
