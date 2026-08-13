import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBezierHostGeometry } from "./bezierGeometry.js";
import { mergeGridPatch, DEFAULT_GLOBAL_GRID } from "./gridSystem.js";
import { quantizeGridElement, sharedGridSnapDelta, translateGridElement } from "./gridElementQuantization.js";

const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, { snap: { mode: "hard", resolution: "major" } });

describe("grid element quantization", () => {
  it("preserves point metadata and modifier baselines", () => {
    const point = [13, 17]; point.pressure = 0.7; point.time = 9; point.speed = 2;
    const element = { id: "line", type: "line", x: 0, y: 0, width: 113, height: 117, angle: 0, version: 1, points: [[0, 0], point], customData: { originalPoints: [[0, 0], [13, 17]], modifiers: [{}] } };
    const result = quantizeGridElement(element, grid);
    assert.equal(result.points[1][0], 0);
    assert.equal(result.points[1][1], 0);
    assert.equal(result.points[1].pressure, 0.7);
    assert.equal(result.points[1].time, 9);
    assert.equal(result.points[1].speed, 2);
    assert.deepEqual(Array.from(result.customData.originalPoints[1]), [0, 0]);
  });

  it("snaps a single-point freedraw by its authored center", () => {
    const element = {
      id: "dot", type: "freedraw", x: 43, y: 57, width: 0, height: 0,
      angle: 0, version: 1, points: [[0, 0]], strokeWidth: 4, customData: {},
    };
    const result = quantizeGridElement(element, grid);
    assert.deepEqual([result.x, result.y], [0, 100]);
    assert.deepEqual(result.points, [[0, 0]]);
    assert.equal(result.strokeWidth, 4);
  });

  it("quantizes real bezier anchors and canonical geometry", () => {
    const host = createBezierHostGeometry([
      { x: 13, y: 17, out: [30, 0], mode: "smooth" },
      { x: 187, y: 221, in: [-30, 0], mode: "smooth" },
    ]);
    const element = { id: "curve", type: "line", x: host.bounds.x, y: host.bounds.y, width: host.bounds.width, height: host.bounds.height, angle: 0, version: 1, points: host.points, customData: { underscoreGeometry: host.geometry, originalPoints: [[13, 17], [187, 221]] } };
    const result = quantizeGridElement(element, grid);
    assert.deepEqual([result.x, result.y], [0, 0]);
    assert.notDeepEqual(result.customData.underscoreGeometry, element.customData.underscoreGeometry);
    assert.deepEqual(result.customData.originalPoints[0], [0, 0]);
  });

  it("uses one delta for a multi-object transform", () => {
    const elements = [{ x: 93, y: 107 }, { x: 143, y: 157 }];
    const delta = sharedGridSnapDelta(elements, grid, { mode: "hard" });
    assert.deepEqual(delta, [7, -7]);
    const moved = elements.map(element => translateGridElement({ ...element, version: 1 }, delta));
    assert.deepEqual([moved[1].x - moved[0].x, moved[1].y - moved[0].y], [50, 50]);
  });

  it("preserves a complex multipoint path and can replace only its live endpoint", () => {
    const element = {
      id: "score-path", type: "line", x: 10, y: 10, width: 170, height: 170, angle: 0, version: 1,
      points: [[0, 0], [90, 0], [90, 90], [170, 170]], customData: {},
    };
    const result = quantizeGridElement(element, grid, { lastPoint: [15, 185] });
    assert.equal(result.points.length, 4);
    assert.deepEqual(result.points.map(point => Array.from(point)), [[0, 0], [100, 0], [100, 100], [0, 200]]);
  });

  it("rebuilds a finalized native line from raw snapped click positions", () => {
    const element = { id: "native-line", type: "line", x: 10, y: 10, width: 100, height: 0, angle: 0, version: 1, points: [[0, 0], [100, 0]], customData: {} };
    const result = quantizeGridElement(element, grid, { worldPoints: [[12, 12], [112, 12], [112, 112], [212, 112]] });
    assert.deepEqual(result.points.map(point => Array.from(point)), [[0, 0], [100, 0], [100, 100], [200, 100]]);
  });

  it("rebuilds unsnapped authored geometry from already-snapped live points", () => {
    const element = { id: "live-line", type: "line", x: 13, y: 17, width: 99, height: 96, angle: 0, version: 1, points: [[0, 0], [99, 96]], customData: {} };
    const result = quantizeGridElement(element, grid, { worldPoints: [[0, 0], [100, 100]] });
    assert.deepEqual([result.x, result.y], [0, 0]);
    assert.deepEqual(result.points.map(point => Array.from(point)), [[0, 0], [100, 100]]);
  });

  it("snaps only the actively edited line point when an index is supplied", () => {
    const element = { id: "edited-line", type: "line", x: 13, y: 17, width: 204, height: 196, angle: 0, version: 1, points: [[0, 0], [101, 96], [204, 196]], customData: {} };
    const result = quantizeGridElement(element, grid, { pointIndices: [1] });
    const worldPoints = result.points.map(point => [result.x + point[0], result.y + point[1]]);
    assert.deepEqual(worldPoints, [[13, 17], [100, 100], [217, 213]]);
  });
});
