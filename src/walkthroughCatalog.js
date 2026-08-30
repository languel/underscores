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

export const ONBOARDING_WALKTHROUGH = createWalkthrough({
  id: "guided-onboarding-v1",
  title: "Welcome to Underscores",
  description: "A guided introduction to the creative blackboard, Livecode, sound, physics, and the main workspace panels.",
  clockMode: "free",
  defaultRate: 1,
  steps: [
    {
      id: "welcome",
      title: "A creative blackboard",
      narration: "Underscores begins as a quiet canvas. Drawing, code, sound, motion, collaboration, and the assistant all meet on the same patch.",
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

export const BUNDLED_WALKTHROUGHS = Object.freeze([ONBOARDING_WALKTHROUGH]);

export const BUNDLED_HELP_CATALOG = Object.freeze([
  { id: "onboarding", title: "Welcome to Underscores", category: "Getting started", tags: ["tour", "canvas", "panels"], summary: "A guided tour of the creative blackboard.", walkthroughId: ONBOARDING_WALKTHROUGH.id },
  { id: "p5", title: "p5 Livecode", category: "Livecode", tags: ["javascript", "visuals", "p5"], summary: "Create visual sketches that live on the canvas.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "p5", insertCommand: { id: "livecode.node.create", args: { kind: "p5", name: "Help p5 sketch", source: P5_SOURCE, running: true, transportMode: "free" } } },
  { id: "glsl", title: "GLSL shaders", category: "Livecode", tags: ["shader", "glsl", "visuals"], summary: "Render fragment shaders with shared time and composition.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "glsl", insertCommand: { id: "livecode.node.create", args: { kind: "shader", name: "Help radial shader", source: GLSL_SOURCE, running: true, transportMode: "free" } } },
  { id: "audio-physics", title: "Audio and physics", category: "Systems", tags: ["sound", "physics", "mapping"], summary: "Connect movement and collisions to the internal synth.", walkthroughId: ONBOARDING_WALKTHROUGH.id, stepId: "audio", insertCommand: { id: "demo.reich.pendulum.create", args: { count: 2, preset: "bowed", running: false, audio: false } } },
]);
