// Lightweight, deterministic waveform geometry for audio preview objects.
// This is intentionally not an audio analyser: audio sources can stay cold
// until they are selected or connected, and their visual proxy never adds a
// per-frame readback or Web Audio node.

const hashText = value => {
  let hash = 2166136261;
  for (const character of String(value || "audio")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const createAudioWaveform = (seed = "audio", count = 64) => {
  const size = Math.max(8, Math.min(256, Math.round(Number(count) || 64)));
  let state = hashText(seed);
  const next = () => {
    state = Math.imul(state ^ (state >>> 13), 1274126177) >>> 0;
    return state / 0xffffffff;
  };
  return Array.from({ length: size }, (_, index) => {
    const envelope = 0.22 + 0.78 * Math.sin((index / Math.max(1, size - 1)) * Math.PI);
    const detail = 0.25 + next() * 0.75;
    return Math.max(0.06, Math.min(1, envelope * detail));
  });
};

export const audioWaveformPath = (amplitudes = []) => {
  // An unavailable file has no waveform data. Keep that state honest with a
  // neutral centerline rather than inventing a shape for the preview.
  if (!amplitudes.length) return "M0 16 H100";
  const width = 100;
  const center = 16;
  const step = width / Math.max(1, amplitudes.length - 1);
  const top = amplitudes.map((amplitude, index) => {
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((center - Math.max(1, amplitude * 13)) * 100) / 100;
    return `${index ? "L" : "M"}${x} ${y}`;
  }).join(" ");
  const bottom = amplitudes.slice().reverse().map((amplitude, reverseIndex) => {
    const index = amplitudes.length - reverseIndex - 1;
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((center + Math.max(1, amplitude * 13)) * 100) / 100;
    return `L${x} ${y}`;
  }).join(" ");
  return `${top} ${bottom} Z`;
};
