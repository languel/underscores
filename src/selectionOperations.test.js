import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSelectionOperationSuggestions,
  getSelectionOperationSuggestions,
  parseSelectionOperation,
} from "./selectionOperations.js";

test("selection operation suggestions follow context-menu capabilities", () => {
  const pathSuggestions = getSelectionOperationSuggestions([
    { id: "curve", type: "freedraw", points: [[0, 0], [4, 4], [8, 0]] },
  ]);
  const names = pathSuggestions.map(suggestion => suggestion.name);
  assert.ok(names.includes("Smooth Path (Laplacian)"));
  assert.ok(names.includes("Snap Points to Grid"));
  assert.ok(!names.includes("Convert to Path"));

  const shapeSuggestions = getSelectionOperationSuggestions([
    { id: "box", type: "rectangle", width: 20, height: 20 },
  ]);
  assert.ok(shapeSuggestions.some(suggestion => suggestion.name === "Convert to Path"));
  assert.ok(!shapeSuggestions.some(suggestion => suggestion.name === "Smooth Path (Laplacian)"));

  const frameSuggestions = getSelectionOperationSuggestions([
    { id: "frame", type: "frame", width: 320, height: 180 },
  ]);
  assert.ok(frameSuggestions.some(suggestion => suggestion.name === "Attach p5 Sketch"));
  assert.ok(frameSuggestions.some(suggestion => suggestion.name === "Fit Selection to Viewport"));
});

test("selection operation filtering stays compact and queryable", () => {
  const suggestions = getSelectionOperationSuggestions([
    { id: "curve", type: "line", points: [[0, 0], [4, 4], [8, 0]] },
  ]);
  assert.deepEqual(
    filterSelectionOperationSuggestions("smooth", suggestions).map(item => item.commandId),
    ["path.smooth", "path.smooth.taubin"],
  );
  assert.deepEqual(
    filterSelectionOperationSuggestions("smooth 10", suggestions).map(item => item.commandId),
    ["path.smooth", "path.smooth.taubin"],
  );
  assert.equal(filterSelectionOperationSuggestions("/snap", suggestions)[0].commandId, "grid.snap.points");
});

test("context operation syntax parses numeric smoothing and simplification arguments", () => {
  assert.deepEqual(parseSelectionOperation("smooth 10"), {
    operationId: "selection.path.smooth",
    commandId: "path.smooth",
    args: { amount: 10 },
  });
  assert.deepEqual(parseSelectionOperation("/smooth taubin 37"), {
    operationId: "selection.path.smooth.taubin",
    commandId: "path.smooth.taubin",
    args: { amount: 37 },
  });
  assert.deepEqual(parseSelectionOperation("simplify rdp 2.5"), {
    operationId: "selection.path.simplify.rdp",
    commandId: "path.simplify.rdp",
    args: { tolerance: 2.5 },
  });
  assert.deepEqual(parseSelectionOperation("resample 42"), {
    operationId: "selection.path.resample",
    commandId: "path.resample",
    args: { count: 42 },
  });
  assert.deepEqual(parseSelectionOperation("simplify vw 1000"), {
    operationId: "selection.path.simplify.vw",
    commandId: "path.simplify.vw",
    args: { tolerance: 1000 },
  });
  assert.deepEqual(parseSelectionOperation("resample 10000"), {
    operationId: "selection.path.resample",
    commandId: "path.resample",
    args: { count: 10000 },
  });
});
