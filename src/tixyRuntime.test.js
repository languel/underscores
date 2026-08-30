import test from "node:test";
import assert from "node:assert/strict";
import {
  compileTixySource,
  evaluateTixyValue,
  resolveTixyGrid,
  TIXY_DEFAULT_SOURCE,
  TIXY_GRID_SIZE,
  tixyGridExtent,
  validateTixySource,
} from "./tixyRuntime.js";

test("compiles the canonical Tixy expression and evaluates t, i, x, and y", () => {
  const compiled = compileTixySource("0.1 * t + i / 1000 + x / 100 + y / 1000");
  assert.ok(Math.abs(evaluateTixyValue(compiled, { time: 2, index: 7, x: 3, y: 4, bridge: {} }) - 0.241) < 1e-12);
});

test("accepts Tixy arrow functions and longer function bodies", () => {
  const arrow = compileTixySource("(t, i, x, y) => sin(t) + (x === y ? 1 : -1)");
  assert.equal(evaluateTixyValue(arrow, { time: 0, index: 0, x: 2, y: 2, bridge: {} }), 1);
  const body = compileTixySource("if (x > 7) return sin(t); return cos(t);");
  assert.equal(evaluateTixyValue(body, { time: 0, index: 0, x: 9, y: 0, bridge: {} }), 0);
});

test("supports compact Math names and clamps non-finite or oversized values", () => {
  const compiled = compileTixySource("sqrt(x*x+y*y) + missingValue");
  assert.equal(evaluateTixyValue(compiled, { time: 0, index: 0, x: 1, y: 1, bridge: {} }), 0);
  const oversized = compileTixySource("2");
  assert.equal(evaluateTixyValue(oversized, { time: 0, index: 0, x: 0, y: 0, bridge: {} }), 1);
  assert.equal(evaluateTixyValue(compileTixySource("-2"), { time: 0, index: 0, x: 0, y: 0, bridge: {} }), -1);
});

test("validates blank and malformed source without throwing", () => {
  assert.equal(validateTixySource(TIXY_DEFAULT_SOURCE).valid, true);
  assert.match(TIXY_DEFAULT_SOURCE, /@param gridSize/);
  assert.match(TIXY_DEFAULT_SOURCE, /@param color1/);
  assert.match(TIXY_DEFAULT_SOURCE, /@param color0/);
  assert.match(TIXY_DEFAULT_SOURCE, /@param backgroundColor = transparent/);
  assert.equal(validateTixySource("").valid, false);
  assert.equal(validateTixySource("(t, i, x, y) =>").valid, false);
});

test("keeps the original 16 by 16 grid dimensions", () => {
  assert.equal(TIXY_GRID_SIZE, 16);
  assert.equal(tixyGridExtent(), 271);
});

test("resolves square, rectangular, and bounded Tixy grids from optional parameters", () => {
  assert.deepEqual(resolveTixyGrid({}), { width: 16, height: 16 });
  assert.deepEqual(resolveTixyGrid({ gridSize: 20 }), { width: 20, height: 20 });
  assert.deepEqual(resolveTixyGrid({ gridSize: [16, 20] }), { width: 16, height: 20 });
  assert.deepEqual(resolveTixyGrid({ gridSize: [12] }), { width: 12, height: 12 });
  assert.deepEqual(resolveTixyGrid({ gridSize: "12x8" }), { width: 12, height: 8 });
  assert.deepEqual(resolveTixyGrid({ gridSize: 20, gridWidth: 4, gridHeight: 70 }), { width: 4, height: 64 });
  assert.deepEqual(resolveTixyGrid({ gridSize: { width: 10, height: 6 } }), { width: 10, height: 6 });
});
