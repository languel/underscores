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
  p5: Object.freeze({
    id: "p5",
    label: "p5 sketch",
    description: "Trusted p5.js sketch for interactive canvas frames. Supports classic global setup()/draw() and instance-mode p.setup/p.draw code, with local access to Drawerator and the page.",
  }),
});

export const DEFAULT_SCRIPT_TYPE = "brush";

export const normalizeScriptType = value => (
  Object.hasOwn(SCRIPT_TYPES, value) ? value : DEFAULT_SCRIPT_TYPE
);
