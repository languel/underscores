export const P5_FRAME_STORAGE_KEY = "drawerator_p5_scripts";

export const DEFAULT_P5_CDN_URL = "https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js";

export const DEFAULT_P5_SOURCE = `// p5 instance-mode sketch. Use p.* for every p5 call.
p.setup = () => {
  p.createCanvas(drawerator.element.width, drawerator.element.height);
};

p.draw = () => {
  if (drawerator.frame.transparent) p.clear();
  else p.background(18);
  p.noFill();
  p.stroke(220);
  p.strokeWeight(3);
  const radius = Math.min(p.width, p.height) * 0.28;
  p.circle(p.width / 2, p.height / 2, radius * 2);
  p.line(p.width / 2 - radius, p.height / 2, p.width / 2 + radius, p.height / 2);
};`;

export const DEFAULT_P5_CLASSIC_SOURCE = `// Classic p5 global-mode sketch. Use setup(), draw(), and ordinary p5 calls.
function setup() {
  createCanvas(drawerator.element.width, drawerator.element.height);
}

function draw() {
  if (drawerator.frame.transparent) clear();
  else background(18);
  noFill();
  stroke(220);
  strokeWeight(3);
  const radius = Math.min(width, height) * 0.28;
  circle(width / 2, height / 2, radius * 2);
  line(width / 2 - radius, height / 2, width / 2 + radius, height / 2);
}`;

export const P5_SOURCE_MODES = Object.freeze({
  auto: "auto",
  instance: "instance",
  global: "global",
});

// In classic/global mode p5 discovers these names on the window. Drawerator
// evaluates each sketch in an isolated proxy instead, so we explicitly carry
// the complete callback surface back to the p5 instance. Keeping this list in
// one place also makes the two authoring styles behave the same way.
export const P5_GLOBAL_CALLBACK_NAMES = Object.freeze([
  "preload",
  "setup",
  "draw",
  "mouseMoved",
  "mouseDragged",
  "mousePressed",
  "mouseReleased",
  "mouseClicked",
  "doubleClicked",
  "mouseWheel",
  "keyPressed",
  "keyReleased",
  "keyTyped",
  "touchStarted",
  "touchMoved",
  "touchEnded",
  "windowResized",
  "deviceMoved",
  "deviceTurned",
  "deviceShaken",
]);

// Web Serial is not a native p5 API, but classic sketches can use these
// familiar callback names after calling drawerator.serial.requestPort().
export const P5_SERIAL_CALLBACK_NAMES = Object.freeze([
  "serialConnect",
  "serialDisconnect",
  "serialData",
  "serialError",
]);

export const P5_CALLBACK_NAMES = Object.freeze([
  ...P5_GLOBAL_CALLBACK_NAMES,
  ...P5_SERIAL_CALLBACK_NAMES,
]);

export const normalizeP5SourceMode = value => (
  Object.values(P5_SOURCE_MODES).includes(value) ? value : P5_SOURCE_MODES.auto
);

export const detectP5SourceMode = source => {
  const code = typeof source === "string" ? source : "";
  const hasInstanceCallbacks = /\bp\.(?:preload|setup|draw)\s*=/.test(code);
  const hasGlobalCallbacks = /\bfunction\s+(?:preload|setup|draw)\s*\(/.test(code)
    || /\b(?:preload|setup|draw)\s*=\s*(?:function\b|\(?[^=]*\)?\s*=>)/.test(code);
  return hasGlobalCallbacks && !hasInstanceCallbacks ? P5_SOURCE_MODES.global : P5_SOURCE_MODES.instance;
};

export const resolveP5SourceMode = value => {
  const config = value && typeof value === "object" ? value : {};
  const mode = normalizeP5SourceMode(config.mode);
  return mode === P5_SOURCE_MODES.auto ? detectP5SourceMode(config.source) : mode;
};

// Keep validation deliberately side-effect free: live editors use it to retain
// the last runnable version while the user is midway through a broken edit.
export const validateP5Source = source => {
  try {
    // p5 sketches are evaluated in a function wrapper in both supported modes.
    // Matching that wrapper here catches syntax failures without executing code.
    new Function(typeof source === "string" ? source : "");
    return { valid: true, error: "" };
  } catch (reason) {
    return {
      valid: false,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }
};

export const DEFAULT_P5_FRAME = Object.freeze({
  scriptId: "",
  hostType: "rectangle",
  source: DEFAULT_P5_SOURCE,
  mode: P5_SOURCE_MODES.auto,
  runtime: "bundled",
  cdnUrl: DEFAULT_P5_CDN_URL,
  autoplay: true,
  fps: 60,
  transparent: false,
  allowInteraction: true,
  reloadNonce: 0,
});

export const isP5FrameElement = element => Boolean(element?.customData?.draweratorP5);

// p5 frames have a Drawerator-owned overlay in addition to their Excalidraw
// host. Keep the overlay aligned with the outliner's visibility state so
// hiding a p5 frame hides the rendered sketch as well.
export const shouldRenderP5Frame = element => Boolean(
  element
  && !element.isDeleted
  && !element.customData?.outlinerHidden
  && isP5FrameElement(element)
);

// p5 runners are Drawerator-owned overlays. Keep a regular Excalidraw host
// beneath them so they remain selectable and resizable without surfacing
// Excalidraw's link/embed decorators.
export const getP5HostElementType = value => {
  const frame = value?.customData?.draweratorP5 || value;
  return frame?.hostType === "frame" ? "frame" : "rectangle";
};

export const canHostP5Frame = element => Boolean(
  element
  && !element.isDeleted
  && (isP5FrameElement(element) || ["rectangle", "frame", "embeddable"].includes(element.type))
);

// Classic p5 global mode is normally installed on window. Drawerator instead
// evaluates it in a frame-local proxy over a p5 instance, which preserves the
// familiar setup()/draw() syntax without letting two frames overwrite each
// other's callbacks or globals.
export const compileClassicP5Source = (p, drawerator, source, interactionState = {}) => {
  const localValues = Object.create(null);
  const scope = new Proxy(localValues, {
    // Keep this evaluator-owned name visible from inside `with`; every other
    // unresolved identifier is intentionally resolved against the p5 proxy.
    has: (_target, key) => key !== "callbacks",
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key === "p") return p;
      if (key === "drawerator") return drawerator;
      // p5 itself exposes mouseIsPressed but not mouseIsDragged. Supporting
      // the latter here is a small compatibility affordance for classroom
      // sketches while still using p5's real mouse events underneath.
      if (key === "mouseIsDragged") return Boolean(interactionState.mouseIsDragged);
      if (Object.hasOwn(target, key)) return target[key];
      if (key in p) {
        const value = p[key];
        return typeof value === "function" ? value.bind(p) : value;
      }
      return key in globalThis ? globalThis[key] : undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  const callbackAssignments = P5_CALLBACK_NAMES
    .map(name => `callbacks.${name} = typeof ${name} === "function" ? ${name} : callbacks.${name};`)
    .join("\n");
  const callbacks = new Function("scope", "callbacks", `with (scope) {
    ${typeof source === "string" ? source : ""}
    ${callbackAssignments}
  }
  return callbacks;`)(scope, localValues);
  return callbacks || {};
};

export const normalizeP5Frame = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_P5_FRAME,
    ...raw,
    scriptId: typeof raw.scriptId === "string" ? raw.scriptId : "",
    // Legacy p5 frames were stored as embeddables. Preserve their geometry but
    // migrate them to a normal rectangle host during scene reconciliation.
    hostType: raw.hostType === "frame" ? "frame" : "rectangle",
    source: typeof raw.source === "string" ? raw.source : DEFAULT_P5_SOURCE,
    mode: normalizeP5SourceMode(raw.mode),
    runtime: raw.runtime === "cdn" ? "cdn" : "bundled",
    cdnUrl: typeof raw.cdnUrl === "string" && raw.cdnUrl.trim() ? raw.cdnUrl.trim() : DEFAULT_P5_CDN_URL,
    autoplay: raw.autoplay !== false,
    fps: Math.max(1, Math.min(120, Number(raw.fps) || DEFAULT_P5_FRAME.fps)),
    transparent: Boolean(raw.transparent),
    allowInteraction: raw.allowInteraction !== false,
    reloadNonce: Math.max(0, Number(raw.reloadNonce) || 0),
  };
};

// A p5 instance is deliberately independent from ordinary Excalidraw element
// revisions. Moving, rotating, selecting, or locking its host should only
// reposition the overlay; it must not erase the sketch's live canvas state.
// Size and p5-runtime settings still define the runner identity and therefore
// recreate the instance when they actually change.
export const getP5ConfigKey = value => {
  const frame = normalizeP5Frame(value);
  return JSON.stringify([
    frame.scriptId,
    frame.source,
    frame.mode,
    frame.runtime,
    frame.cdnUrl,
    frame.autoplay,
    frame.fps,
    frame.transparent,
    frame.allowInteraction,
    frame.reloadNonce,
  ]);
};

export const getP5RunnerKey = (config, element) => JSON.stringify([
  getP5ConfigKey(config),
  typeof element?.id === "string" ? element.id : "",
  Math.max(1, Number(element?.width) || 1),
  Math.max(1, Number(element?.height) || 1),
]);

export const createP5ScriptId = () => `p5-script-${globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

export const normalizeP5Script = (value, { createId = createP5ScriptId, now = Date.now() } = {}) => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled p5 sketch",
    source: typeof raw.source === "string" ? raw.source : DEFAULT_P5_SOURCE,
    mode: normalizeP5SourceMode(raw.mode),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
};

export const normalizeP5Scripts = (value, options = {}) => {
  const scripts = Array.isArray(value) ? value : [];
  const usedIds = new Set();
  return scripts.filter(script => script && typeof script === "object").map(script => {
    let normalized = normalizeP5Script(script, options);
    while (usedIds.has(normalized.id)) normalized = { ...normalized, id: options.createId?.() || createP5ScriptId() };
    usedIds.add(normalized.id);
    return normalized;
  });
};

// Scenes retain each p5 frame's source for portability, but the editor uses a
// script catalog. Recreate any missing catalog entry on import and migrate
// legacy embeddable hosts to ordinary Excalidraw rectangles or frames.
export const reconcileP5ScriptsWithElements = (scripts, elements, { createId = createP5ScriptId, now = Date.now() } = {}) => {
  const catalog = normalizeP5Scripts(scripts, { createId, now });
  const byId = new Map(catalog.map(script => [script.id, script]));
  const repairedElements = (elements || []).map(element => {
    if (!isP5FrameElement(element)) return element;
    const frame = normalizeP5Frame(element.customData?.draweratorP5);
    let script = frame.scriptId ? byId.get(frame.scriptId) : null;
    if (!script) {
      script = normalizeP5Script({
        id: frame.scriptId || createId(),
        name: "Recovered p5 sketch",
        source: frame.source,
        mode: frame.mode,
        createdAt: now,
        updatedAt: now,
      }, { createId, now });
      while (byId.has(script.id)) script = { ...script, id: createId() };
      byId.set(script.id, script);
      catalog.push(script);
    }
    const repairedFrame = normalizeP5Frame({
      ...frame,
      scriptId: script.id,
      source: script.source,
      mode: script.mode,
    });
    return {
      ...element,
      type: getP5HostElementType(repairedFrame),
      link: null,
      validated: false,
      customData: { ...(element.customData || {}), draweratorP5: repairedFrame },
      version: Math.max(1, (element.version || 0) + 1),
      versionNonce: Math.floor(Math.random() * 0x7fffffff),
      updated: now,
    };
  });
  return { scripts: catalog, elements: repairedElements };
};
