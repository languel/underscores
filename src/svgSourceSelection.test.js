import test from "node:test";
import assert from "node:assert/strict";
import {
  getSvgSelectionAtSourcePosition,
  getSvgSourceRangeForSelection,
} from "./svgSourceSelection.js";

const source = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="layer">
    <path id="compound" d="M0 0 L10 10   M20 20 C30 30 40 30 50 20"/>
  </g>
</svg>`;

test("maps an SVG node selection to its exact source range", () => {
  const range = getSvgSourceRangeForSelection(source, { nodeIndex: 1 });
  assert.equal(source.slice(range.from, range.to).startsWith("<g id=\"layer\">"), true);
  assert.equal(source.slice(range.from, range.to).endsWith("</g>"), true);
});

test("maps a compound subpath selection to only that d segment", () => {
  const range = getSvgSourceRangeForSelection(source, { nodeIndex: 2, subpathIndex: 1 });
  assert.equal(source.slice(range.from, range.to), "M20 20 C30 30 40 30 50 20");
});

test("maps a source cursor in path data back to its SVG node and subpath", () => {
  const position = source.indexOf("C30 30") + 2;
  assert.deepEqual(getSvgSelectionAtSourcePosition(source, position), {
    nodeIndex: 2,
    subpathIndex: 1,
  });
});

test("chooses the deepest SVG node at a source cursor", () => {
  const position = source.indexOf("id=\"compound\"") + 4;
  assert.deepEqual(getSvgSelectionAtSourcePosition(source, position), {
    nodeIndex: 2,
  });
});

test("returns no cross-editor selection for malformed source", () => {
  assert.equal(getSvgSelectionAtSourcePosition("<svg><path>", 8), null);
  assert.equal(getSvgSourceRangeForSelection("<svg><path>", { nodeIndex: 1 }), null);
});
