const resolveAudioContext = () => {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

export const playWebAudioTestTone = async ({
  AudioContextClass = resolveAudioContext(),
  frequency = 440,
  duration = 0.35,
} = {}) => {
  if (!AudioContextClass) throw new Error("Web Audio is unavailable in this browser.");
  const context = new AudioContextClass();
  try {
    await context.resume?.();
    if (context.state !== "running") {
      throw new Error(`Web Audio context is ${context.state || "not running"}.`);
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.015);
    gain.gain.setValueAtTime(0.16, context.currentTime + Math.max(0.02, duration - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const ended = new Promise(resolve => { oscillator.onended = resolve; });
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    await ended;
    return {
      state: context.state,
      sampleRate: context.sampleRate,
      channels: context.destination?.maxChannelCount || context.destination?.channelCount || 0,
    };
  } finally {
    await context.close?.();
  }
};
