import test from "node:test";
import assert from "node:assert/strict";
import { executeSvgStructuredCommand } from "./svgCommandApi.js";
import { prepareSvgForStructuredEditing } from "./svgDocumentModel.js";

test("structured SVG commands reject stale revisions without changing source", () => {
  const state = { source: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>`, revision: 4 };
  assert.throws(
    () => executeSvgStructuredCommand(state, "svg.node.create", { revision: 3, markup: "<circle/>" }),
    error => error.code === "SVG_STALE_REVISION",
  );
  assert.equal(state.revision, 4);
});

test("structured SVG commands patch nodes and embedded bindings", () => {
  const prepared = prepareSvgForStructuredEditing(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>`);
  const path = prepared.document.nodes.find(node => node.localName === "path");
  const state = { source: prepared.source, revision: 1 };
  const patched = executeSvgStructuredCommand(state, "svg.node.patch", {
    revision: 1,
    nodeId: path.underscoresId,
    attributes: { stroke: "red" },
  });
  assert.equal(patched.revision, 2);
  assert.match(patched.source, /stroke="red"/);
  const bound = executeSvgStructuredCommand(patched, "svg.binding.attach", {
    revision: 2,
    nodeId: path.underscoresId,
    binding: { id: "b1", target: { kind: "element", elementId: "curve-a" } },
  });
  assert.equal(bound.revision, 3);
  assert.match(bound.source, /curve-a/);
});

test("structured SVG commands patch path geometry, CSS rules, and SMIL nodes", () => {
  const prepared = prepareSvgForStructuredEditing(
    `<svg xmlns="http://www.w3.org/2000/svg"><style>.mark{fill:red}</style><path class="mark" d="M0 0L1 1"/></svg>`,
  );
  const path = prepared.document.nodes.find(node => node.localName === "path");
  const style = prepared.document.nodes.find(node => node.localName === "style");
  let state = { source: prepared.source, revision: 1 };
  state = executeSvgStructuredCommand(state, "svg.geometry.patchPath", {
    revision: 1,
    nodeId: path.underscoresId,
    d: "M0 0 C1 0 1 1 2 1",
  });
  assert.match(state.source, /C1 0 1 1 2 1/);
  state = executeSvgStructuredCommand(state, "svg.style.patchRule", {
    revision: 2,
    styleNodeId: style.underscoresId,
    selector: ".mark",
    property: "fill",
    value: "blue",
  });
  assert.match(state.source, /fill:blue/);
  state = executeSvgStructuredCommand(state, "svg.animation.upsert", {
    revision: 3,
    parentId: path.underscoresId,
    attributes: { attributeName: "opacity", values: "0;1", dur: "2s" },
  });
  assert.match(state.source, /<animate attributeName="opacity" values="0;1" dur="2s"\/>/);
});
