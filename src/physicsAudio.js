const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

export class PhysicsAudioRouter {
  constructor({ maxVoices = 24, midi = null } = {}) {
    this.maxVoices = maxVoices;
    this.midi = midi;
    this.context = null;
    this.voices = new Set();
  }

  async resume() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable.");
      this.context = new AudioContextClass({ latencyHint: "interactive" });
    }
    if (this.context.state !== "running") await this.context.resume();
    return this.context.state;
  }

  route(action, event) {
    if (action.kind === "midi") {
      const velocity = Math.round(clamp((event.impulse || event.relativeSpeed) * (action.velocityScale || 2), 1, 127));
      this.midi?.({ type: "note", note: Math.round(clamp(action.note || 60, 0, 127)), velocity, duration: Math.max(0.02, Number(action.duration) || 0.12), channel: Math.round(clamp(action.channel || 1, 1, 16)) }, event);
      return;
    }
    if (action.kind !== "synth" || !this.context || this.context.state !== "running" || this.voices.size >= this.maxVoices) return;
    const now = this.context.currentTime;
    const x = Number(event.point?.[0]) || 0;
    const base = Math.max(20, Number(action.frequency) || 220);
    const frequency = action.positionToPitch ? base * Math.pow(2, ((x % 600) / 600) * 2 - 1) : base;
    const amplitude = clamp((event.impulse || event.relativeSpeed || 1) * (Number(action.gainScale) || 0.0025), 0.005, 0.18);
    const duration = clamp(action.duration || 0.12, 0.02, 2);
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = typeof this.context.createStereoPanner === "function" ? this.context.createStereoPanner() : null;
    oscillator.type = ["sine", "square", "triangle", "sawtooth"].includes(action.waveform) ? action.waveform : "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(amplitude, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    if (panner) {
      panner.pan.setValueAtTime(action.positionToPan ? clamp(((x % 800) / 800) * 2 - 1, -1, 1) : 0, now);
      oscillator.connect(gain).connect(panner).connect(this.context.destination);
    } else oscillator.connect(gain).connect(this.context.destination);
    this.voices.add(oscillator);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  panic() {
    for (const oscillator of this.voices) {
      try { oscillator.stop(); } catch { /* already stopped */ }
    }
    this.voices.clear();
  }

  async dispose() {
    this.panic();
    await this.context?.close?.();
    this.context = null;
  }
}
