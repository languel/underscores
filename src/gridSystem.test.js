import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLOBAL_GRID,
  createVisibleGridIntersections,
  createVisibleGridLines,
  gridToWorldPoint,
  gridUnitsToSeconds,
  gridValueToWorld,
  mergeGridPatch,
  normalizeGlobalGrid,
  quantizeGridValue,
  secondsToGridUnits,
  snapPointToGrid,
  worldToGridValue,
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
  assert.equal(grid.appearance.unsnappedDots, DEFAULT_GLOBAL_GRID.appearance.unsnappedDots);
  assert.equal(normalizeGlobalGrid({ appearance: { unsnappedDots: false } }).appearance.unsnappedDots, false);
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

test("a force-hard snap uses Underscores grid coordinates even when normal snapping is off", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    transform: { origin: [13, -7], rotation: Math.PI / 4 },
    spacing: { x: 80, y: 40, subdivisionsX: 4, subdivisionsY: 2 },
    snap: { mode: "off", resolution: "minor" },
  });
  const intendedNode = gridToWorldPoint(grid, [1.25, -1.5]);
  // Keep the sample inside the same rotated local minor-grid cell.
  const nearby = gridToWorldPoint(grid, [1.32, -1.43]);
  const normal = snapPointToGrid(grid, nearby);
  const forced = snapPointToGrid(grid, nearby, { mode: "hard" });
  assert.deepEqual(normal.point.slice(0, 2), nearby);
  assert.ok(Math.abs(forced.point[0] - intendedNode[0]) < 1e-9);
  assert.ok(Math.abs(forced.point[1] - intendedNode[1]) < 1e-9);
});

test("magnetic snapping uses a screen-pixel threshold and independent axes", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    snap: { mode: "magnetic", thresholdPx: 8, axes: "both" },
  });
  assert.deepEqual(snapPointToGrid(grid, [23, 31], { zoom: 1 }).point.slice(0, 2), [20, 31]);
  assert.deepEqual(snapPointToGrid(grid, [23, 31], { zoom: 3 }).point.slice(0, 2), [23, 31]);
  assert.deepEqual(snapPointToGrid(grid, [23, 39], { axes: "y" }).point.slice(0, 2), [23, 40]);
});

test("time mappings round-trip for live musical, frame, and fixed expressions", () => {
  const clock = { tempo: 120, signature: { numerator: 6, denominator: 8 }, fps: 25, sampleRate: 48000 };
  const beatGrid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { time: { perCell: { version: 1, expression: "2 beats", fallbackSeconds: 0.5 } } });
  assert.equal(gridUnitsToSeconds(3, beatGrid, clock), 1.5);
  assert.equal(secondsToGridUnits(1.5, beatGrid, clock), 3);
  assert.equal(gridUnitsToSeconds(1, mergeGridPatch(beatGrid, { time: { perCell: "1 bar" } }), clock), 1.5);
  assert.equal(gridUnitsToSeconds(2, mergeGridPatch(beatGrid, { time: { perCell: "5 f" } }), clock), 0.4);
  assert.equal(gridUnitsToSeconds(2, mergeGridPatch(beatGrid, { time: { perCell: "0.75 s" } }), clock), 1.5);
  assert.equal(gridUnitsToSeconds(4, mergeGridPatch(beatGrid, { time: { perCell: "250 ms" } }), clock), 1);
  for (const expression of [
    "3 beats", "2 bars", "1.25 s", "125 ms", "7 f", "18000 samples",
  ]) {
    const mapped = mergeGridPatch(beatGrid, { time: { perCell: expression } });
    for (const changingClock of [clock, { tempo: 87, signature: { numerator: 7, denominator: 8 }, fps: 60, sampleRate: 44100 }]) {
      assert.ok(Math.abs(secondsToGridUnits(gridUnitsToSeconds(2.75, mapped, changingClock), mapped, changingClock) - 2.75) < 1e-9);
    }
  }
});

test("legacy grid time mappings migrate to equivalent TimeValue expressions", () => {
  assert.equal(normalizeGlobalGrid({ time: { amount: 2, unit: "bar" } }).time.perCell.expression, "2 bars");
  assert.equal(normalizeGlobalGrid({ time: { amount: 250, unit: "millisecond" } }).time.perCell.expression, "250 ms");
  assert.equal(normalizeGlobalGrid({ time: { amount: 3, unit: "custom", customSeconds: 0.25 } }).time.perCell.expression, "0.75 s");
});

test("grid value mapping follows upward polarity and round-trips semitone values", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    transform: { origin: [10, 20], rotation: Math.PI / 6 },
    value: { axis: "y", direction: "up", amount: 1, unit: "semitone", originValue: 60 },
  });
  const point = gridToWorldPoint(grid, [0, -7.25]);
  const mapped = worldToGridValue(grid, point);
  assert.ok(Math.abs(mapped.value - 67.25) < 1e-9);
  const world = gridValueToWorld(mapped, grid);
  const local = worldToGridPoint(grid, world);
  assert.ok(Math.abs(local[1] + 7.25) < 1e-8);
  assert.equal(quantizeGridValue(mapped, grid).value, 67);
});

test("grid value mapping supports cents, additive Hz, ratio, and custom scales", () => {
  const cents = mergeGridPatch(DEFAULT_GLOBAL_GRID, { value: { amount: 50, unit: "cent" } });
  assert.equal(worldToGridValue(cents, [0, -200]).value, 61);
  const hz = mergeGridPatch(DEFAULT_GLOBAL_GRID, { value: { amount: 10, unit: "hertz", originValue: 440 } });
  assert.equal(worldToGridValue(hz, [0, -300]).frequency, 470);
  const ratio = mergeGridPatch(DEFAULT_GLOBAL_GRID, { value: { amount: 2, unit: "ratio", originValue: 69 } });
  assert.ok(Math.abs(worldToGridValue(ratio, [0, -100]).frequency - 880) < 1e-8);
  const scale = mergeGridPatch(DEFAULT_GLOBAL_GRID, { value: { amount: 1, unit: "scaleDegree", scale: { id: "custom", degrees: [0, 2, 3, 7], octave: 12 } } });
  assert.equal(worldToGridValue(scale, [0, -300]).value, 67);
  const major = mergeGridPatch(scale, { value: { scale: { id: "major" } } });
  assert.deepEqual(major.value.scale.degrees, [0, 2, 4, 5, 7, 9, 11]);
});

test("visible line generation classifies axes and caps dense viewports", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { appearance: { visible: true } });
  const lines = createVisibleGridLines(grid, { minX: -50000, minY: -50000, maxX: 50000, maxY: 50000 }, { zoom: 0.01, maxLines: 80 });
  assert.ok(lines.length <= 160);
  assert.ok(lines.some(line => line.type === "axis" && line.axis === "x"));
  assert.ok(lines.some(line => line.type === "axis" && line.axis === "y"));
});

test("visible grid intersections reuse line visibility and classify major and axis crossings", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    appearance: { visible: true, unsnappedDots: true },
    spacing: { x: 100, y: 100, subdivisionsX: 2, subdivisionsY: 2 },
  });
  const intersections = createVisibleGridIntersections(grid, { minX: -110, minY: -110, maxX: 110, maxY: 110 }, { zoom: 1, maxLines: 20 });
  assert.ok(intersections.length > 0);
  assert.ok(intersections.some(intersection => intersection.type === "axis" && intersection.point[0] === 0 && intersection.point[1] === 0));
  assert.ok(intersections.some(intersection => intersection.type === "major"));
  assert.ok(intersections.every(intersection => Array.isArray(intersection.point) && intersection.point.length === 2));
});
