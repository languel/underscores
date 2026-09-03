import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultExcalidrawLabel } from "./elementLabels.js";

test("default Excalidraw labels use a stable type and id suffix", () => {
  assert.equal(
    getDefaultExcalidrawLabel({ type: "freedraw", id: "W8C3-9R95-drawing" }),
    "stroke_w8c3",
  );
  assert.equal(
    getDefaultExcalidrawLabel({ type: "rectangle", id: "A1b2-canvas" }),
    "rectangle_a1b2",
  );
});

test("default Excalidraw labels cover custom types and missing ids", () => {
  assert.equal(getDefaultExcalidrawLabel({ type: "custom-shape", id: "Q9" }), "custom-shape_q9");
  assert.equal(getDefaultExcalidrawLabel({ type: "", id: "" }), "object_item");
  assert.equal(getDefaultExcalidrawLabel(null), "");
});
