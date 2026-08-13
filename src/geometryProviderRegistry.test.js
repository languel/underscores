import test from "node:test";
import assert from "node:assert/strict";
import { createUnderscoresGeometryRegistry } from "./geometryProviderRegistry.js";
import { prepareSvgForStructuredEditing, parseSvgDocument } from "./svgDocumentModel.js";
import { svgNodeObjectRef } from "./underscoresObjectRef.js";
import { normalizeSvgObject } from "./svgObject.js";

test("resolves SVG subpaths through the same object-reference registry as native elements", () => {
  const prepared = prepareSvgForStructuredEditing(
    `<svg viewBox="0 0 100 100"><g transform="translate(10 20)"><path d="M0 0L20 10 M30 30L40 40"/></g></svg>`,
  );
  const document = parseSvgDocument(prepared.source);
  const path = document.nodes.find(node => node.localName === "path");
  const element = {
    id: "svg-host",
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    angle: 0,
    customData: { underscoresSvg: normalizeSvgObject({ source: prepared.source, revision: 1 }) },
  };
  const registry = createUnderscoresGeometryRegistry();
  const geometry = registry.resolve(svgNodeObjectRef(element.id, path.underscoresId, 0), { elements: [element] });
  assert.equal(geometry.paths.length, 1);
  // Default xMidYMid meet centers the square viewBox horizontally in the
  // 2:1 host before applying the nested SVG transform.
  assert.deepEqual(geometry.paths[0][0], [160, 220]);
  assert.deepEqual(geometry.bounds, { minX: 160, minY: 220, maxX: 180, maxY: 230 });
});
