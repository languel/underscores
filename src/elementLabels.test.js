import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultExcalidrawLabelMap, getDefaultExcalidrawLabel } from "./elementLabels.js";

test("default Excalidraw labels use a type and zero-padded ordinal", () => {
  assert.equal(
    getDefaultExcalidrawLabel({ type: "freedraw", id: "W8C3-9R95-drawing" }, 1),
    "stroke_0001",
  );
  assert.equal(
    getDefaultExcalidrawLabel({ type: "rectangle", id: "A1b2-canvas" }, 12),
    "rectangle_0012",
  );
});

test("default Excalidraw labels cover custom types and missing values", () => {
  assert.equal(getDefaultExcalidrawLabel({ type: "custom-shape", id: "Q9" }), "custom-shape_0001");
  assert.equal(getDefaultExcalidrawLabel({ type: "", id: "" }), "object_0001");
  assert.equal(getDefaultExcalidrawLabel(null), "");
});

test("default Excalidraw label maps count each prefix independently in scene order", () => {
  const labels = buildDefaultExcalidrawLabelMap([
    { type: "freedraw", id: "stroke-a" },
    { type: "rectangle", id: "rect-a" },
    { type: "freedraw", id: "stroke-b" },
    { type: "line", id: "line-a" },
    { type: "rectangle", id: "rect-b" },
    { type: "freedraw", id: "deleted", isDeleted: true },
  ]);
  assert.deepEqual([...labels.entries()], [
    ["stroke-a", "stroke_0001"],
    ["rect-a", "rectangle_0001"],
    ["stroke-b", "stroke_0002"],
    ["line-a", "line_0001"],
    ["rect-b", "rectangle_0002"],
  ]);
});
