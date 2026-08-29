import { P5_EXAMPLES } from "./p5Frame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";
import { SHADER_EXAMPLES } from "./shaderLivecode.js";
import { MANIM_DEMO_EXAMPLES } from "./manimDemoExamples.js";
import { LIVECODE_KINDS, defaultLivecodeSource } from "./livecodeNode.js";
import { ORCA_GRID_HEIGHT, ORCA_GRID_WIDTH } from "./orcaEngine.js";

const orcaGrid = (...rows) => Array.from(
  { length: ORCA_GRID_HEIGHT },
  (_, index) => String(rows[index] || "").padEnd(ORCA_GRID_WIDTH, ".").slice(0, ORCA_GRID_WIDTH),
).join("\n");

// Build a row from coordinates so musical examples stay readable and do not
// depend on counting a long run of placeholder cells by hand.
const orcaRow = entries => {
  const row = Array(ORCA_GRID_WIDTH).fill(".");
  entries.forEach(([x, glyph]) => {
    if (Number.isInteger(x) && x >= 0 && x < ORCA_GRID_WIDTH) row[x] = String(glyph || ".").slice(0, 1);
  });
  return row.join("");
};

// Keep one deliberately small source template for every persisted Livecode
// kind. These are available to callers that want to seed a node, but they do
// not need a synthetic "Barebones" entry in the user-facing example list.
export const LIVECODE_TEMPLATES = Object.freeze({
  [LIVECODE_KINDS.strudel]: `// Ctrl/Cmd+Enter evaluates this node.\n$: note("c3 e3 g3 b3")\n  .s("sine")\n  .slow(2)`,
  [LIVECODE_KINDS.p5]: defaultLivecodeSource(LIVECODE_KINDS.p5),
  [LIVECODE_KINDS.manim]: defaultLivecodeSource(LIVECODE_KINDS.manim),
  [LIVECODE_KINDS.playcore]: defaultLivecodeSource(LIVECODE_KINDS.playcore),
  [LIVECODE_KINDS.markdown]: `# Markdown starter\n\nWrite **rich text** here. Inline math: $E = mc^2$.\n\n- one\n- two`,
  [LIVECODE_KINDS.latex]: `\\frac{\\partial}{\\partial t} \\Psi = i \\nabla^2 \\Psi`,
  [LIVECODE_KINDS.html]: `<!doctype html>\n<main>\n  <h1>HTML starter</h1>\n  <p>Edit this isolated document.</p>\n</main>`,
  [LIVECODE_KINDS.orca]: defaultLivecodeSource(LIVECODE_KINDS.orca),
  [LIVECODE_KINDS.shader]: defaultLivecodeSource(LIVECODE_KINDS.shader),
});

const p5Examples = Object.freeze([
  ...P5_EXAMPLES.map(example => ({ id: example.id, label: example.name, name: example.name, source: example.source, mode: example.mode })),
]);

const manimExamples = Object.freeze([
  {
    id: "circle-to-square",
    label: "Basics · Circle to square",
    name: "Circle to square",
    source: `const circle = new Circle({ radius: 1.5 });
const square = new Square({ sideLength: 3 });

await scene.play(new Create(circle));
await scene.play(new Transform(circle, square));
await scene.play(new FadeOut(circle));`,
  },
  {
    id: "parameter-circle",
    label: "Interactive · Parameterized circle",
    name: "Parameterized circle",
    source: `// @param radius = 1.5 (0.25..3 step:0.05)
// @param scale = 1 (0.25..2 step:0.05)
const circle = new Circle({ radius: __.params.radius });
circle.scale(__.params.scale);
await scene.play(new Create(circle));`,
  },
  {
    id: "equation",
    label: "Math · Equation reveal",
    name: "Equation reveal",
    source: `const title = new MathTex({ latex: "e^{i\\\\pi}+1=0" });
await scene.play(new Write(title));
await scene.play(title.animate.scale(1.35));`,
  },
  {
    id: "cue-build",
    label: "Presentation · Cue build",
    name: "Cue build",
    settings: { progressionMode: "cue" },
    source: `const axes = new Axes({ xRange: [-4, 4, 1], yRange: [-2, 4, 1] });
await scene.play(new Create(axes));

await cue("Function");
const graph = new FunctionGraph({ func: x => 0.25 * x * x });
await scene.play(new Create(graph));

await cue("Equation");
const equation = new MathTex({ latex: "f(x)=\\\\frac{x^2}{4}" });
await scene.play(new Write(equation));`,
  },
  ...MANIM_DEMO_EXAMPLES,
]);

const playCoreExamples = Object.freeze([
  ...PLAY_CORE_EXAMPLES.map(example => ({ id: example.id, label: `${example.category} · ${example.name}`, name: example.name, source: example.source })),
]);

const orcaExamples = Object.freeze([
  {
    id: "single-note",
    label: "Basics · Single MIDI note",
    name: "Single MIDI note",
    source: orcaGrid(
      "................................",
      "...........*:04Cf1..............",
    ),
  },
  {
    id: "clocked-note",
    label: "Loops · Clocked MIDI note",
    name: "Clocked MIDI note",
    source: orcaGrid(
      "................................",
      "..........1D4...................",
      "...........*....................",
      "...........:04Cf1...............",
    ),
  },
  {
    id: "counter",
    label: "Basics · Counter",
    name: "Counter",
    source: orcaGrid(
      "................................",
      "..........1I8...................",
      "................................",
    ),
  },
  {
    id: "random-pattern",
    label: "Patterns · Random value",
    name: "Random value",
    source: orcaGrid(
      "................................",
      "..........0Rf...................",
      "................................",
    ),
  },
  {
    id: "random-melody-2bar",
    label: "Melody · Random 2-bar quarter notes",
    name: "Random 2-bar quarter-note melody",
    settings: { orcaLoopFrames: 32 },
    source: orcaGrid(
      orcaRow([[10, "1"], [11, "D"], [12, "4"]]),
      orcaRow([[11, "*"], [13, "a"], [14, "R"], [15, "f"]]),
      orcaRow([[11, ":"], [12, "0"], [13, "4"], [15, "f"], [16, "1"]]),
    ),
  },
]);

// A small, local Strudel library: the first entries teach one idea at a time,
// while the final theme demonstrates several voices, effects, and a frame
// visualizer in one editable node. Keep the source self-contained so examples
// remain useful offline and can be freely modified after selection.
const strudelExamples = Object.freeze([
  {
    id: "starter",
    label: "Starter · Chord piano roll",
    name: "Chord piano roll",
    source: defaultLivecodeSource(LIVECODE_KINDS.strudel),
  },
  {
    id: "four-on-the-floor",
    label: "Basics · Four-on-the-floor",
    name: "Four-on-the-floor",
    source: `// A steady kick and backbeat.
$: s("bd ~ bd ~, ~ sd ~ sd")`,
  },
  {
    id: "hi-hat-grid",
    label: "Basics · Hi-hat grid",
    name: "Hi-hat grid",
    source: `// Layer a bright eighth-note hat pattern.
$: s("hh*8")
  .gain(0.35)`,
  },
  {
    id: "slow-arpeggio",
    label: "Basics · Slow arpeggio",
    name: "Slow arpeggio",
    source: `// Mini notation turns the note list into a repeating pattern.
$: note("c4 e4 g4 b4")
  .s("sine")
  .slow(2)`,
  },
  {
    id: "bass-and-drums",
    label: "Grooves · Bass and drums",
    name: "Bass and drums",
    source: `// Two voices: a low pulse and a compact drum groove.
$: note("<c2 c2 g1 g1>")
  .s("sawtooth")
  .lpf(420)
  .gain(0.45)
$: s("bd ~ sd ~, ~ hh*2 ~ hh*2")
  .gain(0.55)`,
  },
  {
    id: "neon-night",
    label: "Theme · Neon night",
    name: "Neon night",
    source: `// A small theme with chords, bass, drums, color, and a piano roll.
$: note("<[c3,e3,g3] [a2,c3,e3] [f2,a2,c3] [g2,b2,d3]>")
  .s("triangle")
  .slow(2)
  .room(0.35)
  .gain(0.42)
  .color("<#ff7aa2 #7ad7ff #ffe08a #b5ff9a>")
  ._pianoroll({ height: 88, fold: 1 })
$: note("<c2 c2 a1 g1>")
  .s("sawtooth")
  .slow(2)
  .lpf(360)
  .gain(0.28)
$: s("bd ~ bd ~, ~ sd ~ sd, hh*8")
  .gain(0.5)`,
  },
]);

export const getLivecodeExamples = kind => {
  if (kind === LIVECODE_KINDS.p5) return p5Examples;
  if (kind === LIVECODE_KINDS.manim) return manimExamples;
  if (kind === LIVECODE_KINDS.playcore) return playCoreExamples;
  if (kind === LIVECODE_KINDS.strudel) return strudelExamples;
  if (kind === LIVECODE_KINDS.orca) return orcaExamples;
  if (kind === LIVECODE_KINDS.shader) return SHADER_EXAMPLES.map(example => ({ id: example.id, label: example.label, name: example.name, source: example.source, mode: example.mode, dialect: example.dialect }));
  return [];
};
