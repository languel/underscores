import assert from "node:assert/strict";
import test from "node:test";
import { audioWaveformPath, createAudioWaveform } from "./audioWaveform.js";

test("audio waveform geometry is deterministic and bounded", () => {
  const first = createAudioWaveform("demo", 32);
  const second = createAudioWaveform("demo", 32);
  assert.deepEqual(first, second);
  assert.equal(first.length, 32);
  assert.ok(first.every(value => value >= 0.06 && value <= 1));
  assert.notDeepEqual(first, createAudioWaveform("other", 32));
});

test("audio waveform path closes a centered silhouette", () => {
  const path = audioWaveformPath([0.2, 0.5, 1]);
  assert.match(path, /^M0 13\.4 L50 9\.5 L100 3 L100 29 L50 22\.5 L0 18\.6 Z$/);
});

