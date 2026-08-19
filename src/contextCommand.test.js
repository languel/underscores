import assert from "node:assert/strict";
import test from "node:test";
import { parseContextCommand } from "./contextCommand.js";

test("parses deterministic visual commands", () => {
  assert.deepEqual(parseContextCommand("opacity 50%"), { kind: "opacity", value: 50 });
  assert.deepEqual(parseContextCommand("volume 25"), { kind: "volume", value: 0.25 });
  assert.deepEqual(parseContextCommand("toggle loop"), { kind: "loop", value: "toggle" });
  assert.deepEqual(parseContextCommand("clock free"), { kind: "clock", value: "free" });
  assert.deepEqual(parseContextCommand("clock toggle"), { kind: "clock", value: "toggle" });
  assert.deepEqual(parseContextCommand("blend screen"), { kind: "blend", value: "screen" });
  assert.deepEqual(parseContextCommand("stroke width 3"), { kind: "objectPatch", property: "strokeWidth", patch: { strokeWidth: 3 } });
  assert.deepEqual(parseContextCommand("background __.currentFill"), { kind: "objectPatch", property: "backgroundColor", patch: { backgroundColor: "__.currentFill" } });
  assert.deepEqual(parseContextCommand("background color red"), { kind: "objectPatch", property: "backgroundColor", patch: { backgroundColor: "red" } });
  assert.deepEqual(parseContextCommand("fill style hachure"), { kind: "objectPatch", property: "fillStyle", patch: { fillStyle: "hachure" } });
});

test("parses media transport commands", () => {
  assert.deepEqual(parseContextCommand("play"), { kind: "play" });
  assert.deepEqual(parseContextCommand("mute"), { kind: "mute", value: true });
  assert.deepEqual(parseContextCommand("transport loop 8 bar"), { kind: "transportLoop", duration: "8 bar" });
});

test("leaves open-ended natural language for the assistant", () => {
  assert.equal(parseContextCommand("edit the shader so it draws a floating starfield"), null);
});
