import test from "node:test";
import assert from "node:assert/strict";
import { parseSvgDocument } from "./svgDocumentModel.js";
import {
  getSvgNodeTransform,
  invertSvgTransform,
  parseSvgTransform,
  transformSvgPoint,
} from "./svgTransform.js";

test("parses SVG transform lists in authored order", () => {
  const matrix = parseSvgTransform("translate(10 20) scale(2)");
  assert.deepEqual(transformSvgPoint(matrix, [3, 4]), [16, 28]);
  assert.deepEqual(transformSvgPoint(invertSvgTransform(matrix), [16, 28]), [3, 4]);
});

test("composes the complete ancestor transform stack", () => {
  const analysis = parseSvgDocument(`
    <svg viewBox="0 0 100 100">
      <g transform="translate(10 20)">
        <g transform="rotate(90)">
          <path transform="scale(2)" d="M0 0 L10 10"/>
        </g>
      </g>
    </svg>
  `);
  const path = analysis.nodes.find(node => node.localName === "path");
  const matrix = getSvgNodeTransform(analysis, path);
  const point = transformSvgPoint(matrix, [5, 0]);
  assert.ok(Math.abs(point[0] - 10) < 1e-9);
  assert.ok(Math.abs(point[1] - 30) < 1e-9);
});
