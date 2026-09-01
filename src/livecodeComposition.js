// Shared, low-overhead composition vocabulary for visual Livecode adapters.
// The settings are normalized without adding fields to older scene records;
// adapters can opt into the policy they understand without changing Strudel
// or other runtimes that do not need a frame reset.

export const LIVECODE_BACKGROUND_MODES = Object.freeze([
  "auto",
  "transparent",
  "theme",
  "solid",
]);

export const LIVECODE_COMPOSITE_MODES = Object.freeze([
  "overlay",
  "underlay",
]);

export const LIVECODE_BLEND_MODES = Object.freeze([
  "normal",
  "screen",
  "multiply",
  "overlay",
  "soft-light",
]);

export const LIVECODE_PERSISTENCE_MODES = Object.freeze([
  "auto",
  "clear",
  "accumulate",
]);

export const DEFAULT_LIVECODE_COMPOSITION = Object.freeze({
  compositeMode: "overlay",
  compositeOpacity: 1,
  blendMode: "normal",
  backgroundMode: "auto",
  persistence: "auto",
});

const settingsFor = value => (
  value?.runtime?.settings && typeof value.runtime.settings === "object"
    ? value.runtime.settings
    : value?.settings && typeof value.settings === "object"
      ? value.settings
      : value && typeof value === "object"
        ? value
        : {}
);

export const normalizeLivecodeComposition = value => {
  const raw = settingsFor(value);
  const compositeMode = LIVECODE_COMPOSITE_MODES.includes(raw.compositeMode)
    ? raw.compositeMode
    : DEFAULT_LIVECODE_COMPOSITION.compositeMode;
  const compositeOpacity = Math.max(0, Math.min(1,
    Number.isFinite(Number(raw.compositeOpacity))
      ? Number(raw.compositeOpacity)
      : DEFAULT_LIVECODE_COMPOSITION.compositeOpacity,
  ));
  const blendMode = LIVECODE_BLEND_MODES.includes(raw.blendMode)
    ? raw.blendMode
    : DEFAULT_LIVECODE_COMPOSITION.blendMode;
  const backgroundMode = LIVECODE_BACKGROUND_MODES.includes(raw.backgroundMode)
    ? raw.backgroundMode
    : (raw.transparent === true
      ? "transparent"
      : raw.transparent === false ? "solid" : DEFAULT_LIVECODE_COMPOSITION.backgroundMode);
  const persistence = LIVECODE_PERSISTENCE_MODES.includes(raw.persistence)
    ? raw.persistence
    : DEFAULT_LIVECODE_COMPOSITION.persistence;
  return { compositeMode, compositeOpacity, blendMode, backgroundMode, persistence };
};

// Existing p5 Livecode Nodes historically defaulted to a transparent surface,
// while standalone p5 frames defaulted to an opaque one. Keep that behavior
// when composition is still "auto" and let an explicit shared setting win.
export const resolveP5Transparency = value => {
  const raw = settingsFor(value);
  const { backgroundMode } = normalizeLivecodeComposition(raw);
  if (backgroundMode === "transparent") return true;
  if (backgroundMode === "theme" || backgroundMode === "solid") return false;
  return raw.transparent !== false;
};

// This is intentionally a pure policy check. The renderer decides how to
// reset its own surface; no per-frame bridge or readback is introduced here.
export const shouldClearLivecodeFrame = value => (
  normalizeLivecodeComposition(value).persistence === "clear"
);

// Underlay routing is presentation state, not renderer state. The board owns
// the visible canvas background, so making Excalidraw transparent remains
// harmless when a stopped node currently has no output frame.
export const isLivecodeUnderlayVisible = (element, { hasRetainedFrame = false } = {}) => {
  const node = element?.customData?.underscoresLivecode;
  if (!node || normalizeLivecodeComposition(node.runtime?.settings).compositeMode !== "underlay") return false;
  if (node.kind !== "shader") return true;
  return node.runtime?.running === true
    || (node.runtime?.settings?.keepLastFrame !== false && hasRetainedFrame === true);
};

// Presentation-only changes must not tear down p5, Manim, Play Core, Tixy, or
// feedback runtimes. Background and persistence remain because adapters may
// use them while constructing or resetting their own surface.
export const livecodeRendererSettings = value => {
  const raw = settingsFor(value);
  const { compositeMode: _compositeMode, compositeOpacity: _compositeOpacity, blendMode: _blendMode, ...rendererSettings } = raw;
  return rendererSettings;
};
