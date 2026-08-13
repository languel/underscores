export const P5_FRAME_STORAGE_KEY = "drawerator_p5_scripts";

export const DEFAULT_P5_CDN_URL = "https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js";

export const DEFAULT_P5_SOURCE = `// p5 instance-mode sketch. __ is the node-local Drawerator bridge.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
};

p.draw = () => {
  if (__.frame.transparent) p.clear();
  else p.background(18);
  p.noFill();
  p.stroke(220);
  p.strokeWeight(3);
  const radius = Math.min(p.width, p.height) * 0.28;
  p.circle(p.width / 2, p.height / 2, radius * 2);
  p.line(p.width / 2 - radius, p.height / 2, p.width / 2 + radius, p.height / 2);
};`;

export const DEFAULT_P5_CLASSIC_SOURCE = `// Classic p5 global-mode sketch. __ is the node-local Drawerator bridge.
function setup() {
  createCanvas(__.element.width, __.element.height);
}

function draw() {
  if (__.frame.transparent) clear();
  else background(18);
  noFill();
  stroke(220);
  strokeWeight(3);
  const radius = Math.min(width, height) * 0.28;
  circle(width / 2, height / 2, radius * 2);
  line(width / 2 - radius, height / 2, width / 2 + radius, height / 2);
}`;

// These are deliberately small, readable starting points rather than a
// gallery of opaque effects. Loading one creates an editable catalog script;
// it never overwrites an existing sketch.
export const P5_EXAMPLES = Object.freeze([
  Object.freeze({
    id: "mediapipe-unicursal",
    name: "MediaPipe · Unicursal portrait",
    mode: "instance",
    source: `// Artistic single-line portrait from the first live Holistic stream.
// Add a Media Input and Holistic object before running this sketch.
let source = null;

p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.pixelDensity(1);
};

p.draw = () => {
  p.clear();
  source ||= __.streams.list().find(stream => stream.kind === "holistic");
  const frame = source && __.art?.unicursal.generate(source.id, {
    preset: "smooth",
    outputSpace: "normalized",
    geometry: { pointBudget: 384 },
    ink: { color: __.currentColor, width: 3 },
  });
  if (!frame?.available) {
    p.fill(__.currentColor);
    p.noStroke();
    p.text("Waiting for a Holistic frame…", 18, 28);
    return;
  }
  p.noFill();
  p.stroke(__.currentColor);
  p.strokeCap(p.ROUND);
  for (let index = 1; index < frame.points.length; index += 1) {
    const a = frame.points[index - 1];
    const b = frame.points[index];
    p.strokeWeight(Math.max(0.5, (a.width + b.width) / 2));
    p.line(a.x * p.width, a.y * p.height, b.x * p.width, b.y * p.height);
  }
};`,
  }),
  Object.freeze({
    id: "bare-instance",
    name: "Bare instance mode",
    mode: "instance",
    source: `// p5 instance-mode starter. Use p.* for p5 calls.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
};

p.draw = () => {
  p.background(18);
  p.noFill();
  p.stroke(220);
  p.circle(p.width / 2, p.height / 2, Math.min(p.width, p.height) * 0.4);
};`,
  }),
  Object.freeze({
    id: "bare-global",
    name: "Bare classic global mode",
    mode: "global",
    source: `// Classic p5 global-mode starter. Use setup(), draw(), and ordinary p5 calls.
function setup() {
  createCanvas(__.element.width, __.element.height);
}

function draw() {
  background(18);
  noFill();
  stroke(220);
  circle(width / 2, height / 2, Math.min(width, height) * 0.4);
}`,
  }),
  Object.freeze({
    id: "ten-print",
    name: "10 PRINT",
    mode: "global",
    source: `// 10 PRINT, adapted for a p5 frame. Press R to redraw.
const cell = 18;

function setup() {
  createCanvas(__.element.width, __.element.height);
  noLoop();
  redrawPattern();
}

function redrawPattern() {
  background(18);
  stroke(220);
  strokeWeight(2);
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (random() < 0.5) line(x, y, x + cell, y + cell);
      else line(x + cell, y, x, y + cell);
    }
  }
}

function keyPressed() {
  if (key === "r" || key === "R") redrawPattern();
}`,
  }),
  Object.freeze({
    id: "mouse-draw",
    name: "Mouse drawing",
    mode: "global",
    source: `// Draw directly into this p5 frame. Press C to clear.
function setup() {
  createCanvas(__.element.width, __.element.height);
  background(18);
  stroke(220);
  strokeWeight(3);
}

function mouseDragged() {
  line(pmouseX, pmouseY, mouseX, mouseY);
}

function keyPressed() {
  if (key === "c" || key === "C") background(18);
}`,
  }),
  Object.freeze({
    id: "random-lines",
    name: "Random lines",
    mode: "instance",
    source: `// Animated instance-mode random lines.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.background(18);
  p.stroke(220, 38);
  p.strokeWeight(2);
};

p.draw = () => {
  const x1 = p.random(p.width);
  const y1 = p.random(p.height);
  const x2 = p.random(p.width);
  const y2 = p.random(p.height);
  p.line(x1, y1, x2, y2);
};`,
  }),
  Object.freeze({
    id: "drawerator-bridge",
    name: "Drawerator canvas and time",
    mode: "instance",
    source: `// Drawerator-aware p5 example.
// Pick a curve, cursor, trigger, label, or group in the optional Driver field.
// @param driver = "" (object)

let latestEvent = null;

const currentDriver = () => (
  __.params.driver
  || __.canvas.selected()[0]
  || __.canvas.find(object => object.role === "cursor")[0]
  || null
);

p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.textFont("monospace");
  p.frameRate(__.frame.fps || 60);
  __.events.on("*", event => { latestEvent = event; });
};

p.draw = () => {
  const objects = __.canvas.all();
  const selected = __.canvas.selected();
  const driver = currentDriver();
  const progress = Number(driver?.time?.progress);
  const phase = Number.isFinite(progress)
    ? progress
    : (__.transport.time % 4) / 4;
  const radius = Math.min(p.width, p.height) * (0.12 + phase * 0.32);

  p.background(18);
  p.noFill();
  p.stroke(90, 180, 255);
  p.strokeWeight(2);
  p.circle(p.width / 2, p.height / 2, radius * 2);
  p.stroke(220, 120);
  p.line(0, p.height / 2, p.width, p.height / 2);

  p.noStroke();
  p.fill(220);
  p.text("canvas objects: " + objects.length, 12, 22);
  p.text("selected: " + selected.length, 12, 40);
  p.text("transport: " + __.transport.time.toFixed(2) + " s", 12, 58);
  p.text("driver: " + (driver?.label || driver?.id || "none"), 12, 76);
  p.text("last event: " + (latestEvent?.name || latestEvent?.type || "waiting"), 12, 94);
};`,
  }),
]);

export const getP5Example = id => P5_EXAMPLES.find(example => example.id === id) || null;

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
// familiar callback names after calling __.serial.requestPort().
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
  parameters: {},
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
  && !element.customData?.presentationMaskActive
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
export const compileClassicP5Source = (p, drawerator, source, interactionState = {}, scriptConsole = drawerator?.console || globalThis.console) => {
  const localValues = Object.create(null);
  const scope = new Proxy(localValues, {
    // Keep this evaluator-owned name visible from inside `with`; every other
    // unresolved identifier is intentionally resolved against the p5 proxy.
    has: (_target, key) => key !== "callbacks",
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key === "p") return p;
      if (key === "drawerator") return drawerator;
      if (key === "__") return drawerator;
      if (key === "console") return scriptConsole;
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

export const compileInstanceP5Source = (p, drawerator, source, scriptConsole = drawerator?.console || globalThis.console) => (
  new Function(
    "p",
    "drawerator",
    "__",
    "console",
    `${typeof source === "string" ? source : ""}\nreturn { ${P5_GLOBAL_CALLBACK_NAMES.map(name => `${name}: p.${name}`).join(", ")} };`,
  )(p, drawerator, drawerator, scriptConsole) || {}
);

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
    parameters: raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
      ? raw.parameters
      : {},
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
    frame.parameters,
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
