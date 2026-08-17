import { HELLO_GLSL_FRAGMENT_SOURCE } from "./shaderLivecode.js";
import { createEmptyOrcaSource } from "./orcaEngine.js";

// Canonical, scene-persisted representation for a Livecode Node.  The
// Excalidraw rectangle that carries this data is intentionally transparent:
// it supplies selection, transforms, history, and ordering while the live DOM
// surface is what authors actually see.

export const LIVECODE_NODE_VERSION = 1;

export const LIVECODE_KINDS = Object.freeze({
  strudel: "strudel",
  p5: "p5",
  playcore: "playcore",
  markdown: "markdown",
  latex: "latex",
  html: "html",
  orca: "orca",
  shader: "shader",
});

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

export const DEFAULT_LIVECODE_RUNTIME = Object.freeze({
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

export const normalizeLivecodeRuntime = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    running: Boolean(raw.running),
    enabled: raw.enabled !== false,
    transportMode: raw.transportMode === "free" ? "free" : "linked",
    settings: raw.settings && typeof raw.settings === "object" && !Array.isArray(raw.settings) ? raw.settings : {},
  };
};

export const createLivecodeNode = value => {
  const raw = value && typeof value === "object" ? value : {};
  const kind = normalizeLivecodeKind(raw.kind);
  const nodeId = typeof raw.nodeId === "string" && raw.nodeId.trim() ? raw.nodeId : `livecode-${createLivecodeId()}`;
  const blankName = randomLivecodeName(kind, nodeId);
  const source = typeof raw.source === "string" ? raw.source : "";
  const normalizedRuntime = normalizeLivecodeRuntime(raw.runtime);
  if (
    kind === LIVECODE_KINDS.strudel
    && normalizedRuntime.running
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
    view: kind === LIVECODE_KINDS.orca || kind === LIVECODE_KINDS.strudel
      ? "code"
      : ["code", "preview", "source", "split"].includes(raw.view)
        ? raw.view
        : raw.view === "overlay"
          ? "code"
          : "code",
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
  const runtime = patch.runtime ? {
    ...previous.runtime,
    ...patch.runtime,
    settings: patch.runtime.settings
      ? { ...previous.runtime.settings, ...patch.runtime.settings }
      : previous.runtime.settings,
  } : previous.runtime;
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
