export const MIDI_REALTIME = Object.freeze({
  clock: 0xf8,
  start: 0xfa,
  continue: 0xfb,
  stop: 0xfc,
  songPosition: 0xf2,
});

export const clampTempo = value => Math.min(400, Math.max(20, Number(value) || 120));

export const normalizeTimeSignature = signature => ({
  numerator: Math.min(32, Math.max(1, Math.round(Number(signature?.numerator) || 4))),
  denominator: [1, 2, 4, 8, 16].includes(Number(signature?.denominator))
    ? Number(signature.denominator)
    : 4,
});

export const formatTimecode = (seconds, fps = 30) => {
  const safeFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;
  const totalFrames = Math.max(0, Math.floor((Number(seconds) || 0) * safeFps + 1e-7));
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return [hours, minutes, secs, frames].map(value => String(value).padStart(2, "0")).join(":");
};

export const secondsToFrame = (seconds, fps = 30) => {
  const safeFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;
  return Math.max(0, Math.floor((Number(seconds) || 0) * safeFps + 1e-7));
};

export const frameToSeconds = (frame, fps = 30) => {
  const safeFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;
  return Math.max(0, Number(frame) || 0) / safeFps;
};

export const secondsToMusicalPosition = (seconds, tempo = 120, signature = { numerator: 4, denominator: 4 }) => {
  const bpm = clampTempo(tempo);
  const meter = normalizeTimeSignature(signature);
  const quarterNotes = Math.max(0, Number(seconds) || 0) * bpm / 60;
  const meterBeats = quarterNotes * meter.denominator / 4;
  const beatsPerBar = meter.numerator;
  const barIndex = Math.floor(meterBeats / beatsPerBar);
  const beatWithinBar = meterBeats - barIndex * beatsPerBar;
  const beatIndex = Math.floor(beatWithinBar);
  const sixteenthWithinBeat = Math.floor((beatWithinBar - beatIndex) * 16) + 1;
  return {
    bar: barIndex + 1,
    beat: beatIndex + 1,
    sixteenth: Math.min(16, sixteenthWithinBeat),
    quarterNotes,
  };
};

export const formatMusicalPosition = (seconds, tempo, signature) => {
  const position = secondsToMusicalPosition(seconds, tempo, signature);
  return `${position.bar}.${position.beat}.${position.sixteenth}`;
};

export const musicalPositionToSeconds = (value, tempo = 120, signature = { numerator: 4, denominator: 4 }) => {
  const meter = normalizeTimeSignature(signature);
  const [barValue = 1, beatValue = 1, sixteenthValue = 1] = String(value).trim().split(/[.:]/).map(Number);
  const bar = Math.max(1, Math.floor(barValue) || 1);
  const beat = Math.min(meter.numerator, Math.max(1, Math.floor(beatValue) || 1));
  const sixteenth = Math.min(16, Math.max(1, Math.floor(sixteenthValue) || 1));
  const meterBeats = (bar - 1) * meter.numerator + (beat - 1) + (sixteenth - 1) / 16;
  const quarterNotes = meterBeats * 4 / meter.denominator;
  return quarterNotes * 60 / clampTempo(tempo);
};

export const parseTimecode = (value, fps = 30) => {
  const safeFps = [24, 25, 30, 50, 60].includes(Number(fps)) ? Number(fps) : 30;
  const parts = String(value).trim().split(":").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part))) return 0;
  const [hours, minutes, seconds, frames] = parts;
  return Math.max(0, hours * 3600 + minutes * 60 + seconds + Math.min(safeFps - 1, Math.max(0, frames)) / safeFps);
};

export const formatTimelinePosition = (seconds, mode, { fps = 30, tempo = 120, signature } = {}) => {
  if (mode === "frame") return String(secondsToFrame(seconds, fps));
  if (mode === "beats") return formatMusicalPosition(seconds, tempo, signature);
  return formatTimecode(seconds, fps);
};

export const parseTimelinePosition = (value, mode, { fps = 30, tempo = 120, signature } = {}) => {
  if (mode === "frame") return frameToSeconds(value, fps);
  if (mode === "beats") return musicalPositionToSeconds(value, tempo, signature);
  return parseTimecode(value, fps);
};

export const createTimelineTicks = (duration, count = 12) => {
  const safeDuration = Math.max(0.001, Number(duration) || 0.001);
  const safeCount = Math.max(2, Math.floor(Number(count) || 12));
  return Array.from({ length: safeCount + 1 }, (_, index) => ({
    time: safeDuration * index / safeCount,
    percent: index * 100 / safeCount,
  }));
};

export const midiClockIntervalMs = tempo => 60000 / (clampTempo(tempo) * 24);

export const songPositionToSeconds = (lsb, msb, tempo) => {
  const sixteenthNotes = (Number(lsb) & 0x7f) | ((Number(msb) & 0x7f) << 7);
  const quarterNotes = sixteenthNotes / 4;
  return quarterNotes * 60 / clampTempo(tempo);
};

export const estimateMidiClockTempo = (previousTimestamp, timestamp, previousTempo = 120) => {
  const delta = Number(timestamp) - Number(previousTimestamp);
  if (!Number.isFinite(delta) || delta <= 0 || delta > 1000) return clampTempo(previousTempo);
  const instantaneous = 60000 / (delta * 24);
  return clampTempo(previousTempo * 0.85 + instantaneous * 0.15);
};

const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const createMidiClockReceiverState = (tempo = 120) => ({
  tempo: clampTempo(tempo),
  lastTimestamp: null,
  intervals: [],
});

/**
 * Advances the 24 PPQN MIDI-clock receiver without conflating clock phase and
 * the user-visible tempo. MIDI Clock does not contain a numeric BPM value, so
 * tempo following is deliberately opt-in. When enabled, a median-gated window
 * rejects browser scheduling spikes before applying a damped estimate.
 */
export const advanceMidiClockReceiver = (
  previousState,
  timestamp,
  { followTempo = false, minSamples = 12, maxSamples = 48 } = {},
) => {
  const state = previousState || createMidiClockReceiverState();
  const nextTimestamp = Number(timestamp);
  const priorTimestamp = Number(state.lastTimestamp);
  const delta = nextTimestamp - priorTimestamp;
  let intervals = Array.isArray(state.intervals) ? [...state.intervals] : [];

  if (Number.isFinite(delta) && state.lastTimestamp !== null) {
    if (delta > 500) {
      intervals = [];
    } else if (delta >= 5 && delta <= 250) {
      intervals.push(delta);
      intervals = intervals.slice(-Math.max(minSamples, maxSamples));
    }
  }

  let tempo = clampTempo(state.tempo);
  let ready = false;
  if (followTempo && intervals.length >= minSamples) {
    const center = median(intervals);
    const inliers = intervals.filter(value => value >= center * 0.75 && value <= center * 1.25);
    if (inliers.length >= minSamples) {
      const meanInterval = inliers.reduce((sum, value) => sum + value, 0) / inliers.length;
      const measuredTempo = clampTempo(60000 / (meanInterval * 24));
      tempo = clampTempo(tempo * 0.8 + measuredTempo * 0.2);
      ready = true;
    }
  }

  return {
    state: {
      tempo,
      lastTimestamp: Number.isFinite(nextTimestamp) ? nextTimestamp : state.lastTimestamp,
      intervals,
    },
    tempo,
    secondsPerPulse: 60 / (tempo * 24),
    ready,
  };
};
