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

export const DEFAULT_P5_FRAME = Object.freeze({
  scriptId: "",
  hostType: "embeddable",
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

export const canHostP5Frame = element => Boolean(
  element
  && !element.isDeleted
  && (isP5FrameElement(element) || ["rectangle", "frame", "embeddable"].includes(element.type))
);

// Classic p5 global mode is normally installed on window. Drawerator instead
// evaluates it in a frame-local proxy over a p5 instance, which preserves the
// familiar setup()/draw() syntax without letting two frames overwrite each
// other's callbacks or globals.
export const compileClassicP5Source = (p, drawerator, source) => {
  const localValues = Object.create(null);
  const scope = new Proxy(localValues, {
    // Keep this evaluator-owned name visible from inside `with`; every other
    // unresolved identifier is intentionally resolved against the p5 proxy.
    has: (_target, key) => key !== "callbacks",
    get(target, key) {
      if (key === Symbol.unscopables) return undefined;
      if (key === "p") return p;
      if (key === "drawerator") return drawerator;
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
  const callbacks = new Function("scope", "callbacks", `with (scope) {
    ${typeof source === "string" ? source : ""}
    callbacks.preload = typeof preload === "function" ? preload : callbacks.preload;
    callbacks.setup = typeof setup === "function" ? setup : callbacks.setup;
    callbacks.draw = typeof draw === "function" ? draw : callbacks.draw;
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
    hostType: ["rectangle", "frame", "embeddable"].includes(raw.hostType) ? raw.hostType : "embeddable",
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
