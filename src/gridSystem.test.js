import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_GRID,
  createVisibleGridLines,
  gridToWorldPoint,
  gridUnitsToSeconds,
  mergeGridPatch,
  normalizeGlobalGrid,
  secondsToGridUnits,
  snapPointToGrid,
  worldToGridPoint,
} from "./gridSystem.js";

test("normalizes legacy and invalid grid values to a stable global singleton", () => {
  const grid = normalizeGlobalGrid({
    id: "wrong",
    topology: "polar",
    spacing: { x: -10, y: "nope", subdivisionsX: 500, subdivisionsY: 0 },
    snap: { mode: "maybe", thresholdPx: -5 },
  });
  assert.equal(grid.id, "global");
  assert.equal(grid.topology, "rectangular");
  assert.equal(grid.spacing.x, 1);
  assert.equal(grid.spacing.y, DEFAULT_GLOBAL_GRID.spacing.y);
  assert.equal(grid.spacing.subdivisionsX, 64);
  assert.equal(grid.spacing.subdivisionsY, 1);
  assert.equal(grid.snap.mode, "off");
});

test("world and grid transforms round-trip with non-square spacing and rotation", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    transform: { origin: [30, -10], rotation: Math.PI / 3 },
    spacing: { x: 80, y: 25 },
  });
  const world = gridToWorldPoint(grid, [2.5, -3.25]);
  const local = worldToGridPoint(grid, world);
  assert.ok(Math.abs(local[0] - 2.5) < 1e-9);
  assert.ok(Math.abs(local[1] + 3.25) < 1e-9);
});

test("hard snapping is idempotent and preserves point metadata", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    snap: { mode: "hard", resolution: "minor" },
  });
  const point = [22, 38];
  point.pressure = 0.7;
  const first = snapPointToGrid(grid, point);
  const second = snapPointToGrid(grid, first.point);
  assert.deepEqual(first.point.slice(0, 2), [20, 40]);
  assert.equal(first.point.pressure, 0.7);
  assert.deepEqual(second.point, first.point);
  assert.equal(second.snapped, false);
});

test("magnetic snapping uses a screen-pixel threshold and independent axes", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    snap: { mode: "magnetic", thresholdPx: 8, axes: "both" },
  });
  assert.deepEqual(snapPointToGrid(grid, [23, 31], { zoom: 1 }).point.slice(0, 2), [20, 31]);
  assert.deepEqual(snapPointToGrid(grid, [23, 31], { zoom: 3 }).point.slice(0, 2), [23, 31]);
  assert.deepEqual(snapPointToGrid(grid, [23, 39], { axes: "y" }).point.slice(0, 2), [23, 40]);
});

test("time mappings round-trip for meter beats, bars, frames, and custom units", () => {
  const clock = { tempo: 120, signature: { numerator: 6, denominator: 8 }, fps: 25 };
  const beatGrid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { time: { amount: 2, unit: "beat" } });
  assert.equal(gridUnitsToSeconds(3, beatGrid, clock), 1.5);
  assert.equal(secondsToGridUnits(1.5, beatGrid, clock), 3);
  assert.equal(gridUnitsToSeconds(1, mergeGridPatch(beatGrid, { time: { amount: 1, unit: "bar" } }), clock), 1.5);
  assert.equal(gridUnitsToSeconds(2, mergeGridPatch(beatGrid, { time: { amount: 5, unit: "frame" } }), clock), 0.4);
  assert.equal(gridUnitsToSeconds(2, mergeGridPatch(beatGrid, { time: { amount: 3, unit: "custom", customSeconds: 0.25 } }), clock), 1.5);
  assert.equal(gridUnitsToSeconds(2, mergeGridPatch(beatGrid, { time: { amount: 1.5, unit: "second" } }), clock), 3);
  assert.equal(gridUnitsToSeconds(4, mergeGridPatch(beatGrid, { time: { amount: 250, unit: "millisecond" } }), clock), 1);
  for (const time of [
    { amount: 3, unit: "beat" }, { amount: 2, unit: "bar" },
    { amount: 1.25, unit: "second" }, { amount: 125, unit: "millisecond" },
    { amount: 7, unit: "frame" }, { amount: 1.5, unit: "custom", customSeconds: 0.375 },
  ]) {
    const mapped = mergeGridPatch(beatGrid, { time });
    for (const changingClock of [clock, { tempo: 87, signature: { numerator: 7, denominator: 8 }, fps: 60 }]) {
      assert.ok(Math.abs(secondsToGridUnits(gridUnitsToSeconds(2.75, mapped, changingClock), mapped, changingClock) - 2.75) < 1e-9);
    }
  }
});

test("visible line generation classifies axes and caps dense viewports", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { appearance: { visible: true } });
  const lines = createVisibleGridLines(grid, { minX: -50000, minY: -50000, maxX: 50000, maxY: 50000 }, { zoom: 0.01, maxLines: 80 });
  assert.ok(lines.length <= 160);
  assert.ok(lines.some(line => line.type === "axis" && line.axis === "x"));
  assert.ok(lines.some(line => line.type === "axis" && line.axis === "y"));
});
