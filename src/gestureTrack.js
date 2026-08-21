export const UNDERSCORES_GESTURE_VERSION = 1;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp01 = value => Math.min(1, Math.max(0, finite(value)));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

const wrap = (value, length) => {
  if (!(length > 0)) return 0;
  return ((value % length) + length) % length;
};

const normalizeSamples = (samples, duration) => {
  const source = Array.isArray(samples) ? samples : [];
  if (!source.length) return [];
  const lastIndex = Math.max(1, source.length - 1);
  const distances = source.map((sample, index) => {
    if (index === 0) return 0;
    const previous = source[index - 1];
    const x = finite(sample?.scene?.x, finite(sample?.x, NaN));
    const y = finite(sample?.scene?.y, finite(sample?.y, NaN));
    const previousX = finite(previous?.scene?.x, finite(previous?.x, NaN));
    const previousY = finite(previous?.scene?.y, finite(previous?.y, NaN));
    return [x, y, previousX, previousY].every(Number.isFinite)
      ? Math.hypot(x - previousX, y - previousY)
      : 0;
  });
  const travelled = [];
  let totalDistance = 0;
  distances.forEach(distance => {
    totalDistance += distance;
    travelled.push(totalDistance);
  });
  return source.map((sample, index) => ({
    t: Math.min(duration, Math.max(0, finite(sample?.t, finite(sample?.time) / 1000))),
    pathProgress: clamp01(sample?.pathProgress ?? (totalDistance > 0 ? travelled[index] / totalDistance : index / lastIndex)),
    pressure: Math.min(1, Math.max(0, finite(sample?.pressure, 0.5))),
    speed: Math.max(0, finite(sample?.speed ?? sample?.data?.speed)),
    phase: sample?.phase || (index === 0 ? "start" : index === source.length - 1 ? "end" : "move"),
    ...(sample?.recording ? { recording: clone(sample.recording) } : {}),
  }));
};

export const normalizeGestureTrack = value => {
  if (!value || typeof value !== "object") return null;
  const duration = Math.max(0.001, finite(value.duration, value.recordedDuration || 0.001));
  const loopStart = Math.max(0, finite(value.loop?.start));
  const loopEnd = Math.max(loopStart + 0.001, finite(value.loop?.end, loopStart + duration));
  return {
    version: UNDERSCORES_GESTURE_VERSION,
    id: value.id || null,
    kind: value.kind || "stroke",
    source: value.source || "pointer",
    duration,
    durationValue: clone(value.durationValue || { version: 1, expression: `${duration} s`, fallbackSeconds: duration }),
    startTime: finite(value.startTime, loopStart),
    // Arrangement playback is rendered by the lightweight SVG overlay. Keep
    // the authored visual weight with the lifecycle instead of depending on
    // a later scene/style read after the source is hidden or regenerated.
    strokeWidth: value.strokeWidth == null ? null : Math.max(0.5, finite(value.strokeWidth, 1)),
    samples: normalizeSamples(value.samples, duration),
    loop: { start: loopStart, end: loopEnd },
    playback: {
      enabled: value.playback?.enabled === true,
      clock: value.playback?.clock || "transport",
      mode: value.playback?.mode || "loop",
    },
    sourceOpacity: Math.min(100, Math.max(0, finite(value.sourceOpacity, 100))),
  };
};

export const createGestureTrack = ({
  id,
  samples = [],
  duration = 0,
  durationValue,
  startTime = 0,
  loopStart = 0,
  loopEnd,
  source = "pointer",
  enabled = false,
  sourceOpacity = 100,
  strokeWidth = null,
} = {}) => normalizeGestureTrack({
  version: UNDERSCORES_GESTURE_VERSION,
  id: id || crypto.randomUUID(),
  kind: "stroke",
  source,
  duration: Math.max(0.001, finite(duration, 0.001)),
  durationValue,
  startTime,
  strokeWidth,
  samples,
  loop: {
    start: loopStart,
    end: loopEnd ?? loopStart + Math.max(0.001, finite(duration, 0.001)),
  },
  playback: { enabled, clock: "transport", mode: "loop" },
  sourceOpacity,
});

export const gesturePathProgressAtElapsed = (trackValue, elapsedSeconds) => {
  const track = normalizeGestureTrack(trackValue);
  if (!track) return 0;
  const elapsed = Math.min(track.duration, Math.max(0, finite(elapsedSeconds)));
  const samples = track.samples;
  if (samples.length < 2) return clamp01(elapsed / track.duration);
  if (elapsed <= samples[0].t) return samples[0].pathProgress;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (elapsed > next.t) continue;
    const span = Math.max(0.000001, next.t - previous.t);
    const amount = clamp01((elapsed - previous.t) / span);
    return previous.pathProgress + (next.pathProgress - previous.pathProgress) * amount;
  }
  return 1;
};

export const getGesturePlaybackState = (trackValue, transportTime, loopOverride = null) => {
  const track = normalizeGestureTrack(trackValue);
  if (!track?.playback.enabled) return { visible: false, progress: 0, elapsed: 0, complete: false };
  const loopStart = Math.max(0, finite(loopOverride?.start, track.loop.start));
  const loopEnd = Math.max(loopStart + 0.001, finite(loopOverride?.end, track.loop.end));
  const loopDuration = loopEnd - loopStart;
  const phase = wrap(finite(transportTime) - loopStart, loopDuration);
  const startOffset = wrap(track.startTime - loopStart, loopDuration);
  const crossesLoopEnd = track.duration > loopDuration - startOffset;
  let elapsed;
  if (phase >= startOffset) elapsed = phase - startOffset;
  else if (crossesLoopEnd) elapsed = loopDuration - startOffset + phase;
  else return { visible: false, progress: 0, elapsed: 0, complete: false };

  if (elapsed >= track.duration) {
    return { visible: true, progress: 1, elapsed, complete: true };
  }
  return {
    visible: true,
    progress: gesturePathProgressAtElapsed(track, elapsed),
    elapsed,
    complete: false,
  };
};

export const sliceGesturePath = (points, progressValue) => {
  const source = Array.isArray(points) ? points : [];
  const progress = clamp01(progressValue);
  if (source.length < 2 || progress <= 0) return source.slice(0, Math.min(1, source.length));
  if (progress >= 1) return source.map(point => [...point]);
  const lengths = [];
  let total = 0;
  for (let index = 1; index < source.length; index += 1) {
    const length = Math.hypot(source[index][0] - source[index - 1][0], source[index][1] - source[index - 1][1]);
    lengths.push(length);
    total += length;
  }
  if (!(total > 0)) return source.slice(0, 2).map(point => [...point]);
  const target = total * progress;
  const result = [[...source[0]]];
  let traversed = 0;
  for (let index = 1; index < source.length; index += 1) {
    const length = lengths[index - 1];
    if (traversed + length <= target) {
      result.push([...source[index]]);
      traversed += length;
      continue;
    }
    const amount = length > 0 ? (target - traversed) / length : 0;
    result.push([
      source[index - 1][0] + (source[index][0] - source[index - 1][0]) * amount,
      source[index - 1][1] + (source[index][1] - source[index - 1][1]) * amount,
    ]);
    break;
  }
  return result;
};
