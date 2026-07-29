import test from "node:test";
import assert from "node:assert/strict";
import { buildHtmlSandboxDocument, renderMarkdownWithMath, sanitizeMarkdownHtml } from "./livecodePresentation.js";

test("Markdown renders inline math while discarding active markup", () => {
  const html = renderMarkdownWithMath("# score\n\n$E = mc^2$ <script>alert(1)</script>");
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /script/i);
  assert.equal(sanitizeMarkdownHtml('<a href="javascript:alert(1)" onclick="x()">x</a>'), "<a>x</a>");
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
  assert.match(document, /draweratorLivecode/);
  assert.match(document, /node-token/);
  assert.match(document, /window\.ran = true/);
  assert.match(document, /<base target="_blank">/);
  assert.match(document, /color-scheme:dark/);
  assert.match(document, /color:#d4d4d4/);
  assert.match(document, /background:#1e1e1e/);
});
