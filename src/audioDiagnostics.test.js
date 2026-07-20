import test from "node:test";
import assert from "node:assert/strict";
import { playWebAudioTestTone } from "./audioDiagnostics.js";

test("raw Web Audio diagnostic creates, connects, plays, and closes a tone", async () => {
  const calls = [];
  class FakeAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 2;
      this.sampleRate = 48000;
      this.destination = { maxChannelCount: 2 };
    }
    async resume() { this.state = "running"; calls.push("resume"); }
    createOscillator() {
      return {
        frequency: { setValueAtTime: (...args) => calls.push(["frequency", ...args]) },
        connect: node => calls.push(["oscillator-connect", node]),
        start: () => calls.push("start"),
        stop: time => { calls.push(["stop", time]); queueMicrotask(() => this.oscillator.onended()); },
        set onended(callback) { this._onended = callback; },
        get onended() { return this._onended; },
      };
    }
    createGain() {
      const node = {
        gain: {
          setValueAtTime: (...args) => calls.push(["gain-set", ...args]),
          exponentialRampToValueAtTime: (...args) => calls.push(["gain-ramp", ...args]),
        },
        connect: destination => calls.push(["gain-connect", destination]),
      };
      return node;
    }
    async close() { calls.push("close"); }
  }
  const originalCreate = FakeAudioContext.prototype.createOscillator;
  FakeAudioContext.prototype.createOscillator = function createOscillator() {
    const oscillator = originalCreate.call(this);
    this.oscillator = oscillator;
    return oscillator;
  };

  const result = await playWebAudioTestTone({ AudioContextClass: FakeAudioContext, duration: 0.2 });
  assert.deepEqual(result, { state: "running", sampleRate: 48000, channels: 2 });
  assert.ok(calls.includes("resume"));
  assert.ok(calls.includes("start"));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "stop" && call[1] === 2.2));
  assert.equal(calls.at(-1), "close");
});

test("raw Web Audio diagnostic reports missing or suspended contexts", async () => {
  await assert.rejects(() => playWebAudioTestTone({ AudioContextClass: null }), /unavailable/);
  class SuspendedContext {
    constructor() { this.state = "suspended"; }
    async resume() {}
    async close() {}
  }
  await assert.rejects(() => playWebAudioTestTone({ AudioContextClass: SuspendedContext }), /suspended/);
});
