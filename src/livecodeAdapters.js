import { normalizeP5Frame, normalizeP5Version, resolveP5SourceMode } from "./p5Frame.js";
import { normalizePlayCoreFrame, validatePlayCoreSource } from "./playCoreFrame.js";
import { normalizeManimFrame, validateManimSource } from "./manimFrame.js";
import { normalizeThreeFrame, validateThreeSource } from "./threeFrame.js";
import { LIVECODE_KINDS, normalizeLivecodeNode, resolveLivecodeRuntimeNode } from "./livecodeNode.js";
import {
  LIVECODE_BACKGROUND_MODES,
  LIVECODE_BLEND_MODES,
  LIVECODE_COMPOSITE_MODES,
  LIVECODE_PERSISTENCE_MODES,
  normalizeLivecodeComposition,
  resolveP5Transparency,
} from "./livecodeComposition.js";
import { validateShaderSource } from "./shaderLivecode.js";
import { validateTixySource } from "./tixyRuntime.js";

// The registry is deliberately declarative.  A node's model never contains a
// renderer instance: adapters receive its canonical source/configuration and
// may be mounted, stopped, or replaced without changing scene data.
const syntaxValidation = source => {
  try {
    // p5 supports both global callbacks and instance callbacks. Parsing is
    // enough here; the existing p5 host remains responsible for reporting
    // runtime errors and restoring the last working sketch.
    new Function(String(source || "")); // eslint-disable-line no-new-func
    return { valid: true, error: "" };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
};

const VISUAL_COMPOSITION = Object.freeze({
  compositeModes: LIVECODE_COMPOSITE_MODES,
  blendModes: LIVECODE_BLEND_MODES,
  backgroundModes: LIVECODE_BACKGROUND_MODES,
  persistenceModes: Object.freeze([]),
});

const P5_COMPOSITION = Object.freeze({
  ...VISUAL_COMPOSITION,
  persistenceModes: LIVECODE_PERSISTENCE_MODES,
});

const SHADER_COMPOSITION = Object.freeze({
  ...VISUAL_COMPOSITION,
  backgroundModes: Object.freeze(["solid", "transparent"]),
});

export const LIVECODE_ADAPTERS = Object.freeze({
  [LIVECODE_KINDS.p5]: Object.freeze({
    id: LIVECODE_KINDS.p5,
    runtime: "p5",
    composition: P5_COMPOSITION,
    validate: syntaxValidation,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      const composition = normalizeLivecodeComposition(node.runtime.settings);
      return normalizeP5Frame({
        source: node.source,
        parameters: node.parameters,
        mode: node.runtime.settings?.p5Mode || node.runtime.settings?.mode || "auto",
        p5Version: normalizeP5Version(node.runtime.settings?.p5Version),
        // Match a high-refresh teaching display by default; authors can set
        // a lower runtime fps when a sketch needs a deliberate cadence.
        fps: node.runtime.settings?.fps || 120,
        // Let p5 choose the display density by default so zoomed/Retina
        // canvases stay sharp. A node may still opt into a specific density
        // through runtime settings, and authored pixelDensity() calls remain
        // available for sketches that deliberately trade fidelity for speed.
        pixelDensity: Number(node.runtime.settings?.pixelDensity) > 0
          ? Number(node.runtime.settings.pixelDensity)
          : null,
        transparent: resolveP5Transparency(node.runtime.settings),
        backgroundMode: composition.backgroundMode,
        persistence: composition.persistence,
        autoplay: true,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
      });
    },
  }),
  [LIVECODE_KINDS.manim]: Object.freeze({
    id: LIVECODE_KINDS.manim,
    runtime: "manim",
    composition: VISUAL_COMPOSITION,
    validate: validateManimSource,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      const composition = normalizeLivecodeComposition(node.runtime.settings);
      return normalizeManimFrame({
        source: node.source,
        parameters: node.parameters,
        transparent: composition.backgroundMode === "solid"
          ? false
          : node.runtime.settings?.transparent !== false,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
        progressionMode: node.runtime.settings?.progressionMode || "auto",
        runtimeUrl: node.runtime.settings?.runtimeUrl,
        reloadNonce: node.revision,
      });
    },
  }),
  [LIVECODE_KINDS.three]: Object.freeze({
    id: LIVECODE_KINDS.three,
    runtime: "three",
    composition: VISUAL_COMPOSITION,
    validate: validateThreeSource,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      const composition = normalizeLivecodeComposition(node.runtime.settings);
      return normalizeThreeFrame({
        source: node.source,
        parameters: node.parameters,
        transparent: composition.backgroundMode === "solid" || composition.backgroundMode === "theme"
          ? false
          : node.runtime.settings?.transparent !== false,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
        keepLastFrame: node.runtime.settings?.keepLastFrame !== false,
        reloadNonce: node.revision,
      });
    },
  }),
  [LIVECODE_KINDS.playcore]: Object.freeze({
    id: LIVECODE_KINDS.playcore,
    runtime: "playcore",
    composition: VISUAL_COMPOSITION,
    validate: validatePlayCoreSource,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      return normalizePlayCoreFrame({
        source: node.source,
        parameters: node.parameters,
        fps: node.runtime.settings?.fps || 30,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
        reloadNonce: node.revision,
      });
    },
  }),
  [LIVECODE_KINDS.strudel]: Object.freeze({
    id: LIVECODE_KINDS.strudel,
    runtime: "strudel",
    composition: VISUAL_COMPOSITION,
    validate: source => String(source || "").trim()
      ? { valid: true, error: "" }
      : { valid: false, error: "Enter a Strudel pattern before running this node." },
    makeRuntimeConfig: rawNode => normalizeLivecodeNode(rawNode),
  }),
  [LIVECODE_KINDS.markdown]: Object.freeze({ id: LIVECODE_KINDS.markdown, runtime: "presentation", composition: VISUAL_COMPOSITION, validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.latex]: Object.freeze({ id: LIVECODE_KINDS.latex, runtime: "presentation", composition: VISUAL_COMPOSITION, validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.html]: Object.freeze({ id: LIVECODE_KINDS.html, runtime: "presentation", composition: VISUAL_COMPOSITION, validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.svg]: Object.freeze({
    id: LIVECODE_KINDS.svg,
    runtime: "presentation",
    composition: VISUAL_COMPOSITION,
    validate: source => /^\s*<svg(?:\s|>)/i.test(String(source || ""))
      ? { valid: true, error: "" }
      : { valid: false, error: "SVG source must start with an <svg> element." },
  }),
  [LIVECODE_KINDS.orca]: Object.freeze({
    id: LIVECODE_KINDS.orca,
    runtime: "orca",
    composition: VISUAL_COMPOSITION,
    validate: source => String(source || "").includes("\u0000")
      ? { valid: false, error: "Orca grid source cannot contain null characters." }
      : { valid: true, error: "" },
    makeRuntimeConfig: rawNode => normalizeLivecodeNode(rawNode),
  }),
  [LIVECODE_KINDS.shader]: Object.freeze({
    id: LIVECODE_KINDS.shader,
    runtime: "shader",
    composition: SHADER_COMPOSITION,
    validate: validateShaderSource,
    makeRuntimeConfig: rawNode => normalizeLivecodeNode(rawNode),
  }),
  [LIVECODE_KINDS.tixy]: Object.freeze({
    id: LIVECODE_KINDS.tixy,
    runtime: "tixy",
    composition: VISUAL_COMPOSITION,
    validate: validateTixySource,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      return {
        source: node.source,
        parameters: node.parameters,
        fps: Math.max(1, Math.min(240, Number(node.runtime.settings?.fps) || 60)),
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
        reloadNonce: node.revision,
      };
    },
  }),
});

export const getLivecodeAdapter = rawNode => (
  LIVECODE_ADAPTERS[normalizeLivecodeNode(rawNode).kind] || LIVECODE_ADAPTERS[LIVECODE_KINDS.strudel]
);

export const getLivecodeCompositionCapabilities = rawNode => (
  getLivecodeAdapter(rawNode).composition || VISUAL_COMPOSITION
);

export const validateLivecodeNode = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  return getLivecodeAdapter(node).validate(node.source, node);
};

export const getLivecodeRuntimeConfig = rawNode => {
  const node = resolveLivecodeRuntimeNode(rawNode);
  return getLivecodeAdapter(node).makeRuntimeConfig?.(node) || null;
};

export const hasNativeLivecodeRuntime = rawNode => {
  const runtime = getLivecodeAdapter(rawNode).runtime;
  return runtime === "p5" || runtime === "manim" || runtime === "three" || runtime === "playcore" || runtime === "strudel" || runtime === "orca" || runtime === "shader" || runtime === "tixy";
};

export const isLivecodeNodeRunnable = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  return node.runtime.enabled && node.runtime.running && hasNativeLivecodeRuntime(node);
};

export const describeLivecodeRuntime = rawNode => {
  const adapter = getLivecodeAdapter(rawNode);
  if (adapter.runtime === "p5") return "Bundled p5.js 2.x / 1.x runtime";
  if (adapter.runtime === "manim") return "manim-web mathematical animation runtime";
  if (adapter.runtime === "three") return "Bundled Three.js scene runtime";
  if (adapter.runtime === "playcore") return "Bundled Play Core runtime";
  if (adapter.runtime === "strudel") return "Shared native Strudel scheduler";
  if (adapter.runtime === "orca") return "Native Orca grid and Underscores MIDI routing";
  if (adapter.runtime === "shader") return "GLSL ES 3.00 on WebGL 2";
  if (adapter.runtime === "tixy") return "Tixy configurable JavaScript expression grid (16×16 default)";
  if (adapter.runtime === "presentation") return "Local presentation renderer";
  return "Native runtime arrives in a later phase.";
};

// Kept as an exported assertion to make the chosen source mode observable in
// unit tests without duplicating p5's legacy/global detection rules.
export const getLivecodeP5SourceMode = rawNode => resolveP5SourceMode(getLivecodeRuntimeConfig(rawNode));
