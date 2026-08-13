import test from "node:test";
import assert from "node:assert/strict";
import { buildHtmlSandboxDocument, getMarkdownSourceBlocks, highlightMarkdownCode, renderMarkdownWithMath, sanitizeMarkdownHtml, validateMarkdownSource } from "./livecodePresentation.js";

test("Markdown renders inline math while discarding active markup", () => {
  const html = renderMarkdownWithMath("# score\n\n$E = mc^2$ <script>alert(1)</script>");
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /script/i);
  assert.equal(sanitizeMarkdownHtml('<a href="javascript:alert(1)" onclick="x()">x</a>'), "<a>x</a>");
});

test("Markdown fenced code blocks use language-aware preview highlighting", () => {
  const html = renderMarkdownWithMath("```js\nconst answer = console.log(42);\n```\n\n```python\n# note\nprint(42)\n```");
  assert.match(html, /livecode-markdown-code-block/);
  assert.match(html, /livecode-code-keyword[^>]*>const/);
  assert.match(html, /livecode-code-builtin[^>]*>console/);
  assert.match(html, /language-python/);
  assert.match(html, /livecode-code-comment[^>]*># note/);
  assert.match(html, /livecode-code-builtin[^>]*>print/);
  assert.match(highlightMarkdownCode("const value = '<safe>';", "js"), /&lt;safe&gt;/);
});

test("Markdown source blocks preserve the exact document for in-place editing", () => {
  const source = "# Heading\n\nParagraph with **weight**.\n\n- one\n- two\n";
  const blocks = getMarkdownSourceBlocks(source);
  assert.equal(blocks.map(block => block.source).join(""), source);
  assert.equal(blocks.length, 3);
  assert.deepEqual({ type: blocks[0].type, depth: blocks[0].depth }, { type: "heading", depth: 1 });
  assert.deepEqual(validateMarkdownSource(blocks[1].source), { valid: true, error: "" });
});

test("HTML node documents are opaque-origin sandbox documents with token bridge", () => {
  const document = buildHtmlSandboxDocument({
    source: "<script>window.ran = true</script>",
    token: "node-token",
    appearance: {
      theme: "dark",
      currentColor: "#d4d4d4",
      colors: { foreground: { css: "#d4d4d4" }, canvas: { css: "#1e1e1e" } },
    },
  });
  assert.match(document, /underscoreLivecode/);
  assert.match(document, /node-token/);
  assert.match(document, /window\.ran = true/);
  assert.match(document, /<base target="_blank">/);
  assert.match(document, /color-scheme:dark/);
  assert.match(document, /color:#d4d4d4/);
  assert.match(document, /background:#1e1e1e/);
});
