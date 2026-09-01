import test from "node:test";
import assert from "node:assert/strict";
import { createGridInteractionState, updateGridInteractionMovement } from "./gridInteraction.js";

test("a stationary selection click never qualifies as a grid transform", () => {
  const interaction = createGridInteractionState([100, 200]);
  assert.equal(updateGridInteractionMovement(interaction, { clientX: 100, clientY: 200, buttons: 1 }), false);
  assert.equal(updateGridInteractionMovement(interaction, { clientX: 102, clientY: 202, buttons: 1 }), false);
  assert.equal(interaction.moved, false);
});

test("a held pointer qualifies only after crossing the drag threshold", () => {
  const interaction = createGridInteractionState([100, 200]);
  assert.equal(updateGridInteractionMovement(interaction, { clientX: 102, clientY: 202, buttons: 0 }), false);
  assert.equal(updateGridInteractionMovement(interaction, { clientX: 103, clientY: 200, buttons: 1 }), true);
  assert.equal(updateGridInteractionMovement(interaction, { clientX: 101, clientY: 200, buttons: 1 }), true);
});
