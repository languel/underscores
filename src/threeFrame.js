// Standalone Three.js Livecode configuration and compilation helpers.  The
// renderer itself is intentionally ephemeral: the persisted node keeps only
// authored source, parameters, and ordinary Livecode settings.

export const THREE_LIVECODE_VERSION = "0.185.1";

export const normalizeThreeFrame = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    source: String(raw.source || ""),
    parameters: raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
      ? raw.parameters
      : {},
    transparent: raw.transparent !== false,
    allowInteraction: raw.allowInteraction !== false,
    pixelRatio: Math.max(1, Math.min(2, Number(raw.pixelRatio) || 2)),
    reloadNonce: Math.max(0, Number(raw.reloadNonce) || 0),
  };
};

export const cacheThreeFrameConfig = (previous, value) => {
  const normalized = normalizeThreeFrame(value);
  const key = JSON.stringify(normalized);
  return previous?.key === key ? previous : { key, value: normalized };
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Three nodes are trusted local authoring surfaces, just like p5 and Manim.
// Compile once, then hand the program a deliberately small scene contract.
export const compileThreeSource = source => new AsyncFunction(
  "THREE",
  "scene",
  "camera",
  "renderer",
  "__",
  "tick",
  "onDispose",
  `"use strict";\n${String(source || "")}\n//# sourceURL=underscores-three-livecode.js`,
);

export const validateThreeSource = source => {
  try {
    compileThreeSource(source);
    return { valid: true, error: "" };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
};
