import test from "node:test";
import assert from "node:assert/strict";
import { getClassicSelectionDragCandidate, isClassicLinearElement } from "./classicSelectionInteraction.js";

const freehand = (overrides = {}) => ({
  id: "stroke",
  type: "freedraw",
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  angle: 0,
  strokeWidth: 4,
  points: [[0, 0], [100, 100], [200, 0]],
  ...overrides,
});

test("offers a move candidate in the empty interior of one selected freehand", () => {
  const candidate = getClassicSelectionDragCandidate({
    elements: [freehand()],
    selectedElementIds: { stroke: true },
    point: [200, 150],
  });
  assert.equal(candidate?.element.id, "stroke");
});

test("leaves the authored path to native Excalidraw hit testing", () => {
  const candidate = getClassicSelectionDragCandidate({
    elements: [freehand()],
    selectedElementIds: { stroke: true },
    point: [200, 200],
  });
  assert.equal(candidate, null);
});

test("does not claim resize-edge or multi-selection gestures", () => {
  assert.equal(getClassicSelectionDragCandidate({
    elements: [freehand()],
    selectedElementIds: { stroke: true },
    point: [110, 150],
  }), null);
  assert.equal(getClassicSelectionDragCandidate({
    elements: [freehand(), freehand({ id: "other", x: 400 })],
    selectedElementIds: { stroke: true, other: true },
    point: [200, 150],
  }), null);
});

test("supports rotated paths and excludes specialized elements", () => {
  const candidate = getClassicSelectionDragCandidate({
    elements: [freehand({ angle: Math.PI / 2 })],
    selectedElementIds: { stroke: true },
    point: [225, 160],
  });
  assert.equal(candidate?.element.id, "stroke");
  assert.equal(isClassicLinearElement({ type: "freedraw", isDeleted: false }, { isExcluded: () => true }), false);
});
