import { createTimeValue, resolveTimeValue } from "./timeValue.js";

export const EXPRESSIVE_SYNTH_ID = "__underscores_expressive_synth__";
export const EXPRESSIVE_SYNTH_STORAGE_KEY = "underscores_expressive_synth_v1";

const DEFAULT_PROGRAM_PARAMETERS = Object.freeze({
  voiceGain: 0.5,
  attack: 0.06,
  decay: 0.16,
  sustain: 0.78,
  release: 0.35,
  brightness: 0.56,
  damping: 0.38,
  pressure: 0.55,
  vibratoDepth: 0.08,
  vibratoRate: 5.2,
  transpose: 0,
  glideMs: 24,
});

export const EXPRESSIVE_SYNTH_PROGRAM_FIELDS = Object.freeze(Object.keys(DEFAULT_PROGRAM_PARAMETERS));
const EXPRESSIVE_SYNTH_TIME_VALUE_FIELDS = Object.freeze(["attackValue", "decayValue", "releaseValue", "glideValue"]);

export const EXPRESSIVE_SYNTH_PRESETS = Object.freeze([
  Object.freeze({ id: "sine", label: "Pure tone", waveform: "sine", model: "oscillator", ...DEFAULT_PROGRAM_PARAMETERS, attack: 0.012, decay: 0.08, sustain: 0.9, release: 0.18, brightness: 0.72, damping: 0.64, pressure: 0.42, vibratoDepth: 0 }),
  Object.freeze({ id: "subtractive", label: "Warm subtractive", waveform: "sawtooth", model: "oscillator", ...DEFAULT_PROGRAM_PARAMETERS, attack: 0.035, decay: 0.22, sustain: 0.7, release: 0.4, brightness: 0.42, damping: 0.58 }),
  Object.freeze({ id: "fm", label: "FM voice", waveform: "sine", model: "fm", ...DEFAULT_PROGRAM_PARAMETERS, attack: 0.008, decay: 0.3, sustain: 0.58, release: 0.28, brightness: 0.7, damping: 0.3, pressure: 0.68, vibratoDepth: 0.02 }),
  Object.freeze({ id: "bowed", label: "Bowed string", waveform: "sawtooth", model: "bowed", ...DEFAULT_PROGRAM_PARAMETERS }),
  Object.freeze({ id: "reed", label: "Reed / wind", waveform: "square", model: "reed", ...DEFAULT_PROGRAM_PARAMETERS, attack: 0.045, decay: 0.12, sustain: 0.86, release: 0.24, brightness: 0.5, damping: 0.45, pressure: 0.62, vibratoDepth: 0.12 }),
]);

export const DEFAULT_EXPRESSIVE_SYNTH_CONFIG = Object.freeze({
  version: 2,
  preset: "bowed",
  masterGain: 0.24,
  ...DEFAULT_PROGRAM_PARAMETERS,
  referenceNote: 60,
  referenceY: 0,
  pixelsPerOctave: 100,
  strokeWidthAmount: 0.35,
  speedAmount: 0.16,
  cursorVoices: true,
  triggerVoices: true,
  maxVoices: 64,
  userPrograms: Object.freeze([]),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const normalizeProgramParameters = (source, fallback = DEFAULT_PROGRAM_PARAMETERS) => ({
  voiceGain: clamp(finite(source?.voiceGain, fallback.voiceGain), 0, 1),
  attack: clamp(finite(source?.attack, fallback.attack), 0.001, 10),
  decay: clamp(finite(source?.decay, fallback.decay), 0.001, 10),
  sustain: clamp(finite(source?.sustain, fallback.sustain), 0, 1),
  release: clamp(finite(source?.release, fallback.release), 0.005, 20),
  brightness: clamp(finite(source?.brightness, fallback.brightness), 0, 1),
  damping: clamp(finite(source?.damping, fallback.damping), 0, 1),
  pressure: clamp(finite(source?.pressure, fallback.pressure), 0, 1),
  vibratoDepth: clamp(finite(source?.vibratoDepth, fallback.vibratoDepth), 0, 2),
  vibratoRate: clamp(finite(source?.vibratoRate, fallback.vibratoRate), 0.05, 20),
  transpose: clamp(finite(source?.transpose, fallback.transpose), -48, 48),
  glideMs: clamp(finite(source?.glideMs, fallback.glideMs), 0, 2000),
  attackValue: createTimeValue(source?.attackValue || `${finite(source?.attack, fallback.attack)} s`, finite(source?.attack, fallback.attack)),
  decayValue: createTimeValue(source?.decayValue || `${finite(source?.decay, fallback.decay)} s`, finite(source?.decay, fallback.decay)),
  releaseValue: createTimeValue(source?.releaseValue || `${finite(source?.release, fallback.release)} s`, finite(source?.release, fallback.release)),
  glideValue: createTimeValue(source?.glideValue || `${finite(source?.glideMs, fallback.glideMs)} ms`, finite(source?.glideMs, fallback.glideMs) / 1000),
});

export const resolveExpressiveSynthTiming = (value, context) => {
  const normalized = normalizeExpressiveSynthConfig(value);
  const resolveParameters = source => ({
    ...source,
    attack: clamp(resolveTimeValue(source.attackValue, context), 0.001, 10),
    decay: clamp(resolveTimeValue(source.decayValue, context), 0.001, 10),
    release: clamp(resolveTimeValue(source.releaseValue, context), 0.005, 20),
    glideMs: clamp(resolveTimeValue(source.glideValue, context) * 1000, 0, 2000),
  });
  return {
    ...resolveParameters(normalized),
    userPrograms: normalized.userPrograms.map(resolveParameters),
  };
};

export const normalizeExpressiveSynthProgram = (value, index = 0) => {
  const source = value && typeof value === "object" ? value : {};
  const base = EXPRESSIVE_SYNTH_PRESETS.find(candidate => candidate.id === source.preset)
    || EXPRESSIVE_SYNTH_PRESETS.find(candidate => candidate.id === source.model)
    || EXPRESSIVE_SYNTH_PRESETS.find(candidate => candidate.id === "bowed");
  const rawId = String(source.id || `user-program-${index + 1}`).trim();
  const id = EXPRESSIVE_SYNTH_PRESETS.some(candidate => candidate.id === rawId)
    ? `user-${rawId}-${index + 1}`
    : rawId.slice(0, 96) || `user-program-${index + 1}`;
  return {
    id,
    label: String(source.label || `User program ${index + 1}`).trim().slice(0, 80) || `User program ${index + 1}`,
    preset: base.id,
    ...normalizeProgramParameters(source, base),
  };
};

const normalizeUserPrograms = value => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 128).map((program, index) => normalizeExpressiveSynthProgram(program, index)).map(program => {
    let id = program.id;
    let suffix = 2;
    while (seen.has(id)) id = `${program.id}-${suffix++}`;
    seen.add(id);
    return { ...program, id };
  });
};

export const normalizeExpressiveSynthConfig = value => {
  const source = value && typeof value === "object" ? value : {};
  const defaults = DEFAULT_EXPRESSIVE_SYNTH_CONFIG;
  return {
    version: 2,
    preset: EXPRESSIVE_SYNTH_PRESETS.some(preset => preset.id === source.preset) ? source.preset : defaults.preset,
    masterGain: clamp(finite(source.masterGain, defaults.masterGain), 0, 1),
    ...normalizeProgramParameters(source, defaults),
    referenceNote: clamp(finite(source.referenceNote, defaults.referenceNote), 0, 127),
    referenceY: clamp(finite(source.referenceY, defaults.referenceY), -100000, 100000),
    pixelsPerOctave: clamp(finite(source.pixelsPerOctave, defaults.pixelsPerOctave), 1, 10000),
    strokeWidthAmount: clamp(finite(source.strokeWidthAmount, defaults.strokeWidthAmount), -1, 1),
    speedAmount: clamp(finite(source.speedAmount, defaults.speedAmount), -1, 1),
    cursorVoices: source.cursorVoices !== false,
    triggerVoices: source.triggerVoices !== false,
    maxVoices: Math.round(clamp(finite(source.maxVoices, defaults.maxVoices), 1, 256)),
    userPrograms: normalizeUserPrograms(source.userPrograms),
  };
};

export const mergeExpressiveSynthConfig = (current, patch) => normalizeExpressiveSynthConfig({
  ...normalizeExpressiveSynthConfig(current),
  ...(patch || {}),
});

export const getExpressiveSynthPrograms = config => {
  const normalized = normalizeExpressiveSynthConfig(config);
  return [
    ...EXPRESSIVE_SYNTH_PRESETS.map(program => ({ ...program, preset: program.id, builtin: true })),
    ...normalized.userPrograms.map(program => ({ ...program, builtin: false })),
  ];
};

export const resolveExpressiveSynthProgram = (config, programId) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  const programs = getExpressiveSynthPrograms(normalized);
  const program = programs.find(candidate => candidate.id === programId)
    || programs.find(candidate => candidate.id === normalized.preset)
    || programs.find(candidate => candidate.id === "bowed");
  return mergeExpressiveSynthConfig(normalized, {
    preset: program.preset,
    ...Object.fromEntries([...EXPRESSIVE_SYNTH_PROGRAM_FIELDS, ...EXPRESSIVE_SYNTH_TIME_VALUE_FIELDS].map(field => [field, program[field]])),
  });
};

export const upsertExpressiveSynthProgram = (config, value) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  const program = normalizeExpressiveSynthProgram(value, normalized.userPrograms.length);
  if (EXPRESSIVE_SYNTH_PRESETS.some(candidate => candidate.id === program.id)) return normalized;
  const exists = normalized.userPrograms.some(candidate => candidate.id === program.id);
  return normalizeExpressiveSynthConfig({
    ...normalized,
    userPrograms: exists
      ? normalized.userPrograms.map(candidate => candidate.id === program.id ? program : candidate)
      : [...normalized.userPrograms, program],
  });
};

export const removeExpressiveSynthProgram = (config, programId) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  return normalizeExpressiveSynthConfig({
    ...normalized,
    userPrograms: normalized.userPrograms.filter(program => program.id !== programId),
  });
};

export const midiNoteToFrequency = note => 440 * (2 ** ((Number(note) - 69) / 12));

export const worldYToMidiNote = (worldY, config = DEFAULT_EXPRESSIVE_SYNTH_CONFIG) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  return normalized.referenceNote + normalized.transpose
    + ((normalized.referenceY - finite(worldY, normalized.referenceY)) * 12 / normalized.pixelsPerOctave);
};

export const mapCursorToExpressiveVoice = (cursor, config = DEFAULT_EXPRESSIVE_SYNTH_CONFIG, motion = {}) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  const position = cursor?.transform?.position || [0, normalized.referenceY];
  const strokeWidth = Math.max(0, finite(cursor?.curveElement?.strokeWidth, finite(cursor?.element?.strokeWidth, 1)));
  const widthExpression = clamp((strokeWidth - 1) / 9, 0, 1);
  const speed = Math.max(0, finite(motion.speed, 0));
  const speedExpression = clamp(speed / 900, 0, 1);
  const pressure = clamp(normalized.pressure + widthExpression * normalized.strokeWidthAmount, 0, 1);
  const brightness = clamp(normalized.brightness + speedExpression * normalized.speedAmount, 0, 1);
  const note = worldYToMidiNote(position[1], normalized);
  return {
    id: `cursor:${cursor?.element?.id || "unknown"}`,
    frequency: midiNoteToFrequency(note),
    note,
    pressure,
    brightness,
    gain: normalized.voiceGain * (0.3 + pressure * 0.7),
    pan: 0,
    position: [finite(position[0], 0), finite(position[1], normalized.referenceY)],
  };
};

export const mapGlissandoToExpressiveVoice = (assignment, config = DEFAULT_EXPRESSIVE_SYNTH_CONFIG, motion = {}) => {
  const normalized = normalizeExpressiveSynthConfig(config);
  const trigger = assignment?.trigger?.element || assignment?.triggerElement || null;
  const position = assignment?.position || [0, normalized.referenceY];
  const strokeWidth = Math.max(0, finite(trigger?.strokeWidth, 1));
  const widthExpression = clamp((strokeWidth - 1) / 9, 0, 1);
  const velocity = clamp(finite(assignment?.velocity, 100) / 127, 0, 1);
  const speedExpression = clamp(Math.max(0, finite(motion.speed, 0)) / 900, 0, 1);
  const pressure = clamp(velocity + widthExpression * normalized.strokeWidthAmount, 0, 1);
  const brightness = clamp(normalized.brightness + speedExpression * normalized.speedAmount, 0, 1);
  const note = clamp(finite(assignment?.note, normalized.referenceNote), 0, 127);
  return {
    frequency: midiNoteToFrequency(note),
    note,
    pressure,
    brightness,
    gain: normalized.voiceGain * (0.3 + pressure * 0.7),
    pan: 0,
    position: [finite(position[0], 0), finite(position[1], normalized.referenceY)],
  };
};

const setParam = (param, value, time, glideSeconds = 0) => {
  if (!param) return;
  const target = Number(value);
  if (!Number.isFinite(target)) return;
  try {
    param.cancelScheduledValues?.(time);
    if (glideSeconds > 0 && param.setTargetAtTime) {
      param.setTargetAtTime(target, time, Math.max(0.001, glideSeconds / 3));
    } else if (param.setValueAtTime) {
      param.setValueAtTime(target, time);
    } else {
      param.value = target;
    }
  } catch {
    param.value = target;
  }
};

const cutoffFor = (brightness, pressure) => {
  const value = clamp(brightness * 0.82 + pressure * 0.18, 0, 1);
  return 140 * (2 ** (value * 6.45));
};

const createNoiseSource = (context, seconds = 1) => {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
};

const createVoiceGraph = (context, destination, config, voiceState) => {
  const preset = EXPRESSIVE_SYNTH_PRESETS.find(candidate => candidate.id === config.preset) || EXPRESSIVE_SYNTH_PRESETS[0];
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.5 + (1 - config.damping) * 5;
  const envelope = context.createGain();
  const expression = context.createGain();
  const panner = context.createStereoPanner ? context.createStereoPanner() : context.createGain();
  filter.connect(envelope);
  envelope.connect(expression);
  expression.connect(panner);
  panner.connect(destination);

  const oscillators = [];
  const auxiliaries = [];
  const carrier = context.createOscillator();
  carrier.type = preset.waveform;
  carrier.frequency.value = voiceState.frequency;
  carrier.connect(filter);
  oscillators.push(carrier);

  if (preset.model === "fm") {
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    modulator.type = "sine";
    modulator.frequency.value = voiceState.frequency * 2;
    modGain.gain.value = voiceState.frequency * (0.5 + config.pressure * 3.5);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    oscillators.push(modulator);
    auxiliaries.push({ modulator, modGain });
  } else if (preset.model === "bowed" || preset.model === "reed") {
    const companion = context.createOscillator();
    const companionGain = context.createGain();
    companion.type = preset.model === "bowed" ? "triangle" : "sine";
    companion.frequency.value = voiceState.frequency * (preset.model === "bowed" ? 1.0025 : 2);
    companionGain.gain.value = preset.model === "bowed" ? 0.32 : 0.18;
    companion.connect(companionGain);
    companionGain.connect(filter);
    oscillators.push(companion);
    auxiliaries.push({ companion, companionGain });

    const noise = createNoiseSource(context);
    const noiseGain = context.createGain();
    noiseGain.gain.value = preset.model === "bowed" ? 0.018 + config.pressure * 0.055 : 0.008 + config.pressure * 0.025;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    oscillators.push(noise);
    auxiliaries.push({ noise, noiseGain });
  }

  const vibrato = context.createOscillator();
  const vibratoGain = context.createGain();
  vibrato.type = "sine";
  vibrato.frequency.value = config.vibratoRate;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(carrier.frequency);
  oscillators.push(vibrato);

  return { preset, carrier, filter, envelope, expression, panner, oscillators, auxiliaries, vibrato, vibratoGain };
};

export const isExpressiveSynthSupported = () => typeof window !== "undefined"
  && Boolean(window.AudioContext || window.webkitAudioContext);

export const createExpressiveSynth = ({
  config: initialConfig,
  contextFactory = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    return new AudioContextCtor();
  },
  now = () => performance.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
} = {}) => {
  let config = normalizeExpressiveSynthConfig(initialConfig);
  let context = null;
  let master = null;
  let compressor = null;
  let disposed = false;
  const voices = new Map();
  const cursorMotion = new Map();
  const scheduled = new Set();
  const channelState = new Map();

  const initialize = async () => {
    if (disposed) throw new Error("Expressive Synth has been disposed.");
    if (context) return output;
    context = contextFactory();
    master = context.createGain();
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 12;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    master.gain.value = config.masterGain;
    master.connect(compressor);
    compressor.connect(context.destination);
    return output;
  };

  const stopVoice = (id, immediate = false) => {
    const voice = voices.get(id);
    if (!voice || !context) return;
    voices.delete(id);
    const time = context.currentTime;
    const release = immediate ? 0.005 : (voice.config?.release ?? config.release);
    try {
      voice.graph.envelope.gain.cancelScheduledValues(time);
      voice.graph.envelope.gain.setTargetAtTime(0.0001, time, Math.max(0.001, release / 4));
      voice.graph.oscillators.forEach(oscillator => oscillator.stop(time + release + 0.05));
    } catch {
      // Nodes may already be stopped during a rapid panic/reset.
    }
    setTimer(() => {
      try { voice.graph.panner.disconnect(); } catch { /* already disconnected */ }
    }, (release + 0.1) * 1000);
  };

  const startVoice = (id, voiceState, voiceConfig = config) => {
    if (!context || !master || disposed) return null;
    if (voices.has(id)) return voices.get(id);
    const resolvedConfig = mergeExpressiveSynthConfig(config, voiceConfig);
    while (voices.size >= resolvedConfig.maxVoices) stopVoice(voices.keys().next().value, true);
    const normalizedState = {
      frequency: clamp(finite(voiceState?.frequency, 440), 8, 24000),
      gain: clamp(finite(voiceState?.gain, resolvedConfig.voiceGain), 0, 1),
      pressure: clamp(finite(voiceState?.pressure, resolvedConfig.pressure), 0, 1),
      brightness: clamp(finite(voiceState?.brightness, resolvedConfig.brightness), 0, 1),
      pan: clamp(finite(voiceState?.pan, 0), -1, 1),
    };
    const graph = createVoiceGraph(context, master, resolvedConfig, normalizedState);
    const time = context.currentTime;
    graph.envelope.gain.setValueAtTime(0.0001, time);
    graph.envelope.gain.linearRampToValueAtTime(1, time + resolvedConfig.attack);
    graph.envelope.gain.linearRampToValueAtTime(resolvedConfig.sustain, time + resolvedConfig.attack + resolvedConfig.decay);
    setParam(graph.expression.gain, normalizedState.gain, time);
    setParam(graph.filter.frequency, cutoffFor(normalizedState.brightness, normalizedState.pressure), time);
    setParam(graph.filter.Q, 0.5 + (1 - resolvedConfig.damping) * 5, time);
    setParam(graph.panner.pan, normalizedState.pan, time);
    setParam(graph.vibrato.frequency, resolvedConfig.vibratoRate, time);
    setParam(graph.vibratoGain.gain, normalizedState.frequency * (2 ** (resolvedConfig.vibratoDepth / 12) - 1), time);
    graph.oscillators.forEach(oscillator => oscillator.start(time));
    const voice = { id, state: normalizedState, graph, config: resolvedConfig };
    voices.set(id, voice);
    return voice;
  };

  const updateVoice = (id, nextState, voiceConfig = config) => {
    const resolvedConfig = mergeExpressiveSynthConfig(config, voiceConfig);
    const existing = voices.get(id);
    if (existing && existing.config?.preset !== resolvedConfig.preset) stopVoice(id, true);
    const voice = voices.get(id) || startVoice(id, nextState, resolvedConfig);
    if (!voice || !context) return;
    voice.config = resolvedConfig;
    const state = { ...voice.state, ...(nextState || {}) };
    state.frequency = clamp(finite(state.frequency, voice.state.frequency), 8, 24000);
    state.gain = clamp(finite(state.gain, voice.state.gain), 0, 1);
    state.pressure = clamp(finite(state.pressure, voice.state.pressure), 0, 1);
    state.brightness = clamp(finite(state.brightness, voice.state.brightness), 0, 1);
    state.pan = clamp(finite(state.pan, voice.state.pan), -1, 1);
    voice.state = state;
    const time = context.currentTime;
    const glide = resolvedConfig.glideMs / 1000;
    setParam(voice.graph.carrier.frequency, state.frequency, time, glide);
    voice.graph.auxiliaries.forEach(auxiliary => {
      if (auxiliary.modulator) {
        setParam(auxiliary.modulator.frequency, state.frequency * 2, time, glide);
        setParam(auxiliary.modGain.gain, state.frequency * (0.5 + state.pressure * 3.5), time, glide);
      }
      if (auxiliary.companion) {
        const ratio = voice.graph.preset.model === "bowed" ? 1.0025 : 2;
        setParam(auxiliary.companion.frequency, state.frequency * ratio, time, glide);
      }
      if (auxiliary.noiseGain) {
        const amount = voice.graph.preset.model === "bowed" ? 0.018 + state.pressure * 0.055 : 0.008 + state.pressure * 0.025;
        setParam(auxiliary.noiseGain.gain, amount, time, glide);
      }
    });
    setParam(voice.graph.expression.gain, state.gain, time, 0.025);
    setParam(voice.graph.filter.frequency, cutoffFor(state.brightness, state.pressure), time, 0.025);
    setParam(voice.graph.panner.pan, state.pan, time, 0.025);
    setParam(voice.graph.vibrato.frequency, resolvedConfig.vibratoRate, time);
    setParam(voice.graph.vibratoGain.gain, state.frequency * (2 ** (resolvedConfig.vibratoDepth / 12) - 1), time, glide);
  };

  const stopCursorVoices = () => {
    [...voices.keys()].filter(id => id.startsWith("cursor:")).forEach(id => stopVoice(id));
    [...cursorMotion.keys()].filter(id => id.startsWith("cursor:")).forEach(id => cursorMotion.delete(id));
  };

  const stopGlissandoVoices = () => {
    [...voices.keys()].filter(id => id.startsWith("glissando:")).forEach(id => stopVoice(id));
    [...cursorMotion.keys()].filter(id => id.startsWith("glissando:")).forEach(id => cursorMotion.delete(id));
  };

  const syncCursorVoices = (cursors, frameTime = now()) => {
    if (!context || !config.cursorVoices) {
      stopCursorVoices();
      return;
    }
    const activeIds = new Set();
    for (const cursor of cursors || []) {
      if (!cursor?.timeState?.active) continue;
      const id = `cursor:${cursor.element.id}`;
      activeIds.add(id);
      const position = cursor.transform?.position || [0, 0];
      const previous = cursorMotion.get(id);
      const dt = previous ? Math.max(0.001, (frameTime - previous.time) / 1000) : 0;
      const speed = previous ? Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1]) / dt : 0;
      cursorMotion.set(id, { position: [...position], time: frameTime });
      updateVoice(id, mapCursorToExpressiveVoice(cursor, config, { speed }));
    }
    [...voices.keys()]
      .filter(id => id.startsWith("cursor:") && !activeIds.has(id))
      .forEach(id => stopVoice(id));
    [...cursorMotion.keys()]
      .filter(id => id.startsWith("cursor:") && !activeIds.has(id))
      .forEach(id => cursorMotion.delete(id));
  };

  const syncRoutedCursorVoices = (assignments, frameTime = now()) => {
    if (!context || !config.cursorVoices) {
      stopCursorVoices();
      return;
    }
    const activeIds = new Set();
    for (const assignment of assignments || []) {
      const cursor = assignment?.cursor;
      const track = assignment?.track;
      if (!cursor?.timeState?.active || !track?.id) continue;
      const id = `cursor:${track.id}:${cursor.element.id}`;
      activeIds.add(id);
      const position = cursor.transform?.position || [0, 0];
      const previous = cursorMotion.get(id);
      const dt = previous ? Math.max(0.001, (frameTime - previous.time) / 1000) : 0;
      const speed = previous ? Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1]) / dt : 0;
      cursorMotion.set(id, { position: [...position], time: frameTime });
      const voiceConfig = resolveExpressiveSynthProgram(config, track.program);
      updateVoice(id, mapCursorToExpressiveVoice(cursor, voiceConfig, { speed }), voiceConfig);
    }
    [...voices.keys()]
      .filter(id => id.startsWith("cursor:") && !activeIds.has(id))
      .forEach(id => stopVoice(id));
    [...cursorMotion.keys()]
      .filter(id => id.startsWith("cursor:") && !activeIds.has(id))
      .forEach(id => cursorMotion.delete(id));
  };

  const syncRoutedGlissandoVoices = (assignments, frameTime = now()) => {
    if (!context || !config.triggerVoices) {
      stopGlissandoVoices();
      return;
    }
    const activeIds = new Set();
    for (const assignment of assignments || []) {
      const track = assignment?.track;
      const trigger = assignment?.trigger;
      if (!track?.id || !trigger?.element?.id) continue;
      const id = `glissando:${track.id}:${trigger.element.id}`;
      activeIds.add(id);
      const position = assignment.position || [0, 0];
      const previous = cursorMotion.get(id);
      const dt = previous ? Math.max(0.001, (frameTime - previous.time) / 1000) : 0;
      const speed = previous ? Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1]) / dt : 0;
      cursorMotion.set(id, { position: [...position], time: frameTime });
      const voiceConfig = resolveExpressiveSynthProgram(config, track.program);
      updateVoice(id, mapGlissandoToExpressiveVoice(assignment, voiceConfig, { speed }), voiceConfig);
    }
    [...voices.keys()]
      .filter(id => id.startsWith("glissando:") && !activeIds.has(id))
      .forEach(id => stopVoice(id));
    [...cursorMotion.keys()]
      .filter(id => id.startsWith("glissando:") && !activeIds.has(id))
      .forEach(id => cursorMotion.delete(id));
  };

  const clear = () => {
    scheduled.forEach(clearTimer);
    scheduled.clear();
    [...voices.keys()].forEach(id => stopVoice(id, true));
    cursorMotion.clear();
  };

  const sendNow = (data, route = null) => {
    if (!context || disposed || !config.triggerVoices) return;
    const message = Array.from(data || [], value => Number(value) & 0xff);
    if (!message.length) return;
    const routeId = String(route?.id || "default");
    const routeConfig = route?.config?.program
      ? resolveExpressiveSynthProgram(config, route.config.program)
      : mergeExpressiveSynthConfig(config, route?.config || {});
    const status = message[0] & 0xf0;
    const channel = message[0] & 0x0f;
    const note = message[1] & 0x7f;
    const velocity = message[2] & 0x7f;
    const channelKey = `${routeId}:${channel}`;
    if (status === 0x90 && velocity > 0) {
      const channelData = channelState.get(channelKey) || { bend: 0, brightness: routeConfig.brightness, expression: 1 };
      const id = `midi:${routeId}:${channel}:${note}`;
      const bentNote = note + channelData.bend;
      updateVoice(id, {
        frequency: midiNoteToFrequency(bentNote),
        gain: routeConfig.voiceGain * (velocity / 127) * channelData.expression,
        pressure: velocity / 127,
        brightness: channelData.brightness,
        pan: 0,
      }, routeConfig);
      const voice = voices.get(id);
      if (voice) voice.baseNote = note;
      return;
    }
    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      stopVoice(`midi:${routeId}:${channel}:${note}`);
      return;
    }
    if (status === 0xb0) {
      const controller = note;
      const channelData = channelState.get(channelKey) || { bend: 0, brightness: routeConfig.brightness, expression: 1 };
      if (controller === 74) channelData.brightness = velocity / 127;
      if (controller === 11) channelData.expression = velocity / 127;
      channelState.set(channelKey, channelData);
      return;
    }
    if (status === 0xe0) {
      const bend14 = note | (velocity << 7);
      const channelData = channelState.get(channelKey) || { bend: 0, brightness: routeConfig.brightness, expression: 1 };
      channelData.bend = ((bend14 - 8192) / 8192) * 2;
      channelState.set(channelKey, channelData);
      [...voices.entries()].forEach(([id, voice]) => {
        if (id.startsWith(`midi:${routeId}:${channel}:`) && Number.isFinite(voice.baseNote)) {
          updateVoice(id, { frequency: midiNoteToFrequency(voice.baseNote + channelData.bend) }, routeConfig);
        }
      });
    }
  };

  const output = {
    id: EXPRESSIVE_SYNTH_ID,
    name: "Expressive Synth",
    initialize,
    async resume() {
      await initialize();
      await context.resume?.();
      return context.state || "running";
    },
    getState: () => context?.state || "off",
    getVoiceCount: () => voices.size,
    getConfig: () => ({ ...config }),
    setConfig(patch) {
      const previousPreset = config.preset;
      config = mergeExpressiveSynthConfig(config, patch);
      if (master && context) setParam(master.gain, config.masterGain, context.currentTime, 0.03);
      if (previousPreset !== config.preset) clear();
      return { ...config };
    },
    startVoice,
    updateVoice,
    stopVoice,
    syncCursorVoices,
    syncRoutedCursorVoices,
    syncRoutedGlissandoVoices,
    stopCursorVoices,
    stopGlissandoVoices,
    send(data, timestamp) {
      if (!context || disposed) throw new Error("Expressive Synth audio is not enabled.");
      const delay = Number(timestamp) - now();
      if (Number.isFinite(delay) && delay > 1) {
        let timer;
        timer = setTimer(() => {
          scheduled.delete(timer);
          sendNow(data);
        }, delay);
        scheduled.add(timer);
        return;
      }
      sendNow(data);
    },
    sendRouted(routeId, data, timestamp, routeConfig = {}) {
      if (!context || disposed) throw new Error("Expressive Synth audio is not enabled.");
      const route = { id: routeId, config: routeConfig };
      const delay = Number(timestamp) - now();
      if (Number.isFinite(delay) && delay > 1) {
        let timer;
        timer = setTimer(() => {
          scheduled.delete(timer);
          sendNow(data, route);
        }, delay);
        scheduled.add(timer);
        return;
      }
      sendNow(data, route);
    },
    clear,
    async close() {
      if (disposed) return;
      clear();
      disposed = true;
      const closing = context;
      context = null;
      master = null;
      compressor = null;
      await closing?.close?.();
    },
  };

  return output;
};
