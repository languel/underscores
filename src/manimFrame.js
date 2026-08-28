export const MANIM_WEB_VERSION = "0.3.24";
export const MANIM_WEB_BROWSER_URL = `https://cdn.jsdelivr.net/npm/manim-web@${MANIM_WEB_VERSION}/dist/manim-web.browser.js`;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const normalizeManimFrame = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    source: String(raw.source || ""),
    parameters: raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
      ? raw.parameters
      : {},
    width: Math.max(1, Number(raw.width) || 640),
    height: Math.max(1, Number(raw.height) || 360),
    transparent: raw.transparent !== false,
    allowInteraction: raw.allowInteraction !== false,
    progressionMode: raw.progressionMode === "cue" ? "cue" : "auto",
    runtimeUrl: String(raw.runtimeUrl || MANIM_WEB_BROWSER_URL),
    reloadNonce: Math.max(0, Number(raw.reloadNonce) || 0),
  };
};

export const validateManimSource = source => {
  try {
    // Manim Livecode is deliberately trusted author code. AsyncFunction is
    // used at runtime because authored programs commonly contain top-level
    // await scene.play(...).
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    new AsyncFunction("scene", "__", "cue", "MANIM", String(source || ""));
    return { valid: true, error: "" };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const manimApiBindings = api => Object.entries(api || {})
  .filter(([name]) => IDENTIFIER.test(name) && name !== "default");

export const compileManimSource = (source, api = {}) => {
  const bindings = manimApiBindings(api);
  const names = bindings.map(([name]) => name);
  const values = bindings.map(([, value]) => value);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction(
    ...names,
    "scene",
    "__",
    "cue",
    "MANIM",
    `"use strict";\n${String(source || "")}\n//# sourceURL=underscores-manim-livecode.js`,
  );
  return ({ scene, bridge, cue }) => run(...values, scene, bridge, cue, api);
};

export const createManimCueController = ({ mode = "auto", onCue } = {}) => {
  let progressionMode = mode === "cue" ? "cue" : "auto";
  let index = -1;
  let pending = null;
  let disposed = false;

  const release = value => {
    if (!pending) return false;
    const resolve = pending.resolve;
    pending = null;
    resolve(value);
    return true;
  };

  return {
    async cue(label = "", options = {}) {
      if (disposed) return { index, label: String(label || ""), disposed: true };
      index += 1;
      const detail = {
        index,
        id: String(options.id || label || `cue-${index}`),
        label: String(label || options.id || `Cue ${index + 1}`),
        options: options && typeof options === "object" ? { ...options } : {},
      };
      onCue?.(detail);
      if (progressionMode !== "cue" || options.auto === true) return detail;
      await new Promise(resolve => { pending = { resolve, detail }; });
      return detail;
    },
    next() {
      return release({ action: "next" });
    },
    setMode(value) {
      progressionMode = value === "cue" ? "cue" : "auto";
      if (progressionMode === "auto") release({ action: "auto" });
    },
    get mode() { return progressionMode; },
    get index() { return index; },
    get pendingCue() { return pending?.detail || null; },
    dispose() {
      disposed = true;
      release({ action: "dispose" });
    },
  };
};

export const createManimTransportGate = ({ mode = "free", transport } = {}) => {
  let transportMode = mode === "free" ? "free" : "linked";
  let snapshot = transport || {};
  let waiters = [];
  let disposed = false;

  const isPlaying = () => transportMode === "free" || Boolean(snapshot?.playing);
  const release = () => {
    if (!isPlaying() || !waiters.length) return;
    const pending = waiters;
    waiters = [];
    pending.forEach(resolve => resolve(true));
  };

  return {
    wait() {
      if (disposed) return Promise.resolve(false);
      if (isPlaying()) return Promise.resolve(true);
      return new Promise(resolve => waiters.push(resolve));
    },
    update(nextTransport) {
      snapshot = nextTransport || {};
      release();
    },
    setMode(value) {
      transportMode = value === "free" ? "free" : "linked";
      release();
    },
    get playing() { return isPlaying(); },
    get transport() { return snapshot; },
    get mode() { return transportMode; },
    dispose() {
      disposed = true;
      const pending = waiters;
      waiters = [];
      pending.forEach(resolve => resolve(false));
    },
  };
};
