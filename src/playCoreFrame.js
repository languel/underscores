// Drawerator's small, bundled Play Core-compatible runner. Its public program
// contract follows https://github.com/ertdfgcvb/play.core (Apache-2.0):
// settings plus boot/pre/main/post and pointer callbacks. This is deliberately
// a local runtime, so a score remains portable with its Drawerator scene.
export const PLAY_CORE_STORAGE_KEY = "drawerator_play_core_scripts";

export const DEFAULT_PLAY_CORE_SOURCE = `// Play Core program. @param values are available as drawerator.params.
// @param threshold = 0.55 (0..1, step: 0.01)
export const settings = { cols: 0, rows: 0, fps: 30, backgroundColor: "#101010", color: "#e8e8e8" };

export function main({ x, y }, context, cursor, buffer, drawerator) {
  const wave = Math.sin(x * 0.22 + context.time / 450);
  return wave > drawerator.params.threshold ? "·" : " ";
}`;

export const DEFAULT_PLAY_CORE_FRAME = Object.freeze({
  scriptId: "", source: DEFAULT_PLAY_CORE_SOURCE, fps: 30, allowInteraction: true,
  parameters: {}, reloadNonce: 0,
});

export const isPlayCoreFrameElement = element => Boolean(element?.customData?.draweratorPlayCore);
export const shouldRenderPlayCoreFrame = element => Boolean(element && !element.isDeleted && !element.customData?.outlinerHidden && isPlayCoreFrameElement(element));
export const canHostPlayCoreFrame = element => Boolean(element && !element.isDeleted && (isPlayCoreFrameElement(element) || ["rectangle", "frame"].includes(element.type)));

export const normalizePlayCoreFrame = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_PLAY_CORE_FRAME, ...raw,
    scriptId: typeof raw.scriptId === "string" ? raw.scriptId : "",
    source: typeof raw.source === "string" ? raw.source : DEFAULT_PLAY_CORE_SOURCE,
    fps: Math.max(1, Math.min(120, Number(raw.fps) || 30)),
    allowInteraction: raw.allowInteraction !== false,
    parameters: raw.parameters && typeof raw.parameters === "object" ? raw.parameters : {},
    reloadNonce: Math.max(0, Number(raw.reloadNonce) || 0),
  };
};

export const validatePlayCoreSource = source => {
  try { compilePlayCoreSource(source); return { valid: true, error: "" }; }
  catch (error) { return { valid: false, error: error instanceof Error ? error.message : String(error) }; }
};

const transformPlayCoreSource = source => String(source || "")
    .replace(/export\s+const\s+settings\s*=/g, "exports.settings =")
    .replace(/export\s+(async\s+)?function\s+(boot|pre|main|post|pointerMove|pointerDown|pointerUp)\s*\(/g, (_match, async, name) => `exports.${name} = ${async || ""}function ${name}(`)
    .replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, "exports.$2 =");

export const evaluatePlayCoreSource = (source, drawerator = {}) => {
  const code = transformPlayCoreSource(source);
  const exports = {};
  new Function("exports", "drawerator", `"use strict";\n${code}\nreturn exports;`)(exports, drawerator);
  return exports;
};

// Validation evaluates a module with an inert Drawerator value. Runtime
// evaluation happens once the live bridge has been constructed.
export const compilePlayCoreSource = source => evaluatePlayCoreSource(source);

const createPlayCoreId = () => (
  globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
);

export const createPlayCoreScript = (value = {}) => ({
  id: value.id || `play-core-${createPlayCoreId()}`,
  name: String(value.name || "Untitled Play Core").trim() || "Untitled Play Core",
  source: typeof value.source === "string" ? value.source : DEFAULT_PLAY_CORE_SOURCE,
  createdAt: Number(value.createdAt) || Date.now(), updatedAt: Number(value.updatedAt) || Date.now(),
});

export const normalizePlayCoreScripts = value => Array.isArray(value) ? value.filter(Boolean).map(createPlayCoreScript) : [];
