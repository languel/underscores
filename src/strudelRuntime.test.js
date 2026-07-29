import test from "node:test";
import assert from "node:assert/strict";
import { StrudelRuntimeManager, strudelBpmToCps } from "./strudelRuntime.js";

test("Strudel transport maps Drawerator BPM to four-beat cycles", () => {
  assert.equal(strudelBpmToCps(120), 0.5);
  assert.equal(strudelBpmToCps(240), 1);
  assert.equal(strudelBpmToCps(0), 0.5);
});

test("Strudel runtime keeps node ownership and free-run decisions separate", () => {
  const runtime = new StrudelRuntimeManager();
  runtime.entries.set("linked", { pattern: {}, transportMode: "linked", cps: null });
  runtime.entries.set("free", { pattern: {}, transportMode: "free", cps: null });
  assert.equal(runtime._shouldPlay(), true);
  runtime.entries.delete("free");
  assert.equal(runtime._shouldPlay(), false);
  runtime.dispose();
});
