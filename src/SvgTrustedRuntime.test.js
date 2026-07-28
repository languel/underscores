import test from "node:test";
import assert from "node:assert/strict";
import { buildTrustedSvgRuntimeDocument } from "./svgTrustedRuntimeDocument.js";

test("trusted SVG runtime remains sandbox-oriented and network-blocked by default", () => {
  const document = buildTrustedSvgRuntimeDocument(
    `<svg xmlns="http://www.w3.org/2000/svg"><script>drawerator.emit("cue", 1)</script></svg>`,
    { allowNetwork: false },
    "token",
  );
  assert.match(document, /default-src 'none'/);
  assert.match(document, /connect-src 'none'/);
  assert.match(document, /draweratorSvgRuntime/);
  assert.match(document, /<script>drawerator\.emit/);
  assert.doesNotMatch(document, /allow-same-origin/);
});
