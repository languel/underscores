export const MIDI_PORT_NONE = "";
export const MIDI_PORT_ALL = "__all__";
export const INTERNAL_MIDI_SYNTH_ID = "__internal_gm_synth__";

const connectedOutputs = midiAccess => midiAccess?.outputs
  ? [...midiAccess.outputs.values()].filter(output => output?.state !== "disconnected")
  : [];

export const resolveMidiOutputRoute = ({
  midiAccess,
  selectedOutputId,
  fallbackEnabled = false,
  internalOutput = null,
} = {}) => {
  if (selectedOutputId === MIDI_PORT_NONE) return { outputs: [], kind: "none", fallback: false };
  if (selectedOutputId === MIDI_PORT_ALL) {
    return { outputs: connectedOutputs(midiAccess), kind: "all", fallback: false };
  }
  if (selectedOutputId === INTERNAL_MIDI_SYNTH_ID) {
    return {
      outputs: internalOutput ? [internalOutput] : [],
      kind: internalOutput ? "internal" : "internal-unavailable",
      fallback: false,
    };
  }
  const external = midiAccess?.outputs?.get?.(selectedOutputId);
  if (external && external.state !== "disconnected") {
    return { outputs: [external], kind: "external", fallback: false };
  }
  if (fallbackEnabled) {
    return {
      outputs: internalOutput ? [internalOutput] : [],
      kind: internalOutput ? "internal" : "internal-unavailable",
      fallback: true,
    };
  }
  return { outputs: [], kind: "external-unavailable", fallback: false };
};

export const resolveExternalMidiOutputs = (midiAccess, selectedOutputId) => {
  if (selectedOutputId === MIDI_PORT_NONE || selectedOutputId === INTERNAL_MIDI_SYNTH_ID || !midiAccess) return [];
  if (selectedOutputId === MIDI_PORT_ALL) return connectedOutputs(midiAccess);
  const output = midiAccess.outputs?.get?.(selectedOutputId);
  return output && output.state !== "disconnected" ? [output] : [];
};
