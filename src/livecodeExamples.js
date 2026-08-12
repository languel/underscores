import { P5_EXAMPLES } from "./p5Frame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";
import { SHADER_EXAMPLES } from "./shaderLivecode.js";
import { LIVECODE_KINDS, defaultLivecodeSource } from "./livecodeNode.js";

// Keep one deliberately small starter for every persisted Livecode kind. These
// are editor templates, not hidden runtime defaults: selecting one replaces
// only the selected node's source and records the change in scene history.
export const LIVECODE_TEMPLATES = Object.freeze({
  [LIVECODE_KINDS.strudel]: `// Ctrl/Cmd+Enter evaluates this node.\n$: note("c3 e3 g3 b3")\n  .s("sine")\n  .slow(2)`,
  [LIVECODE_KINDS.p5]: defaultLivecodeSource(LIVECODE_KINDS.p5),
  [LIVECODE_KINDS.playcore]: defaultLivecodeSource(LIVECODE_KINDS.playcore),
  [LIVECODE_KINDS.markdown]: `# Markdown starter\n\nWrite **rich text** here. Inline math: $E = mc^2$.\n\n- one\n- two`,
  [LIVECODE_KINDS.latex]: `\\frac{\\partial}{\\partial t} \\Psi = i \\nabla^2 \\Psi`,
  [LIVECODE_KINDS.html]: `<!doctype html>\n<main>\n  <h1>HTML starter</h1>\n  <p>Edit this isolated document.</p>\n</main>`,
  [LIVECODE_KINDS.orca]: `................................\n................................\n................................\n................................`,
  [LIVECODE_KINDS.shader]: defaultLivecodeSource(LIVECODE_KINDS.shader),
});

const bareExample = kind => ({
  id: "bare",
  label: "Barebones",
  name: "Barebones",
  source: LIVECODE_TEMPLATES[kind] || defaultLivecodeSource(kind),
});

const p5Examples = Object.freeze([
  bareExample(LIVECODE_KINDS.p5),
  ...P5_EXAMPLES.map(example => ({ id: example.id, label: example.name, name: example.name, source: example.source, mode: example.mode })),
]);

const playCoreExamples = Object.freeze([
  bareExample(LIVECODE_KINDS.playcore),
  ...PLAY_CORE_EXAMPLES.map(example => ({ id: example.id, label: `${example.category} · ${example.name}`, name: example.name, source: example.source })),
]);

export const getLivecodeExamples = kind => {
  if (kind === LIVECODE_KINDS.p5) return p5Examples;
  if (kind === LIVECODE_KINDS.playcore) return playCoreExamples;
  if (kind === LIVECODE_KINDS.shader) return SHADER_EXAMPLES.map(example => ({ id: example.id, label: example.label, name: example.name, source: example.source, mode: example.mode }));
  return [bareExample(kind)];
};
