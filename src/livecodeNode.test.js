import test from "node:test";
import assert from "node:assert/strict";
import {
  LIVECODE_KINDS,
  createLivecodeNode,
  getLivecodeFont,
  getLivecodeEditorProfile,
  isLivecodeNodeElement,
  normalizeLivecodeNode,
  patchLivecodeNode,
  shouldRenderLivecodeNode,
} from "./livecodeNode.js";

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
  assert.deepEqual(node.runtime, { running: false, enabled: false, transportMode: "linked", settings: {} });
  assert.deepEqual(node.typography, {
    font: "mono",
    fontSize: 72,
    lineHeight: 0.8,
    fontWeight: 400,
    letterSpacing: -2,
    showLineNumbers: false,
    showFoldGutter: false,
    codeOverlayOpacity: 0,
    glyphOnlyOverlay: true,
  });
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

test("detects scene nodes and maps their source to established CodeMirror profiles", () => {
  const element = { id: "node", customData: { draweratorLivecode: { kind: "html" } } };
  assert.equal(isLivecodeNodeElement(element), true);
  assert.equal(shouldRenderLivecodeNode(element), true);
  assert.equal(shouldRenderLivecodeNode({ ...element, customData: { ...element.customData, outlinerHidden: true } }), false);
  assert.equal(getLivecodeEditorProfile({ kind: "html" }), "html");
  assert.equal(getLivecodeEditorProfile({ kind: "orca" }), "orca");
  assert.match(getLivecodeFont("mono").family, /Fira Mono/);
  assert.match(getLivecodeFont("sans").family, /Inter/);
});
