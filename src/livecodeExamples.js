import { P5_EXAMPLES } from "./p5Frame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";
import { SHADER_EXAMPLES } from "./shaderLivecode.js";
import { LIVECODE_KINDS, defaultLivecodeSource } from "./livecodeNode.js";

const bareExample = kind => ({
  id: "bare",
  label: "Barebones",
  name: "Barebones",
  source: defaultLivecodeSource(kind),
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
