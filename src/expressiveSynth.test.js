import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXPRESSIVE_SYNTH_CONFIG,
  mapCursorToExpressiveVoice,
  mergeExpressiveSynthConfig,
  midiNoteToFrequency,
  normalizeExpressiveSynthConfig,
  worldYToMidiNote,
} from "./expressiveSynth.js";

test("normalizes expressive synth configuration and clamps invalid values", () => {
  const config = normalizeExpressiveSynthConfig({
    preset: "missing",
    masterGain: 4,
    attack: -2,
    referenceNote: 300,
    pixelsPerOctave: 0,
    maxVoices: 999,
    cursorVoices: false,
  });
  assert.equal(config.preset, DEFAULT_EXPRESSIVE_SYNTH_CONFIG.preset);
  assert.equal(config.masterGain, 1);
  assert.equal(config.attack, 0.001);
  assert.equal(config.referenceNote, 127);
  assert.equal(config.pixelsPerOctave, 1);
  assert.equal(config.maxVoices, 256);
  assert.equal(config.cursorVoices, false);
});

test("world Y maps continuously to pitch with canvas-up polarity", () => {
  const config = mergeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, {
    referenceNote: 60,
    referenceY: 100,
    pixelsPerOctave: 120,
    transpose: 2,
  });
  assert.equal(worldYToMidiNote(100, config), 62);
  assert.equal(worldYToMidiNote(-20, config), 74);
  assert.equal(worldYToMidiNote(220, config), 50);
  assert.ok(Math.abs(midiNoteToFrequency(69) - 440) < 0.000001);
});

test("cursor voice mapping uses world position, stroke width, and speed", () => {
  const config = mergeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, {
    referenceNote: 69,
    referenceY: 0,
    pixelsPerOctave: 120,
    pressure: 0.2,
    brightness: 0.3,
    strokeWidthAmount: 0.5,
    speedAmount: 0.4,
  });
  const cursor = {
    element: { id: "cursor-1", strokeWidth: 1 },
    curveElement: { strokeWidth: 10 },
    transform: { position: [25, 0] },
  };
  const voice = mapCursorToExpressiveVoice(cursor, config, { speed: 900 });
  assert.equal(voice.id, "cursor:cursor-1");
  assert.ok(Math.abs(voice.frequency - 440) < 0.000001);
  assert.equal(voice.pressure, 0.7);
  assert.equal(voice.brightness, 0.7);
});
