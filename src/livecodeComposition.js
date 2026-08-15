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

export const LIVECODE_PERSISTENCE_MODES = Object.freeze([
  "auto",
  "clear",
  "accumulate",
]);

export const DEFAULT_LIVECODE_COMPOSITION = Object.freeze({
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
  const backgroundMode = LIVECODE_BACKGROUND_MODES.includes(raw.backgroundMode)
    ? raw.backgroundMode
    : (raw.transparent === true
      ? "transparent"
      : raw.transparent === false ? "solid" : DEFAULT_LIVECODE_COMPOSITION.backgroundMode);
  const persistence = LIVECODE_PERSISTENCE_MODES.includes(raw.persistence)
    ? raw.persistence
    : DEFAULT_LIVECODE_COMPOSITION.persistence;
  return { backgroundMode, persistence };
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
