import { P5_EXAMPLES } from "./p5Frame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";
import { SHADER_EXAMPLES } from "./shaderLivecode.js";
import { MANIM_DEMO_EXAMPLES } from "./manimDemoExamples.js";
import { LIVECODE_KINDS, defaultLivecodeSource } from "./livecodeNode.js";
import { ORCA_GRID_HEIGHT, ORCA_GRID_WIDTH } from "./orcaEngine.js";
import { THREE_MODEL_EXAMPLES } from "./threeModel.js";

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
  [LIVECODE_KINDS.three]: defaultLivecodeSource(LIVECODE_KINDS.three),
  [LIVECODE_KINDS.playcore]: defaultLivecodeSource(LIVECODE_KINDS.playcore),
  [LIVECODE_KINDS.markdown]: `# Markdown starter\n\nWrite **rich text** here. Inline math: $E = mc^2$.\n\n- one\n- two`,
  [LIVECODE_KINDS.latex]: `\\frac{\\partial}{\\partial t} \\Psi = i \\nabla^2 \\Psi`,
  [LIVECODE_KINDS.html]: `<!doctype html>\n<main>\n  <h1>HTML starter</h1>\n  <p>Edit this isolated document.</p>\n</main>`,
  [LIVECODE_KINDS.orca]: defaultLivecodeSource(LIVECODE_KINDS.orca),
  [LIVECODE_KINDS.shader]: defaultLivecodeSource(LIVECODE_KINDS.shader),
  [LIVECODE_KINDS.tixy]: defaultLivecodeSource(LIVECODE_KINDS.tixy),
  [LIVECODE_KINDS.svg]: defaultLivecodeSource(LIVECODE_KINDS.svg),
});

// A deliberately spacious welcome-tour bed with a complete 64-cycle form.
// At 80 BPM, one four-beat cycle lasts three seconds, so the arrangement takes
// 3:12 before it repeats: intro, first groove, lift, bridge, and return.
// Each layer owns the same form but changes its phrase, density, and timbre at
// section boundaries, so the result develops like a short song rather than a
// collection of independently looping patterns.
export const WELCOME_STRUDEL_SOURCE = `// Welcome tour trip-hop backdrop — 80 BPM, 64 cycles / 3:12 before repeat.
setcpm(20)

// 0–8 intro · 8–24 first groove · 24–40 lift · 40–48 bridge · 48–64 return
// The kick stays sparse at first, then changes its phrase for the lift and
// plays a shorter answer through the bridge before the final return.
$: arrange(
  [8, s("~")],
  [16, s("bd ~ ~ ~ ~ bd ~ ~ bd ~ ~ ~ ~ ~ bd ~").slow(2)],
  [16, s("bd ~ ~ bd ~ bd ~ ~ bd ~ ~ ~ ~ bd ~ ~").slow(2).every(4, x => x.rev())],
  [8, s("bd ~ ~ ~ ~ ~ bd ~").slow(2)],
  [16, s("bd ~ ~ bd ~ bd ~ ~ bd ~ ~ bd ~ bd ~ ~").slow(2).every(8, x => x.rev())],
)
  .gain(0.28)
  .lpf("<760 900 1100 820>")

// Snare/rim gives the verses their laid-back backbeat, then recedes in the
// bridge so the return feels earned instead of merely louder.
$: arrange(
  [8, s("~")],
  [16, s("~ ~ sd ~ ~ ~ ~ sd").slow(2)],
  [16, s("~ ~ sd ~ ~ sd ~ sd").slow(2).every(4, x => x.rev())],
  [8, s("~ ~ ~ ~ ~ sd ~ ~").slow(2).degradeBy(0.2)],
  [16, s("~ ~ sd ~ ~ sd ~ sd").slow(2).every(8, x => x.rev())],
)
  .gain(0.18)
  .lpf(1750)
  .room(0.12)

// Hats enter late, open into the lift, disappear for the bridge, then return
// with a restrained swing and a few naturally missing strokes.
$: arrange(
  [8, s("~")],
  [16, s("hh ~ hh [~ hh] hh ~ ~ hh").slow(2).swing(4).degradeBy(0.14)],
  [16, s("hh*2 ~ hh*2 [hh ~] hh*2 ~ [~ hh] hh*2").slow(2).swing(4).degradeBy(0.08)],
  [8, s("~")],
  [16, s("hh*2 ~ [hh ~ hh] hh*2 ~ hh [~ hh] hh*2").slow(2).swing(4).degradeBy(0.1)],
)
  .gain(0.11)
  .lpf(3600)
  .pan("-0.22 0.16 -0.08 0.28")

// The bass gets a distinct response in each section: held and patient in the
// first groove, more mobile in the lift, almost absent in the bridge, then
// returning with the harmony turned around.
$: arrange(
  [8, s("~")],
  [16, note("<d2 ~ d2 bb1 c2 ~ bb1 c2>").slow(4)],
  [16, note("<d2 f2 bb1 c2 d2 a1 bb1 c2>").slow(4).every(4, x => x.rev())],
  [8, note("<d2 ~ ~ c2>").slow(4)],
  [16, note("<d2 d2 bb1 c2 f2 a1 bb1 c2>").slow(4).every(8, x => x.rev())],
)
  .s("triangle")
  .lpf("<360 480 580 420 640 460 520 700>")
  .gain(0.2)

// The chord bed remains the steady centre, but its voicings widen in the lift,
// thin to four suspended changes in the bridge, then resolve for the return.
$: arrange(
  [8, note("<[d3,f3,a3] [c3,f3,a3] [bb2,d3,f3] [c3,e3,g3]>").slow(8)],
  [16, note("<[d3,f3,a3] [c3,f3,a3] [bb2,d3,f3] [c3,e3,g3] [d3,f3,a3] [f3,a3,c4] [bb2,d3,f3] [c3,e3,g3]>").slow(8)],
  [16, note("<[d3,f3,a3,c4] [c3,f3,a3,d4] [bb2,d3,f3,a3] [c3,e3,g3,b3] [d3,f3,a3,c4] [f3,a3,c4,e4] [bb2,d3,f3,a3] [c3,e3,g3,b3]>").slow(8)],
  [8, note("<[d3,a3,c4] [bb2,f3,a3] [c3,g3,bb3] [d3,a3,c4]>").slow(8)],
  [16, note("<[d3,f3,a3] [c3,f3,a3] [bb2,d3,f3] [c3,e3,g3] [f3,a3,c4] [d3,f3,a3] [bb2,d3,f3] [c3,e3,g3]>").slow(8)],
)
  .s("sine")
  .lpf("<1100 1450 1850 1300>")
  .room("<0.32 0.42 0.5 0.38>")
  .gain(0.09)

// A barely audible high response only appears between phrases. It supplies
// air and a sense of motion without competing with the guide or spoken demo.
$: arrange(
  [8, note("~ d5 ~ a4").slow(4)],
  [16, note("~ ~ a4 ~ ~ c5 ~ d5").slow(4).degradeBy(0.38)],
  [16, note("~ a4 ~ c5 ~ d5 ~ f5").slow(4).degradeBy(0.3)],
  [8, note("~ ~ d5 ~").slow(4)],
  [16, note("~ a4 ~ c5 ~ d5 ~ a4").slow(4).degradeBy(0.34)],
)
  .s("sine")
  .lpf(2400)
  .room(0.58)
  .pan("-0.35 0.35")
  .gain(0.035)`;

// A brighter companion demo for presentations and open-ended drawing. Its
// 64-cycle arrangement lasts 3:33 at 72 BPM before repeating, moving through
// mist, pulse, bloom, a weightless bridge, and a resolved afterglow.
export const AIRBIENT_STRUDEL_SOURCE = `// airbient — atmospheric downtempo / ambient IDM, 72 BPM, 3:33 before repeat.
setcpm(18)

// 0–8 mist · 8–24 pulse · 24–40 bloom · 40–48 weightless · 48–64 afterglow
// The main pad carries the song. Each section has its own voicing and contour,
// with long attacks and releases so the harmony seems to breathe.
$: arrange(
  [8, note("<[c3,e3,g3,d4] [e3,g3,b3,d4] [a2,c3,e3,b3] [f2,a2,c3,e3]>").slow(8)],
  [16, note("<[c3,e3,g3,d4] [e3,g3,b3,d4] [a2,c3,e3,b3] [f2,a2,c3,e3] [d3,f3,a3,e4] [g2,a2,d3,g3] [e3,g3,b3,d4] [a2,c3,e3,b3]>").slow(16)],
  [16, note("<[c3,e3,g3,d4] [g2,b2,d3,a3] [a2,c3,e3,b3] [e3,g3,b3,d4] [f2,a2,c3,e3] [d3,f3,a3,e4] [g2,a2,d3,g3] [c3,e3,g3,d4]>").slow(16)],
  [8, note("<[f2,a2,c3,e3] [c3,e3,g3,d4] [d3,f3,a3,e4] [g2,a2,d3,g3]>").slow(8)],
  [16, note("<[c3,e3,g3,d4] [e3,g3,b3,d4] [a2,c3,e3,b3] [f2,a2,c3,e3] [d3,f3,a3,e4] [g2,b2,d3,a3] [f2,a2,c3,e3] [c3,e3,g3,d4]>").slow(16)],
)
  .s("sine")
  .attack(1.4)
  .release(3.8)
  .lpf("<1050 1450 2100 1650>")
  .phaser("<0.08 0.12 0.18 0.1>")
  .phaserdepth(0.22)
  .room(0.72)
  .gain(0.072)

// A second, higher breath layer appears only where the form needs light. It
// widens during the bloom, disappears in the bridge, and returns very softly.
$: arrange(
  [8, note("<e4 ~ b4 ~>").slow(8)],
  [16, note("<~ g4 ~ b4 ~ e5 ~ d5>").slow(16).degradeBy(0.2)],
  [16, note("<e4 g4 b4 d5 e5 d5 b4 g4>").slow(16).degradeBy(0.12)],
  [8, s("~")],
  [16, note("<~ e4 ~ g4 ~ d5 ~ b4>").slow(16).degradeBy(0.24)],
)
  .s("sine")
  .attack(1.8)
  .release(4.2)
  .lpf(2600)
  .vib(0.18)
  .vibmod(0.06)
  .room(0.82)
  .pan("-0.38 0.34")
  .gain(0.026)

// The low pulse arrives after the intro. It becomes more melodic in the bloom,
// leaves only two held notes under the bridge, then settles home on C.
$: arrange(
  [8, s("~")],
  [16, note("<c2 ~ e2 ~ a1 ~ f1 ~>").slow(8)],
  [16, note("<c2 g1 a1 e2 f1 d2 g1 c2>").slow(8).every(8, x => x.rev())],
  [8, note("<f1 ~ c2 ~>").slow(8)],
  [16, note("<c2 e2 a1 f1 d2 g1 f1 c2>").slow(8)],
)
  .s("triangle")
  .attack(0.08)
  .release(1.35)
  .lpf("<380 520 680 460>")
  .gain(0.135)

// A small tape-like melody answers the harmony rather than running constantly.
// Delay and missing notes create space between phrases without masking speech.
$: arrange(
  [8, note("~ ~ e5 ~ ~ b4 ~ ~").slow(8)],
  [16, note("~ e5 ~ g5 ~ d5 [~ e5] ~").slow(8).degradeBy(0.2)],
  [16, note("e5 ~ g5 b5 ~ a5 [g5 e5] ~").slow(8).degradeBy(0.12)],
  [8, note("~ c5 ~ ~ ~ g4 ~ ~").slow(8)],
  [16, note("~ e5 g5 ~ d5 ~ b4 [~ c5]").slow(8).degradeBy(0.16)],
)
  .s("sine")
  .attack(0.03)
  .release(0.9)
  .delay(0.32)
  .delaytime(0.375)
  .delayfeedback(0.28)
  .room(0.62)
  .pan("0.28 -0.24 0.34 -0.16")
  .gain(0.042)

// Soft drums enter gradually: a heartbeat in the pulse section, a slightly
// more articulated pattern in the bloom, silence in the bridge, then a light
// final groove that thins as the harmony resolves.
$: arrange(
  [8, s("~")],
  [16, s("bd ~ ~ ~ ~ ~ bd ~").slow(2)],
  [16, s("bd ~ ~ [bd ~] ~ bd ~ ~").slow(2).every(8, x => x.rev())],
  [8, s("~")],
  [16, s("bd ~ ~ ~ ~ bd ~ [~ bd]").slow(2).degradeBy(0.08)],
)
  .gain(0.15)
  .lpf(820)

$: arrange(
  [8, s("~")],
  [16, s("hh ~ ~ hh ~ [~ hh] ~ hh").slow(2).swing(4).degradeBy(0.22)],
  [16, s("hh*2 ~ hh [~ hh] hh*2 ~ [hh ~] hh").slow(2).swing(4).degradeBy(0.14)],
  [8, s("~")],
  [16, s("hh ~ hh [~ hh] ~ hh ~ [hh ~]").slow(2).swing(4).degradeBy(0.2)],
)
  .gain(0.052)
  .lpf(4200)
  .pan("-0.18 0.22")

// Tiny digital glints are most active at the centre of the composition and
// fade back into the pad before the repeat.
$: arrange(
  [8, s("~")],
  [16, note("~ c6 ~ ~ g5 ~ ~ e6").slow(8).degradeBy(0.34)],
  [16, note("c6 ~ [g5 a5] ~ e6 ~ d6 ~").slow(8).degradeBy(0.24)],
  [8, note("~ ~ a5 ~").slow(8)],
  [16, note("~ c6 ~ g5 ~ e6 ~ ~").slow(8).degradeBy(0.38)],
)
  .s("sine")
  .attack(0.01)
  .release(0.22)
  .crush("<16 14 12 16>")
  .delay(0.24)
  .delaytime(0.25)
  .delayfeedback(0.22)
  .room(0.7)
  .pan("-0.4 0.4 -0.16 0.2")
  .gain(0.018)`;

// A separate, sunnier composition rather than another variation on the tour
// backdrop. The 72-cycle form lasts 3:16 at 88 BPM and is led by syncopated
// major-key chords, a rising arpeggio, and a buoyant broken beat.
export const SUNROOM_STRUDEL_SOURCE = `// sunroom — bright downtempo electronica, 88 BPM, 72 cycles / 3:16 before repeat.
setcpm(22)

// 0–12 windows open · 12–28 first walk · 28–44 wide sky
// 44–56 floating middle · 56–72 home
// Short, syncopated chord gestures replace the long dark wash of the other
// demos. The voicings climb through the middle and settle on C at the end.
$: arrange(
  [12, note("<[c4,e4,g4,b4] ~ [e4,g4,b4,d5] ~ [f4,a4,c5,e5] ~ [g4,a4,d5,e5] ~>").slow(12)],
  [16, note("<[c4,e4,g4,b4] ~ [g3,b3,d4,a4] [a3,c4,e4,g4] ~ [f3,a3,c4,e4] ~ [g3,b3,d4,e4] ~>").slow(16)],
  [16, note("<[c4,e4,g4,b4] [e4,g4,b4,d5] ~ [f4,a4,c5,e5] [g4,b4,d5,e5] ~ [a3,c4,e4,g4] [g3,b3,d4,a4] ~ [f3,a3,c4,e4] ~>").slow(16)],
  [12, note("<[a3,c4,e4,g4] ~ [e4,g4,b4,d5] ~ [f4,a4,c5,e5] ~ [c4,e4,g4,b4] ~>").slow(12)],
  [16, note("<[c4,e4,g4,b4] ~ [g3,b3,d4,a4] [a3,c4,e4,g4] ~ [f3,a3,c4,e4] [g3,b3,d4,e4] ~ [c4,e4,g4,b4] ~>").slow(16)],
)
  .s("triangle")
  .attack(0.12)
  .release(1.8)
  .lpf("<1700 2300 3100 2100>")
  .room(0.44)
  .delay(0.12)
  .delaytime(0.25)
  .delayfeedback(0.16)
  .gain(0.075)

// A circular arpeggio is present from the start, changes register in the wide
// section, and becomes a slower call-and-response during the floating middle.
$: arrange(
  [12, note("<c5 e5 g5 b5 e5 g5 d5 b4>").slow(6)],
  [16, note("<c5 e5 g5 b5 d5 g5 e5 b4>").slow(4).degradeBy(0.08)],
  [16, note("<e5 g5 b5 d6 c6 g5 e5 d5>").slow(4).every(8, x => x.rev())],
  [12, note("<a4 ~ e5 ~ g5 ~ c6 ~>").slow(6)],
  [16, note("<c5 e5 g5 b5 d6 b5 g5 e5>").slow(4).degradeBy(0.1)],
)
  .s("sine")
  .attack(0.02)
  .release(0.55)
  .delay(0.22)
  .delaytime(0.375)
  .delayfeedback(0.2)
  .room(0.5)
  .pan("-0.3 0.24 -0.12 0.34")
  .gain(0.047)

// The bass is rounded and melodic, stepping upward into each new section
// instead of sitting on a single root pattern.
$: arrange(
  [12, note("<c2 ~ g1 ~ c2 ~ e2 ~>").slow(6)],
  [16, note("<c2 g1 a1 e2 f1 c2 g1 e2>").slow(8)],
  [16, note("<c2 e2 f2 g2 a1 e2 g1 c2>").slow(8).every(8, x => x.rev())],
  [12, note("<a1 ~ e2 ~ f1 ~ c2 ~>").slow(6)],
  [16, note("<c2 g1 a1 e2 f1 g1 c2 ~>").slow(8)],
)
  .s("triangle")
  .attack(0.04)
  .release(0.72)
  .lpf("<520 720 920 640>")
  .gain(0.13)

// The kick has a light broken-beat bounce. It waits through most of the intro,
// becomes more animated under the wide section, then simplifies for the close.
$: arrange(
  [12, s("~ ~ ~ ~ bd ~ ~ ~").slow(2)],
  [16, s("bd ~ ~ bd ~ ~ bd ~").slow(2)],
  [16, s("bd ~ [~ bd] ~ bd ~ bd ~").slow(2).every(8, x => x.rev())],
  [12, s("bd ~ ~ ~ ~ ~ bd ~").slow(2)],
  [16, s("bd ~ ~ bd ~ bd ~ ~").slow(2).degradeBy(0.06)],
)
  .gain(0.17)
  .lpf(980)

// Backbeat and hats trade activity rather than arriving as a rigid drum loop.
$: arrange(
  [12, s("~")],
  [16, s("~ ~ sd ~ ~ ~ ~ sd").slow(2)],
  [16, s("~ sd ~ ~ ~ ~ sd [~ sd]").slow(2).every(8, x => x.rev())],
  [12, s("~")],
  [16, s("~ ~ sd ~ ~ ~ ~ sd").slow(2).degradeBy(0.1)],
)
  .gain(0.095)
  .lpf(2400)
  .room(0.16)

$: arrange(
  [12, s("hh ~ ~ hh ~ ~ [~ hh] ~").slow(3).swing(4).degradeBy(0.22)],
  [16, s("hh ~ hh [~ hh] hh ~ ~ hh").slow(2).swing(4).degradeBy(0.15)],
  [16, s("hh*2 ~ [hh ~] hh*2 ~ hh [~ hh]").slow(2).swing(4).degradeBy(0.1)],
  [12, s("hh ~ ~ ~ [~ hh] ~ hh ~").slow(3).swing(4).degradeBy(0.24)],
  [16, s("hh ~ hh [~ hh] ~ hh ~ [hh ~]").slow(2).swing(4).degradeBy(0.18)],
)
  .gain(0.054)
  .lpf(4600)
  .pan("-0.2 0.24")

// A simple, optimistic melody only arrives after the groove is established.
// It peaks in the wide section, rests in the middle, and returns as a shorter
// closing phrase so the final minute feels like home rather than another loop.
$: arrange(
  [12, s("~")],
  [16, note("~ ~ e5 g5 ~ a5 g5 ~").slow(8).degradeBy(0.16)],
  [16, note("e5 g5 a5 c6 b5 g5 e5 d5").slow(8).degradeBy(0.08)],
  [12, note("~ ~ a5 ~ ~ g5 ~ ~").slow(12)],
  [16, note("~ e5 g5 a5 ~ g5 e5 c5").slow(8).degradeBy(0.14)],
)
  .s("sine")
  .attack(0.04)
  .release(0.8)
  .vib(0.12)
  .vibmod(0.035)
  .delay(0.26)
  .delaytime(0.5)
  .delayfeedback(0.2)
  .room(0.6)
  .pan("0.28 -0.18 0.36 -0.26")
  .gain(0.036)`;

// A full-length sunny hip-hop composition supplied as a standalone demo.
// Its 88-cycle arrangement lasts approximately 4:11 at 84 BPM.
export const SUNDAY_WRLD_STRUDEL_SOURCE = `// ============================================================================
// "SUNDAY WRLD"
// Runtime: 88 cycles @ 84 BPM = ~4 minutes, 11 seconds
// ============================================================================

setcpm(84 / 4); // 84 BPM (1 cycle = 1 bar of 4/4)

// ----------------------------------------------------------------------------
// 1. TEXTURE & FOUNDATION
// ----------------------------------------------------------------------------

// Constant dusty vinyl warmth & needle hum
const vinyl = sound("crackle")
  .density(12)
  .lpf(2800)
  .gain(0.06);

// ----------------------------------------------------------------------------
// 2. DRUM STEMS (Dusty Hip-Hop Breakbeat)
// ----------------------------------------------------------------------------

// Full hip-hop break with syncopated kick and ghost notes
const drums_full = stack(
  // Thumping kick
  s("<[bd:3 ~ [~ bd:3] ~] [bd:3 ~ ~ bd:3] [bd:3 ~ [~ bd:3] ~] [~ bd:3 ~ [~ bd:3]]>")
    .gain(0.88).bank("RolandTR909"),
  // Crisp snare and woody rim on 2 and 4 with subtle ghost rolls
  s("<[~ [sd:2,rim] ~ [sd:2,rim]] [~ [sd:2,rim] ~ [sd:2,rim]] [~ [sd:2,rim] ~ [sd:2,rim]] [~ [sd:2,rim] ~ [sd:2,rim [~ sd:1*0.4]]]>")
    .gain(0.82).bank("RolandTR808"),
  // Swung 16th hats with dynamic accenting
  s("hh*8")
    .gain("<[0.72 0.35 0.82 0.4 0.72 0.35 0.85 0.45]>")
    .lpf(7200),
  // Gentle open hat breathing on the offbeats
  s("<[~ ~ [~ oh:1*0.35] ~] [~ ~ ~ [~ oh:1*0.35]]>")
);

// Lifted chorus drums with shaker / tambourine sizzle
const drums_chorus = stack(
  drums_full,
  s("hh:1*16").gain(0.22).pan(0.35)
);

// Stripped-down intro/outro beat
const drums_sparse = stack(
  s("bd:3 ~ ~ ~").gain(0.7),
  s("~ ~ rim ~").gain(0.6),
  s("hh*4").gain(0.4)
);

// Muffled low-pass pulse for the breakdown
const drums_muffled = stack(
  s("bd:3 ~ ~ [~ bd:3]").gain(0.65).lpf(340),
  s("~ ~ rim:1 ~").gain(0.35).room(0.5).lpf(900)
);

// ----------------------------------------------------------------------------
// 3. THE BASSLINES
// ----------------------------------------------------------------------------

// Rubber, flatwound vintage bass tone
const bassTone = (pat) =>
  pat.sound("sawtooth")
    .lpf(380)
    .lpq(2.8)
    .decay(0.32)
    .sustain(0.28)
    .gain(0.9);

// Verse walking bass (C -> Em -> F -> G)
const bass_verse = bassTone(
  note("<[c2 [~ c3] [g2 ~] [a2 b2]] [e2 [~ b2] [g2 ~] [e2 g2]] [f2 [~ c3] [a2 ~] [g2 f2]] [g2 [~ d3] [b2 a2] [g2 d2]]>")
);

// Chorus bouncy bass with octave leaps (F -> G -> C -> Am)
const bass_chorus = bassTone(
  note("<[f2 [~ c3] [f2 a2] [c3 ~]] [g2 [~ d3] [g2 b2] [d3 ~]] [c2 [~ c3] [g2 e2] [g2 ~]] [a2 [~ e3] [c3 b2] [a2 g2]]>")
);

// Climax energetic bass with octave slap feel
const bass_climax = bassTone(
  note("<[[f2 f3] [~ c3] [f2 f3] [a2 c3]] [[g2 g3] [~ d3] [g2 g3] [b2 d3]] [[c2 c3] [~ g2] [c2 c3] [e3 g3]] [[a2 a3] [~ e3] [c3 b2] [a2 g2]]>")
);

// Outro gentle resolve
const bass_outro = bassTone(
  note("<[c2 ~ [g2 ~] [e2 ~]] [f2 ~ [c2 ~] [a1 ~]] [g1 ~ [d2 ~] [g2 ~]] [c2 ~ ~ ~]>")
);

// ----------------------------------------------------------------------------
// 4. CHORDS & STRUMS (Acoustic Rhythm & Warm Electric Piano)
// ----------------------------------------------------------------------------

const guitarTone = (pat) =>
  pat.sound("triangle")
    .lpf(1500)
    .decay(0.22)
    .sustain(0.12)
    .gain(0.62);

const guitar_verse = guitarTone(
  note("<[c3,e3,g3,c4] [b2,e3,g3,b3] [c3,f3,a3,c4] [b2,d3,g3,b3]>").struct("~ 1 [~ 1] 1")
);

const guitar_chorus = guitarTone(
  note("<[c3,f3,a3,c4] [b2,d3,g3,b3] [c3,e3,g3,c4] [c3,e3,a3,c4]>").struct("~ 1 [~ 1] 1")
);

// Soft Rhodes/organ pad that fills the chorus with nostalgic warmth
const pad_chorus = note("<[c3,f3,a3,c4] [b2,d3,g3,b3] [c3,e3,g3,c4] [c3,e3,a3,c4]>")
  .sound("sine")
  .attack(0.25)
  .decay(0.5)
  .sustain(0.6)
  .release(0.4)
  .gain(0.26)
  .lpf(1100);

// ----------------------------------------------------------------------------
// 5. HOOKS & TOY INSTRUMENTS
// ----------------------------------------------------------------------------

// Melodica / Whistle indie hook (single continuous mini-notation string)
const melodica_hook = note(
  "<[~ a4 [c5 e5] [f5 ~] [e5 d5]] [~ b4 [d5 f5] [g5 ~] [f5 e5]] [~ g4 [c5 e5] [g5 ~] [e5 d5]] [c5 [~ a4] [g4 e4] [c4 ~]] [~ a4 [c5 e5] [f5 ~] [e5 d5]] [~ b4 [d5 g5] [f5 ~] [d5 b4]] [c5 [~ e5] [g5 a5] [g5 e5]] [c5 ~ ~ ~]>"
)
  .sound("triangle")
  .lpf(1900)
  .lpq(2)
  .attack(0.04)
  .decay(0.35)
  .sustain(0.42)
  .gain(0.52)
  .room(0.3);

// Sparkling Glockenspiel / Music Box counter-melody
const glockenspiel = note(
  "<[~ e6 [~ g6] c6] [~ g6 [~ b6] d6] [~ e6 [~ a6] c7] [~ d6 [~ b6] g6]>"
)
  .sound("sine")
  .decay(0.2)
  .sustain(0)
  .gain(0.42)
  .delay(0.22)
  .delaytime(0.25)
  .delayfeedback(0.35)
  .pan(0.6);

// Playful retro Casio VL-Tone style computer bleeps
const casio_bleeps = note(
  "<[~ c5*2 ~ g5] [~ d5*2 ~ a5] [~ e5*2 ~ c6] [~ g5*2 ~ b5]>"
)
  .sound("square")
  .lpf(2500)
  .decay(0.06)
  .sustain(0)
  .gain(0.2)
  .pan(-0.6);

// ----------------------------------------------------------------------------
// 6. SECTIONS DEFINITION
// ----------------------------------------------------------------------------

// Section 1: Needle drop, vinyl crackle, gentle chords, bass walks in at cycle 4
const intro_sec = stack(
  vinyl,
  guitar_verse,
  casio_bleeps,
  bass_verse.mask("<0 0 0 0 1 1 1 1>")
);

// Section 2: Verse 1 - The full drum break drops, walking bass takes the lead
const verse1_sec = stack(
  vinyl,
  drums_full,
  bass_verse,
  guitar_verse,
  glockenspiel.mask("<0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1>")
);

// Section 3: Chorus 1 - Sunny Melodica theme + tambourines + organ warmth
const chorus1_sec = stack(
  vinyl,
  drums_chorus,
  bass_chorus,
  guitar_chorus,
  pad_chorus,
  melodica_hook
);

// Section 4: Verse 2 - Carefree stroll with Casio chirps and glockenspiel interplay
const verse2_sec = stack(
  vinyl,
  drums_full,
  bass_verse,
  guitar_verse,
  glockenspiel,
  casio_bleeps
);

// Section 5: Breakdown - Coffee shop moment; drums muffle, chords and solo toy piano
const breakdown_sec = stack(
  vinyl,
  drums_muffled,
  guitar_verse.gain(0.4),
  glockenspiel,
  bass_verse.lpf(260).gain(0.7)
);

// Section 6: Big Climax - Everything intertwined at peak Mondo sunshine energy!
const climax_sec = stack(
  vinyl,
  drums_chorus,
  bass_climax,
  guitar_chorus,
  pad_chorus,
  melodica_hook,
  glockenspiel,
  casio_bleeps
);

// Section 7: Outro - Drums strip back, bass bids farewell, fading to tape silence
const outro_sec = stack(
  vinyl,
  drums_sparse.mask("<1 1 1 1 1 1 0 0 0 0 0 0>"),
  bass_outro,
  glockenspiel.mask("<1 1 1 1 1 1 1 1 0 0 0 0>").gain(0.3)
);

// ----------------------------------------------------------------------------
// 7. MASTER ARRANGEMENT (88 Cycles = ~4:11 Total Duration)
// ----------------------------------------------------------------------------

arrange(
  [8,  intro_sec],     // 0:00 - 0:23  The Alarm & Needle Drop
  [16, verse1_sec],    // 0:23 - 1:08  Morning Stroll (Beat Drops)
  [12, chorus1_sec],   // 1:08 - 1:42  The Sunny Melodica Hook
  [16, verse2_sec],    // 1:42 - 2:28  Whimsical Play & Casio Chirps
  [8,  breakdown_sec], // 2:28 - 2:51  The Coffee Shop Interlude
  [16, climax_sec],    // 2:51 - 3:37  Full Mondo Groove (Peak Energy)
  [12, outro_sec]      // 3:37 - 4:11  Walking Into The Distance
);`;

// A 160-cycle, eight-section IDM composition supplied as a standalone demo.
// At 174 BPM the complete form lasts approximately 3:41 before repeating.
export const UNDERLOOPED_STRUDEL_SOURCE = `setcpm(174/4);

const ch_a = "<[a2,e3,g3,c4,b4] [f#2,e3,a3,c4,e4] [f2,c3,e3,a3,b3] [e2,b2,d3,f3,g#3]>";
const ch_b = "<[c3,g3,bb3,d4,f4] [d3,a3,c4,e4,f#4] [f2,c3,eb3,a3,c4] [e2,b2,d3,g#3,d4]>";

const rhodes = note(ch_a).sound("triangle").lpf(sine.range(1200,3200).slow(8)).attack(0.03).decay(0.65).sustain(0.3).gain(0.48).room(0.4).color("#e6e6e6");
const pad = note(ch_a).sound("sine").attack(0.4).decay(0.8).sustain(0.6).release(0.5).gain(0.28).lpf(1150).color("#888888");
const rhodes_b = note(ch_b).sound("triangle").shape(0.25).lpf(3000).attack(0.03).decay(0.6).sustain(0.35).gain(0.5).room(0.4).color("#ffffff");
const stabs = note(ch_a).struct("1 ~ 1 1 ~ 1 ~ 1").sound("triangle").shape(0.3).lpf(3200).decay(0.16).sustain(0.04).gain(0.45).color("#cccccc");

const sub = note("<a1 f#1 f1 e1>").sound("sine").gain(0.72).lpf(165).color("#333333");
const bass_walk = note("<[a1 [~ a2] [e2 g2] [c3 b2]] [f#1 [~ f#2] [c2 e2] [a2 c3]] [f1 [~ f2] [c2 e2] [a2 b2]] [e1 [~ e2] [b1 d2] [g#2 b2]]>").sound("sawtooth").shape(0.4).lpf(880).lpq(4.6).decay(0.22).sustain(0.14).gain(0.85).color("#666666");
const bass_slap = note("<[[a1 a2] [e2 g2] [c3 e3] [b2 g2]] [[f#1 f#2] [c2 e2] [a2 c3] [e3 c3]] [[f1 f2] [c2 e2] [a2 b2] [e3 b2]] [[e1 e2] [b1 d2] [g#2 b2*2] [d3 c3 b2 a2]]>").sound("sawtooth").shape(0.45).lpf(1050).lpq(5).decay(0.2).sustain(0.1).gain(0.88).color("#aaaaaa");
const bass_solo = note("<[a2 ~ [e3 ~] c3] [f#2 ~ [c3 ~] a2] [f2 ~ [c3 ~] a2] [e2 ~ ~ ~]>").sound("sawtooth").shape(0.3).lpf(750).lpq(3.5).decay(0.3).sustain(0.2).gain(0.8).color("#555555");

const dr_core = stack(
  s("<[bd ~ [~ bd] ~] [~ bd ~ [bd bd]] [bd ~ [~ bd] ~] [~ bd [bd*2 ~] ~]>").shape(0.35).gain(0.94).color("#8c8c8c"),
  s("<[~ sd ~ sd] [~ sd ~ [sd*2]] [~ sd ~ sd] [~ [sd*2] ~ [sd*4]]>").shape(0.3).gain(0.86).color("#cccccc"),
  s("hh*16").degradeBy(0.14).gain("<[0.6 0.2 0.5 0.22 0.7 0.3 0.5 0.2 0.62 0.2 0.5 0.3 0.78 0.35 0.6 0.3]>").pan("<[-0.5 0.5 -0.3 0.3]>").lpf(9000).color("#4d4d4d"),
  s("[~ rim ~ ~]*2").speed("<1.5 1.9 1.3 2.1>").gain(0.44).color("#777777")
);
const dr_drill = s("sd:2*16").degradeBy(0.5).sometimesBy(0.4, x => x.ply(2)).speed(rand.range(1.1, 3.4)).pan(rand.range(-0.8, 0.8)).crush("<0 0 5 3 0 6>").gain(0.7).color("#ffffff");
const dr_full = stack(dr_core, dr_drill, s("hh:1*8").gain(0.22).pan(0.35).color("#666666"), s("<cr ~ ~ ~>").gain(0.55).room(0.45).color("#ffffff"));
const dr_flim = stack(s("bd ~ ~ [~ bd]").gain(0.75).color("#8c8c8c"), s("~ [rim:1,sd:1*0.4] ~ rim:1").gain(0.65).color("#cccccc"), s("hh*8").degradeBy(0.1).gain("<[0.42 0.18 0.38 0.18 0.52 0.22 0.38 0.18]>").color("#4d4d4d"), s("sd:2*8").degradeBy(0.7).speed(rand.range(1.2, 2.6)).pan(rand.range(-0.6, 0.6)).gain(0.45).color("#ffffff"));
const dr_glitch = stack(s("<[~ [cp*4] ~ ~] [~ ~ [sd*8] ~] [~ [rim*16] ~ ~] [~ ~ ~ [cp*8]]>").speed("<2.2 3.1 1.7 4.2>").crush("<8 4 3 6>").pan("<0.7 -0.7 0.5 -0.5>").gain(0.7).color("#e0e0e0"), s("<[~ ~ oh:1 ~] [~ ~ ~ [oh:1*2]]>").gain(0.35).color("#999999"));

const lead_trill = note("<[[~ e4] [g4 a4] [c5 ~] [b4 a4]] [[~ d4] [f#4 a4] [c5 ~] [a4 f#4]] [[~ c4] [e4 a4] [b4 ~] [a4 g4]] [[f#4 ~] [e4 d#4] [b3 c4] [a3 ~]] [[~ e4] [g4 a4] [c5 d5] [e5 ~]] [[d5 ~] [b4 a4] [f#4 a4] [b4 ~]] [[c5 b4] [a4 g4] [e4 g4] [a4 ~]] [[a4 ~] [~ g4] [e4 ~] [~ ~]]>").sound("sawtooth").shape(0.38).lpf(sine.range(1600, 5600).slow(4)).lpq(4.6).attack(0.02).decay(0.32).sustain(0.36).gain(0.52).room(0.35).color("#ffffff");
const lead_glass = note("<[[~ b5] [c6 e6] [g6 ~] [f#6 e6]] [[~ a5] [c6 e6] [f#6 ~] [e6 c6]] [[~ g5] [b5 d6] [e6 ~] [d6 b5]] [[c6 ~] [b5 a5] [f#5 d#5] [e5 ~]] [[~ b5] [c6 e6] [g6 a6] [b6 ~]] [[a6 ~] [f#6 e6] [d6 e6] [f#6 ~]] [[g6 f#6] [e6 d6] [b5 d6] [e6 ~]] [[e6 ~] [~ d6] [b5 ~] [~ ~]]>").sound("sine").decay(0.45).sustain(0.42).gain(0.48).delay(0.28).delaytime(0.1875).delayfeedback(0.42).room(0.45).color("#d4d4d4");
const lead_arp = note("<[a4 c5 e5 g5 b5 g5 e5 c5] [f#4 a4 c5 e5 f#5 e5 c5 a4] [f4 a4 c5 e5 f5 e5 c5 a4] [e4 g#4 b4 d5 e5 d5 b4 g#4]>").sound("triangle").decay(0.15).sustain(0).gain(0.42).pan(sine.range(-0.6, 0.6).slow(2)).color("#b0b0b0");
const bleeps = note("<[a5*4 c6*4] [f#5*4 d6*4] [f5*4 e6*4] [e5*8]>").sound("square").lpf(3600).decay(0.035).sustain(0).gain(0.18).pan("<-0.6 0.6 -0.4 0.4>").color("#ffffff");

const s1 = stack(pad, rhodes, lead_glass.gain(0.35), bass_solo);
const s2 = stack(pad, rhodes, dr_flim, sub, bass_walk, lead_arp);
const s3 = stack(pad, rhodes, dr_full, sub, bass_walk, lead_trill, bleeps);
const s4 = stack(pad, stabs, dr_full, dr_glitch, sub, bass_slap, lead_arp, bleeps);
const s5 = stack(pad, rhodes, lead_glass, bass_solo, arrange([20, s("~")], [4, s("sd*16").shape(0.35).gain("<0.35 0.55 0.75 0.95>").speed("<1.3 1.8 2.4 3.4>").color("#ffffff")]));
const s6 = stack(pad, rhodes_b, dr_full, dr_glitch, sub, bass_slap, lead_trill, lead_glass, lead_arp, bleeps);
const s7 = stack(pad, rhodes.gain(0.35), dr_flim, bass_walk, lead_arp.gain(0.3), bleeps.gain(0.12));
const s8 = stack(pad.gain(0.2), lead_glass.gain(0.35));

arrange(
  [16, s1],
  [16, s2],
  [32, s3],
  [16, s4],
  [24, s5],
  [32, s6],
  [16, s7],
  [8,  s8]
).pianoroll({ cycles: 4 });`;

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

// Standalone Three.js starters. These examples deliberately use only the
// small runtime contract exposed by ThreeFrame so they can be copied into a
// node, edited in place, and run without a Manim scene or any external DOM.
const threeExamples = Object.freeze([
  {
    id: "unit-cube",
    label: "Basics · Unit cube",
    name: "Unit cube",
    source: `const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial(),
);
scene.add(cube);

tick(({ delta }) => {
  cube.rotation.x += delta * 0.7;
  cube.rotation.y += delta * 1.1;
});`,
  },
  {
    id: "lit-torus-knot",
    label: "Materials · Lit torus knot",
    name: "Lit torus knot",
    source: `const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.85, 0.25, 128, 24),
  new THREE.MeshStandardMaterial({
    color: 0x8bd5ff,
    roughness: 0.3,
    metalness: 0.5,
  }),
);
scene.add(knot);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(2, 3, 4);
scene.add(key);
scene.add(new THREE.AmbientLight(0x334155, 1.2));

tick(({ time, delta }) => {
  knot.rotation.x = time * 0.35;
  knot.rotation.y += delta * 0.8;
});`,
  },
  {
    id: "orbiting-spheres",
    label: "Motion · Orbiting spheres",
    name: "Orbiting spheres",
    source: `const group = new THREE.Group();
const geometry = new THREE.SphereGeometry(0.16, 24, 16);
const colors = [0xff7aa2, 0x8bd5ff, 0xf5d76e, 0x9df59d];

colors.forEach((color, index) => {
  const sphere = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 }),
  );
  const angle = (index / colors.length) * Math.PI * 2;
  sphere.position.set(Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0);
  group.add(sphere);
});
scene.add(group);

const light = new THREE.PointLight(0xffffff, 18, 8);
light.position.set(0, 0, 2.5);
scene.add(light);

tick(({ time }) => {
  group.rotation.z = time * 0.55;
  group.rotation.x = Math.sin(time * 0.8) * 0.25;
});`,
  },
  {
    id: "parameter-dancing-lights",
    label: "Interactive · Parameter dancing lights",
    name: "Parameter dancing lights",
    source: `// A small light dance. Change these controls in Node settings.
// @param count = 12 (4..24 step:1)
// @param energy = 1.6 (0.4..3 step:0.1)
// @param radius = 1.15 (0.5..2 step:0.05)
const count = Math.max(4, Math.round(__.params.count));
const energy = Number(__.params.energy);
const radius = Number(__.params.radius);
const palette = [0x8bd5ff, 0xff7aa2, 0xf5d76e, 0x9df59d];
const geometry = new THREE.SphereGeometry(0.12, 16, 12);
const rig = new THREE.Group();
const dancers = [];

for (let index = 0; index < count; index += 1) {
  const color = palette[index % palette.length];
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.25,
    metalness: 0.35,
  });
  const orb = new THREE.Mesh(geometry, material);
  rig.add(orb);
  dancers.push({ orb, phase: (index / count) * Math.PI * 2, speed: 0.55 + (index % 5) * 0.08 });
}
scene.add(rig);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x080b14, 1.2));

const glowLights = [
  new THREE.PointLight(0x8bd5ff, energy * 8, 6),
  new THREE.PointLight(0xff7aa2, energy * 8, 6),
  new THREE.PointLight(0xf5d76e, energy * 6, 5),
];
glowLights.forEach(light => scene.add(light));

tick(({ time }) => {
  dancers.forEach(({ orb, phase, speed }, index) => {
    const angle = phase + time * speed;
    const orbit = radius * (0.55 + (index % 4) * 0.15);
    orb.position.set(
      Math.cos(angle) * orbit,
      Math.sin(angle * 1.3) * 0.85,
      Math.sin(angle) * orbit * 0.75,
    );
    orb.scale.setScalar(0.8 + 0.25 * Math.sin(time * 2 + phase));
    orb.material.emissiveIntensity = 0.45 + energy * 0.65;
  });
  glowLights.forEach((light, index) => {
    const angle = time * (0.35 + index * 0.12) + index * 2.1;
    light.position.set(Math.cos(angle) * radius, Math.sin(time + index) * 1.2, Math.sin(angle) * radius);
    light.intensity = energy * (index === 2 ? 6 : 8);
  });
  });`,
  },
  {
    id: "model-viewer-gltf",
    label: "Models · glTF viewer",
    name: "glTF model viewer",
    source: `// loadModel is the safe Three.js model loader. It accepts CORS-enabled
// OBJ, glTF/GLB, USD/USDZ, or ZIP URLs containing an OBJ and returns { scene, animations }.
const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "damaged-helmet")?.url || "")});
scene.add(asset.scene);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x101522, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(3, 4, 5);
scene.add(key);

tick(({ time }) => {
  asset.scene.rotation.y = time * 0.25;
});`,
  },
  {
    id: "model-viewer-animation-morph",
    label: "Models · Animation + blendshape",
    name: "Animated glTF blendshape",
    source: `// Khronos AnimatedMorphCube includes an animation and morph targets.
const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "animated-morph-cube")?.url || "")});
scene.add(asset.scene);
const mixer = new THREE.AnimationMixer(asset.scene);
if (asset.animations[0]) mixer.clipAction(asset.animations[0]).play();
let morph = 0;

tick(({ delta, time }) => {
  mixer.update(delta);
  morph = 0.5 + 0.5 * Math.sin(time * 1.7);
  asset.scene.traverse(object => {
    if (!object.morphTargetInfluences) return;
    object.morphTargetInfluences.fill(morph);
  });
});`,
  },
  {
    id: "model-viewer-obj-teapot",
    label: "Models · Walt Head OBJ",
    name: "Walt Head · OBJ",
    source: `// A CORS-enabled OBJ sample from the Three.js examples.
const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "three-walt-head")?.url || "")});
// ThreeFrame automatically frames loaded models with the default camera.
scene.add(asset.scene);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x111827, 2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(2, 3, 4);
scene.add(light);

tick(({ time }) => {
  asset.scene.rotation.y = time * 0.15;
});`,
  },
  {
    id: "mediapipe-unicursal-3d",
    label: "MediaPipe · Unicursal ribbon (3D)",
    name: "MediaPipe · Unicursal ribbon (3D)",
    source: `// A volumetric unicursal drawing driven by Holistic pose landmarks.
// It weaves a closed ribbon through the pose instead of tracing the p5 path.
// Blender-style camera: Option-drag orbits, Shift+Option-drag pans,
// Ctrl+Option-drag zooms; two-finger drag orbits, Shift-two-finger pans,
// and Ctrl-two-finger zooms. WASD / arrow keys are also available.
const FEATURE_IDS = Object.freeze([
  "pose.left_wrist", "pose.left_elbow", "pose.left_shoulder", "pose.nose",
  "pose.right_shoulder", "pose.right_elbow", "pose.right_wrist",
  "pose.right_hip", "pose.right_knee", "pose.left_knee", "pose.left_hip",
]);
const FALLBACK = Object.freeze([
  { x: 0.16, y: 0.56, z: 0 }, { x: 0.25, y: 0.35, z: 0.1 },
  { x: 0.37, y: 0.42, z: 0.2 }, { x: 0.5, y: 0.23, z: 0.1 },
  { x: 0.63, y: 0.42, z: 0.2 }, { x: 0.75, y: 0.35, z: 0.1 },
  { x: 0.84, y: 0.56, z: 0 }, { x: 0.68, y: 0.7, z: -0.15 },
  { x: 0.58, y: 0.86, z: 0.05 }, { x: 0.42, y: 0.86, z: 0.05 },
  { x: 0.32, y: 0.7, z: -0.15 },
]);
let source = null;
const maxPoints = 180;
const positions = new Float32Array(maxPoints * 3);
const pathGeometry = new THREE.BufferGeometry();
const positionAttribute = new THREE.BufferAttribute(positions, 3);
positionAttribute.setUsage(THREE.DynamicDrawUsage);
pathGeometry.setAttribute("position", positionAttribute);
pathGeometry.setDrawRange(0, 0);
const ribbonMaterial = new THREE.LineBasicMaterial({
  color: __.colors?.foreground?.color || __.currentColor || 0x8bd5ff,
  transparent: true,
  opacity: 0.9,
});
const ribbon = new THREE.Line(pathGeometry, ribbonMaterial);
const points = new THREE.Points(pathGeometry, new THREE.PointsMaterial({
  color: 0xf5d76e,
  size: 0.075,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.8,
}));
scene.add(ribbon);
scene.add(points);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x090b14, 1.8));
const rim = new THREE.PointLight(0xff7aa2, 12, 8);
rim.position.set(0, 1.5, 2.5);
scene.add(rim);

const readPoint = (stream, id) => {
  const feature = stream?.feature?.(id, { space: "normalized" });
  const point = feature?.position || feature?.normalized;
  return feature?.available && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: point.x, y: point.y, z: Number(point.z) || 0 }
    : null;
};
const readAnchors = () => {
  source ||= __.streams?.list?.().find(stream => stream.kind === "holistic");
  if (!source) return null;
  const anchors = FEATURE_IDS.map(id => readPoint(source, id));
  return anchors.every(Boolean) ? anchors : null;
};
const toWorld = point => new THREE.Vector3(
  (point.x - 0.5) * 3.8,
  (0.5 - point.y) * 2.8,
  -point.z * 1.8,
);
const makeRibbon = (anchors, time) => {
  const world = anchors.map(toWorld);
  const output = [];
  for (let index = 0; index < world.length; index += 1) {
    const from = world[index];
    const to = world[(index + 1) % world.length];
    const segmentCount = index === world.length - 1 ? 18 : 14;
    const tangent = new THREE.Vector3().subVectors(to, from).normalize();
    const weave = new THREE.Vector3(-tangent.y, tangent.x, tangent.z * 0.35).normalize();
    for (let step = 0; step < segmentCount; step += 1) {
      const amount = step / segmentCount;
      const point = new THREE.Vector3().lerpVectors(from, to, amount);
      const curl = Math.sin(amount * Math.PI * 2 + time * 1.2 + index * 0.65) * (0.08 + index * 0.004);
      point.addScaledVector(weave, curl);
      point.z += Math.cos(amount * Math.PI + time * 0.7) * 0.055;
      output.push(point);
    }
  }
  return output.slice(0, maxPoints);
};

tick(({ time }) => {
  const anchors = readAnchors() || FALLBACK;
  const path = makeRibbon(anchors, time);
  path.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });
  positionAttribute.needsUpdate = true;
  pathGeometry.setDrawRange(0, path.length);
  ribbonMaterial.color.set(__.colors?.foreground?.color || __.currentColor || "#8bd5ff");
  ribbon.rotation.y = Math.sin(time * 0.38) * 0.16;
  points.rotation.y = ribbon.rotation.y;
  rim.position.x = Math.sin(time * 0.7) * 1.4;
  rim.position.y = 1.2 + Math.cos(time * 0.9) * 0.45;
});`,
  },
  {
    id: "mediapipe-schlemmer-3d",
    label: "MediaPipe · Schlemmer costume (3D)",
    name: "MediaPipe · Schlemmer costume (3D)",
    source: `// A 3D Bauhaus costume assembled from primitives and driven by pose.
// This is intentionally a different construction from the p5 figurine:
// cylinders articulate the skeleton while boxes, cones, and torus hoops make
// an abstract costume volume. If no Holistic frame is ready, it holds a T-pose.
const T_POSE = Object.freeze({
  nose: { x: 0.5, y: 0.18, z: 0 },
  leftShoulder: { x: 0.34, y: 0.36, z: 0 }, rightShoulder: { x: 0.66, y: 0.36, z: 0 },
  leftElbow: { x: 0.18, y: 0.36, z: 0 }, rightElbow: { x: 0.82, y: 0.36, z: 0 },
  leftWrist: { x: 0.07, y: 0.36, z: 0 }, rightWrist: { x: 0.93, y: 0.36, z: 0 },
  leftHip: { x: 0.42, y: 0.58, z: 0 }, rightHip: { x: 0.58, y: 0.58, z: 0 },
  leftKnee: { x: 0.42, y: 0.78, z: 0 }, rightKnee: { x: 0.58, y: 0.78, z: 0 },
  leftAnkle: { x: 0.42, y: 0.97, z: 0 }, rightAnkle: { x: 0.58, y: 0.97, z: 0 },
});
const FEATURE_IDS = Object.freeze({
  nose: "pose.nose", leftShoulder: "pose.left_shoulder", rightShoulder: "pose.right_shoulder",
  leftElbow: "pose.left_elbow", rightElbow: "pose.right_elbow", leftWrist: "pose.left_wrist", rightWrist: "pose.right_wrist",
  leftHip: "pose.left_hip", rightHip: "pose.right_hip", leftKnee: "pose.left_knee", rightKnee: "pose.right_knee",
  leftAnkle: "pose.left_ankle", rightAnkle: "pose.right_ankle",
});
let source = null;
const primary = __.colors?.foreground?.color || __.currentColor || "#e8e8e8";
const blue = __.colors?.accent?.color || __.colors?.accent?.css || "#2f6de1";
const red = __.colors?.highlight?.color || __.colors?.highlight?.css || "#d94c3d";
const yellow = __.colors?.warning?.color || __.colors?.warning?.css || "#f5c84c";
const materials = {
  primary: new THREE.MeshStandardMaterial({ color: primary, roughness: 0.42, metalness: 0.15 }),
  blue: new THREE.MeshStandardMaterial({ color: blue, roughness: 0.32, metalness: 0.28 }),
  red: new THREE.MeshStandardMaterial({ color: red, roughness: 0.36, metalness: 0.2 }),
  yellow: new THREE.MeshStandardMaterial({ color: yellow, roughness: 0.38, metalness: 0.18 }),
};
const figure = new THREE.Group();
scene.add(figure);
// Standard materials need an explicit light rig. Keep it small and shared by
// the whole costume so the primitive volumes stay legible without adding a
// per-part light or an expensive post-processing pass.
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x090b14, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-2.5, 3.5, 4.5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff7aa2, 10, 8);
rimLight.position.set(2.2, 0.8, 2.8);
scene.add(rimLight);
const makeMesh = (geometry, material) => { const mesh = new THREE.Mesh(geometry, material); figure.add(mesh); return mesh; };
const torso = makeMesh(new THREE.BoxGeometry(1, 1, 1), materials.blue);
const chestBlock = makeMesh(new THREE.BoxGeometry(1, 1, 1), materials.red);
const shoulderBeam = makeMesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 16), materials.yellow);
const hipHoop = makeMesh(new THREE.TorusGeometry(0.72, 0.08, 12, 32), materials.red);
const chestHoop = makeMesh(new THREE.TorusGeometry(0.64, 0.055, 12, 32), materials.yellow);
const headOuter = makeMesh(new THREE.SphereGeometry(0.42, 20, 14), materials.primary);
const headInner = makeMesh(new THREE.SphereGeometry(0.29, 16, 12), materials.yellow);
const headRing = makeMesh(new THREE.TorusGeometry(0.53, 0.045, 10, 28), materials.blue);
const eyeLeft = makeMesh(new THREE.SphereGeometry(0.052, 12, 8), materials.blue);
const eyeRight = makeMesh(new THREE.SphereGeometry(0.052, 12, 8), materials.blue);
const halo = makeMesh(new THREE.TorusGeometry(1.05, 0.035, 10, 40), materials.blue);
const wedge = makeMesh(new THREE.ConeGeometry(0.36, 0.8, 4), materials.yellow);
const armParts = [
  ["leftShoulder", "leftElbow", materials.blue], ["leftElbow", "leftWrist", materials.yellow],
  ["rightShoulder", "rightElbow", materials.red], ["rightElbow", "rightWrist", materials.yellow],
  ["leftHip", "leftKnee", materials.red], ["leftKnee", "leftAnkle", materials.blue],
  ["rightHip", "rightKnee", materials.yellow], ["rightKnee", "rightAnkle", materials.blue],
].map(([from, to, material]) => ({ from, to, mesh: makeMesh(new THREE.CylinderGeometry(0.13, 0.17, 1, 12), material) }));
const joints = Object.fromEntries(Object.keys(FEATURE_IDS).filter(id => id !== "nose").map(id => [id, makeMesh(new THREE.SphereGeometry(0.14, 14, 10), materials.primary)]));
const readPoint = (stream, id) => {
  const feature = stream?.feature?.(id, { space: "normalized" });
  const point = feature?.position || feature?.normalized;
  return feature?.available && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: point.x, y: point.y, z: Number(point.z) || 0 }
    : null;
};
const toWorld = point => new THREE.Vector3((point.x - 0.5) * 3.2, (0.5 - point.y) * 3.0, -point.z * 1.8);
const readPose = () => {
  source ||= __.streams?.list?.().find(stream => stream.kind === "holistic");
  if (!source) return { pose: T_POSE, live: false };
  const pose = Object.fromEntries(Object.entries(FEATURE_IDS).map(([name, id]) => [name, readPoint(source, id)]));
  return Object.values(pose).every(Boolean) ? { pose, live: true } : { pose: T_POSE, live: false };
};
const midpoint = (a, b) => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
const placeLimb = (part, from, to) => {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, direction.length());
  part.mesh.position.copy(midpoint(from, to));
  part.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  part.mesh.scale.set(1, length, 1);
};
const placeBlock = (mesh, center, width, height, depth, direction) => {
  mesh.position.copy(center);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.scale.set(width, height, depth);
};

tick(({ time }) => {
  const { pose, live } = readPose();
  const world = Object.fromEntries(Object.entries(pose).map(([name, point]) => [name, toWorld(point)]));
  const shoulderMid = midpoint(world.leftShoulder, world.rightShoulder);
  const hipMid = midpoint(world.leftHip, world.rightHip);
  const shoulderSpan = world.leftShoulder.distanceTo(world.rightShoulder);
  const torsoHeight = shoulderMid.distanceTo(hipMid);
  const torsoDirection = new THREE.Vector3().subVectors(hipMid, shoulderMid);
  placeBlock(torso, midpoint(shoulderMid, hipMid), shoulderSpan * 0.82, torsoHeight * 1.08, shoulderSpan * 0.48, torsoDirection);
  placeBlock(chestBlock, midpoint(shoulderMid, hipMid).add(new THREE.Vector3(0, 0, 0.3)), shoulderSpan * 0.34, torsoHeight * 0.65, shoulderSpan * 0.62, torsoDirection);
  shoulderBeam.position.copy(shoulderMid);
  shoulderBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(world.rightShoulder, world.leftShoulder).normalize());
  shoulderBeam.scale.set(1, shoulderSpan, 1);
  hipHoop.position.copy(hipMid);
  hipHoop.scale.set(shoulderSpan * 1.05, shoulderSpan * 0.68, 1);
  chestHoop.position.copy(shoulderMid).add(new THREE.Vector3(0, -torsoHeight * 0.18, 0.1));
  chestHoop.rotation.x = Math.PI / 2;
  chestHoop.scale.set(shoulderSpan * 0.9, shoulderSpan * 0.58, 1);
  armParts.forEach(part => placeLimb(part, world[part.from], world[part.to]));
  Object.entries(joints).forEach(([name, mesh]) => mesh.position.copy(world[name]));
  headOuter.position.copy(world.nose);
  headInner.position.copy(world.nose).add(new THREE.Vector3(0, 0, 0.12));
  headRing.position.copy(world.nose);
  headRing.rotation.x = Math.PI / 2;
  eyeLeft.position.copy(world.nose).add(new THREE.Vector3(-0.13, 0.03, 0.35));
  eyeRight.position.copy(world.nose).add(new THREE.Vector3(0.13, 0.03, 0.35));
  halo.position.copy(shoulderMid).add(new THREE.Vector3(0, 0, -0.35));
  halo.rotation.x = Math.PI / 2;
  halo.rotation.z = time * 0.22;
  wedge.position.copy(hipMid).add(new THREE.Vector3(0, -torsoHeight * 0.22, 0.15));
  wedge.rotation.y = time * 0.35;
  wedge.scale.setScalar(Math.max(0.55, shoulderSpan * 0.8));
  figure.rotation.y = Math.sin(time * 0.3) * 0.08;
  figure.userData.poseMode = live ? "mediapipe" : "t-pose";
});`,
  },
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

const tixyExamples = Object.freeze([
  {
    id: "waves",
    label: "Basics · Waves",
    name: "Waves",
    source: defaultLivecodeSource(LIVECODE_KINDS.tixy),
  },
  {
    id: "ripple",
    label: "Motion · Ripple",
    name: "Ripple",
    source: "sin(t * 2 - sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2))",
  },
  {
    id: "checkerboard",
    label: "Logic · Checkerboard",
    name: "Checkerboard",
    source: "(x + y + floor(t * 0.01 * 2)) % 2 ? 1 : 0",
  },
  {
    id: "orbit",
    label: "Math · Orbit",
    name: "Orbit",
    source: "sin(t * 3 + atan2(y - 7.5, x - 7.5) * 4) * (1 - min(1, sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2) / 8))",
  },
]);

// A small, local Strudel library: the first entries teach one idea at a time,
// while the themed entries demonstrate several voices and effects in one
// editable node. Keep the source self-contained so examples remain useful
// offline and can be freely modified after selection.
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
  {
    id: "trip-hop-backdrop",
    label: "Atmospheres · Trip-hop backdrop",
    name: "Trip-hop backdrop",
    source: WELCOME_STRUDEL_SOURCE,
  },
  {
    id: "airbient",
    label: "Atmospheres · airbient",
    name: "airbient",
    source: AIRBIENT_STRUDEL_SOURCE,
  },
  {
    id: "sunroom",
    label: "Songs · sunroom",
    name: "sunroom",
    source: SUNROOM_STRUDEL_SOURCE,
  },
  {
    id: "sunday-wrld",
    label: "Songs · SUNDAY WRLD",
    name: "SUNDAY WRLD",
    source: SUNDAY_WRLD_STRUDEL_SOURCE,
  },
  {
    id: "underlooped",
    label: "Songs · underlooped",
    name: "underlooped",
    source: UNDERLOOPED_STRUDEL_SOURCE,
  },
]);

export const getLivecodeExamples = kind => {
  if (kind === LIVECODE_KINDS.p5) return p5Examples;
  if (kind === LIVECODE_KINDS.manim) return manimExamples;
  if (kind === LIVECODE_KINDS.three) return threeExamples;
  if (kind === LIVECODE_KINDS.playcore) return playCoreExamples;
  if (kind === LIVECODE_KINDS.strudel) return strudelExamples;
  if (kind === LIVECODE_KINDS.orca) return orcaExamples;
  if (kind === LIVECODE_KINDS.shader) return SHADER_EXAMPLES.map(example => ({ id: example.id, label: example.label, name: example.name, source: example.source, mode: example.mode, dialect: example.dialect }));
  if (kind === LIVECODE_KINDS.tixy) return tixyExamples;
  return [];
};
