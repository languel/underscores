import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GLOBAL_GRID, mergeGridPatch } from "./gridSystem.js";
import { createTimeValue } from "./timeValue.js";
import { gridTimeQuantumCells, measureGridGeometry, resolveScoreTiming } from "./scoreTiming.js";

const context = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30, sampleRate: 48000 };
const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { time: { perCell: "1 beat" } });

test("geometry metrics use normalized rotated non-square grid coordinates", () => {
  const rotated = mergeGridPatch(grid, {
    transform: { origin: [20, 30], rotation: Math.PI / 2 },
    spacing: { x: 100, y: 50 },
  });
  const paths = [[[20, 30], [20, 230], [-80, 230]]];
  const measurement = measureGridGeometry(paths, rotated, "auto");
  assert.ok(Math.abs(measurement.xSpan - 2) < 1e-9);
  assert.ok(Math.abs(measurement.ySpan - 2) < 1e-9);
  assert.equal(measurement.metric, "xSpan");
  assert.ok(Math.abs(measurement.arcLength - 4) < 1e-9);
  assert.ok(Math.abs(measurement.manhattan - 4) < 1e-9);
});

test("geometry-derived timing, manual override, and live musical expressions resolve deterministically", () => {
  const paths = [[[0, 0], [250, 0]]];
  const auto = resolveScoreTiming({
    time: { startValue: createTimeValue("0 s"), durationValue: createTimeValue("9 s"), durationMode: "geometry", rate: 1, loopMode: "once" },
    gridBinding: { gridId: "global", metric: "xSpan" },
  }, { context, grid, paths });
  assert.equal(auto.duration, 1.25);
  const manual = resolveScoreTiming({
    time: { startValue: createTimeValue("2 bars"), durationValue: createTimeValue("4n"), durationMode: "manual", rate: 1, loopMode: "once" },
  }, { context, grid, paths });
  assert.equal(manual.start, 4);
  assert.equal(manual.duration, 0.5);
  const slower = resolveScoreTiming({
    time: { startValue: createTimeValue("2 bars"), durationValue: createTimeValue("4n"), durationMode: "manual", rate: 1, loopMode: "once" },
  }, { context: { ...context, tempo: 60 }, grid, paths });
  assert.equal(slower.start, 8);
  assert.equal(slower.duration, 1);
});

test("cursor timing inherits curve start and selected range with signed offset", () => {
  const timing = resolveScoreTiming({
    time: { startMode: "curve", durationMode: "curve", rate: 1, loopMode: "once" },
    cursor: { range: [0.75, 0.25], startOffsetValue: createTimeValue("-250 ms") },
  }, { context, curveTiming: { start: 2, duration: 8 } });
  assert.equal(timing.start, 1.75);
  assert.equal(timing.duration, 4);
  assert.deepEqual(timing.cursorRange, [0.75, 0.25]);
});

test("minor time quantum follows axis subdivisions and LCM for path metrics", () => {
  const mapped = mergeGridPatch(grid, { spacing: { subdivisionsX: 4, subdivisionsY: 6 } });
  assert.equal(gridTimeQuantumCells(mapped, "xSpan", "minor"), 0.25);
  assert.equal(gridTimeQuantumCells(mapped, "ySpan", "minor"), 1 / 6);
  assert.equal(gridTimeQuantumCells(mapped, "arcLength", "minor"), 1 / 12);
  assert.equal(gridTimeQuantumCells(mapped, "manhattan", "major"), 1);
});

test("resolved object timing exposes mapped and independently quantized values", () => {
  const paths = [[[0, -141], [100, -141]]];
  const continuous = resolveScoreTiming({
    time: { durationValue: createTimeValue("1 s"), durationMode: "manual" },
    gridBinding: { gridId: "global", metric: "xSpan", quantize: { value: false } },
  }, { context, grid, paths });
  assert.equal(continuous.resolvedValue.value, 61.41);
  const quantized = resolveScoreTiming({
    time: { durationValue: createTimeValue("1 s"), durationMode: "manual" },
    gridBinding: { gridId: "global", metric: "xSpan", quantize: { value: true } },
  }, { context, grid, paths });
  assert.equal(quantized.resolvedValue.value, 61);
  assert.equal(quantized.resolvedValue.quantized, true);
});
