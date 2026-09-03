import { createWalkthrough } from "./walkthroughSystem.js";

const P5_SOURCE = `function setup() {
  createCanvas(520, 300);
  noStroke();
}

function draw() {
  background(12, 14, 20);
  const x = width / 2 + cos(frameCount * 0.025) * 150;
  const y = height / 2 + sin(frameCount * 0.04) * 80;
  fill(90, 210, 255);
  circle(x, y, 54);
}`;

const GLSL_SOURCE = `void main() {
  vec2 uv = (FC.xy - 0.5 * r.xy) / r.y;
  float wave = 0.5 + 0.5 * sin(10.0 * length(uv) - t * 2.0);
  o = vec4(mix(vec3(0.1, 0.25, 0.8), vec3(1.0, 0.25, 0.55), wave), 1.0);
}`;

// The Livecode lesson deliberately grows one source in three passes: a plain
// sketch, the same sketch with a declared parameter, and finally the same
// sketch reading transport time. Each pass is a readable diff for a learner.
const LIVECODE_PLAIN_SOURCE = `function setup() {
  createCanvas(480, 300);
  noStroke();
}

function draw() {
  background(10, 12, 18);
  fill(120, 220, 255);
  for (let i = 0; i < 8; i++) {
    const a = frameCount * 0.01 + i * 0.7;
    circle(width / 2 + cos(a) * 140, height / 2 + sin(a * 1.3) * 90, 26);
  }
}`;

const LIVECODE_PARAM_SOURCE = `// @param count = 8 (2..40, step: 1)
// @param hue = #78dcff (color)

function setup() {
  createCanvas(480, 300);
  noStroke();
}

function draw() {
  background(10, 12, 18);
  fill(__.params.hue);
  for (let i = 0; i < __.params.count; i++) {
    const a = frameCount * 0.01 + i * 0.7;
    circle(width / 2 + cos(a) * 140, height / 2 + sin(a * 1.3) * 90, 26);
  }
}`;

const LIVECODE_TRANSPORT_SOURCE = `// @param count = 8 (2..40, step: 1)
// @param hue = #78dcff (color)

function setup() {
  createCanvas(480, 300);
  noStroke();
}

function draw() {
  background(10, 12, 18);
  // __.transport.time is score time, so this follows Timeline instead of
  // frameCount once the node's clock is set to Linked.
  const beat = __.transport.time * (__.transport.tempo / 60);
  fill(__.params.hue);
  for (let i = 0; i < __.params.count; i++) {
    const a = beat * 0.5 + i * 0.7;
    const pulse = 26 + sin(beat * PI + i) * 10;
    circle(width / 2 + cos(a) * 140, height / 2 + sin(a * 1.3) * 90, pulse);
  }
}`;

const TIMELINE_PULSE_SOURCE = `// A linked node reads score time, so Timeline drives it.
function setup() {
  createCanvas(420, 260);
  noStroke();
}

function draw() {
  clear();
  const beat = __.transport.time * (__.transport.tempo / 60);
  const phase = beat % 4;
  fill(255, 214, 120, 220);
  circle(width / 2, height / 2, 60 + (1 - phase / 4) * 90);
  fill(20, 24, 32);
  circle(width / 2, height / 2, 46);
}`;

export const ONBOARDING_WALKTHROUGH_ID = "guided-onboarding-v1";

export const LIVECODE_WALKTHROUGH_ID = "livecode-first-program-v1";

export const PHYSICS_WALKTHROUGH_ID = "physics-first-instrument-v1";

export const TIMELINE_WALKTHROUGH_ID = "timeline-arrangement-v1";

export const MARIONETTE_WALKTHROUGH_ID = "physics-marionette-study-v1";

export const ONBOARDING_WALKTHROUGH = createWalkthrough({
  id: ONBOARDING_WALKTHROUGH_ID,
  revision: 2,
  title: "Welcome to Underscores",
  description: "A guided introduction to Underscores as an infinite creative computational canvas for performance, teaching, exploration, and research, with the palette, panels, Documentation, Livecode, sound, physics, and the keep-or-restore decision at the end.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "welcome",
      title: "An infinite creative computational canvas",
      narration: "Underscores is an infinite creative computational canvas for performance, teaching, exploration, and research. Drawing, code, sound, motion, physics, collaboration, and time all meet in one document, called a **patch**.\n\nThis tour takes about five minutes. Nothing is uploaded, and at the end you choose whether to keep what it builds or return to exactly the patch you started with.",
      info: "Guided walkthroughs use the same registered commands as the palette, the assistant, WebMCP, History, and Playlist. Press Continue whenever you are ready; you can pause or stop at any point.",
      focusTarget: "canvas",
      advance: { mode: "continue" },
    },
    {
      id: "palette",
      title: "The command palette",
      narration: "The palette is the fastest way to find anything. Type part of a command name, an alias, or a slash form and press Enter.\n\nWatch the cursor open it now.",
      info: "Command/Ctrl+/ opens the palette. Every panel also has a slash name, so /physics, /transport, and /docs all work here. Option/Alt+Shift+- opens the compact contextual command field instead, which passes the current selection along.",
      focusTarget: "app.commandPalette",
      cues: [{ type: "command", commandId: "commandPalette.open", at: 0.45 }],
      advance: { mode: "continue" },
      hint: "The palette field is the one that just appeared near the top of the window. Continue closes it again.",
    },
    {
      id: "panels",
      title: "Panels are views, not separate worlds",
      narration: "Outliner, Script, Assistant, Multiplayer, Properties, and Settings all operate on the same patch. Two panels showing one Livecode source are two views of one file, never competing drafts.\n\nPanels dock left, dock right, float, or collapse to an edge handle.",
      info: "Command/Ctrl+B, Command/Ctrl+Option+B, and Command/Ctrl+Shift+B collapse the left, right, and bottom docks. Ctrl+Alt+Shift+D resets the workspace to defaults. Panel layout is presentation state, so a walkthrough can teach the interface without storing brittle screen coordinates.",
      focusTarget: "panel.script",
      cues: [
        { type: "command", commandId: "commandPalette.close", at: 0 },
        { type: "command", commandId: "panel.open", args: { panelId: "outliner" }, at: 0.25 },
        { type: "command", commandId: "panel.open", args: { panelId: "script" }, at: 0.75 },
        { type: "command", commandId: "panel.open", args: { panelId: "chat" }, at: 1.25 },
        { type: "command", commandId: "panel.open", args: { panelId: "collaboration" }, at: 1.75 },
        { type: "command", commandId: "panel.open", args: { panelId: "properties" }, at: 2.25 },
        { type: "command", commandId: "panel.open", args: { panelId: "settings" }, at: 2.75 },
      ],
      advance: { mode: "continue" },
    },
    {
      id: "documentation",
      title: "Where the answers live",
      narration: "Documentation is the searchable library. Its table of contents starts with **Getting started**, then covers Livecode, Physics, Timeline, and every panel; the bundled help patches and walkthroughs are listed underneath.\n\nSearch matches titles, keywords, and body text together, so `physics midi` goes straight to the mapping pages.",
      info: "Open it with /docs, /documentation, or /help. The Getting started button at its top re-runs this tour; /welcome does the same from the palette. Info, docked at the bottom, stays the short contextual reference and links here for the long version.",
      focusTarget: "panel.documentation",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "documentation" }, at: 0.2 },
      ],
      advance: { mode: "continue" },
      hint: "Documentation opens in the left dock by default. It can move to the right, float, or join the bottom dock beside Timeline.",
    },
    {
      id: "timeline-info",
      title: "Timeline and contextual help",
      narration: "Timeline supplies shared musical and visual time: frames, timecode, or bars and beats, with tempo, meter, loops, and arrangement lanes.\n\nInfo follows the current walkthrough step, and also explains any control you hover or focus.",
      info: "Space plays and pauses. Shift+Left and Shift+Right jump to the timeline or loop start and end. Walkthroughs may use a free clock or follow the transport; this tour uses a free clock so you can pause anywhere.",
      focusTarget: "panel.info",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "transport" }, at: 0.25 },
        { type: "command", commandId: "panel.open", args: { panelId: "info" }, at: 0.75 },
      ],
      advance: { mode: "continue" },
    },
    {
      id: "p5",
      title: "A p5 Livecode node",
      narration: "A **Livecode node** is a self-contained program living on the canvas. The cursor will create a blank one and type into it, exactly as you would.\n\nThis one draws an orbiting cyan dot.",
      info: "p5 nodes can run freely or link to transport time, expose @param values, receive events, and stay editable inside the patch. Command/Ctrl+Enter runs the node; Command/Ctrl+. stops the node under the pointer.",
      focusTarget: "editor.livecode",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "script" }, at: 0 },
        { type: "command", commandId: "livecode.node.create", args: { kind: "p5", name: "Walkthrough orbit", source: "", running: false, transportMode: "free", view: "code", runtimeSettings: { autoUpdate: false } }, instantArgs: { kind: "p5", name: "Walkthrough orbit", source: P5_SOURCE, running: true, transportMode: "free", view: "code" }, at: 0.35 },
        { type: "ui", action: "type", target: "editor.livecode", value: P5_SOURCE, at: 0.7, skipInInstant: true },
        { type: "command", commandId: "livecode.node.update", args: { source: P5_SOURCE, running: true, runtimeSettings: { autoUpdate: false } }, at: 1.4, skipInInstant: true },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "p5", name: "Walkthrough orbit" } },
      hint: "Look for the cyan p5 node on the canvas and its editable source in Script.",
    },
    {
      id: "glsl",
      title: "A GLSL shader node",
      narration: "Shader nodes use the same Livecode lifecycle while rendering a fragment program. This radial wave stays composable with everything else in the patch.",
      info: "GLSL nodes support standard and Shadertoy-style inputs, transport time, layering, blending, and scene interaction. Above objects, Opacity, Blend, and Background are the shared composition controls for every visual node.",
      focusTarget: "canvas.selection",
      cues: [
        { type: "command", commandId: "livecode.node.create", args: { kind: "shader", name: "Walkthrough radial shader", source: "", running: false, transportMode: "free", view: "code", runtimeSettings: { autoUpdate: false } }, instantArgs: { kind: "shader", name: "Walkthrough radial shader", source: GLSL_SOURCE, running: true, transportMode: "free", view: "preview" }, at: 0.35 },
        { type: "ui", action: "type", target: "editor.livecode", value: GLSL_SOURCE, at: 0.7, skipInInstant: true },
        { type: "command", commandId: "livecode.node.update", args: { source: GLSL_SOURCE, running: true, view: "preview", runtimeSettings: { autoUpdate: false } }, at: 1.4, skipInInstant: true },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "shader", name: "Walkthrough radial shader" } },
      hint: "The shader is a second Livecode rectangle with a colorful animated preview.",
    },
    {
      id: "audio",
      title: "Enable sound",
      narration: "Browsers require a human gesture before audio can begin, so nothing here bypasses that.\n\nThe walkthrough is about to add a short Expressive Synth demo. Because that touches audio, Underscores will ask you to allow it first — choosing **Allow** is the deliberate gesture that starts sound.",
      info: "Audio permission is never bypassed by automation. Permission-sensitive, destructive, file, MIDI, and audio cues always ask the learner. If the browser still reports suspended audio afterwards, use Enable audio in the Synth panel.",
      focusTarget: "panel.synth",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "synth" }, at: 0 },
        { type: "command", commandId: "expressiveSynth.demo.create", at: 0.6 },
      ],
      advance: { mode: "continue" },
      hint: "If you declined the prompt, or heard nothing, open the Synth panel and press Enable audio, then continue.",
    },
    {
      id: "physics",
      title: "Motion can become a score",
      narration: "This compact pendulum example connects deterministic physics to the score and the internal synth. It is built from ordinary canvas objects and authored mappings, not a separate demo runtime.",
      info: "Physics bodies, constraints, collision mappings, and transport synchronization are authored state inside the same patch. A mapping runs Source → Filter → Transform → Target outside the render loop.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0 },
        { type: "command", commandId: "demo.reich.pendulum.create", args: { count: 2, preset: "bowed", running: true, audio: true }, at: 0.35 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minSystems: 1, minBodies: 2 } },
      hint: "The Physics panel should be open and two pendulums should be swinging on the canvas. Press Play in Physics if they are still.",
    },
    {
      id: "finish",
      title: "Keep this patch, or rewind it",
      narration: "You have seen the palette, panels, Documentation, Timeline and Info, a p5 node, a shader, sound, and physics.\n\nPress **Done** to finish. You will be asked whether to keep these examples or restore the exact patch you started with.",
      info: "Next: the Livecode, Physics, and Timeline walkthroughs go deeper on each area, and Documentation's Getting started section covers the canvas, panels, commands, shortcuts, and saving. Help patches and classroom walkthroughs use the same portable .__.json format.",
      focusTarget: "panel.walkthrough",
      advance: { mode: "continue" },
    },
  ],
});

// Livecode is the first thing most learners want, so this lesson stays on one
// node and grows it: plain sketch, declared parameters, transport-linked time,
// then a second node to show composition. Every stage leaves runnable code.
export const LIVECODE_WALKTHROUGH = createWalkthrough({
  id: LIVECODE_WALKTHROUGH_ID,
  title: "Livecode: your first program",
  description: "Build one p5 node from a blank source into a parameterized, transport-linked sketch, then add a shader underneath it to see how visual nodes compose.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "create-node",
      title: "1. Make a node",
      narration: "A Livecode node is one canvas object whose contents are a running program. The cursor will create a blank p5 node and open Script beside it.\n\nThe node on the canvas and the Script panel are two views of one source document.",
      info: "Create a node from New Livecode Node, the palette, livecode.node.create, or /live. Naming the kind goes straight there: /live p5, /live shader, /live strudel, /live three, /live orca, /live tixy.",
      focusTarget: "panel.script",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "script" }, at: 0 },
        { type: "command", commandId: "livecode.node.create", args: { kind: "p5", name: "First sketch", source: "", running: false, transportMode: "free", view: "code", runtimeSettings: { autoUpdate: false } }, at: 0.4 },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "p5", name: "First sketch" } },
      hint: "Look for an empty rectangle named First sketch. Selecting it always opens its source in Script.",
    },
    {
      id: "write-source",
      title: "2. Write and run it",
      narration: "Now the source. Eight circles orbit on offset phases — small enough to read, big enough to change.\n\nWhen the typing finishes the node compiles and starts.",
      info: "Command/Ctrl+Enter runs a stopped node or evaluates a manual-update draft. With the pointer over a node on the canvas, the same chord runs it without focusing the editor, and Command/Ctrl+. stops it.",
      focusTarget: "editor.livecode",
      cues: [
        { type: "ui", action: "type", target: "editor.livecode", value: LIVECODE_PLAIN_SOURCE, at: 0.3, skipInInstant: true },
        { type: "command", commandId: "livecode.node.update", args: { source: LIVECODE_PLAIN_SOURCE, running: true, runtimeSettings: { autoUpdate: false } }, instantArgs: { source: LIVECODE_PLAIN_SOURCE, running: true }, at: 1.2 },
      ],
      advance: { mode: "continue" },
      hint: "Change a number in the source and press Command/Ctrl+Enter again. Nothing is lost: the previous working output stays on screen if an edit fails to compile.",
    },
    {
      id: "parameters",
      title: "3. Expose parameters",
      narration: "A `// @param` comment turns a hard-coded value into a control. The same source now declares a **count** number and a **hue** color, and reads them through `__.params`.\n\nOpen the Parameters section in Script and drag the count.",
      info: "@param declarations accept numbers with a range and step, strings, CSS colors, booleans, parsed JSON, and canvas object references. Colors use the in-app picker with a live eyedropper, and color references resolve on access so a running node follows a changed palette without recompiling.",
      focusTarget: "panel.script",
      cues: [
        { type: "command", commandId: "livecode.node.update", args: { source: LIVECODE_PARAM_SOURCE, running: true }, at: 0.3 },
        { type: "command", commandId: "panel.open", args: { panelId: "script" }, at: 0.8 },
      ],
      advance: { mode: "continue" },
      hint: "Parameter changes take effect without recompiling. Try dragging count, then click the hue swatch.",
    },
    {
      id: "views",
      title: "4. Change what the node shows",
      narration: "Each node remembers which surface it shows. **Code** is the source, **Output** is the runtime, **Code overlay** paints the source over the running output, and **Code/output** splits them.\n\nThe cursor is switching to the split view now.",
      info: "Command/Ctrl+Shift+Enter cycles views while a node editor has focus. Enter on a selected node opens its canvas editor. A plain Command/Ctrl-click on a canvas output switches that node to Output. Glyphs only, on by default for Code overlay, paints the overlay behind non-whitespace runs so output shows through the gaps.",
      focusTarget: "canvas.selection",
      cues: [
        { type: "command", commandId: "livecode.node.update", args: { view: "split" }, at: 0.3 },
        { type: "command", commandId: "livecode.node.update", args: { view: "preview" }, at: 1.6 },
      ],
      advance: { mode: "continue" },
      hint: "Press Enter on the selected node to get back to its code, or use Command/Ctrl+Shift+Enter to cycle.",
    },
    {
      id: "clock",
      title: "5. Put it on the shared clock",
      narration: "Every node runs on either its own clock or the score's. **Free** keeps its own timer; **Linked** follows Timeline's play, pause, seek, and rate.\n\nThe source now reads `__.transport.time` instead of `frameCount`, and the node switches to Linked. Press play in Timeline and the circles pulse in tempo.",
      info: "The compact clock toggle sits beside Auto-update in Script: a stopwatch for Free, a square subdivided clock for Linked. With Quantize linked activation enabled, starting or stopping a linked node waits for the next musical boundary — 1/16 through 4 bars, or a custom beat count.",
      focusTarget: "panel.transport",
      cues: [
        { type: "command", commandId: "livecode.node.update", args: { source: LIVECODE_TRANSPORT_SOURCE, running: true, transportMode: "linked" }, at: 0.3 },
        { type: "command", commandId: "panel.open", args: { panelId: "transport" }, at: 0.9 },
        { type: "command", commandId: "transport.update", args: { state: { tempo: 96, displayMode: "beats", playing: true } }, at: 1.3 },
      ],
      advance: { mode: "continue" },
      hint: "Change the tempo in Timeline while it plays. A linked node follows immediately, because it is reading score time rather than counting frames.",
    },
    {
      id: "compose",
      title: "6. Compose two nodes",
      narration: "Visual nodes compose without being flattened. The cursor adds a Stokes flow shader; now put it behind the sketch.\n\nSelect the shader, press **Option/Alt+Shift+-**, and type `layer underlay`. Then try `blend screen` and `node opacity 70`.",
      info: "Layer places a node above or below native canvas objects. Opacity and Blend are browser-compositor properties, and Background chooses transparent, theme, or solid while preserving adapter-owned pixels. Composition never reads pixels back or writes scene state per frame. Large overlapping translucent surfaces cost GPU fill rate, so keep Normal where blending is not needed.",
      focusTarget: "canvas.selection",
      cues: [
        { type: "command", commandId: "livecode.node.create", args: { kind: "shader", example: "stokes", name: "Flow underlay", running: true, transportMode: "free", view: "preview" }, at: 0.4 },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "shader", name: "Flow underlay" } },
      hint: "The contextual command field is Option/Alt+Shift+-. It passes the current selection along, so short property edits like layer underlay or blend screen apply straight away.",
    },
    {
      id: "finish",
      title: "7. When something breaks",
      narration: "Open **Console** and read the Live status stream. Compile and runtime failures are reported there — p5 problems appear as `p5 error:` — while the canvas keeps its last working frame.\n\nThat is the whole Livecode model: one source, one node, an explicit run gesture, and a visible place where failures go.",
      info: "See Livecode nodes, Running, stopping, and updating, Free and linked clocks, The Underscores bridge, and When a node will not run in Documentation. The per-kind quick references under Scripting cover p5, GLSL, Strudel, Three.js, Orca, Tixy, SVG, Markdown, LaTeX, and HTML.",
      focusTarget: "panel.console",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "console" }, at: 0.2 },
      ],
      advance: { mode: "continue" },
    },
  ],
});

// Physics reads best as a single escalation: a world that already sounds good,
// then the mapping that makes it sound good, then the learner's own object
// joining that world. The Musical gas example is the acceptance workload, so
// it doubles as an honest performance demonstration.
export const PHYSICS_WALKTHROUGH = createWalkthrough({
  id: PHYSICS_WALKTHROUGH_ID,
  title: "Physics: make a drawing sound",
  description: "Build the Musical gas world, hear its collisions through the internal synth, read the debug overlay, then give one of your own drawings a body in the same world.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "open-physics",
      title: "1. Physics is an inspector, not a separate document",
      narration: "Physics in Underscores is a relationship graph laid over objects you already drew. There is no separate simulation window: a drawing gets a body role and starts moving while staying selectable, copyable, and deletable.\n\nThe cursor opens the Physics panel and its floating toolbar.",
      info: "World holds gravity in metres per second squared, viscosity, pixels per metre, and sim speed. Gravity defaults to 0, -9.8; because canvas Y grows downward, that negative world-Y reads as falling down the page. Open the panel with /physics or /relations.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0 },
        { type: "command", commandId: "physics.toolbar.toggle", at: 0.5 },
      ],
      advance: { mode: "continue" },
      hint: "The compact toolbar drags by its atom icon and reopens with /physicstoolbar or Ctrl+Alt+P.",
    },
    {
      id: "build-gas",
      title: "2. Build a world",
      narration: "Musical gas draws four walls plus a slack string, then fills the box with a seeded population of 250 particles.\n\nThe walls are ordinary canvas rectangles with fixed bodies. Select one and Properties will show its Physics role.",
      info: "A population creates many seeded runtime instances from one template without putting hundreds of objects in the patch. Runtime-lite members keep only solver identity, pose, collider, tags, and render style, and are painted by a single imperative overlay. Materialize turns them into authored objects when you want to keep them.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "physics.example.gas", at: 0.3 },
        { type: "command", commandId: "excalidraw.view.frameAll", at: 1 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minSystems: 1, minBodies: 4 } },
      hint: "Look for the framed box with a pink string across it, and a Musical gas system in the Physics panel.",
    },
    {
      id: "play",
      title: "3. Press play",
      narration: "The solver runs at a fixed 60 Hz in a worker. Pause holds the evaluated pose rather than freezing mid-step, and Reset returns to the authored baseline.\n\nWatch the particles fill the box.",
      info: "This is the acceptance workload: 250 runtime bodies at a 60 Hz solver step while canvas rendering stays at or above 45 FPS. The performance monitor reports physics.step, physics.transfer, physics.render, body count, collision-event rate, dropped events, and route cost.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "physics.play", at: 0.3 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minSystems: 1, playing: true } },
      hint: "Use Play in the Physics panel if the world is still. Reset returns everything to its authored starting pose.",
    },
    {
      id: "sound",
      title: "4. Give contact a voice",
      narration: "Open the Synth panel and enable audio — browsers need a deliberate gesture, and automation never bypasses it.\n\nThe cursor now adds a collision mapping: body-to-body hits become short Expressive Synth notes.",
      info: "A mapping runs Source → Filter → Transform → Target outside the render loop. Source picks a system, collision class, phase, tags, and a numeric field. Filter rejects events by range or formula. Transform scales what survives. Target sends MIDI Note, CC, Pitch Bend, or an Expressive Synth voice.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "synth" }, at: 0 },
        { type: "command", commandId: "physics.mapping.create", args: { collisionClass: "body-body", target: "expressive-voice" }, at: 0.7 },
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 1.2 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minMappings: 1 } },
      hint: "If you hear nothing, press Enable audio in the Synth panel. Open the mapping card in Physics to change its field, filter, or synth program.",
    },
    {
      id: "formulas",
      title: "5. Shape it with a formula",
      narration: "Open the new mapping card and look at its Transform. Formulas here are safe expressions, not JavaScript.\n\nTry a pitch formula such as `major(baseNote, floor(speed / 12))`, or a velocity formula such as `clamp(20 + speed * 2, 1, 127)`.",
      info: "Shared values include raw, norm, value, impulse, speed, contact x/y, normalX/normalY, per-body position, velocity and speed, gravity, worldTime, step, timeScale, and pixelsPerMeter. Body materials arrive as aMass/bMass, aFriction/bFriction, aBounce/bBounce, aDensity/bDensity. Pitch formulas also receive baseNote, with major, minor, pentatonic, and scale helpers.",
      focusTarget: "panel.physics",
      advance: { mode: "continue" },
      hint: "Use hit for one note per impact. Use begin and end with a pair-gated target for notes that persist while two bodies stay in contact.",
    },
    {
      id: "debug",
      title: "6. See what the solver sees",
      narration: "Under Systems, turn on the **Physics debug overlay**. It draws the actual collider geometry, labels, constraints, contacts, collision pulses, and force vectors in the same coordinate system as your drawing.\n\nThis is diagnostic only. It never serializes and never exports.",
      info: "Each category toggles independently and takes a theme-aware CSS color. With the overlay off, no diagnostic primitives are collected or painted at all, so it adds no cost. Trails follow a body's centre of mass, and Axles and Welds can plot both attachment points so real joint separation shows as two diverging traces.",
      focusTarget: "panel.physics",
      advance: { mode: "continue" },
      hint: "Turn on Colliders first. It is the fastest way to see why a shape is not colliding the way you expected.",
    },
    {
      id: "your-body",
      title: "7. Add your own object",
      narration: "Now make something of your own join the world. Draw a shape anywhere inside the box, keep it selected, then either Shift-right-click and choose **Make Physics Body** or run `/make body`.\n\nIt will fall, collide, and sound like everything else.",
      info: "Underscores infers a collider and material from the shape. Closed near-round freehand strokes become circles; other closed strokes become convex colliders. Path bodies can choose Bounding box, Bounding ellipse, Convex hull, or Path chain in Physics Role.",
      focusTarget: "canvas",
      advance: { mode: "assertion", assertion: { type: "physics.state", minBodies: 6 } },
      hint: "Draw with P, press V, select the shape, then run /make body. If you would rather move on, Skip is available.",
      failureText: "No new body yet. Select a drawing inside the box and run /make body, or press Skip.",
    },
    {
      id: "finish",
      title: "8. Reset, apply, and keep going",
      narration: "**Reset** returns to the authored baseline. **Apply current pose** makes the running arrangement the new baseline. While a world is paused, Paused edits decides whether an ordinary canvas transform updates that baseline or leaves it alone.\n\nPress Done to keep this world or restore the patch you started with.",
      info: "Next: the Physics marionette case study builds an articulated rig, adds collision sound, drives a second rig from MediaPipe, and records a take. Documentation covers bodies and colliders, constraints, actuators, collision layers, posing, and performance in depth.",
      focusTarget: "panel.walkthrough",
      advance: { mode: "continue" },
    },
  ],
});

// Timeline is the least self-evident of the three priority areas, so this
// lesson deliberately separates the three ideas learners conflate: transport
// time, a node's clock, and an arrangement clip.
export const TIMELINE_WALKTHROUGH = createWalkthrough({
  id: TIMELINE_WALKTHROUGH_ID,
  title: "Timeline: give the patch time",
  description: "Read the transport in frames, timecode, and beats, set tempo and a loop, link a node to score time, quantize its launch, and place it on an arrangement clip.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "open-transport",
      title: "1. One clock, shared",
      narration: "Timeline is the shared clock. Drawings, Livecode nodes, media, physics worlds, and sound agree about when things happen because they read the same transport — and anything that would rather not can stay on its own free clock.\n\nIt docks to the bottom and stays one compact row.",
      info: "Open it with /transport or Ctrl+Alt+T. Space plays and pauses. Shift+Left and Shift+Right jump to the timeline or loop start and end. Ctrl+Shift+Space is the rehearsal reset toggle: it returns to zero and then stops or starts from there, and it keeps working while an editor has focus.",
      focusTarget: "panel.transport",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "transport" }, at: 0.2 },
      ],
      advance: { mode: "continue" },
    },
    {
      id: "time-modes",
      title: "2. Frames, timecode, or beats",
      narration: "The same position reads three ways. **Frame** is an integer count. **Timecode** is hours:minutes:seconds:frames. **Beats** is bar.beat.sixteenth, so `1.2.0` is the second beat of the first bar.\n\nThe cursor switches to beats at 96 BPM.",
      info: "Frame rate is one of 24, 25, 30, 50, or 60 and governs both frame display and timecode. Tempo is clamped between 20 and 400 BPM. The display mode also changes the ruler: in beats the minor division is a beat and the major is a bar; in frames the minor is one frame and the major is one second.",
      focusTarget: "panel.transport",
      cues: [
        { type: "command", commandId: "transport.update", args: { state: { displayMode: "beats", tempo: 96, fps: 30, timeSignature: "4/4" } }, at: 0.3 },
      ],
      advance: { mode: "continue" },
      hint: "Switch the display mode back and forth while the playhead moves. Nothing about the timing changes; only the reading does.",
    },
    {
      id: "loop",
      title: "3. Seek, zoom, and loop",
      narration: "Drag the ruler to seek. Hold Command while dragging to snap to major units, Command+Shift for minor. **Shift-drag across the ruler marks a loop.**\n\nThe cursor sets a four-bar loop and starts playback.",
      info: "The zoom strip below the timeline sets the visible window: drag it to pan, drag its edges to zoom, Command-click to fit the score, Option-click to fit the loop. Zooming only changes what you look at; it never alters timing.",
      focusTarget: "panel.transport",
      cues: [
        { type: "command", commandId: "transport.update", args: { state: { loop: { enabled: true, start: 0, end: 10 } } }, at: 0.3 },
        { type: "command", commandId: "transport.jump.start", at: 0.7 },
        { type: "command", commandId: "transport.update", args: { state: { playing: true } }, at: 0.9 },
      ],
      advance: { mode: "continue" },
      hint: "Drag the loop bar to move the range, or either handle to change its start or end.",
    },
    {
      id: "linked-node",
      title: "4. Link a node to score time",
      narration: "A node's clock is a separate choice from the transport. **Free** uses a node-local timer; **Linked** follows play, pause, seek, and rate.\n\nThis pulse node is created Linked and reads `__.transport.time`, so seeking the playhead moves it too.",
      info: "Visual and document kinds default to Free. Strudel defaults to Linked and re-anchors its cycles to score time on play, rewind, loop, backward seek, and tempo change. Seeking a transport-clocked physics world restores a deterministic checkpoint rather than guessing.",
      focusTarget: "canvas.selection",
      cues: [
        { type: "command", commandId: "livecode.node.create", args: { kind: "p5", name: "Timeline pulse", source: TIMELINE_PULSE_SOURCE, running: true, transportMode: "linked", view: "preview" }, at: 0.4 },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "p5", name: "Timeline pulse" } },
      hint: "Scrub the playhead by hand. The pulse follows, because it is reading score time rather than counting its own frames.",
    },
    {
      id: "quantize",
      title: "5. Launch on the beat",
      narration: "**Quantize linked activation** turns the run control into a clip launcher: starting or stopping a linked node waits for the next musical boundary.\n\nThe cursor enables it at one bar. Now stop and start the pulse node and it snaps to the bar line.",
      info: "The control is Q plus an interval selector in the compact transport, and also lives in Settings under Score & MIDI. Intervals are 1/16, 1/8, 1/4 beat, 1/2 beat, 1 bar, 2 bars, 4 bars, or a custom beat count. A newly launched node gets a fresh phase origin at its actual activation, so its first event starts at the beginning of the clip.",
      focusTarget: "panel.transport",
      cues: [
        { type: "command", commandId: "transport.update", args: { state: { launchQuantization: { enabled: true, interval: "bar" } } }, at: 0.3 },
      ],
      advance: { mode: "continue" },
      hint: "Stopping the transport cancels queued starts and stops, and toggling a queued node again cancels its pending change.",
    },
    {
      id: "clip",
      title: "6. Schedule it with a clip",
      narration: "A clock decides *how* an object reads time. A **clip** decides *when* it participates at all.\n\nSelect the Timeline pulse node and run **Add clip at playhead**, or `/clip add`. A lane appears in Timeline; drag the clip to move it, drag an edge to trim it, Option-drag an edge to stretch its rate, and double-click it to loop.",
      info: "Creating an object's first clip opts it into arrangement scheduling; deleting its last clip returns it to always-present behavior. Livecode clips default to one bar, media uses its intrinsic duration, gestures use their recorded duration, and static objects use Hold. Every edit commits once at pointer release as one undo.",
      focusTarget: "panel.transport",
      advance: { mode: "continue" },
      hint: "Selecting a clip selects its canvas object, and selecting an arranged object reveals its lane. Command/Ctrl-click toggles individual clips; Shift-click extends a range.",
    },
    {
      id: "record",
      title: "7. Record a performance into clips",
      narration: "Arrangement Record captures performance as clips, separately from History.\n\n**Alt+Shift+R** arms it. **Alt+Shift+S** switches Rolling and Step. Rolling records against the moving playhead; Step keeps the transport paused and **Alt+Right** / **Alt+Left** move the step playhead, which is how you build something frame by frame.",
      info: "A completed drawing becomes a gesture lifecycle and a clip. Recordings that cross a loop boundary become source-continuous linked segments sharing one recording ID, and each loop pass becomes an overlay take. Take rows carry M and S: muting or soloing changes evaluation without touching the authored objects.",
      focusTarget: "panel.transport",
      advance: { mode: "continue" },
      hint: "Raw gesture timing is retained even when the first presentation is a static Hold or one-frame clip, so you can convert a step-recorded drawing into a timed one later.",
    },
    {
      id: "finish",
      title: "8. Three separate ideas",
      narration: "That is the whole model, and the three ideas are worth keeping apart:\n\n**Transport time** is the shared clock. **A node's clock** decides whether that node reads it. **A clip** decides when an object participates at all.\n\nPress Done to keep this arrangement or restore your starting patch.",
      info: "Documentation covers Timeline overview, Frames, timecode, and beats, Seeking, zooming, and looping, Arrangement clips, Editing clips, Arrangement recording, and How clips drive objects in depth.",
      focusTarget: "panel.walkthrough",
      advance: { mode: "continue" },
    },
  ],
});

// A case study rather than a one-shot demo: each stage leaves the patch in a
// useful, inspectable state so a teacher can stop, explain, or let a learner
// take over before continuing. The first command uses the same Marionette
// builder as the Physics panel and `/physics demo marionette`; subsequent
// stages add the musical, MediaPipe, and History layers around that rig.
export const MARIONETTE_WALKTHROUGH = createWalkthrough({
  id: MARIONETTE_WALKTHROUGH_ID,
  title: "Physics marionette: from costume to performance",
  description: "An incremental case study that turns Bauhaus-inspired primitives into an articulated paper doll, then adds live posing, collision sound, a second MediaPipe rig, and recordable playback.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "construct-costume",
      title: "1. Construct a Bauhaus paper doll",
      narration: "Begin with a deliberately legible costume: a circular head, a block body, and two contrasting arm pieces. These are ordinary selectable Excalidraw objects, so the drawing remains editable while physics supplies the behavior.",
      info: "The Marionette builder creates four native primitives and gives them authored-rigid bodies in one named physics world. Keep the parts visually simple so the relationship graph stays easy to inspect.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0 },
        { type: "command", commandId: "physics.example.marionette", at: 0.35 },
        { type: "command", commandId: "excalidraw.view.frameAll", at: 0.9 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minSystems: 1, minBodies: 4, minConstraints: 4 } },
      hint: "Look for the four colored costume parts and the Marionette world in Physics. Use Outliner or Properties to inspect any part.",
    },
    {
      id: "inspect-rig",
      title: "2. Read the rig before touching it",
      narration: "The invisible structure is as important as the costume. A world pin holds the head, a spring gives the neck a little give, and two revolute joints let the arms swing from the body.",
      info: "Physics relationships are authored graph data. Reset returns to the starting pose; Apply Current Pose makes a staged pose the new reset state.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0 },
        { type: "command", commandId: "physics.pause", at: 0.2 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minBodies: 4, minConstraints: 4, playing: false } },
      hint: "Expand the Marionette system and identify the pin, neck spring, and two shoulder joints before continuing.",
    },
    {
      id: "live-pose",
      title: "3. Pose it with the mouse",
      narration: "Play the world, then drag an unselected body or pivot to pose the doll. The grab is temporary: it becomes an authored arrangement only when you choose Apply Current Pose.",
      info: "Live pose is an explicit Physics mode. A selected object keeps Excalidraw's normal transform gesture; start a grab on an unselected body or joint when you want runtime posing.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "physics.play", at: 0.2 },
      ],
      advance: { mode: "continue" },
      hint: "Drag the head or an arm while the world is running. Pause, Reset, or Apply in the Physics panel when you are ready.",
    },
    {
      id: "wind-chime",
      title: "4. Turn collisions into wind chimes",
      narration: "Now give contact a voice. The collision mapping listens for body-to-body hits and turns impulse into a short bowed-synth note, so a moving arm can sound like a small wind chime.",
      info: "Mappings are Source → Filter → Transform → Target. The example uses an Expressive Synth target; enable audio with the Synth panel if the browser has not started it yet.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "physics.pause", at: 0 },
        { type: "command", commandId: "physics.mapping.create", args: { collisionClass: "body-body", target: "expressive-voice" }, at: 0.25 },
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0.7 },
      ],
      advance: { mode: "assertion", assertion: { type: "physics.state", minMappings: 1 } },
      hint: "Open the mapping card to change the note, filter, or synth program. Press Play and make the parts meet.",
    },
    {
      id: "mediapipe-second-rig",
      title: "5. Add a second, camera-driven rig",
      narration: "Keep the physics doll running while a separate p5 node reads the Holistic stream. The Schlemmer costume is a second rig, not a replacement: it gives you a visual controller to compare with the paper doll.",
      info: "The starter reads named pose landmarks and falls back to a deterministic T-pose when no completed MediaPipe frame is available. Add a Holistic source from Media, then adapt the landmark values to the Marionette graph through __.api.physics or event mappings.",
      focusTarget: "editor.livecode",
      cues: [
        { type: "command", commandId: "livecode.node.create", args: { kind: "p5", example: "mediapipe-schlemmer-pose", name: "Marionette pose controller", running: true, transportMode: "free", view: "preview" }, at: 0.35 },
        { type: "command", commandId: "panel.open", args: { panelId: "media-input" }, at: 0.8 },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", kind: "p5", name: "Marionette pose controller" } },
      hint: "Add or select a Holistic source in Media. The p5 node remains useful without a camera because it falls back to T-pose.",
    },
    {
      id: "record-take",
      title: "6. Record a performance",
      narration: "Start a History recording, play the physics world, and make a short gesture with the mouse or camera. History captures the authored and presentation actions without baking the live solver into new geometry.",
      info: "History keeps a recoverable baseline. Stop recording before reviewing the take; the History panel can export the session or turn a selected range into a reusable walkthrough.",
      focusTarget: "panel.history",
      cues: [
        { type: "command", commandId: "panel.open", args: { panelId: "history" }, at: 0 },
        { type: "command", commandId: "history.record.start", at: 0.25 },
        { type: "command", commandId: "physics.play", at: 0.5 },
      ],
      advance: { mode: "continue" },
      hint: "Move the doll for a few seconds, then use /record stop or the History stop button and continue to review it.",
    },
    {
      id: "review-take",
      title: "7. Rewind and play it back",
      narration: "Stop the take and play it back from its captured baseline. This is the hand-off point for clips: rehearse, export the History session, or create a polished Walkthrough from the useful range.",
      info: "Playback is deterministic for recorded commands and scene changes. Keep the Marionette as authored state, or stop the walkthrough with Restore to return to the patch that existed before the lesson.",
      focusTarget: "panel.history",
      cues: [
        { type: "command", commandId: "history.record.stop", at: 0 },
        { type: "command", commandId: "panel.open", args: { panelId: "history" }, at: 0.25 },
        { type: "command", commandId: "history.play", at: 0.55 },
      ],
      advance: { mode: "continue" },
      hint: "Use History's playhead, pause, and export controls to turn the take into a repeatable clip or a new walkthrough.",
    },
  ],
});

export const BUNDLED_WALKTHROUGHS = Object.freeze([
  ONBOARDING_WALKTHROUGH,
  LIVECODE_WALKTHROUGH,
  PHYSICS_WALKTHROUGH,
  TIMELINE_WALKTHROUGH,
  MARIONETTE_WALKTHROUGH,
]);

export const BUNDLED_HELP_CATALOG = Object.freeze([
  { id: "onboarding", title: "Welcome to Underscores", category: "Getting started", tags: ["tour", "canvas", "panels", "performance", "teaching", "exploration", "research"], summary: "A guided tour of an infinite creative computational canvas for performance, teaching, exploration, and research.", walkthroughId: ONBOARDING_WALKTHROUGH.id },
  { id: "livecode-first-program", title: "Livecode: your first program", category: "Getting started", tags: ["livecode", "p5", "parameters", "transport", "shader", "compositing"], summary: "Grow one p5 node from a blank source into a parameterized, transport-linked sketch, then compose it with a shader.", walkthroughId: LIVECODE_WALKTHROUGH.id },
  { id: "physics-first-instrument", title: "Physics: make a drawing sound", category: "Getting started", tags: ["physics", "collision", "mapping", "synth", "population", "debug"], summary: "Build the Musical gas world, map its collisions to the internal synth, then give your own drawing a body.", walkthroughId: PHYSICS_WALKTHROUGH.id },
  { id: "timeline-arrangement", title: "Timeline: give the patch time", category: "Getting started", tags: ["timeline", "transport", "tempo", "loop", "linked", "quantize", "clips", "arrangement"], summary: "Read the transport three ways, loop it, link a node to score time, quantize its launch, and place it on a clip.", walkthroughId: TIMELINE_WALKTHROUGH.id },
  { id: "p5", title: "p5 Livecode", category: "Livecode", tags: ["javascript", "visuals", "p5"], summary: "Create visual sketches that live on the canvas.", walkthroughId: LIVECODE_WALKTHROUGH.id, stepId: "write-source", insertCommand: { id: "livecode.node.create", args: { kind: "p5", name: "Help p5 sketch", source: P5_SOURCE, running: true, transportMode: "free" } } },
  { id: "glsl", title: "GLSL shaders", category: "Livecode", tags: ["shader", "glsl", "visuals"], summary: "Render fragment shaders with shared time and composition.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "glsl", insertCommand: { id: "livecode.node.create", args: { kind: "shader", name: "Help radial shader", source: GLSL_SOURCE, running: true, transportMode: "free" } } },
  { id: "livecode-parameters", title: "Livecode parameters", category: "Livecode", tags: ["param", "parameters", "controls", "color", "number"], summary: "Turn hard-coded values into @param controls read through __.params.", walkthroughId: LIVECODE_WALKTHROUGH.id, stepId: "parameters", insertCommand: { id: "livecode.node.create", args: { kind: "p5", name: "Help parameter sketch", source: LIVECODE_PARAM_SOURCE, running: true, transportMode: "free" } } },
  { id: "audio-physics", title: "Audio and physics", category: "Systems", tags: ["sound", "physics", "mapping"], summary: "Connect movement and collisions to the internal synth.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "audio", insertCommand: { id: "demo.reich.pendulum.create", args: { count: 2, preset: "bowed", running: false, audio: false } } },
  { id: "physics-musical-gas", title: "Musical gas", category: "Systems", tags: ["physics", "population", "collision", "performance", "mapping"], summary: "A 250-particle seeded population whose body and wall hits drive distinct sounds.", walkthroughId: PHYSICS_WALKTHROUGH.id, stepId: "build-gas", insertCommand: { id: "physics.example.gas", args: {} } },
  { id: "physics-marionette", title: "Physics marionette case study", category: "Systems", tags: ["physics", "marionette", "rigging", "mediapipe", "history", "performance"], summary: "Build a Bauhaus paper doll, rig it, make it musical, drive a second rig from MediaPipe, and record a take.", walkthroughId: MARIONETTE_WALKTHROUGH.id, stepId: "construct-costume", insertCommand: { id: "physics.example.marionette", args: {} } },
  { id: "timeline-clips", title: "Arrangement clips", category: "Score", tags: ["timeline", "clip", "take", "record", "lane", "loop"], summary: "Schedule when an object participates in the score, and record performance into clips.", walkthroughId: TIMELINE_WALKTHROUGH.id, stepId: "clip" },
]);
