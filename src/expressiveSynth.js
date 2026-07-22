export const EXPRESSIVE_SYNTH_ID = "__drawerator_expressive_synth__";
export const EXPRESSIVE_SYNTH_STORAGE_KEY = "drawerator_expressive_synth_v1";

export const EXPRESSIVE_SYNTH_PRESETS = Object.freeze([
  Object.freeze({ id: "sine", label: "Pure tone", waveform: "sine", model: "oscillator" }),
  Object.freeze({ id: "subtractive", label: "Warm subtractive", waveform: "sawtooth", model: "oscillator" }),
  Object.freeze({ id: "fm", label: "FM voice", waveform: "sine", model: "fm" }),
  Object.freeze({ id: "bowed", label: "Bowed string", waveform: "sawtooth", model: "bowed" }),
  Object.freeze({ id: "reed", label: "Reed / wind", waveform: "square", model: "reed" }),
]);

export const DEFAULT_EXPRESSIVE_SYNTH_CONFIG = Object.freeze({
  version: 1,
  preset: "bowed",
  masterGain: 0.24,
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
  referenceNote: 60,
  referenceY: 0,
  pixelsPerOctave: 100,
  glideMs: 24,
  strokeWidthAmount: 0.35,
  speedAmount: 0.16,
  cursorVoices: true,
  triggerVoices: true,
  maxVoices: 64,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const normalizeExpressiveSynthConfig = value => {
  const source = value && typeof value === "object" ? value : {};
  const defaults = DEFAULT_EXPRESSIVE_SYNTH_CONFIG;
  return {
    version: 1,
    preset: EXPRESSIVE_SYNTH_PRESETS.some(preset => preset.id === source.preset) ? source.preset : defaults.preset,
    masterGain: clamp(finite(source.masterGain, defaults.masterGain), 0, 1),
    voiceGain: clamp(finite(source.voiceGain, defaults.voiceGain), 0, 1),
    attack: clamp(finite(source.attack, defaults.attack), 0.001, 10),
    decay: clamp(finite(source.decay, defaults.decay), 0.001, 10),
    sustain: clamp(finite(source.sustain, defaults.sustain), 0, 1),
    release: clamp(finite(source.release, defaults.release), 0.005, 20),
    brightness: clamp(finite(source.brightness, defaults.brightness), 0, 1),
    damping: clamp(finite(source.damping, defaults.damping), 0, 1),
    pressure: clamp(finite(source.pressure, defaults.pressure), 0, 1),
    vibratoDepth: clamp(finite(source.vibratoDepth, defaults.vibratoDepth), 0, 2),
    vibratoRate: clamp(finite(source.vibratoRate, defaults.vibratoRate), 0.05, 20),
    transpose: clamp(finite(source.transpose, defaults.transpose), -48, 48),
    referenceNote: clamp(finite(source.referenceNote, defaults.referenceNote), 0, 127),
    referenceY: clamp(finite(source.referenceY, defaults.referenceY), -100000, 100000),
    pixelsPerOctave: clamp(finite(source.pixelsPerOctave, defaults.pixelsPerOctave), 1, 10000),
    glideMs: clamp(finite(source.glideMs, defaults.glideMs), 0, 2000),
    strokeWidthAmount: clamp(finite(source.strokeWidthAmount, defaults.strokeWidthAmount), -1, 1),
    speedAmount: clamp(finite(source.speedAmount, defaults.speedAmount), -1, 1),
    cursorVoices: source.cursorVoices !== false,
    triggerVoices: source.triggerVoices !== false,
    maxVoices: Math.round(clamp(finite(source.maxVoices, defaults.maxVoices), 1, 256)),
  };
};

export const mergeExpressiveSynthConfig = (current, patch) => normalizeExpressiveSynthConfig({
  ...normalizeExpressiveSynthConfig(current),
  ...(patch || {}),
});

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
    const release = immediate ? 0.005 : config.release;
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

  const startVoice = (id, voiceState) => {
    if (!context || !master || disposed) return null;
    if (voices.has(id)) return voices.get(id);
    while (voices.size >= config.maxVoices) stopVoice(voices.keys().next().value, true);
    const normalizedState = {
      frequency: clamp(finite(voiceState?.frequency, 440), 8, 24000),
      gain: clamp(finite(voiceState?.gain, config.voiceGain), 0, 1),
      pressure: clamp(finite(voiceState?.pressure, config.pressure), 0, 1),
      brightness: clamp(finite(voiceState?.brightness, config.brightness), 0, 1),
      pan: clamp(finite(voiceState?.pan, 0), -1, 1),
    };
    const graph = createVoiceGraph(context, master, config, normalizedState);
    const time = context.currentTime;
    graph.envelope.gain.setValueAtTime(0.0001, time);
    graph.envelope.gain.linearRampToValueAtTime(1, time + config.attack);
    graph.envelope.gain.linearRampToValueAtTime(config.sustain, time + config.attack + config.decay);
    setParam(graph.expression.gain, normalizedState.gain, time);
    setParam(graph.filter.frequency, cutoffFor(normalizedState.brightness, normalizedState.pressure), time);
    setParam(graph.filter.Q, 0.5 + (1 - config.damping) * 5, time);
    setParam(graph.panner.pan, normalizedState.pan, time);
    setParam(graph.vibrato.frequency, config.vibratoRate, time);
    setParam(graph.vibratoGain.gain, normalizedState.frequency * (2 ** (config.vibratoDepth / 12) - 1), time);
    graph.oscillators.forEach(oscillator => oscillator.start(time));
    const voice = { id, state: normalizedState, graph };
    voices.set(id, voice);
    return voice;
  };

  const updateVoice = (id, nextState) => {
    const voice = voices.get(id) || startVoice(id, nextState);
    if (!voice || !context) return;
    const state = { ...voice.state, ...(nextState || {}) };
    state.frequency = clamp(finite(state.frequency, voice.state.frequency), 8, 24000);
    state.gain = clamp(finite(state.gain, voice.state.gain), 0, 1);
    state.pressure = clamp(finite(state.pressure, voice.state.pressure), 0, 1);
    state.brightness = clamp(finite(state.brightness, voice.state.brightness), 0, 1);
    state.pan = clamp(finite(state.pan, voice.state.pan), -1, 1);
    voice.state = state;
    const time = context.currentTime;
    const glide = config.glideMs / 1000;
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
    setParam(voice.graph.vibratoGain.gain, state.frequency * (2 ** (config.vibratoDepth / 12) - 1), time, glide);
  };

  const stopCursorVoices = () => {
    [...voices.keys()].filter(id => id.startsWith("cursor:")).forEach(id => stopVoice(id));
    cursorMotion.clear();
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
    [...cursorMotion.keys()].filter(id => !activeIds.has(id)).forEach(id => cursorMotion.delete(id));
  };

  const clear = () => {
    scheduled.forEach(clearTimer);
    scheduled.clear();
    [...voices.keys()].forEach(id => stopVoice(id, true));
    cursorMotion.clear();
  };

  const sendNow = data => {
    if (!context || disposed || !config.triggerVoices) return;
    const message = Array.from(data || [], value => Number(value) & 0xff);
    if (!message.length) return;
    const status = message[0] & 0xf0;
    const channel = message[0] & 0x0f;
    const note = message[1] & 0x7f;
    const velocity = message[2] & 0x7f;
    if (status === 0x90 && velocity > 0) {
      const channelData = channelState.get(channel) || { bend: 0, brightness: config.brightness, expression: 1 };
      const id = `midi:${channel}:${note}`;
      const bentNote = note + channelData.bend;
      updateVoice(id, {
        frequency: midiNoteToFrequency(bentNote),
        gain: config.voiceGain * (velocity / 127) * channelData.expression,
        pressure: velocity / 127,
        brightness: channelData.brightness,
        pan: 0,
      });
      const voice = voices.get(id);
      if (voice) voice.baseNote = note;
      return;
    }
    if (status === 0x80 || (status === 0x90 && velocity === 0)) {
      stopVoice(`midi:${channel}:${note}`);
      return;
    }
    if (status === 0xb0) {
      const controller = note;
      const channelData = channelState.get(channel) || { bend: 0, brightness: config.brightness, expression: 1 };
      if (controller === 74) channelData.brightness = velocity / 127;
      if (controller === 11) channelData.expression = velocity / 127;
      channelState.set(channel, channelData);
      return;
    }
    if (status === 0xe0) {
      const bend14 = note | (velocity << 7);
      const channelData = channelState.get(channel) || { bend: 0, brightness: config.brightness, expression: 1 };
      channelData.bend = ((bend14 - 8192) / 8192) * 2;
      channelState.set(channel, channelData);
      [...voices.entries()].forEach(([id, voice]) => {
        if (id.startsWith(`midi:${channel}:`) && Number.isFinite(voice.baseNote)) {
          updateVoice(id, { frequency: midiNoteToFrequency(voice.baseNote + channelData.bend) });
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
    stopCursorVoices,
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

