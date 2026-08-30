import { HELLO_GLSL_FRAGMENT_SOURCE } from "./shaderLivecode.js";
import { createEmptyOrcaSource } from "./orcaEngine.js";
import { TIXY_DEFAULT_SOURCE } from "./tixyRuntime.js";

// Canonical, scene-persisted representation for a Livecode Node.  The
// Excalidraw rectangle that carries this data is intentionally transparent:
// it supplies selection, transforms, history, and ordering while the live DOM
// surface is what authors actually see.

export const LIVECODE_NODE_VERSION = 1;

export const LIVECODE_KINDS = Object.freeze({
  strudel: "strudel",
  p5: "p5",
  manim: "manim",
  playcore: "playcore",
  markdown: "markdown",
  latex: "latex",
  html: "html",
  orca: "orca",
  shader: "shader",
  tixy: "tixy",
  svg: "svg",
});

// Keep the author-facing kind selector focused on the most common visual
// coding surfaces first. The registry remains keyed by kind so persisted
// nodes and command payloads are unaffected by presentation order.
export const LIVECODE_KIND_ORDER = Object.freeze([
  LIVECODE_KINDS.p5,
  LIVECODE_KINDS.markdown,
  LIVECODE_KINDS.shader,
  LIVECODE_KINDS.tixy,
  LIVECODE_KINDS.html,
  LIVECODE_KINDS.strudel,
  LIVECODE_KINDS.manim,
  LIVECODE_KINDS.playcore,
  LIVECODE_KINDS.latex,
  LIVECODE_KINDS.orca,
  LIVECODE_KINDS.svg,
]);

export const LIVECODE_KIND_DEFINITIONS = Object.freeze({
  [LIVECODE_KINDS.strudel]: Object.freeze({
    label: "Strudel",
    editorProfile: "strudel",
    defaultName: "Untitled Strudel",
    defaultSource: `// Ctrl/Cmd+Enter evaluates. Ctrl+. stops this node.\n$: note("c3 e3 g3 b3")\n  .s("sine").slow(2)\n  .color("<#ff8bd1 #8bd5ff #f5d76e #9df59d>")\n  ._pianoroll({ height: 72, fold: 1 })`,
    summary: "Pattern livecoding node using the shared native scheduler. Public deployment stays release-gated until Strudel licensing compliance is complete.",
  }),
  [LIVECODE_KINDS.p5]: Object.freeze({
    label: "p5",
    editorProfile: "p5",
    defaultName: "Untitled p5 node",
    defaultSource: `function setup() {\n  createCanvas(__.element.width, __.element.height);\n}\n\nfunction draw() {\n  clear();\n  noFill();\n  stroke(__.currentColor);\n  circle(width / 2, height / 2, Math.min(width, height) * 0.45);\n}`,
    summary: "Self-contained p5 sketch using the embedded latest 2.x runtime, with latest 1.x available per node.",
  }),
  [LIVECODE_KINDS.manim]: Object.freeze({
    label: "Manim",
    editorProfile: "javascript",
    defaultName: "Untitled Manim",
    defaultSource: `// @param radius = 1.5 (0.25..3 step:0.05)\nconst circle = new Circle({ radius: __.params.radius });\n\nawait scene.play(new Create(circle));\nawait cue("Transform");\nconst square = new Square({ sideLength: __.params.radius * 2 });\nawait scene.play(new Transform(circle, square));`,
    summary: "Interactive mathematical animation with manim-web. Uses the shared Livecode parameters, free/linked transport, and optional cue progression.",
  }),
  [LIVECODE_KINDS.playcore]: Object.freeze({
    label: "Play Core",
    editorProfile: "play",
    defaultName: "Untitled Play Core node",
    defaultSource: `export const settings = { fps: 30 };\n\nexport function main({ x, y }, context) {\n  return (x + y + Math.floor(context.time / 180)) % 4 === 0 ? "·" : " ";\n}`,
    summary: "Self-contained ASCII program using the existing portable Play Core runner.",
  }),
  [LIVECODE_KINDS.markdown]: Object.freeze({
    label: "Markdown",
    editorProfile: "markdown",
    defaultName: "Untitled Markdown",
    defaultSource: "# Livecode Node\n\nWrite a presentation slide here. Inline math: $E = mc^2$.",
    summary: "Presentation document with local Markdown and inline LaTeX rendering.",
  }),
  [LIVECODE_KINDS.latex]: Object.freeze({
    label: "LaTeX",
    editorProfile: "latex",
    defaultName: "Untitled LaTeX",
    defaultSource: "\\\\frac{\\\\partial}{\\\\partial t} \\Psi = i \\nabla^2 \\Psi",
    summary: "Standalone mathematical typesetting node rendered locally.",
  }),
  [LIVECODE_KINDS.html]: Object.freeze({
    label: "HTML",
    editorProfile: "html",
    defaultName: "Untitled HTML",
    defaultSource: `<main>\n  <h1>Live HTML</h1>\n  <p>Trusted board content runs in an isolated iframe.</p>\n</main>`,
    summary: "Trusted board HTML. The renderer will remain sandboxed from the parent application.",
  }),
  [LIVECODE_KINDS.orca]: Object.freeze({
    label: "Orca",
    editorProfile: "orca",
    defaultName: "Untitled Orca",
    defaultSource: createEmptyOrcaSource(),
    summary: "Native frame-based Orca grid. Focus the grid to edit it; its MIDI, CC, and pitch-bend operators route through Underscores’s Mixer.",
  }),
  [LIVECODE_KINDS.shader]: Object.freeze({
    label: "GLSL",
    editorProfile: "shader",
    defaultName: "Hello GLSL",
    defaultSource: HELLO_GLSL_FRAGMENT_SOURCE,
    summary: "Editable GLSL ES 3.00 fragment shader rendered into the node with WebGL 2.",
  }),
  [LIVECODE_KINDS.tixy]: Object.freeze({
    label: "Tixy",
    editorProfile: "tixy",
    defaultName: "Untitled Tixy",
    defaultSource: TIXY_DEFAULT_SOURCE,
    summary: "Tiny configurable `(t, i, x, y) => value` creative coding grid synchronized to the shared transport (16×16 by default).",
  }),
  [LIVECODE_KINDS.svg]: Object.freeze({
    label: "SVG",
    editorProfile: "svg",
    defaultName: "Untitled SVG",
    defaultSource: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">\n  <path d="M20 90 C80 20 140 160 300 90" fill="none" stroke="currentColor" stroke-width="3"/>\n</svg>`,
    summary: "Source-preserving SVG document rendered locally with transport-aware SMIL and Web Animations playback.",
  }),
});

export const LIVE_CODE_FONT_OPTIONS = Object.freeze([
  Object.freeze({ id: "mono", label: "Fira Mono", family: '"Fira Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' }),
  Object.freeze({ id: "sans", label: "Inter", family: '"Inter", ui-sans-serif, system-ui, sans-serif' }),
  Object.freeze({ id: "serif", label: "Serif", family: "ui-serif, Georgia, serif" }),
  Object.freeze({ id: "monaspace-argon", label: "Monaspace · Argon", family: '"Monaspace Argon", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', supportsLigatures: true, featureSettings: '"calt" 1, "liga" 1, "ss01" 1, "ss02" 1, "ss03" 1, "ss04" 1, "ss05" 1, "ss06" 1, "ss07" 1, "ss08" 1, "ss09" 1, "ss10" 1' }),
  Object.freeze({ id: "monaspace-krypton", label: "Monaspace · Krypton", family: '"Monaspace Krypton", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', supportsLigatures: true, featureSettings: '"calt" 1, "liga" 1, "ss01" 1, "ss02" 1, "ss03" 1, "ss04" 1, "ss05" 1, "ss06" 1, "ss07" 1, "ss08" 1, "ss09" 1, "ss10" 1' }),
  Object.freeze({ id: "monaspace-neon", label: "Monaspace · Neon", family: '"Monaspace Neon", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', supportsLigatures: true, featureSettings: '"calt" 1, "liga" 1, "ss01" 1, "ss02" 1, "ss03" 1, "ss04" 1, "ss05" 1, "ss06" 1, "ss07" 1, "ss08" 1, "ss09" 1, "ss10" 1' }),
  Object.freeze({ id: "monaspace-radon", label: "Monaspace · Radon", family: '"Monaspace Radon", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', supportsLigatures: true, featureSettings: '"calt" 1, "liga" 1, "ss01" 1, "ss02" 1, "ss03" 1, "ss04" 1, "ss05" 1, "ss06" 1, "ss07" 1, "ss08" 1, "ss09" 1, "ss10" 1' }),
  Object.freeze({ id: "monaspace-xenon", label: "Monaspace · Xenon", family: '"Monaspace Xenon", "Symbols Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', supportsLigatures: true, featureSettings: '"calt" 1, "liga" 1, "ss01" 1, "ss02" 1, "ss03" 1, "ss04" 1, "ss05" 1, "ss06" 1, "ss07" 1, "ss08" 1, "ss09" 1, "ss10" 1' }),
]);

export const DEFAULT_LIVECODE_TYPOGRAPHY = Object.freeze({
  font: "mono",
  fontSize: 14,
  lineHeight: 1.45,
  fontWeight: 400,
  letterSpacing: 0,
  ligatures: true,
  showLineNumbers: false,
  showFoldGutter: false,
  codeOverlayOpacity: 0,
  glyphOnlyOverlay: true,
});

// Visual/document nodes are immediately useful as live surfaces, so a fresh
// node starts running on its own clock. Audio-pattern nodes remain the
// deliberate exception: they need an explicit evaluation boundary and follow
// the score clock by default.
export const DEFAULT_LIVECODE_RUNTIME = Object.freeze({
  running: true,
  enabled: true,
  transportMode: "free",
  settings: {},
});

export const DEFAULT_STRUDEL_RUNTIME = Object.freeze({
  running: false,
  enabled: true,
  transportMode: "linked",
  settings: {},
});

const createLivecodeId = () => (
  globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
);

const LIVE_CODE_NAME_ADJECTIVES = Object.freeze([
  "random", "quiet", "neon", "soft", "lucid", "velvet", "tiny", "electric",
  "hidden", "slow", "paper", "golden", "cosmic", "gentle", "pixel", "midnight",
]);

const LIVE_CODE_NAME_NOUNS = Object.freeze([
  "lines", "orbit", "garden", "weather", "machine", "signal", "bloom", "circuit",
  "comet", "static", "rhythm", "loops", "window", "field", "drift", "echo",
]);

const hashLivecodeNameSeed = value => {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const isLivecodeKind = value => Object.hasOwn(LIVECODE_KIND_DEFINITIONS, value);

export const normalizeLivecodeKind = value => (
  isLivecodeKind(value) ? value : LIVECODE_KINDS.strudel
);

export const getLivecodeKindDefinition = value => LIVECODE_KIND_DEFINITIONS[normalizeLivecodeKind(value)];

export const getLivecodeFont = value => (
  LIVE_CODE_FONT_OPTIONS.find(option => option.id === value) || LIVE_CODE_FONT_OPTIONS[0]
);

export const defaultLivecodeSource = kind => getLivecodeKindDefinition(kind).defaultSource;

export const defaultLivecodeName = kind => getLivecodeKindDefinition(kind).defaultName;

// Blank nodes get a short, human-readable name instead of exposing the
// adapter's implementation name (for example, "p5 node") in the UI. A seed
// keeps names stable when an older scene is normalized repeatedly; omitting it
// gives newly-created nodes a fresh name.
export const randomLivecodeName = (kind, seed = "") => {
  const normalizedKind = normalizeLivecodeKind(kind);
  const value = seed ? hashLivecodeNameSeed(`${normalizedKind}:${seed}`) : hashLivecodeNameSeed(`${normalizedKind}:${createLivecodeId()}`);
  const adjective = LIVE_CODE_NAME_ADJECTIVES[value % LIVE_CODE_NAME_ADJECTIVES.length];
  const noun = LIVE_CODE_NAME_NOUNS[Math.floor(value / LIVE_CODE_NAME_ADJECTIVES.length) % LIVE_CODE_NAME_NOUNS.length];
  return `${adjective} ${noun}`;
};

export const copyLivecodeExampleName = name => {
  const base = String(name || "example").trim() || "example";
  return /\s+copy$/i.test(base) ? base : `${base} copy`;
};

// Modifier-specific double-click entry points for canvas Livecode nodes.
// Return null for an ordinary double-click so the node keeps its authored
// view. Ctrl is accepted alongside Cmd for cross-platform parity.
export const getLivecodeViewForDoubleClick = event => {
  const command = Boolean(event?.metaKey || event?.ctrlKey);
  const option = Boolean(event?.altKey);
  const shift = Boolean(event?.shiftKey);
  if (command && !option && !shift) return "preview";
  if (shift && option && !command) return "source";
  if (shift && !option && !command) return "code";
  return null;
};

// Command-clicking a Livecode output is a deliberate preview shortcut. Keep
// modified command clicks available to canvas selection gestures, in
// particular Command+Shift-click for cycling overlapping objects.
export const isLivecodeCommandOutputGesture = event => Boolean(
  event
  && (event.metaKey || event.ctrlKey)
  && !event.shiftKey
  && !event.altKey
  && (event.button === undefined || event.button === 0)
);

export const isLivecodeCommandCycleGesture = event => Boolean(
  event
  && event.metaKey
  && event.shiftKey
  && !event.ctrlKey
  && !event.altKey
  && (event.button === undefined || event.button === 0)
);

export const normalizeLivecodeTypography = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    font: getLivecodeFont(raw.font).id,
    fontSize: Math.max(8, Math.min(72, Number(raw.fontSize) || DEFAULT_LIVECODE_TYPOGRAPHY.fontSize)),
    lineHeight: Math.max(0.8, Math.min(3, Number(raw.lineHeight) || DEFAULT_LIVECODE_TYPOGRAPHY.lineHeight)),
    fontWeight: [300, 400, 500, 600, 700].includes(Number(raw.fontWeight)) ? Number(raw.fontWeight) : DEFAULT_LIVECODE_TYPOGRAPHY.fontWeight,
    letterSpacing: Math.max(-2, Math.min(8, Number(raw.letterSpacing) || DEFAULT_LIVECODE_TYPOGRAPHY.letterSpacing)),
    ligatures: raw.ligatures !== false,
    showLineNumbers: raw.showLineNumbers === true,
    showFoldGutter: raw.showFoldGutter === true,
    codeOverlayOpacity: Math.max(0, Math.min(1, Number(raw.codeOverlayOpacity) || DEFAULT_LIVECODE_TYPOGRAPHY.codeOverlayOpacity)),
    glyphOnlyOverlay: raw.glyphOnlyOverlay !== false,
  };
};

export const adjustLivecodeFontSize = (fontSize, delta) => {
  const current = Number(fontSize);
  const base = Number.isFinite(current) ? current : DEFAULT_LIVECODE_TYPOGRAPHY.fontSize;
  return Math.max(8, Math.min(72, base + (Number(delta) < 0 ? -1 : 1)));
};

export const normalizeLivecodeRuntime = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    running: Boolean(raw.running),
    enabled: raw.enabled !== false,
    transportMode: raw.transportMode === "free" ? "free" : "linked",
    settings: raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings) ? raw.settings : {},
  };
};

export const defaultLivecodeRuntimeForKind = kind => (
  normalizeLivecodeKind(kind) === LIVECODE_KINDS.strudel
    ? DEFAULT_STRUDEL_RUNTIME
    : DEFAULT_LIVECODE_RUNTIME
);

// Strudel has historically treated Cmd/Ctrl+Enter as an explicit evaluation
// boundary, while the visual runtimes compile source as it changes. Keep that
// distinction as a small per-node setting without rewriting older scene data:
// an omitted value preserves the established default for each kind, and an
// explicit value is persisted when the author toggles it.
export const isLivecodeAutoUpdateEnabled = rawNode => {
  const kind = normalizeLivecodeKind(rawNode?.kind);
  const setting = rawNode?.runtime?.settings?.autoUpdate;
  if (typeof setting === "boolean") return setting;
  return kind !== LIVECODE_KINDS.strudel;
};

export const resolveLivecodeRuntimeSource = rawNode => {
  const source = typeof rawNode?.source === "string" ? rawNode.source : "";
  if (isLivecodeAutoUpdateEnabled(rawNode)) return source;
  return typeof rawNode?.runtime?.settings?.evaluatedSource === "string"
    ? rawNode.runtime.settings.evaluatedSource
    : source;
};

// Runtime adapters receive a source snapshot, while the authored node keeps
// the latest draft for the editor. Manual-update nodes also use the evaluation
// revision as their runtime revision so draft edits do not tear down a live
// renderer before Cmd/Ctrl+Enter commits them.
export const resolveLivecodeRuntimeNode = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  const autoUpdate = isLivecodeAutoUpdateEnabled(node);
  const evaluationRevision = Math.max(0, Number(node.runtime.settings?.evaluationRevision) || 0);
  return {
    ...node,
    source: resolveLivecodeRuntimeSource(node),
    revision: autoUpdate ? node.revision : evaluationRevision,
  };
};

export const createLivecodeNode = value => {
  const raw = value && typeof value === "object" ? value : {};
  const kind = normalizeLivecodeKind(raw.kind);
  const requestedView = ["code", "preview", "source", "split"].includes(raw.view)
    ? raw.view
    : raw.view === "overlay"
      ? "code"
      : "code";
  const nodeId = typeof raw.nodeId === "string" && raw.nodeId.trim() ? raw.nodeId : `livecode-${createLivecodeId()}`;
  const blankName = randomLivecodeName(kind, nodeId);
  const source = typeof raw.source === "string" ? raw.source : "";
  const runtimeInput = raw.runtime && typeof raw.runtime === "object" && !Array.isArray(raw.runtime)
    ? raw.runtime
    : {};
  const defaults = defaultLivecodeRuntimeForKind(kind);
  const normalizedRuntime = normalizeLivecodeRuntime({
    ...runtimeInput,
    // Only valid, explicitly-authored values override the kind default. This
    // also keeps callers that build a partial runtime object from accidentally
    // opting a new visual node out with `running: undefined`.
    running: typeof runtimeInput.running === "boolean" ? runtimeInput.running : defaults.running,
    transportMode: runtimeInput.transportMode === "free" || runtimeInput.transportMode === "linked"
      ? runtimeInput.transportMode
      : defaults.transportMode,
  });
  if (
    normalizedRuntime.running
    && !isLivecodeAutoUpdateEnabled({ kind, runtime: normalizedRuntime })
    && typeof normalizedRuntime.settings.evaluatedSource !== "string"
  ) {
    normalizedRuntime.settings = {
      ...normalizedRuntime.settings,
      evaluatedSource: source,
      evaluationRevision: Math.max(0, Number(normalizedRuntime.settings.evaluationRevision) || 0),
    };
  }
  return {
    version: LIVECODE_NODE_VERSION,
    nodeId,
    kind,
    name: String(raw.name || blankName).trim() || blankName,
    // Livecode nodes start as a blank surface rather than injecting an adapter
    // template into a node the user is about to improvise in.
    source,
    parameters: raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters) ? raw.parameters : {},
    runtime: normalizedRuntime,
    // Orca owns its grid surface. Strudel uses the same source/output views
    // as the other Livecode kinds, but does not expose a redundant side-by-
    // side split because its output is itself a live decorated code surface.
    view: kind === LIVECODE_KINDS.orca
      ? "code"
      : kind === LIVECODE_KINDS.strudel && requestedView === "split"
        ? "code"
        : requestedView,
    typography: normalizeLivecodeTypography(raw.typography),
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
    createdAt: Math.max(0, Number(raw.createdAt) || Date.now()),
    updatedAt: Math.max(0, Number(raw.updatedAt) || Date.now()),
  };
};

export const normalizeLivecodeNode = createLivecodeNode;

export const isLivecodeNodeElement = element => Boolean(element?.customData?.underscoresLivecode);

export const shouldRenderLivecodeNode = element => Boolean(
  element && !element.isDeleted && !element.customData?.outlinerHidden && !element.customData?.presentationMaskActive && isLivecodeNodeElement(element)
);

export const getLivecodeEditorProfile = node => getLivecodeKindDefinition(node?.kind).editorProfile;

export const patchLivecodeNode = (value, patch = {}) => {
  const previous = normalizeLivecodeNode(value);
  const kind = normalizeLivecodeKind(patch.kind ?? previous.kind);
  const settingPatch = patch.runtime?.settings && typeof patch.runtime.settings === "object"
    ? patch.runtime.settings
    : null;
  const runtime = patch.runtime ? {
    ...previous.runtime,
    ...patch.runtime,
    settings: patch.runtime.settings
      ? { ...previous.runtime.settings, ...patch.runtime.settings }
      : previous.runtime.settings,
  } : previous.runtime;
  // When leaving auto-update, freeze the currently-rendered source as the
  // explicit evaluation snapshot. This prevents a draft that was typed just
  // before the toggle from unexpectedly replacing the running surface.
  if (
    settingPatch
    && Object.hasOwn(settingPatch, "autoUpdate")
    && isLivecodeAutoUpdateEnabled(previous)
    && settingPatch.autoUpdate === false
    && !Object.hasOwn(settingPatch, "evaluatedSource")
  ) {
    runtime.settings = {
      ...runtime.settings,
      evaluatedSource: previous.source,
      evaluationRevision: Math.max(0, Number(previous.runtime.settings?.evaluationRevision) || 0) + 1,
    };
  }
  return normalizeLivecodeNode({
    ...previous,
    ...patch,
    kind,
    runtime,
    typography: patch.typography ? { ...previous.typography, ...patch.typography } : previous.typography,
    parameters: patch.parameters ? { ...previous.parameters, ...patch.parameters } : previous.parameters,
    revision: previous.revision + 1,
    updatedAt: Date.now(),
  });
};

export const replaceLivecodeNodeProgram = (value, {
  kind,
  source,
  name,
  runtimeSettings = {},
} = {}) => {
  const previous = normalizeLivecodeNode(value);
  const nextKind = normalizeLivecodeKind(kind ?? previous.kind);
  const kindChanged = nextKind !== previous.kind;
  const nextName = typeof name === "string" && name.trim()
    ? name.trim()
    : kindChanged
      ? randomLivecodeName(nextKind, `${previous.nodeId}:${nextKind}`)
      : previous.name;
  return normalizeLivecodeNode({
    ...previous,
    kind: nextKind,
    name: nextName,
    source: typeof source === "string" ? source : previous.source,
    parameters: kindChanged ? {} : previous.parameters,
    runtime: {
      ...previous.runtime,
      settings: {
        ...(kindChanged ? {} : previous.runtime.settings),
        ...(runtimeSettings && typeof runtimeSettings === "object" ? runtimeSettings : {}),
      },
    },
    revision: previous.revision + 1,
    updatedAt: Date.now(),
  });
};

export const getLivecodeNodeLabel = value => {
  const node = normalizeLivecodeNode(value);
  return node.name || getLivecodeKindDefinition(node.kind).label;
};
