import test from "node:test";
import assert from "node:assert/strict";
import { getSvgNodeStyleCascade, updateStructuredSvgStyleDeclaration } from "./svgStyleModel.js";
import { parseSvgDocument } from "./svgDocumentModel.js";

test("inspects presentation, inline, and matched stylesheet values separately", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><style>#dot { fill: var(--paint); stroke: blue }</style><circle id="dot" style="opacity:.5" stroke-width="2"/></svg>`;
  const document = parseSvgDocument(source);
  const circle = document.nodes.find(node => node.localName === "circle");
  const cascade = getSvgNodeStyleCascade(source, circle.index);
  assert.deepEqual(cascade.presentation, { "stroke-width": "2" });
  assert.deepEqual(cascade.inline, { opacity: ".5" });
  assert.equal(cascade.matchedRules[0].selector, "#dot");
  assert.equal(cascade.matchedRules[0].declarations.fill, "var(--paint)");
});

test("patches a matched CSS declaration instead of adding inline style", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><style>#dot { fill: red; }</style><circle id="dot"/></svg>`;
  const document = parseSvgDocument(source);
  const style = document.nodes.find(node => node.localName === "style");
  const patched = updateStructuredSvgStyleDeclaration(source, style.index, "#dot", "fill", "blue");
  assert.match(patched, /#dot \{ fill: blue; \}/);
  assert.doesNotMatch(patched, /<circle[^>]+style=/);
  assert.match(patched, /data-underscores-id=/);
});
