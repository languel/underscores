import test from "node:test";
import assert from "node:assert/strict";
import { countPerformanceScene } from "./performanceMonitor.js";

test("counts active scene workload by first-class object kind", () => {
  assert.deepEqual(countPerformanceScene([
    { id: "native", type: "ellipse" },
    { id: "image", type: "image" },
    { id: "svg", type: "rectangle", customData: { underscoreSvg: {} } },
    { id: "live", type: "rectangle", customData: { underscoreLivecode: {} } },
    { id: "media", type: "rectangle", customData: { underscoreMediaStream: {} } },
    { id: "gone", type: "image", isDeleted: true },
  ], { native: true }), {
    elements: 5, selected: 1, images: 1, svg: 1, livecode: 1, media: 1,
  });
});
