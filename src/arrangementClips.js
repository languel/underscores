import { createTimeValue, resolveTimeValue } from "./timeValue.js";

export const UNDERSCORES_ARRANGEMENT_VERSION = 2;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => Math.max(0, finite(value, fallback));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const wrap = (value, length) => length > 0 ? ((value % length) + length) % length : 0;
const makeId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

const normalizeTimelineTrack = (value, index = 0) => ({
  id: String(value?.id || makeId("track")),
  name: String(value?.name || `Track ${index + 1}`),
  order: finite(value?.order, index),
  enabled: value?.enabled !== false,
  muted: value?.muted === true,
  solo: value?.solo === true,
});

const timelineSourceKind = value => ["history", "element", "command", "media", "livecode"].includes(value) ? value : "element";

export const normalizeTimelineClip = (value = {}, context) => {
  const base = normalizeArrangementClip(value, context);
  const source = timelineSourceKind(value.source || value.sourceKind || (value.historyAction ? "history" : value.elementId ? "element" : "command"));
  return {
    id: String(value.id || makeId("timeline_clip")),
    trackId: String(value.trackId || "track-1"),
    source,
    label: String(value.label || value.name || value.commandId || value.historyAction?.commandId || value.elementId || "Clip"),
    elementId: value.elementId ? String(value.elementId) : null,
    historyActionId: value.historyActionId ? String(value.historyActionId) : value.actionId ? String(value.actionId) : null,
    commandId: value.commandId ? String(value.commandId) : value.historyAction?.commandId ? String(value.historyAction.commandId) : null,
    historyAction: clone(value.historyAction || value.action || null),
    enabled: value.enabled !== false,
    timing: base.timing,
    recording: base.recording,
  };
};

export const createTimelineTrack = (value = {}, index = 0) => normalizeTimelineTrack(value, index);
export const createTimelineClip = (value = {}, context) => normalizeTimelineClip(value, context);

const normalizeTake = (value, index = 0) => ({
  id: String(value?.id || makeId("take")),
  name: String(value?.name || `Take ${index + 1}`),
  order: finite(value?.order, index),
  enabled: value?.enabled !== false,
  muted: value?.muted === true,
  solo: value?.solo === true,
  recordingId: value?.recordingId ? String(value.recordingId) : null,
});

export const createArrangementState = (value = {}) => {
  const takes = (Array.isArray(value.takes) ? value.takes : []).map(normalizeTake);
  const timelineMode = value.timelineMode === "clips" ? "clips" : "objects";
  const rawClipTracks = Array.isArray(value.clipTracks) ? value.clipTracks : Array.isArray(value.timelineTracks) ? value.timelineTracks : [];
  const clipTracks = (rawClipTracks.length || timelineMode !== "clips"
    ? rawClipTracks
    : [
        { id: "track-1", name: "Track 1", order: 0 },
        { id: "track-2", name: "Track 2", order: 1 },
        { id: "track-3", name: "Track 3", order: 2 },
      ]).map(normalizeTimelineTrack);
  const timelineClips = (Array.isArray(value.timelineClips) ? value.timelineClips : Array.isArray(value.clips) ? value.clips : []).map(clip => normalizeTimelineClip(clip));
  return {
    version: UNDERSCORES_ARRANGEMENT_VERSION,
    takes,
    laneOrder: [...new Set((Array.isArray(value.laneOrder) ? value.laneOrder : []).map(String))],
    timelineMode,
    clipTracks,
    timelineClips,
    recording: {
      mode: value.recording?.mode === "step" ? "step" : "rolling",
      stepValue: createTimeValue(value.recording?.stepValue || "1 f"),
      stepDurationMode: value.recording?.stepDurationMode === "fixed" ? "fixed" : "hold",
    },
  };
};

export const createArrangementTake = (value = {}, index = 0) => normalizeTake(value, index);

export const normalizeArrangementClip = (value = {}, context) => {
  const start = positive(value.timing?.start ?? value.start);
  const duration = positive(value.timing?.duration ?? value.duration);
  const startValue = createTimeValue(value.timing?.startValue || value.startValue || start, start, context);
  const durationValue = createTimeValue(value.timing?.durationValue || value.durationValue || duration, duration, context);
  return {
    id: String(value.id || makeId("clip")),
    takeId: value.takeId ? String(value.takeId) : null,
    enabled: value.enabled !== false,
    timing: {
      start,
      startValue,
      duration,
      durationValue,
      durationMode: value.timing?.durationMode === "hold" ? "hold" : "fixed",
      sourceOffset: positive(value.timing?.sourceOffset ?? value.sourceOffset),
      rate: Math.max(0.000001, finite(value.timing?.rate ?? value.rate, 1)),
      loopMode: value.timing?.loopMode === "loop" ? "loop" : "once",
    },
    recording: {
      mode: value.recording?.mode === "step" ? "step" : "rolling",
      unwrappedStart: finite(value.recording?.unwrappedStart, start),
      transportStart: finite(value.recording?.transportStart, start),
      loopStart: finite(value.recording?.loopStart),
      loopEnd: finite(value.recording?.loopEnd),
      loopIteration: Math.max(0, Math.floor(finite(value.recording?.loopIteration))),
      recordingId: String(value.recording?.recordingId || makeId("recording")),
    },
  };
};

export const createArrangementClip = (value = {}, context) => normalizeArrangementClip(value, context);

export const getElementArrangement = element => {
  const value = element?.customData?.underscoresArrangement;
  if (!value || value.mode !== "clips") return null;
  return {
    version: UNDERSCORES_ARRANGEMENT_VERSION,
    mode: "clips",
    clips: (Array.isArray(value.clips) ? value.clips : []).map(clip => normalizeArrangementClip(clip)),
  };
};

export const getElementArrangementClips = element => getElementArrangement(element)?.clips || [];

export const setElementArrangementClips = (element, clips) => {
  const next = clone(element) || {};
  next.customData = { ...(next.customData || {}) };
  const normalized = (Array.isArray(clips) ? clips : []).map(clip => normalizeArrangementClip(clip));
  if (!normalized.length) {
    delete next.customData.underscoresArrangement;
    return next;
  }
  next.customData.underscoresArrangement = {
    version: UNDERSCORES_ARRANGEMENT_VERSION,
    mode: "clips",
    clips: normalized,
  };
  return next;
};

export const addElementArrangementClip = (element, clip) => setElementArrangementClips(
  element,
  [...getElementArrangementClips(element), normalizeArrangementClip(clip)],
);

export const removeElementArrangementClip = (element, clipId) => setElementArrangementClips(
  element,
  getElementArrangementClips(element).filter(clip => clip.id !== clipId),
);

export const resolveClipTiming = (clipValue, context) => {
  const clip = normalizeArrangementClip(clipValue, context);
  return {
    ...clip.timing,
    start: Math.max(0, resolveTimeValue(clip.timing.startValue, context) || clip.timing.start),
    duration: Math.max(0, resolveTimeValue(clip.timing.durationValue, context) || clip.timing.duration),
  };
};

export const evaluateClipAtTime = (clipValue, transportTime, options = {}) => {
  const clip = normalizeArrangementClip(clipValue, options.context);
  const timing = resolveClipTiming(clip, options.context);
  const time = finite(transportTime);
  const projectEnd = Math.max(timing.start, finite(options.projectEnd, Infinity));
  const end = timing.durationMode === "hold" ? projectEnd : timing.start + timing.duration;
  const active = clip.enabled && time >= timing.start && time < end;
  const elapsed = Math.max(0, time - timing.start);
  const sourceTime = timing.sourceOffset + elapsed * timing.rate;
  const intrinsicDuration = positive(options.intrinsicDuration);
  const iteration = intrinsicDuration > 0 ? Math.floor(sourceTime / intrinsicDuration) : 0;
  const localTime = timing.loopMode === "loop" && intrinsicDuration > 0
    ? wrap(sourceTime, intrinsicDuration)
    : intrinsicDuration > 0 ? Math.min(sourceTime, intrinsicDuration) : sourceTime;
  const progress = intrinsicDuration > 0
    ? Math.min(1, Math.max(0, localTime / intrinsicDuration))
    : timing.duration > 0 ? Math.min(1, elapsed / timing.duration) : active ? 1 : 0;
  const complete = timing.loopMode !== "loop" && intrinsicDuration > 0 && sourceTime >= intrinsicDuration;
  return { active, localTime, progress, iteration, complete, start: timing.start, end };
};

const takeRank = (takeId, arrangementState) => {
  const takes = createArrangementState(arrangementState).takes;
  const index = takes.findIndex(take => take.id === takeId);
  return index < 0 ? -1 : finite(takes[index].order, index);
};

export const selectArrangementClipAtTime = (clips, transportTime, options = {}) => {
  const arrangementState = createArrangementState(options.arrangementState);
  const soloed = new Set(arrangementState.takes.filter(take => take.solo).map(take => take.id));
  const takeById = new Map(arrangementState.takes.map(take => [take.id, take]));
  const candidates = (Array.isArray(clips) ? clips : [])
    .map(clip => ({ clip: normalizeArrangementClip(clip), state: evaluateClipAtTime(clip, transportTime, options) }))
    .filter(({ clip, state }) => {
      if (!state.active) return false;
      const take = takeById.get(clip.takeId);
      if (take && (!take.enabled || take.muted)) return false;
      return !soloed.size || soloed.has(clip.takeId);
    });
  candidates.sort((left, right) => (
    right.state.start - left.state.start
    || takeRank(right.clip.takeId, arrangementState) - takeRank(left.clip.takeId, arrangementState)
    || right.clip.id.localeCompare(left.clip.id)
  ));
  return candidates[0] || null;
};

export const getArrangementProjectEnd = ({ elements = [], loopEnd = 0, scoreEnd = 0, automationEnd = 0, minimum = 10, context } = {}) => {
  let end = Math.max(positive(minimum, 10), positive(loopEnd), positive(scoreEnd), positive(automationEnd));
  for (const element of elements) {
    for (const clip of getElementArrangementClips(element)) {
      const timing = resolveClipTiming(clip, context);
      if (clip.enabled && timing.durationMode === "fixed") end = Math.max(end, timing.start + timing.duration);
    }
  }
  return end;
};

const createLaneSchedule = (clips, context) => {
  const entries = clips.map(clip => {
    const timing = resolveClipTiming(clip, context);
    return {
      clip,
      start: timing.start,
      end: timing.durationMode === "hold" ? Infinity : timing.start + timing.duration,
    };
  }).sort((a, b) => a.start - b.start || a.clip.id.localeCompare(b.clip.id));
  let maximumEnd = -Infinity;
  return entries.map(entry => {
    maximumEnd = Math.max(maximumEnd, entry.end);
    return { ...entry, maximumEnd };
  });
};

export const queryArrangementLaneAtTime = (lane, transportTime) => {
  const time = finite(transportTime);
  const schedule = lane?.schedule || [];
  let low = 0;
  let high = schedule.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (schedule[middle].start <= time) low = middle + 1;
    else high = middle;
  }
  const candidates = [];
  for (let index = low - 1; index >= 0; index -= 1) {
    const entry = schedule[index];
    if (entry.end > time) candidates.push(entry.clip);
    if (index === 0 || schedule[index - 1].maximumEnd <= time) break;
  }
  return candidates;
};

export const createArrangementIndex = (elements = [], arrangementState = {}, options = {}) => {
  const state = createArrangementState(arrangementState);
  const elementById = new Map();
  const lanes = [];
  const clips = [];
  for (const element of elements) {
    const elementClips = getElementArrangementClips(element);
    if (!elementClips.length) continue;
    elementById.set(element.id, element);
    const sorted = [...elementClips].sort((a, b) => a.timing.start - b.timing.start || a.id.localeCompare(b.id));
    lanes.push({ elementId: element.id, clips: sorted, schedule: createLaneSchedule(sorted, options.context) });
    sorted.forEach(clip => clips.push({ elementId: element.id, clip }));
  }
  const laneRank = new Map(state.laneOrder.map((id, index) => [id, index]));
  lanes.sort((a, b) => (laneRank.get(a.elementId) ?? Infinity) - (laneRank.get(b.elementId) ?? Infinity));
  clips.sort((a, b) => a.clip.timing.start - b.clip.timing.start);
  return { state, elementById, lanes, clips };
};

// Clip-oriented timelines keep their lanes independent from authored canvas
// objects. A clip may still target an element (Livecode/media playback), but
// its visual lane and ordering belong to the user's timeline tracks.
export const createTimelineClipIndex = (arrangementState = {}, options = {}) => {
  const state = createArrangementState(arrangementState);
  const tracks = state.clipTracks
    .map((track, index) => ({ ...track, order: finite(track.order, index), clips: [] }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const trackById = new Map(tracks.map(track => [track.id, track]));
  if (!tracks.length && state.timelineMode === "clips") {
    const fallback = createTimelineTrack({ id: "track-1", name: "Track 1", order: 0 });
    tracks.push({ ...fallback, clips: [] });
    trackById.set(fallback.id, tracks[0]);
  }
  const clips = state.timelineClips.map(value => {
    const clip = normalizeTimelineClip(value, options.context);
    const track = trackById.get(clip.trackId) || tracks[0];
    if (track) track.clips.push(clip);
    return { clip, trackId: track?.id || clip.trackId };
  });
  tracks.forEach(track => {
    track.clips.sort((left, right) => left.timing.start - right.timing.start || left.id.localeCompare(right.id));
    track.schedule = createLaneSchedule(track.clips, options.context);
  });
  return { state, tracks, clips, trackById };
};

export const selectTimelineClipAtTime = (clips, transportTime, options = {}) => {
  const state = createArrangementState(options.arrangementState);
  const tracks = new Map(state.clipTracks.map(track => [track.id, track]));
  const soloed = new Set(state.clipTracks.filter(track => track.solo && track.enabled !== false && !track.muted).map(track => track.id));
  const candidates = (Array.isArray(clips) ? clips : [])
    .map(value => {
      const clip = value?.clip || value;
      return { clip: normalizeTimelineClip(clip, options.context), state: evaluateClipAtTime(clip, transportTime, options) };
    })
    .filter(({ clip, state: timing }) => {
      const track = tracks.get(clip.trackId);
      if (track && (!track.enabled || track.muted)) return false;
      if (soloed.size && !soloed.has(clip.trackId)) return false;
      return timing.active;
    });
  candidates.sort((left, right) => right.state.start - left.state.start || right.clip.id.localeCompare(left.clip.id));
  return candidates[0] || null;
};

export const getTimelineProjectEnd = (arrangementState = {}, options = {}) => {
  const state = createArrangementState(arrangementState);
  if (state.timelineMode !== "clips") return positive(options.minimum, 0);
  const index = createTimelineClipIndex(state, options);
  return index.clips.reduce((end, entry) => {
    const timing = resolveClipTiming(entry.clip, options.context);
    return entry.clip.enabled && timing.durationMode === "fixed"
      ? Math.max(end, timing.start + timing.duration)
      : end;
  }, positive(options.minimum, 0));
};

export const migrateGestureToArrangement = (element, context) => {
  if (getElementArrangementClips(element).length) return element;
  const gesture = element?.customData?.underscoresGesture;
  if (!gesture?.playback?.enabled) return element;
  const start = positive(gesture.startTime);
  const duration = positive(gesture.duration, 0.001);
  return addElementArrangementClip(element, createArrangementClip({
    timing: {
      start,
      startValue: createTimeValue(start, start, context),
      duration,
      durationValue: clone(gesture.durationValue) || createTimeValue(duration, duration, context),
      durationMode: "fixed",
      sourceOffset: 0,
      rate: 1,
      loopMode: gesture.playback?.mode === "loop" ? "loop" : "once",
    },
    recording: {
      mode: "rolling",
      unwrappedStart: start,
      transportStart: start,
      loopStart: gesture.loop?.start,
      loopEnd: gesture.loop?.end,
      loopIteration: 0,
      recordingId: gesture.id || undefined,
    },
  }, context));
};

export const remapArrangementForDuplicate = (element, { takeIdMap = new Map() } = {}) => {
  const arrangement = getElementArrangement(element);
  if (!arrangement) return clone(element);
  return setElementArrangementClips(element, arrangement.clips.map(clip => ({
    ...clip,
    id: makeId("clip"),
    takeId: takeIdMap.get(clip.takeId) || clip.takeId,
    recording: { ...clip.recording, recordingId: makeId("recording") },
  })));
};

export const splitClipAcrossLoop = (clipValue, loopStartValue, loopEndValue, options = {}) => {
  const clip = normalizeArrangementClip(clipValue, options.context);
  const timing = resolveClipTiming(clip, options.context);
  const loopStart = finite(loopStartValue);
  const loopEnd = finite(loopEndValue);
  const loopDuration = loopEnd - loopStart;
  if (!(loopDuration > 0) || timing.durationMode !== "fixed" || timing.duration <= 0) return [clip];
  const recordingId = clip.recording.recordingId || makeId("recording");
  const segments = [];
  let remaining = timing.duration;
  let visibleStart = timing.start;
  let consumed = 0;
  let iteration = Math.max(0, Math.floor(clip.recording.loopIteration));
  while (remaining > 0.0000001) {
    const phase = wrap(visibleStart - loopStart, loopDuration);
    const available = loopDuration - phase;
    const duration = Math.min(remaining, available || loopDuration);
    segments.push(normalizeArrangementClip({
      ...clip,
      id: segments.length ? makeId("clip") : clip.id,
      timing: {
        ...timing,
        start: visibleStart,
        startValue: createTimeValue(visibleStart, visibleStart, options.context),
        duration,
        durationValue: createTimeValue(duration, duration, options.context),
        sourceOffset: timing.sourceOffset + consumed * timing.rate,
      },
      recording: {
        ...clip.recording,
        transportStart: visibleStart,
        loopStart,
        loopEnd,
        loopIteration: iteration,
        recordingId,
      },
    }, options.context));
    consumed += duration;
    remaining -= duration;
    visibleStart = loopStart;
    iteration += 1;
  }
  return segments;
};

export const advanceArrangementRecordingClock = (clockValue = {}, transportTimeValue, loop = {}) => {
  const transportTime = finite(transportTimeValue);
  const previousTransportTime = finite(clockValue.transportTime, transportTime);
  const loopStart = finite(loop.start);
  const loopEnd = finite(loop.end);
  const loopDuration = loopEnd - loopStart;
  const wrapped = loop.enabled === true && loopDuration > 0 && transportTime + 0.000001 < previousTransportTime;
  const delta = wrapped ? loopEnd - previousTransportTime + (transportTime - loopStart) : Math.max(0, transportTime - previousTransportTime);
  return {
    unwrappedTime: finite(clockValue.unwrappedTime) + delta,
    transportTime,
    loopPhase: loopDuration > 0 ? wrap(transportTime - loopStart, loopDuration) : 0,
    loopIteration: Math.max(0, Math.floor(finite(clockValue.loopIteration))) + (wrapped ? 1 : 0),
  };
};
