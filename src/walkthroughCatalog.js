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

export const ONBOARDING_WALKTHROUGH_ID = "guided-onboarding-v1";

export const MARIONETTE_WALKTHROUGH_ID = "physics-marionette-study-v1";

export const ONBOARDING_WALKTHROUGH = createWalkthrough({
  id: ONBOARDING_WALKTHROUGH_ID,
  title: "Welcome to Underscores",
  description: "A guided introduction to Underscores as an infinite creative computational canvas for performance, teaching, exploration, and research, with Livecode, sound, physics, and the main workspace panels.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "welcome",
      title: "An infinite creative computational canvas",
      narration: "Underscores is an infinite creative computational canvas for performance, teaching, exploration, and research. Drawing, code, sound, motion, collaboration, and the assistant all meet on the same patch.",
      info: "Guided walkthroughs use the same semantic commands as the palette, assistant, WebMCP, History, and Playlist.",
      focusTarget: "canvas",
      advance: { mode: "continue" },
    },
    {
      id: "palette",
      title: "The command palette",
      narration: "The palette is the fastest way to find an action. The cursor will open it, then you can continue when you are ready.",
      info: "Use Command/Ctrl+K or the palette control to search every registered command.",
      focusTarget: "app.commandPalette",
      cues: [{ type: "command", commandId: "commandPalette.open", at: 0.45 }],
      advance: { mode: "continue" },
    },
    {
      id: "panels",
      title: "Panels are views, not separate worlds",
      narration: "Outliner, Script, Assistant, Multiplayer, Properties, and Settings all operate on the same patch. Open panels can dock, float, or collapse.",
      info: "Panel state is recordable presentation state, so a walkthrough can teach the interface without storing brittle screen coordinates.",
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
      id: "timeline-info",
      title: "Timeline and contextual help",
      narration: "Timeline supplies shared musical and visual time. Info follows the current walkthrough step and also explains controls when you hover or focus them.",
      info: "Walkthroughs may use a free clock or follow the global transport. This tour uses a free clock so you can pause anywhere.",
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
      narration: "A Livecode node is a self-contained program living directly on the canvas. This one draws an orbiting cyan dot.",
      info: "p5 nodes can run freely or link to transport time, expose parameters, receive events, and remain editable inside the patch.",
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
      narration: "Shader nodes use the same Livecode lifecycle while rendering a fragment program. This radial wave stays composable with the rest of the patch.",
      info: "GLSL nodes support standard and Shadertoy-style inputs, transport time, composition, and scene interaction.",
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
      narration: "Browsers require a human gesture before audio can begin. Continue to explicitly enable the internal expressive synth and hear a short demo.",
      info: "Audio permission is never bypassed by automation. The Continue click is the intentional learner gesture.",
      focusTarget: "panel.synth",
      cues: [{ type: "command", commandId: "panel.open", args: { panelId: "synth" }, at: 0 }],
      advance: { mode: "continue" },
      hint: "If the browser still reports suspended audio, click Enable audio in the Synth panel.",
    },
    {
      id: "physics",
      title: "Motion can become a score",
      narration: "This compact pendulum example connects deterministic physics to the score and internal synth. It uses ordinary native objects and mappings—not a separate demo runtime.",
      info: "Physics bodies, constraints, collision mappings, and transport synchronization are authored state inside the same patch.",
      focusTarget: "panel.physics",
      cues: [
        { type: "command", commandId: "expressiveSynth.demo.create", at: 0 },
        { type: "command", commandId: "panel.open", args: { panelId: "physics" }, at: 0 },
        { type: "command", commandId: "demo.reich.pendulum.create", args: { count: 2, preset: "bowed", running: true, audio: true }, at: 0.35 },
      ],
      advance: { mode: "assertion", assertion: { type: "scene.exists", minCount: 2 } },
      hint: "The Physics panel should be open and two pendulums should be moving on the canvas.",
    },
    {
      id: "finish",
      title: "Your patch can remain or rewind",
      narration: "You have seen the palette, panels, contextual help, Livecode, sound, and physics. Stop the walkthrough to keep these examples or restore the exact starting patch.",
      info: "Help patches and future classroom walkthroughs use the same portable .__.json format.",
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

export const BUNDLED_WALKTHROUGHS = Object.freeze([ONBOARDING_WALKTHROUGH, MARIONETTE_WALKTHROUGH]);

export const BUNDLED_HELP_CATALOG = Object.freeze([
  { id: "onboarding", title: "Welcome to Underscores", category: "Getting started", tags: ["tour", "canvas", "panels", "performance", "teaching", "exploration", "research"], summary: "A guided tour of an infinite creative computational canvas for performance, teaching, exploration, and research.", walkthroughId: ONBOARDING_WALKTHROUGH.id },
  { id: "p5", title: "p5 Livecode", category: "Livecode", tags: ["javascript", "visuals", "p5"], summary: "Create visual sketches that live on the canvas.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "p5", insertCommand: { id: "livecode.node.create", args: { kind: "p5", name: "Help p5 sketch", source: P5_SOURCE, running: true, transportMode: "free" } } },
  { id: "glsl", title: "GLSL shaders", category: "Livecode", tags: ["shader", "glsl", "visuals"], summary: "Render fragment shaders with shared time and composition.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "glsl", insertCommand: { id: "livecode.node.create", args: { kind: "shader", name: "Help radial shader", source: GLSL_SOURCE, running: true, transportMode: "free" } } },
  { id: "audio-physics", title: "Audio and physics", category: "Systems", tags: ["sound", "physics", "mapping"], summary: "Connect movement and collisions to the internal synth.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "audio", insertCommand: { id: "demo.reich.pendulum.create", args: { count: 2, preset: "bowed", running: false, audio: false } } },
  { id: "physics-marionette", title: "Physics marionette case study", category: "Systems", tags: ["physics", "marionette", "rigging", "mediapipe", "history", "performance"], summary: "Build a Bauhaus paper doll, rig it, make it musical, drive a second rig from MediaPipe, and record a take.", walkthroughId: MARIONETTE_WALKTHROUGH.id, stepId: "construct-costume", insertCommand: { id: "physics.example.marionette", args: {} } },
]);
