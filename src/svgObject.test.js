import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SVG_SOURCE,
  analyzeSvgSource,
  getSvgHostFrame,
  isSvgObjectElement,
  makeSvgCanvasForegroundAdaptive,
  normalizeSvgObject,
  normalizeSvgScripts,
  resolveSvgCurrentColor,
  scanSvgNodes,
  svgSourceToDataUrl,
  updateSvgNodeAttribute,
  updateSvgRootDocument,
  updateStructuredSvgNodeAttribute,
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
  assert.deepEqual(result.nodes.map(node => node.parentIndex), [null, 0, 1, 1]);
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

test("structured edits assign stable node identities and embedded metadata once", () => {
  const source = `\n<svg xmlns="http://www.w3.org/2000/svg"><g><path d="M0 0L10 10"/></g></svg>\n`;
  const first = updateStructuredSvgNodeAttribute(source, 2, "stroke", "red");
  assert.match(first, /<svg[^>]+data-underscores-id=/);
  assert.match(first, /<g[^>]+data-underscores-id=/);
  assert.match(first, /<path[^>]+data-underscores-id=[^>]+stroke="red"/);
  assert.match(first, /<metadata data-underscores="v1">/);
  assert.equal(first.startsWith("\n"), true);
  assert.equal(first.endsWith("\n"), true);
  const second = updateStructuredSvgNodeAttribute(first, 2, "stroke", "blue");
  assert.equal((second.match(/data-underscores-id=/g) || []).length, 3);
  assert.equal((second.match(/data-underscores="v1"/g) || []).length, 1);
  assert.match(second, /stroke="blue"/);
});

test("recognizes first-class SVG canvas hosts", () => {
  assert.equal(isSvgObjectElement({ customData: { underscoresSvg: {} } }), true);
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

test("converts Excalidraw neutral foregrounds to theme-adaptive currentColor", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><g stroke="#1e1e1e"><path fill="#1e1e1e" d="M0 0L10 10"/><path style="fill:#121212;stroke:#1769e0" d="M0 10L10 0"/></g></svg>`;
  const adaptive = makeSvgCanvasForegroundAdaptive(source);
  assert.match(adaptive, /stroke="currentColor"/);
  assert.match(adaptive, /fill="currentColor"/);
  assert.match(adaptive, /style="fill:currentColor;stroke:#1769e0"/);
  assert.match(adaptive, /stroke:#1769e0/);
});

test("injects the live canvas foreground for currentColor without overriding authored color", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor"/></svg>`;
  const resolved = resolveSvgCurrentColor(source, "#d8dde2");
  assert.match(resolved, /<svg[^>]+color="#d8dde2"/);
  const explicit = `<svg xmlns="http://www.w3.org/2000/svg" color="#ff0000"><path fill="currentColor"/></svg>`;
  assert.equal(resolveSvgCurrentColor(explicit, "#d8dde2"), explicit);
  const dataSource = decodeURIComponent(svgSourceToDataUrl(source, { currentColor: "#d8dde2" }).split(",")[1]);
  assert.equal(dataSource, resolved);
});

test("positions an exported SVG around the selection's rotated world bounds", () => {
  assert.deepEqual(
    getSvgHostFrame([120, -80, 320, 220], [0, 0, 220, 320]),
    { x: 110, y: -90, width: 220, height: 320 },
  );
  assert.deepEqual(
    getSvgHostFrame([120, -80, 320, 220], [0, 0, 180, 260]),
    { x: 120, y: -80, width: 200, height: 300 },
  );
});
