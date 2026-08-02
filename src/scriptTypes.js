export const SCRIPT_TYPES = Object.freeze({
  brush: Object.freeze({
    id: "brush",
    label: "Brush / modifier",
    description: "JavaScript geometry modifier or multi-track brush. Receives points and Drawerator globals.",
  }),
  iannix: Object.freeze({
    id: "iannix",
    label: "Score",
    description: "Trusted score script with run()/load() commands and shared parameters. IanniX syntax remains supported for compatibility.",
  }),
  p5: Object.freeze({
    id: "p5",
    label: "p5 sketch",
    description: "Trusted p5.js sketch for interactive canvas frames. Supports classic global setup()/draw() and instance-mode p.setup/p.draw code, with local access to Drawerator and the page.",
  }),
  play: Object.freeze({ id: "play", label: "Play Core", description: "Trusted play.core-style ASCII program with Drawerator parameters, canvas queries, events, and transport access." }),
  livecode: Object.freeze({
    id: "livecode",
    label: "Livecode Node",
    description: "Self-contained canvas livecode node. Select a node to edit its own source, parameters, runtime state, and presentation view without a separate script catalog.",
  }),
  svg: Object.freeze({
    id: "svg",
    label: "SVG",
    description: "Source-preserving SVG document. Play creates a canvas object or updates the selected SVG object.",
  }),
});

export const DEFAULT_SCRIPT_TYPE = "brush";

export const normalizeScriptType = value => (
  value === "score" ? "iannix" : Object.hasOwn(SCRIPT_TYPES, value) ? value : DEFAULT_SCRIPT_TYPE
);
