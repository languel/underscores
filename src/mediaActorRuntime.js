import { getMediaFeaturePoint } from "./mediaLandmarkOntology.js";

export const MEDIA_TRACE_LIMIT = 120;

const confidencePasses = (feature, minimum) => (
  feature?.confidence === null
  || feature?.confidence === undefined
  || Number(feature.confidence) >= minimum
);

export const createMediaBindingRuntimeState = () => ({
  filteredPoint: null,
  lastPointAt: 0,
  lastFrameAt: 0,
  gateActive: false,
  lastGateAt: 0,
  trace: [],
  stroke: null,
});

const filterPoint = (current, next, elapsedMs, smoothingMs) => {
  if (!current || smoothingMs <= 0 || elapsedMs <= 0) return { ...next };
  const alpha = 1 - Math.exp(-elapsedMs / smoothingMs);
  return {
    x: current.x + (next.x - current.x) * alpha,
    y: current.y + (next.y - current.y) * alpha,
    z: (current.z || 0) + ((next.z || 0) - (current.z || 0)) * alpha,
  };
};

export const resolveMediaBindingSignal = (binding, frame, state, now = performance.now()) => {
  const feature = frame?.feature?.(binding.featureId);
  const candidate = getMediaFeaturePoint(feature, "scene");
  const valid = Boolean(
    feature?.available
    && candidate
    && confidencePasses(feature, binding.signal.confidenceMin),
  );
  if (valid) {
    const gap = state.lastPointAt ? now - state.lastPointAt : Infinity;
    const point = gap <= binding.signal.missingGraceMs
      ? filterPoint(state.filteredPoint, candidate, Math.max(0, now - state.lastFrameAt), binding.signal.smoothingMs)
      : { ...candidate };
    state.filteredPoint = point;
    state.lastPointAt = now;
    state.lastFrameAt = now;
    if (binding.trace) {
      state.trace.push({ x: point.x, y: point.y, time: now });
      if (state.trace.length > MEDIA_TRACE_LIMIT) state.trace.splice(0, state.trace.length - MEDIA_TRACE_LIMIT);
    } else if (state.trace.length) {
      state.trace = [];
    }
    return { point: { ...point }, feature, stale: false };
  }
  state.lastFrameAt = now;
  if (state.filteredPoint && now - state.lastPointAt <= binding.signal.missingGraceMs) {
    return { point: { ...state.filteredPoint }, feature, stale: true };
  }
  return { point: null, feature, stale: true };
};

export const resolveMediaBindingGate = (binding, frame, state, now = performance.now()) => {
  if (!binding.gate.featureId) {
    state.gateActive = true;
    state.lastGateAt = now;
    return true;
  }
  const feature = frame?.feature?.(binding.gate.featureId);
  const valid = Boolean(feature?.available && confidencePasses(feature, binding.signal.confidenceMin));
  if (!valid) {
    if (state.gateActive && now - state.lastGateAt <= binding.signal.missingGraceMs) return true;
    state.gateActive = false;
    return false;
  }
  const active = binding.gate.comparator === "above"
    ? Number(feature.value) >= binding.gate.threshold
    : binding.gate.comparator === "below"
      ? Number(feature.value) <= binding.gate.threshold
      : Boolean(feature.active);
  state.gateActive = active;
  state.lastGateAt = now;
  return active;
};

export const mediaTargetAnchorOffset = (element, anchor = "center") => {
  const width = Number(element?.width) || 0;
  const height = Number(element?.height) || 0;
  if (anchor === "top-left") return { x: 0, y: 0 };
  if (anchor === "top") return { x: width / 2, y: 0 };
  if (anchor === "bottom") return { x: width / 2, y: height };
  if (anchor === "left") return { x: 0, y: height / 2 };
  if (anchor === "right") return { x: width, y: height / 2 };
  return { x: width / 2, y: height / 2 };
};

export const mediaDrivenElementPosition = (element, binding, point) => {
  const anchor = mediaTargetAnchorOffset(element, binding.anchor);
  const width = Number(element?.width) || 0;
  const height = Number(element?.height) || 0;
  const angle = Number(element?.angle) || 0;
  const dx = anchor.x - width / 2;
  const dy = anchor.y - height / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotatedAnchor = {
    x: width / 2 + dx * cosine - dy * sine,
    y: height / 2 + dx * sine + dy * cosine,
  };
  return {
    x: point.x + binding.offset.x - rotatedAnchor.x,
    y: point.y + binding.offset.y - rotatedAnchor.y,
  };
};

export const shouldAppendMediaStrokePoint = (points, point, minimumDistance = 0.75) => {
  const previous = points.at(-1);
  return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= minimumDistance;
};

export const mediaBindingRuntimeHasExpired = (state, now = performance.now()) => {
  if (!state?.stroke || !state.binding) return false;
  const timestamps = [state.lastPointAt];
  if (state.binding.gate?.featureId) timestamps.push(state.lastGateAt);
  if (timestamps.some(value => !Number.isFinite(value) || value <= 0)) return true;
  return now - Math.min(...timestamps) > state.binding.signal.missingGraceMs;
};
