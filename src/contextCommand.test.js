import assert from "node:assert/strict";
import test from "node:test";
import { parseContextCommand } from "./contextCommand.js";

test("parses deterministic visual commands", () => {
  assert.deepEqual(parseContextCommand("opacity 50%"), { kind: "opacity", value: 50 });
  assert.deepEqual(parseContextCommand("volume 25"), { kind: "volume", value: 0.25 });
  assert.deepEqual(parseContextCommand("toggle loop"), { kind: "loop", value: "toggle" });
});

test("parses media transport commands", () => {
  assert.deepEqual(parseContextCommand("play"), { kind: "play" });
  assert.deepEqual(parseContextCommand("mute"), { kind: "mute", value: true });
  assert.deepEqual(parseContextCommand("transport loop 8 bar"), { kind: "transportLoop", duration: "8 bar" });
});

test("leaves open-ended natural language for the assistant", () => {
  assert.equal(parseContextCommand("edit the shader so it draws a floating starfield"), null);
});
