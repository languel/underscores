import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXPRESSIVE_SYNTH_CONFIG,
  getExpressiveSynthPrograms,
  mapCursorToExpressiveVoice,
  mapGlissandoToExpressiveVoice,
  mergeExpressiveSynthConfig,
  midiNoteToFrequency,
  normalizeExpressiveSynthConfig,
  removeExpressiveSynthProgram,
  resolveExpressiveSynthProgram,
  upsertExpressiveSynthProgram,
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

test("scene programs normalize, resolve independently, and preserve factory programs", () => {
  const configured = upsertExpressiveSynthProgram(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, {
    id: "user-glass",
    label: "Glass line",
    preset: "fm",
    voiceGain: 0.31,
    attack: 0.2,
    brightness: 0.91,
    glideMs: 180,
  });
  const programs = getExpressiveSynthPrograms(configured);
  assert.equal(programs.find(program => program.id === "fm")?.builtin, true);
  assert.equal(programs.find(program => program.id === "user-glass")?.builtin, false);

  const resolved = resolveExpressiveSynthProgram(configured, "user-glass");
  assert.equal(resolved.preset, "fm");
  assert.equal(resolved.voiceGain, 0.31);
  assert.equal(resolved.attack, 0.2);
  assert.equal(resolved.brightness, 0.91);
  assert.equal(resolved.glideMs, 180);

  const removed = removeExpressiveSynthProgram(configured, "user-glass");
  assert.equal(removed.userPrograms.length, 0);
  assert.equal(getExpressiveSynthPrograms(removed).length, 5);
});

test("invalid scene program values are clamped and missing program references fall back", () => {
  const config = normalizeExpressiveSynthConfig({
    userPrograms: [{ id: "wild", label: "Wild", preset: "missing", attack: -5, release: 99 }],
  });
  assert.equal(config.version, 2);
  assert.equal(config.userPrograms[0].preset, "bowed");
  assert.equal(config.userPrograms[0].attack, 0.001);
  assert.equal(config.userPrograms[0].release, 20);
  assert.equal(resolveExpressiveSynthProgram(config, "missing").preset, "bowed");
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

test("glissando voice mapping preserves fractional pitch and uses trigger width as expression", () => {
  const config = mergeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, {
    voiceGain: 0.5,
    brightness: 0.25,
    strokeWidthAmount: 0.5,
    speedAmount: 0,
  });
  const voice = mapGlissandoToExpressiveVoice({
    note: 69.5,
    velocity: 64,
    position: [120, 48],
    trigger: { element: { id: "gliss-1", strokeWidth: 10 } },
  }, config);
  assert.equal(voice.note, 69.5);
  assert.ok(voice.frequency > 440 && voice.frequency < midiNoteToFrequency(70));
  assert.equal(voice.position[1], 48);
  assert.equal(voice.pressure, Math.min(1, 64 / 127 + 0.5));
});
