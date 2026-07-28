import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SVG_SOURCE,
  analyzeSvgSource,
  isSvgObjectElement,
  normalizeSvgObject,
  normalizeSvgScripts,
  scanSvgNodes,
  updateSvgNodeAttribute,
  updateSvgRootDocument,
} from "./svgObject.js";

test("analyzes an authored SVG document without flattening its source", () => {
  const source = `<svg viewBox="10 20 400 240"><g id="art"><path id="curve" d="M0 0 C1 2 3 4 5 6"/><circle cx="8" cy="9" r="3"/></g></svg>`;
  const result = analyzeSvgSource(source);
  assert.equal(result.valid, true);
  assert.deepEqual(result.viewBox, [10, 20, 400, 240]);
  assert.equal(result.width, 400);
  assert.equal(result.height, 240);
  assert.deepEqual(result.nodes.map(node => [node.label, node.depth]), [
    ["svg", 0],
    ["g#art", 1],
    ["path#curve", 2],
    ["circle", 2],
  ]);
  assert.equal(result.source, source);
});

test("requires a complete SVG root and falls back safely during normalization", () => {
  assert.equal(analyzeSvgSource("<path/>").valid, false);
  const normalized = normalizeSvgObject({ source: "<path/>", name: "Broken" });
  assert.equal(normalized.source, DEFAULT_SVG_SOURCE);
  assert.equal(normalized.name, "Broken");
  assert.equal(normalized.nodeCount, 2);
});

test("patches visual attributes back into the canonical SVG source", () => {
  const source = `<svg width="100" height="80"><path id="wave" fill="none"/></svg>`;
  const nodes = scanSvgNodes(source);
  const pathIndex = nodes.find(node => node.id === "wave").index;
  const withStroke = updateSvgNodeAttribute(source, pathIndex, "stroke", "#1769e0");
  assert.match(withStroke, /stroke="#1769e0"/);
  const withoutFill = updateSvgNodeAttribute(withStroke, pathIndex, "fill", "");
  assert.doesNotMatch(withoutFill, /fill=/);
  const resized = updateSvgRootDocument(withoutFill, { width: 320, height: 180, viewBox: "0 0 320 180" });
  assert.match(resized, /width="320"/);
  assert.match(resized, /height="180"/);
  assert.match(resized, /viewBox="0 0 320 180"/);
});

test("recognizes first-class SVG canvas hosts", () => {
  assert.equal(isSvgObjectElement({ customData: { draweratorSvg: {} } }), true);
  assert.equal(isSvgObjectElement({ type: "rectangle" }), false);
});

test("normalizes the local SVG script catalog without accepting broken documents", () => {
  const scripts = normalizeSvgScripts([
    { id: "wave", name: "Wave", source: DEFAULT_SVG_SOURCE, createdAt: 1, updatedAt: 2 },
    { id: "wave", name: "Duplicate id", source: DEFAULT_SVG_SOURCE },
    { id: "broken", source: "<path/>" },
  ]);
  assert.equal(scripts.length, 2);
  assert.equal(scripts[0].id, "wave");
  assert.notEqual(scripts[1].id, "wave");
  assert.equal(scripts[0].name, "Wave");
});
