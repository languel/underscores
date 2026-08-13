import assert from "node:assert/strict";
import test from "node:test";
import {
  applySvgSourcePatches,
  buildSvgMetadataMirror,
  ensureSvgNodeIdentities,
  insertSvgNode,
  parseSvgDocument,
  patchSvgNodeAttribute,
  prepareSvgForStructuredEditing,
  readSvgUnderscoreMetadata,
  updateSvgNodeData,
  writeSvgUnderscoreMetadata,
} from "./svgDocumentModel.js";

const SIMPLE = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <!-- preserve this -->
  <g id="layer">
    <path d="M0 0L40 20" stroke="red"/>
  </g>
</svg>
`;

test("lossless SVG document model retains source ranges and namespaces", () => {
  const document = parseSvgDocument(SIMPLE);
  assert.equal(document.valid, true);
  assert.equal(document.root.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(document.nodes[1].parentIndex, 0);
  assert.equal(document.nodes[2].attributes.d, "M0 0L40 20");
  assert.equal(SIMPLE.slice(document.nodes[2].start, document.nodes[2].openEnd), "<path d=\"M0 0L40 20\" stroke=\"red\"/>");
});

test("source patches reject overlap and otherwise preserve untouched bytes", () => {
  assert.equal(
    applySvgSourcePatches("abcdef", [{ start: 1, end: 3, text: "X" }, { start: 5, end: 6, text: "Y" }]),
    "aXdeY",
  );
  assert.throws(
    () => applySvgSourcePatches("abcdef", [{ start: 1, end: 4, text: "" }, { start: 3, end: 5, text: "" }]),
    /overlap/,
  );
});

test("attribute patches minimally update, add, and remove attributes", () => {
  const changed = patchSvgNodeAttribute(SIMPLE, 2, "stroke", "#1769e0");
  assert.equal(changed.replace("#1769e0", "red"), SIMPLE);
  const added = patchSvgNodeAttribute(changed, 2, "stroke-width", 3);
  assert.match(added, /stroke="#1769e0" stroke-width="3"\/>/);
  const removed = patchSvgNodeAttribute(added, 2, "stroke", null);
  assert.doesNotMatch(removed, /stroke="#1769e0"/);
  assert.match(removed, /d="M0 0L40 20" stroke-width="3"/);
});

test("structured editing assigns stable private IDs without replacing authored IDs", () => {
  let nextId = 0;
  const result = ensureSvgNodeIdentities(SIMPLE, { createId: () => `node-${++nextId}` });
  assert.equal(result.changed, true);
  assert.equal(result.assigned.length, 3);
  assert.match(result.source, /id="layer" data-underscore-id="node-2"/);
  const repeated = ensureSvgNodeIdentities(result.source, { createId: () => "unused" });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.source, result.source);
});

test("embedded Underscore metadata round-trips independently of SVG markup", () => {
  const prepared = prepareSvgForStructuredEditing(SIMPLE, {
    createId: node => `node-${node.index}`,
  });
  assert.equal(prepared.document.valid, true);
  assert.match(prepared.source, /<metadata data-underscore="v1">/);

  const withData = updateSvgNodeData(prepared.source, "node-2", {
    label: "Score curve",
    iannix: { role: "curve", active: true },
  });
  const metadata = readSvgUnderscoreMetadata(withData);
  assert.equal(metadata.valid, true);
  assert.equal(metadata.nodes["node-2"].iannix.role, "curve");
  assert.match(withData, /<!-- preserve this -->/);

  const mirror = buildSvgMetadataMirror(withData, 7);
  assert.equal(mirror.sourceRevision, 7);
  assert.equal(mirror.nodes["node-2"].label, "Score curve");
});

test("metadata writer repairs a self-closing Underscore metadata node", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><metadata data-underscore="v1"/></svg>`;
  const repaired = writeSvgUnderscoreMetadata(source, {
    nodes: { a: { label: "A & B" } },
  });
  assert.match(repaired, /<metadata data-underscore="v1">\{"version":1,"nodes":\{"a":\{"label":"A &amp; B"\}\}\}<\/metadata>/);
  assert.equal(readSvgUnderscoreMetadata(repaired).nodes.a.label, "A & B");
});

test("inserting a child expands a self-closing SVG element without reserializing it", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><path id="p" d="M0 0L1 1" /></svg>`;
  const document = parseSvgDocument(source);
  const path = document.nodes.find(node => node.id === "p");
  assert.equal(
    insertSvgNode(source, path.index, `<animate attributeName="opacity" dur="1s"/>`),
    `<svg xmlns="http://www.w3.org/2000/svg"><path id="p" d="M0 0L1 1" ><animate attributeName="opacity" dur="1s"/></path></svg>`,
  );
});
