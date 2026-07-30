// Drawerator's small, bundled Play Core-compatible runner. Its public program
// contract follows https://github.com/ertdfgcvb/play.core (Apache-2.0):
// settings plus boot/pre/main/post and pointer callbacks. This is deliberately
// a local runtime, so a score remains portable with its Drawerator scene.
import { PLAY_CORE_MODULE_SPECIFIERS, resolvePlayCoreModule } from "./playCoreModules.js";

export const PLAY_CORE_STORAGE_KEY = "drawerator_play_core_scripts";

export const DEFAULT_PLAY_CORE_SOURCE = `// Play Core program. The __ alias is the node-local Drawerator bridge.
// @param threshold = 0.55 (0..1, step: 0.01)
export const settings = { cols: 0, rows: 0, fps: 30, backgroundColor: "#101010", color: "#e8e8e8" };

export function main({ x, y }, context) {
  const wave = Math.sin(x * 0.22 + context.time / 450);
  return wave > __.params.threshold ? "·" : " ";
}`;

export const DEFAULT_PLAY_CORE_FRAME = Object.freeze({
  scriptId: "", source: DEFAULT_PLAY_CORE_SOURCE, fps: 30, allowInteraction: true,
  parameters: {}, reloadNonce: 0,
});

export const getPlayCoreGridSize = ({ contentWidth, contentHeight, cellWidth, cellHeight, cols = 0, rows = 0 }) => ({
  cols: Math.max(1, Number(cols) || Math.floor(Math.max(0, contentWidth) / Math.max(1, cellWidth))),
  rows: Math.max(1, Number(rows) || Math.floor(Math.max(0, contentHeight) / Math.max(1, cellHeight))),
});

export const mapPlayCorePointerToLayout = ({ clientX, clientY, rect, layoutWidth, layoutHeight }) => ({
  x: (clientX - rect.left) * Math.max(1, layoutWidth) / Math.max(1, rect.width),
  y: (clientY - rect.top) * Math.max(1, layoutHeight) / Math.max(1, rect.height),
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

const formatModuleImports = source => {
  let importIndex = 0;
  const transformed = String(source || "").replace(/^\s*import\s+(.+?)\s+from\s+["']([^"']+)["'];?\s*$/gm, (_match, rawClause, specifier) => {
    const clause = rawClause.trim();
    const moduleName = `__playCoreModule${importIndex++}`;
    const require = `const ${moduleName} = __require(${JSON.stringify(specifier)});`;
    const named = value => value.slice(1, -1).trim().replace(/\s+as\s+/g, ": ");
    if (clause.startsWith("{")) return `${require}\nconst { ${named(clause)} } = ${moduleName};`;
    if (clause.startsWith("* as ")) return `${require}\nconst ${clause.slice(5).trim()} = ${moduleName};`;
    const comma = clause.indexOf(",");
    if (comma === -1) return `${require}\nconst ${clause} = ${moduleName}.default ?? ${moduleName};`;
    const defaultName = clause.slice(0, comma).trim();
    const remainder = clause.slice(comma + 1).trim();
    if (remainder.startsWith("{")) return `${require}\nconst ${defaultName} = ${moduleName}.default ?? ${moduleName};\nconst { ${named(remainder)} } = ${moduleName};`;
    if (remainder.startsWith("* as ")) return `${require}\nconst ${defaultName} = ${moduleName}.default ?? ${moduleName};\nconst ${remainder.slice(5).trim()} = ${moduleName};`;
    throw new Error(`Unsupported Play Core import clause: ${clause}`);
  });
  if (/\bimport\s*\(/.test(transformed)) throw new Error("Dynamic import() is not available in a portable Play Core program.");
  if (/^\s*import\s/m.test(transformed)) throw new Error("Use a static import from a bundled Play Core module.");
  return transformed;
};

const transformPlayCoreSource = source => formatModuleImports(source)
    .replace(/export\s+const\s+settings\s*=/g, "exports.settings =")
    .replace(/export\s+(async\s+)?function\s+(boot|pre|main|post|pointerMove|pointerDown|pointerUp)\s*\(/g, (_match, async, name) => `exports.${name} = ${async || ""}function ${name}(`)
    .replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, "exports.$2 =")
    .replace(/export\s+default\s+/g, "exports.default = ")
    .replace(/export\s*\{\s*([^}]+)\s*\}\s*;?/g, (_match, names) => names.split(",").map(entry => {
      const [local, exported = local] = entry.trim().split(/\s+as\s+/);
      return `exports.${exported.trim()} = ${local.trim()};`;
    }).join("\n"));

const requirePlayCoreModule = specifier => {
  const module = resolvePlayCoreModule(specifier);
  if (module) return module;
  throw new Error(`Unsupported Play Core module “${specifier}”. Bundled modules: ${PLAY_CORE_MODULE_SPECIFIERS.join(", ")}`);
};

export const evaluatePlayCoreSource = (source, drawerator = {}) => {
  const code = transformPlayCoreSource(source);
  const exports = {};
  new Function("exports", "drawerator", "__", "__require", `"use strict";\n${code}\nreturn exports;`)(
    exports,
    drawerator,
    drawerator,
    requirePlayCoreModule,
  );
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
