import test from "node:test";
import assert from "node:assert/strict";
import { collectShaderSceneSegments, DEFAULT_SHADER_SEGMENTS, flattenShaderSegments } from "./shaderSceneGeometry.js";

test("shader geometry maps scene objects into the node's normalized coordinate system", () => {
  const node = { id: "shader", x: 100, y: 100, width: 200, height: 100, angle: 0 };
  const rectangle = { id: "box", type: "rectangle", x: 120, y: 120, width: 40, height: 20, angle: 0 };
  assert.deepEqual(collectShaderSceneSegments([node, rectangle], node), [
    [0.1, 0.8, 0.3, 0.8],
    [0.3, 0.8, 0.3, 0.6],
    [0.3, 0.6, 0.1, 0.6],
    [0.1, 0.6, 0.1, 0.8],
  ]);
});

test("shader geometry supplies a visible fallback and fixed-size uniform buffer", () => {
  const node = { id: "shader", x: 0, y: 0, width: 100, height: 100 };
  const segments = collectShaderSceneSegments([], node);
  assert.deepEqual(segments, DEFAULT_SHADER_SEGMENTS.map(segment => [...segment]));
  const flattened = flattenShaderSegments(segments, 8);
  assert.equal(flattened.length, 32);
  [...flattened.slice(0, 4)].forEach((value, index) => {
    assert.ok(Math.abs(value - DEFAULT_SHADER_SEGMENTS[0][index]) < 1e-6);
  });
});

test("shader geometry can disable demo fallback for physical scene interaction", () => {
  const node = { id: "shader", x: 0, y: 0, width: 100, height: 100 };
  assert.deepEqual(collectShaderSceneSegments([], node, 128, { fallback: false }), []);
});
