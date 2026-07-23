export const SCRIPT_TYPES = Object.freeze({
  brush: Object.freeze({
    id: "brush",
    label: "Brush / modifier",
    description: "JavaScript geometry modifier or multi-track brush. Receives points and Drawerator globals.",
  }),
  iannix: Object.freeze({
    id: "iannix",
    label: "IanniX",
    description: "Trusted IanniX-compatible score script with run()/load() commands and shared parameters.",
  }),
});

export const DEFAULT_SCRIPT_TYPE = "brush";

export const normalizeScriptType = value => (
  Object.hasOwn(SCRIPT_TYPES, value) ? value : DEFAULT_SCRIPT_TYPE
);
