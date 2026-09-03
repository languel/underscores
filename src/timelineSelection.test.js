import test from "node:test";
import assert from "node:assert/strict";
import { updateTimelineClipSelection } from "./timelineSelection.js";

test("timeline shift-select returns the ordered clip range", () => {
  assert.deepEqual(
    updateTimelineClipSelection(["a", "b", "c", "d"], ["a"], "a", "c", { shiftKey: true }),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    updateTimelineClipSelection(["a", "b", "c", "d"], ["d"], "d", "b", { shiftKey: true }),
    ["b", "c", "d"],
  );
});

test("timeline toggle selection adds and removes clips without duplicates", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(updateTimelineClipSelection(order, ["a"], "a", "c", { toggle: true }), ["a", "c"]);
  assert.deepEqual(updateTimelineClipSelection(order, ["a", "c"], "a", "c", { toggle: true }), ["a"]);
  assert.deepEqual(updateTimelineClipSelection(["a", "a", "b"], ["a", "a"], "", "b"), ["b"]);
});
