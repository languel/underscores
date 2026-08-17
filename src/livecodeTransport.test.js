import test from "node:test";
import assert from "node:assert/strict";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";

test("linked livecode follows the score play state", () => {
  assert.equal(isLivecodeTransportPlaying("linked", { playing: true }), true);
  assert.equal(isLivecodeTransportPlaying("linked", { playing: false }), false);
  assert.equal(isLivecodeTransportPlaying("linked", undefined), false);
});

test("free livecode remains independent of the score", () => {
  assert.equal(isLivecodeTransportPlaying("free", { playing: false }), true);
  assert.equal(isLivecodeTransportPlaying("free", undefined), true);
});
