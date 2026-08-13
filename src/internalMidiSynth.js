import { isPercussionChannel, makeProgramChange, normalizeGmPrograms } from "./generalMidi.js";
import { INTERNAL_MIDI_SYNTH_ID } from "./midiOutputRouting.js";

const INTERNAL_MIDI_SYNTH_NAME = "Internal GM Synth";
const REALTIME_MIN = 0xf8;

export const createTinySynthBackend = async ({
  loadModules = async () => {
    const [{ default: JZZ }, { default: installTinySynth }] = await Promise.all([
      import("jzz"),
      import("jzz-synth-tiny"),
    ]);
    return { JZZ, installTinySynth };
  },
} = {}) => {
  const { JZZ, installTinySynth } = await loadModules();
  installTinySynth(JZZ);
  // TinySynth treats a supplied name as a process-wide synth key. Closing the
  // MIDI port does not remove that cached synth, so reopening a stuck named
  // port can reconnect the same graph and its stale voices. Use an unnamed
  // TinySynth port instead: every Underscores-owned backend is then a fresh
  // graph, while the public wrapper below retains its stable output identity.
  const port = await JZZ.synth.Tiny();
  const audioContext = JZZ.lib.getAudioContext();
  if (!audioContext) throw new Error("Web Audio is unavailable in this browser.");
  return {
    send: data => port.send(data),
    resume: () => audioContext.resume(),
    getState: () => audioContext.state,
    close: async () => {
      // TinySynth retains its own module-level reference to JZZ's AudioContext.
      // Closing JZZ.lib's context here leaves that reference pointing at a
      // permanently closed context, so the next Reset audio appears Ready but
      // cannot make sound. A reset instead closes this MIDI port and creates a
      // fresh unnamed synth on the still-live shared context.
      await port.close?.();
    },
  };
};

const loadTinySynthBackend = () => createTinySynthBackend();

export const isInternalMidiSynthSupported = () => typeof window !== "undefined"
  && Boolean(window.AudioContext || window.webkitAudioContext);

export const createInternalMidiSynth = ({
  programs,
  backendFactory = loadTinySynthBackend,
  now = () => performance.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = timer => clearTimeout(timer),
} = {}) => {
  let backend = null;
  let initialization = null;
  let disposed = false;
  let configuredPrograms = normalizeGmPrograms(programs);
  const scheduled = new Set();

  const sendNow = data => {
    if (!backend || disposed) return;
    const message = Array.from(data || [], value => Number(value) & 0xff);
    if (!message.length || message[0] >= REALTIME_MIN) return;
    backend.send(message);
  };

  const applyPrograms = () => {
    for (let channel = 1; channel <= 16; channel += 1) {
      if (!isPercussionChannel(channel)) sendNow(makeProgramChange(channel, configuredPrograms[channel]));
    }
  };

  const initialize = async () => {
    if (disposed) throw new Error("Internal synth has been disposed.");
    if (backend) return output;
    if (!initialization) {
      initialization = Promise.resolve(backendFactory()).then(async created => {
        if (!created?.send) throw new Error("TinySynth failed to create a MIDI output.");
        // Reset can occur while a user-gesture initialization is still loading
        // dynamic modules. Do not resurrect that late backend after disposal:
        // it could otherwise close a newly-created shared JZZ AudioContext.
        if (disposed) {
          await created.close?.();
          throw new Error("Internal synth has been disposed.");
        }
        backend = created;
        applyPrograms();
        return output;
      }).catch(error => {
        initialization = null;
        throw error;
      });
    }
    return initialization;
  };

  const clear = () => {
    scheduled.forEach(clearTimer);
    scheduled.clear();
    if (!backend) return;
    for (let channel = 0; channel < 16; channel += 1) {
      sendNow([0xb0 | channel, 64, 0]);
      sendNow([0xb0 | channel, 120, 0]);
      sendNow([0xb0 | channel, 123, 0]);
    }
  };

  const output = {
    id: INTERNAL_MIDI_SYNTH_ID,
    name: INTERNAL_MIDI_SYNTH_NAME,
    initialize,
    send(data, timestamp) {
      if (!backend || disposed) throw new Error("Internal synth audio is not enabled.");
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
    async resume() {
      await initialize();
      await backend.resume?.();
      applyPrograms();
      return backend.getState?.() || "running";
    },
    getState: () => backend?.getState?.() || (backend ? "running" : "off"),
    setPrograms(nextPrograms) {
      configuredPrograms = normalizeGmPrograms(nextPrograms);
      if (backend) applyPrograms();
    },
    setProgram(channelOneBased, program) {
      const next = normalizeGmPrograms({ ...configuredPrograms, [channelOneBased]: program });
      configuredPrograms = next;
      if (backend && !isPercussionChannel(channelOneBased)) {
        sendNow(makeProgramChange(channelOneBased, configuredPrograms[channelOneBased]));
      }
    },
    clear,
    async close() {
      if (disposed) return;
      clear();
      disposed = true;
      const current = backend;
      const pending = initialization;
      backend = null;
      initialization = null;
      await current?.close?.();
      // Wait for an in-flight backend creation to observe `disposed` and tear
      // itself down before a reset is allowed to make a new shared context.
      await pending?.catch?.(() => {});
    },
  };

  return output;
};

export const resumeInternalMidiSynth = output => output?.resume();
export const disposeInternalMidiSynth = output => output?.close();
