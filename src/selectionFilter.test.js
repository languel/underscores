import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SELECTION_FILTER,
  filterSelectedElementIds,
  isInteriorObjectSelectionGesture,
  normalizeSelectionFilter,
  selectionFilterAllowsElement,
  selectionMapsEqual,
  toggleSelectionFilter,
} from "./selectionFilter.js";

const element = (id, role = null) => ({
  id,
  isDeleted: false,
  customData: role ? { iannix: { role } } : {},
});

test("selection filter normalizes invalid and empty filters to Anything", () => {
  assert.deepEqual(normalizeSelectionFilter(null), DEFAULT_SELECTION_FILTER);
  assert.deepEqual(normalizeSelectionFilter({ anything: false }), DEFAULT_SELECTION_FILTER);
  assert.deepEqual(normalizeSelectionFilter({ anything: true, curve: true }), DEFAULT_SELECTION_FILTER);
});

test("selection role toggles support inclusive role filters and never become empty", () => {
  const curves = toggleSelectionFilter(DEFAULT_SELECTION_FILTER, "curve");
  assert.deepEqual(curves, { anything: false, curve: true, cursor: false, trigger: false });
  const curvesAndTriggers = toggleSelectionFilter(curves, "trigger");
  assert.deepEqual(curvesAndTriggers, { anything: false, curve: true, cursor: false, trigger: true });
  assert.deepEqual(toggleSelectionFilter(curves, "curve"), DEFAULT_SELECTION_FILTER);
  assert.deepEqual(toggleSelectionFilter(curvesAndTriggers, "anything"), DEFAULT_SELECTION_FILTER);
});

test("selection filter accepts ordinary elements only in Anything mode", () => {
  const ordinary = element("shape");
  assert.equal(selectionFilterAllowsElement(DEFAULT_SELECTION_FILTER, ordinary), true);
  assert.equal(selectionFilterAllowsElement({ anything: false, curve: true }, ordinary), false);
  assert.equal(selectionFilterAllowsElement({ anything: false, curve: true }, element("curve", "curve")), true);
  assert.equal(selectionFilterAllowsElement({ anything: false, curve: true }, element("cursor", "cursor")), false);
});

test("interior object selection uses Command-click without consuming Option gestures", () => {
  assert.equal(isInteriorObjectSelectionGesture({ button: 0, metaKey: true }), true);
  assert.equal(isInteriorObjectSelectionGesture({ button: 0, metaKey: true, shiftKey: true }), true);
  assert.equal(isInteriorObjectSelectionGesture({ button: 0, altKey: true }), false);
  assert.equal(isInteriorObjectSelectionGesture({ button: 0, metaKey: true, altKey: true }), false);
  assert.equal(isInteriorObjectSelectionGesture({ button: 0, ctrlKey: true }), false);
  assert.equal(isInteriorObjectSelectionGesture({ button: 1, metaKey: true }), false);
});

test("selected ID filtering removes deleted, unavailable, and disallowed elements", () => {
  const deleted = { ...element("deleted", "curve"), isDeleted: true };
  const result = filterSelectedElementIds(
    [element("curve", "curve"), element("cursor", "cursor"), element("shape"), deleted],
    { curve: true, cursor: true, shape: true, deleted: true, missing: true },
    { anything: false, curve: true }
  );
  assert.deepEqual(result, { curve: true });
});

test("selection map equality ignores false entries and insertion order", () => {
  assert.equal(selectionMapsEqual({ a: true, b: true }, { b: true, a: true, c: false }), true);
  assert.equal(selectionMapsEqual({ a: true }, { b: true }), false);
});
