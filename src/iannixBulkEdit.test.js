import test from "node:test";
import assert from "node:assert/strict";
import {
  expandIndexedLabelTemplate,
  getBulkIannixEditorValue,
  getSharedPrimitiveValue,
} from "./iannixBulkEdit.js";

test("indexed label templates use one-based selection order", () => {
  assert.equal(expandIndexedLabelTemplate("trigger_${n}", 0), "trigger_1");
  assert.equal(expandIndexedLabelTemplate("trigger_${n}_${n}", 9), "trigger_10_10");
  assert.equal(expandIndexedLabelTemplate("shared", 4), "shared");
});

test("bulk editor exposes only common and role-relevant sections", () => {
  const data = {
    version: 1,
    role: "trigger",
    active: true,
    label: "Trigger 1",
    time: { duration: 5 },
    cursor: { curveId: "curve" },
    midi: { baseNote: 60 },
    trigger: { midiPattern: "pattern" },
  };
  assert.deepEqual(getBulkIannixEditorValue(data, "trigger"), {
    active: true,
    label: "Trigger 1",
    time: { duration: 5 },
    trigger: { midiPattern: "pattern" },
  });
  assert.deepEqual(Object.keys(getBulkIannixEditorValue(data, "cursor")), ["active", "label", "time", "cursor", "midi"]);
});

test("shared primitive values distinguish uniform and mixed selections", () => {
  assert.deepEqual(getSharedPrimitiveValue([4, 4, 4]), { mixed: false, value: 4 });
  assert.deepEqual(getSharedPrimitiveValue([4, 5]), { mixed: true, value: 4 });
  assert.deepEqual(getSharedPrimitiveValue([false, false]), { mixed: false, value: false });
});
