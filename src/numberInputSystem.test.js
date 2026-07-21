import test from "node:test";
import assert from "node:assert/strict";
import { clampNumberInputValue, decimalPlaces, numberInputDataPath, valueFromNumberDrag } from "./numberInputSystem.js";

test("numeric drag respects step, fine adjustment, precision, and bounds", () => {
  assert.equal(valueFromNumberDrag({ startValue: 10, deltaX: 8, step: 1 }), 12);
  assert.equal(valueFromNumberDrag({ startValue: 10, deltaX: 8, step: 1, fine: true }), 10.2);
  assert.equal(valueFromNumberDrag({ startValue: 0.5, deltaX: 4, step: 0.05 }), 0.55);
  assert.equal(valueFromNumberDrag({ startValue: 9, deltaX: 100, step: 1, max: 10 }), 10);
  assert.equal(valueFromNumberDrag({ startValue: 1, deltaX: -100, step: 1, min: 0 }), 0);
});

test("numeric helpers keep stable precision and data paths", () => {
  assert.equal(decimalPlaces(0.001), 3);
  assert.equal(clampNumberInputValue(12, 0, 10), 10);
  assert.equal(numberInputDataPath({ dataset: {}, name: "tempo" }), "tempo");
  assert.equal(numberInputDataPath({ dataset: {}, name: "", id: "", getAttribute: name => name === "aria-label" ? "Global Grid Opacity" : null }), "global.grid.opacity");
});
