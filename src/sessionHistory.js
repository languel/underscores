export const DRAWERATOR_SESSION_VERSION = 2;
export const DRAWERATOR_SESSION_TYPE = "drawerator-session";
export const DRAWERATOR_MACRO_TYPE = "drawerator-macro";

const cloneValue = value => {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const createId = () => crypto.randomUUID();
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizeHistoryClockMode = value => ["realtime", "active", "hold"].includes(value) ? value : "realtime";
const fixedTimeValue = seconds => ({ version: 1, expression: `${seconds} s`, fallbackSeconds: seconds });

export const normalizeSessionAction = (action, sequence = 0) => {
  const at = Math.max(0, numeric(action.at));
  const duration = Math.max(0, numeric(action.duration));
  return {
    id: action.id || createId(),
    sequence: Number.isFinite(action.sequence) ? action.sequence : sequence,
    kind: action.kind || "command",
    at,
    atValue: cloneValue(action.atValue || fixedTimeValue(at)),
    transportTime: Math.max(0, numeric(action.transportTime)),
    duration,
    durationValue: cloneValue(action.durationValue || fixedTimeValue(duration)),
    commandId: action.commandId || null,
    commandVersion: numeric(action.commandVersion, 1),
    args: cloneValue(action.args || {}),
    source: action.source || "app",
    groupId: action.groupId || null,
    track: action.track || (action.presentation ? "presentation" : "world"),
    presentation: !!action.presentation,
    enabled: action.enabled !== false,
    result: cloneValue(action.result),
  };
};

export const createDraweratorSession = ({ baseline = null, clock = {}, includePresentation = true, name = "Untitled session", seed } = {}) => ({
  type: DRAWERATOR_SESSION_TYPE,
  version: DRAWERATOR_SESSION_VERSION,
  id: createId(),
  name,
  createdAt: new Date().toISOString(),
  seed: Number.isFinite(seed) ? seed : Math.floor(Math.random() * 0x7fffffff),
  clock: {
    fps: numeric(clock.fps, 30),
    tempo: numeric(clock.tempo, 120),
    signature: cloneValue(clock.signature || { numerator: 4, denominator: 4 }),
    sampleRate: Math.min(768000, Math.max(8000, numeric(clock.sampleRate, 48000))),
    historyMode: normalizeHistoryClockMode(clock.historyMode),
  },
  includePresentation,
  baseline: cloneValue(baseline),
  actions: [],
});

export const parseDraweratorSession = payload => {
  const value = typeof payload === "string" ? JSON.parse(payload) : cloneValue(payload);
  if (!value || value.type !== DRAWERATOR_SESSION_TYPE || !Array.isArray(value.actions)) {
    throw new Error("This is not a Drawerator session document.");
  }
  if (value.version > DRAWERATOR_SESSION_VERSION) {
    throw new Error(`Session version ${value.version} is newer than this Drawerator build.`);
  }
  const migrated = createDraweratorSession(value);
  return {
    ...migrated,
    ...value,
    version: DRAWERATOR_SESSION_VERSION,
    clock: { ...migrated.clock, ...(value.clock || {}), sampleRate: migrated.clock.sampleRate },
    actions: value.actions.map(normalizeSessionAction).sort((a, b) => a.at - b.at || a.sequence - b.sequence),
  };
};

export const mergeSceneMutation = (pending, {
  previousElements = new Map(),
  changedElements = [],
  removedElementIds = [],
  now = () => performance.now(),
} = {}) => {
  const mutation = pending || {
    created: new Map(),
    updated: new Map(),
    deletedElementIds: new Set(),
    startedAt: now(),
  };
  for (const element of changedElements) {
    if (!element?.id) continue;
    if (element.isDeleted) {
      if (!mutation.created.has(element.id)) mutation.deletedElementIds.add(element.id);
      mutation.created.delete(element.id);
      mutation.updated.delete(element.id);
    } else if (!previousElements.has(element.id) || mutation.created.has(element.id)) {
      mutation.created.set(element.id, cloneValue(element));
      mutation.deletedElementIds.delete(element.id);
    } else {
      mutation.updated.set(element.id, cloneValue(element));
      mutation.deletedElementIds.delete(element.id);
    }
  }
  for (const id of removedElementIds) {
    if (!mutation.created.has(id)) mutation.deletedElementIds.add(id);
    mutation.created.delete(id);
    mutation.updated.delete(id);
  }
  return mutation;
};

const getSessionDuration = session => (session?.actions || []).reduce(
  (duration, action) => Math.max(duration, action.at + action.duration),
  0,
);

export class DraweratorSessionController {
  constructor({
    now = () => performance.now(),
    requestFrame = callback => requestAnimationFrame(callback),
    cancelFrame = handle => cancelAnimationFrame(handle),
    restoreBaseline = async () => {},
    applyAction = async () => {},
  } = {}) {
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.restoreBaseline = restoreBaseline;
    this.applyAction = applyAction;
    this.session = createDraweratorSession();
    this.status = "idle";
    this.playhead = 0;
    this.playbackRate = 1;
    this.recordStartedAt = 0;
    this.recordPausedAt = 0;
    this.recordPausedDuration = 0;
    this.recordClockMode = "realtime";
    this.recordFilter = "all";
    this.recordCursor = 0;
    this.frameHandle = null;
    this.listeners = new Set();
    this.dispatched = new Set();
    this.playbackOptions = {};
  }

  snapshot() {
    return {
      status: this.status,
      playhead: this.playhead,
      playbackRate: this.playbackRate,
      duration: getSessionDuration(this.session),
      session: cloneValue(this.session),
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  notify(event = "change", detail = null) {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot, event, detail);
  }

  start({ baseline = null, clock = {}, includePresentation = true, name, append = true } = {}) {
    const appendToExisting = append && this.session.actions.length > 0;
    const resumeCursor = appendToExisting ? this.playhead : 0;
    this.stopPlayback({ reset: !appendToExisting });
    if (appendToExisting) {
      this.session = {
        ...this.session,
        includePresentation,
        clock: { ...this.session.clock, ...cloneValue(clock) },
      };
    } else {
      this.session = createDraweratorSession({ baseline, clock, includePresentation, name });
    }
    this.status = "recording";
    this.playhead = resumeCursor;
    this.recordStartedAt = this.now();
    this.recordPausedAt = 0;
    this.recordPausedDuration = 0;
    this.recordClockMode = normalizeHistoryClockMode(this.session.clock?.historyMode);
    this.recordCursor = resumeCursor;
    this.notify("recording.start");
    return this.snapshot();
  }

  clear({ baseline = null, clock = {}, includePresentation = true, name } = {}) {
    this.stopPlayback({ reset: true });
    this.session = createDraweratorSession({ baseline, clock, includePresentation, name });
    this.status = "idle";
    this.playhead = 0;
    this.recordCursor = 0;
    this.notify("session.cleared");
    return this.snapshot();
  }

  pause() {
    if (this.status === "recording") {
      this.status = "recording-paused";
      this.recordPausedAt = this.now();
      this.notify("recording.pause");
    } else if (this.status === "recording-paused") {
      this.recordPausedDuration += this.now() - this.recordPausedAt;
      this.recordPausedAt = 0;
      this.status = "recording";
      this.notify("recording.resume");
    } else if (this.status === "playing") {
      this.pausePlayback();
    } else if (this.status === "playback-paused") {
      this.play({ ...this.playbackOptions, restoreBaseline: false, from: this.playhead });
    }
    return this.snapshot();
  }

  stop() {
    if (this.status === "recording" || this.status === "recording-paused") {
      this.status = "idle";
      this.playhead = getSessionDuration(this.session);
      this.notify("recording.stop");
    } else {
      this.stopPlayback();
    }
    return this.snapshot();
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.05, numeric(rate, 1));
    if (this.status === "playing") {
      this.playbackStartedAt = this.now() - this.playhead * 1000 / this.playbackRate;
    }
    this.notify("playback.rate");
    return this.snapshot();
  }

  setRecordFilter(filter = "all") {
    this.recordFilter = filter || "all";
    return this.recordFilter;
  }

  record(action) {
    if (this.status !== "recording") return null;
    if (this.recordFilter !== "all" && action.kind !== this.recordFilter) return null;
    const relativeNow = Math.max(0, (this.now() - this.recordStartedAt - this.recordPausedDuration) / 1000);
    const implicitAt = this.recordClockMode === "realtime" ? this.recordCursor + relativeNow : this.recordCursor;
    const normalized = normalizeSessionAction({
      ...action,
      at: Number.isFinite(action.at) ? action.at : implicitAt,
    }, this.session.actions.length);
    if (normalized.presentation && !this.session.includePresentation) return null;
    this.session.actions.push(normalized);
    this.session.actions.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    if (this.recordClockMode === "active") {
      this.recordCursor = normalized.at + normalized.duration;
      this.playhead = this.recordCursor;
    } else if (this.recordClockMode === "hold") {
      this.playhead = this.recordCursor;
    } else {
      this.playhead = Math.max(this.playhead, normalized.at + normalized.duration);
    }
    this.notify("action.recorded", normalized);
    return cloneValue(normalized);
  }

  recordCommand(detail) {
    if (!detail?.metadata?.record) return null;
    return this.record({
      kind: "command",
      commandId: detail.id,
      commandVersion: detail.version,
      args: detail.args,
      result: detail.result,
      source: detail.metadata.source,
      groupId: detail.metadata.groupId,
      transportTime: detail.metadata.transportTime,
      duration: detail.metadata.duration,
      presentation: detail.metadata.presentation,
    });
  }

  load(session) {
    this.stopPlayback({ reset: true });
    this.session = parseDraweratorSession(session);
    this.status = "idle";
    this.playhead = 0;
    this.notify("session.loaded");
    return this.snapshot();
  }

  get() {
    return cloneValue(this.session);
  }

  updateClock(clock = {}) {
    this.session.clock = {
      ...this.session.clock,
      ...cloneValue(clock),
      sampleRate: Math.min(768000, Math.max(8000, numeric(clock.sampleRate, this.session.clock.sampleRate || 48000))),
    };
    this.notify("clock.updated", this.session.clock);
    return cloneValue(this.session.clock);
  }

  updateAction(id, patch) {
    const index = this.session.actions.findIndex(action => action.id === id);
    if (index < 0) return null;
    this.session.actions[index] = normalizeSessionAction({ ...this.session.actions[index], ...cloneValue(patch), id }, index);
    this.session.actions.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    this.notify("action.updated", this.session.actions[index]);
    return cloneValue(this.session.actions[index]);
  }

  removeAction(id) {
    const before = this.session.actions.length;
    this.session.actions = this.session.actions.filter(action => action.id !== id);
    if (before !== this.session.actions.length) this.notify("action.removed", { id });
    return before !== this.session.actions.length;
  }

  duplicateAction(id) {
    const source = this.session.actions.find(action => action.id === id);
    if (!source) return null;
    const at = source.at + 0.01;
    const copy = normalizeSessionAction({ ...cloneValue(source), id: createId(), at, atValue: fixedTimeValue(at) }, this.session.actions.length);
    this.session.actions.push(copy);
    this.session.actions.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    this.notify("action.duplicated", copy);
    return cloneValue(copy);
  }

  moveAction(id, direction) {
    const ordered = [...this.session.actions].sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    const index = ordered.findIndex(action => action.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return false;
    const firstTime = ordered[index].at;
    ordered[index].at = ordered[target].at;
    ordered[target].at = firstTime;
    ordered[index].atValue = fixedTimeValue(ordered[index].at);
    ordered[target].atValue = fixedTimeValue(ordered[target].at);
    ordered.forEach((action, sequence) => { action.sequence = sequence; });
    this.session.actions = ordered;
    this.notify("action.moved", { id, direction });
    return true;
  }

  async playAction(id, { emitMidi = false } = {}) {
    const action = this.session.actions.find(candidate => candidate.id === id);
    if (!action?.enabled) return false;
    await this.applyAction(cloneValue(action), { phase: "complete", emitMidi });
    this.playhead = action.at + (action.kind === "stroke" ? action.duration : 0);
    this.notify("action.played", action);
    return true;
  }

  async play(options = {}) {
    if (!this.session.actions.length) return this.snapshot();
    this.stopPlayback();
    const from = Math.max(0, numeric(options.from, this.playhead));
    this.playbackRate = Math.max(0.05, numeric(options.rate, this.playbackRate));
    this.playbackOptions = {
      restoreBaseline: options.restoreBaseline !== false,
      includePresentation: options.includePresentation !== false,
      emitMidi: options.emitMidi === true,
      rate: this.playbackRate,
    };
    if (this.playbackOptions.restoreBaseline) {
      await this.restoreBaseline(cloneValue(this.session.baseline));
    }
    this.playhead = from;
    this.dispatched = new Set();
    for (const action of this.session.actions) {
      const triggerAt = action.kind === "stroke" ? action.at + action.duration : action.at;
      if (triggerAt < from) this.dispatched.add(action.id);
    }
    this.status = "playing";
    this.playbackStartedAt = this.now() - from * 1000 / this.playbackRate;
    this.notify("playback.start");
    this.frameHandle = this.requestFrame(timestamp => this.tick(timestamp));
    return this.snapshot();
  }

  tick(timestamp = this.now()) {
    if (this.status !== "playing") return;
    const duration = getSessionDuration(this.session);
    this.playhead = Math.min(duration, Math.max(0, (timestamp - this.playbackStartedAt) / 1000 * this.playbackRate));
    for (const action of this.session.actions) {
      if (!action.enabled || this.dispatched.has(action.id)) continue;
      if (action.presentation && !this.playbackOptions.includePresentation) {
        this.dispatched.add(action.id);
        continue;
      }
      const triggerAt = action.kind === "stroke" ? action.at + action.duration : action.at;
      if (triggerAt <= this.playhead) {
        this.dispatched.add(action.id);
        Promise.resolve(this.applyAction(cloneValue(action), {
          phase: "complete",
          emitMidi: this.playbackOptions.emitMidi,
        })).catch(error => this.notify("playback.error", { action, error }));
      }
    }
    this.notify("playback.tick");
    if (this.playhead >= duration) {
      this.status = "idle";
      this.frameHandle = null;
      this.notify("playback.complete");
      return;
    }
    this.frameHandle = this.requestFrame(next => this.tick(next));
  }

  pausePlayback() {
    if (this.status !== "playing") return this.snapshot();
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.status = "playback-paused";
    this.notify("playback.pause");
    return this.snapshot();
  }

  stopPlayback({ reset = false } = {}) {
    if (this.frameHandle !== null) this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    if (this.status === "playing" || this.status === "playback-paused") this.status = "idle";
    if (reset) this.playhead = 0;
    this.notify("playback.stop");
    return this.snapshot();
  }

  async seek(seconds, { rebuild = true, includePresentation = true, emitMidi = false } = {}) {
    const target = Math.max(0, Math.min(numeric(seconds), getSessionDuration(this.session)));
    const wasPlaying = this.status === "playing";
    this.pausePlayback();
    if (rebuild) await this.restoreBaseline(cloneValue(this.session.baseline));
    this.dispatched = new Set();
    for (const action of this.session.actions) {
      if (!action.enabled || (action.presentation && !includePresentation)) continue;
      const triggerAt = action.kind === "stroke" ? action.at + action.duration : action.at;
      if (triggerAt <= target) {
        this.dispatched.add(action.id);
        await this.applyAction(cloneValue(action), { phase: "seek", emitMidi });
      }
    }
    this.playhead = target;
    this.notify("playback.seek");
    if (wasPlaying) await this.play({ ...this.playbackOptions, restoreBaseline: false, from: target });
    return this.snapshot();
  }

  export() {
    return JSON.stringify(this.session, null, 2);
  }
}

const visit = (value, fn) => {
  if (Array.isArray(value)) return value.map(item => visit(item, fn));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, fn)]));
  }
  return fn(value);
};

const collectElementIds = actions => {
  const ids = new Set();
  for (const action of actions) {
    for (const element of action.args?.finalElements || action.args?.elements || []) {
      if (element?.id) ids.add(element.id);
    }
  }
  return ids;
};

const translateAction = (action, dx, dy) => {
  const next = cloneValue(action);
  const translateElements = elements => (elements || []).map(element => ({
    ...element,
    x: numeric(element.x) + dx,
    y: numeric(element.y) + dy,
  }));
  if (next.args?.finalElements) next.args.finalElements = translateElements(next.args.finalElements);
  if (next.args?.elements) next.args.elements = translateElements(next.args.elements);
  if (next.args?.samples) {
    next.args.samples = next.args.samples.map(sample => ({
      ...sample,
      scene: sample.scene ? { x: sample.scene.x + dx, y: sample.scene.y + dy } : sample.scene,
      x: Number.isFinite(sample.x) ? sample.x + dx : sample.x,
      y: Number.isFinite(sample.y) ? sample.y + dy : sample.y,
    }));
  }
  return next;
};

export const createDraweratorMacro = (session, { actionIds = null, start = null, end = null, name = "Untitled macro" } = {}) => {
  const source = parseDraweratorSession(session);
  const hasStart = start !== null && start !== undefined && start !== "" && Number.isFinite(Number(start));
  const hasEnd = end !== null && end !== undefined && end !== "" && Number.isFinite(Number(end));
  const rangeStart = hasStart ? Number(start) : -Infinity;
  const rangeEnd = hasEnd ? Number(end) : Infinity;
  const selected = source.actions.filter(action =>
    (!actionIds || actionIds.includes(action.id)) &&
    action.at + action.duration >= rangeStart && action.at <= rangeEnd
  );
  const firstActionTime = selected.reduce((value, action) => Math.min(value, action.at), Infinity);
  const actions = selected.map((action, index) => normalizeSessionAction({
    ...cloneValue(action),
    id: createId(),
    at: action.at - (Number.isFinite(firstActionTime) ? firstActionTime : 0),
  }, index));
  const points = actions.flatMap(action => [
    ...(action.args?.samples || []).map(sample => sample.scene || sample).filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)),
    ...(action.args?.finalElements || []).map(element => ({ x: element.x, y: element.y })),
  ]);
  const origin = points.length ? {
    x: Math.min(...points.map(point => point.x)),
    y: Math.min(...points.map(point => point.y)),
  } : { x: 0, y: 0 };
  return {
    type: DRAWERATOR_MACRO_TYPE,
    version: 1,
    id: createId(),
    name,
    createdAt: new Date().toISOString(),
    origin,
    actions,
  };
};

export const instantiateDraweratorMacro = (macro, { mode = "relative", anchor = null } = {}) => {
  if (!macro || macro.type !== DRAWERATOR_MACRO_TYPE || !Array.isArray(macro.actions)) {
    throw new Error("This is not a Drawerator macro document.");
  }
  const idMap = new Map([...collectElementIds(macro.actions)].map(id => [id, createId()]));
  const remapped = macro.actions.map((action, index) => normalizeSessionAction(visit(cloneValue(action), value => {
    return typeof value === "string" && idMap.has(value) ? idMap.get(value) : value;
  }), index));
  if (mode !== "relative") return remapped;
  const target = anchor || macro.origin || { x: 0, y: 0 };
  const dx = numeric(target.x) - numeric(macro.origin?.x);
  const dy = numeric(target.y) - numeric(macro.origin?.y);
  return remapped.map(action => translateAction(action, dx, dy));
};

export class DraweratorLibraryStore {
  constructor({ databaseName = "drawerator-history-v1" } = {}) {
    this.databaseName = databaseName;
    this.memory = new Map();
  }

  open() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (this.database) return this.database;
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
    return this.database;
  }

  async put(item) {
    const value = cloneValue(item);
    this.memory.set(value.id, value);
    const db = await this.open();
    if (!db) return value;
    await new Promise((resolve, reject) => {
      const request = db.transaction("items", "readwrite").objectStore("items").put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    return value;
  }

  async list(type = null) {
    const db = await this.open();
    if (!db) return [...this.memory.values()].filter(item => !type || item.type === type);
    const values = await new Promise((resolve, reject) => {
      const request = db.transaction("items").objectStore("items").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    values.forEach(value => this.memory.set(value.id, value));
    return values.filter(item => !type || item.type === type);
  }

  async remove(id) {
    this.memory.delete(id);
    const db = await this.open();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const request = db.transaction("items", "readwrite").objectStore("items").delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
