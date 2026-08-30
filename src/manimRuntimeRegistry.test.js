import test from "node:test";
import assert from "node:assert/strict";
import {
  clearManimRuntimes,
  findPendingManimCue,
  getPendingManimCue,
  registerManimRuntime,
} from "./manimRuntimeRegistry.js";

test.afterEach(() => clearManimRuntimes());

test("Manim runtime registry returns pending cues in playlist element order", () => {
  registerManimRuntime("manim-b", { getPendingCue: () => ({ id: "b", label: "Second" }) });
  registerManimRuntime("manim-a", { getPendingCue: () => ({ id: "a", label: "First" }) });

  assert.deepEqual(findPendingManimCue(["missing", "manim-a", "manim-b"]), {
    elementId: "manim-a",
    cue: { id: "a", label: "First" },
  });
});

test("Manim runtime registry cleanup cannot remove a replacement runtime", () => {
  const unregisterOld = registerManimRuntime("manim-a", { getPendingCue: () => ({ id: "old" }) });
  const unregisterNew = registerManimRuntime("manim-a", { getPendingCue: () => ({ id: "new" }) });

  unregisterOld();
  assert.equal(getPendingManimCue("manim-a")?.cue.id, "new");
  unregisterNew();
  assert.equal(getPendingManimCue("manim-a"), null);
});

test("Manim runtime registry ignores mounted nodes without a pending cue", () => {
  registerManimRuntime("manim-a", { getPendingCue: () => null });
  assert.equal(findPendingManimCue(["manim-a"]), null);
});
