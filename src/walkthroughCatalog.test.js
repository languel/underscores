import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLED_HELP_CATALOG,
  BUNDLED_WALKTHROUGHS,
  LIVECODE_WALKTHROUGH,
  LIVECODE_WALKTHROUGH_ID,
  MARIONETTE_WALKTHROUGH,
  MARIONETTE_WALKTHROUGH_ID,
  ONBOARDING_WALKTHROUGH,
  ONBOARDING_WALKTHROUGH_ID,
  PHYSICS_WALKTHROUGH,
  PHYSICS_WALKTHROUGH_ID,
  TIMELINE_WALKTHROUGH,
  TIMELINE_WALKTHROUGH_ID,
  WAYANG_WALKTHROUGH,
  WAYANG_WALKTHROUGH_ID,
} from "./walkthroughCatalog.js";
import { WALKTHROUGH_ASSERTION_TYPES } from "./walkthroughSystem.js";
import { isRegisteredWalkthroughTarget } from "./walkthroughTargets.js";

const byId = new Map(BUNDLED_WALKTHROUGHS.map(item => [item.id, item]));

test("the bundled library covers onboarding and the three priority areas", () => {
  assert.deepEqual(BUNDLED_WALKTHROUGHS.map(item => item.id), [
    ONBOARDING_WALKTHROUGH_ID,
    LIVECODE_WALKTHROUGH_ID,
    PHYSICS_WALKTHROUGH_ID,
    TIMELINE_WALKTHROUGH_ID,
    WAYANG_WALKTHROUGH_ID,
    MARIONETTE_WALKTHROUGH_ID,
  ]);
  // Onboarding is the default selection and the /welcome target, so it stays first.
  assert.equal(BUNDLED_WALKTHROUGHS[0].id, ONBOARDING_WALKTHROUGH_ID);
});

test("every bundled step is playable: registered target, real advance rule, narration", () => {
  for (const walkthrough of BUNDLED_WALKTHROUGHS) {
    assert.ok(walkthrough.steps.length > 0, walkthrough.id);
    assert.ok(walkthrough.description.length > 0, walkthrough.id);
    const ids = new Set();
    for (const step of walkthrough.steps) {
      const where = `${walkthrough.id}/${step.id}`;
      assert.ok(!ids.has(step.id), `duplicate step id ${where}`);
      ids.add(step.id);
      assert.ok(step.title.trim().length > 0, where);
      assert.ok(step.narration.trim().length > 0, where);
      assert.ok(isRegisteredWalkthroughTarget(step.focusTarget), `${where} target ${step.focusTarget}`);
      if (step.advance.mode === "assertion") {
        assert.ok(step.advance.assertion, `${where} declares assertion mode without an assertion`);
        assert.ok(WALKTHROUGH_ASSERTION_TYPES.includes(step.advance.assertion.type), where);
        // A hint is the recovery path when an assertion will not pass.
        assert.ok(step.hint.trim().length > 0, `${where} needs a hint`);
      }
      for (const cue of step.cues) {
        if (cue.type === "command") assert.ok(cue.commandId, `${where} command cue without an id`);
        if (cue.type === "ui") assert.ok(isRegisteredWalkthroughTarget(cue.target), `${where} ui cue target`);
      }
    }
  }
});

test("onboarding teaches the palette shortcut that actually exists", () => {
  const palette = ONBOARDING_WALKTHROUGH.steps.find(step => step.id === "palette");
  assert.equal(palette.focusTarget, "app.commandPalette");
  // The palette is Mod+Slash, not Mod+K; the earlier copy taught the wrong key.
  assert.match(palette.info, /Command\/Ctrl\+\//);
  assert.doesNotMatch(palette.info, /Command\/Ctrl\+K/);
});

test("onboarding enables audio in the step whose narration promises it", () => {
  const stepIds = ONBOARDING_WALKTHROUGH.steps.map(step => step.id);
  assert.deepEqual(stepIds, [
    "welcome",
    "palette",
    "panels",
    "documentation",
    "timeline-info",
    "p5",
    "glsl",
    "audio",
    "physics",
    "finish",
  ]);
  const audio = ONBOARDING_WALKTHROUGH.steps.find(step => step.id === "audio");
  const physics = ONBOARDING_WALKTHROUGH.steps.find(step => step.id === "physics");
  assert.ok(audio.cues.some(cue => cue.commandId === "expressiveSynth.demo.create"));
  assert.ok(!physics.cues.some(cue => cue.commandId === "expressiveSynth.demo.create"));
  // The learner gate prompts on that command, so the narration has to warn first.
  assert.match(audio.narration, /allow/i);
});

test("onboarding checks the pendulum world instead of counting any two objects", () => {
  const physics = ONBOARDING_WALKTHROUGH.steps.find(step => step.id === "physics");
  // scene.exists with only minCount passes as soon as any two elements exist,
  // which the p5 and shader steps already guarantee.
  assert.equal(physics.advance.assertion.type, "physics.state");
  assert.equal(physics.advance.assertion.minSystems, 1);
  assert.equal(physics.advance.assertion.minBodies, 2);
});

test("onboarding introduces Documentation and supersedes the earlier revision", () => {
  const docs = ONBOARDING_WALKTHROUGH.steps.find(step => step.id === "documentation");
  assert.equal(docs.focusTarget, "panel.documentation");
  assert.ok(docs.cues.some(cue => cue.commandId === "panel.open" && cue.args.panelId === "documentation"));
  assert.ok(ONBOARDING_WALKTHROUGH.revision >= 2, "bump the revision so saved patches adopt the fixed tour");
});

test("the Livecode lesson grows one node through parameters and score time", () => {
  assert.deepEqual(LIVECODE_WALKTHROUGH.steps.map(step => step.id), [
    "create-node",
    "write-source",
    "parameters",
    "views",
    "clock",
    "compose",
    "finish",
  ]);
  const create = LIVECODE_WALKTHROUGH.steps[0];
  assert.deepEqual(create.advance.assertion, { type: "scene.exists", kind: "p5", name: "First sketch" });
  const parameters = LIVECODE_WALKTHROUGH.steps.find(step => step.id === "parameters");
  const source = parameters.cues.find(cue => cue.commandId === "livecode.node.update").args.source;
  assert.match(source, /@param count/);
  assert.match(source, /__\.params\.count/);
  const clock = LIVECODE_WALKTHROUGH.steps.find(step => step.id === "clock");
  assert.ok(clock.cues.some(cue => cue.args?.transportMode === "linked"));
  assert.ok(clock.cues.some(cue => cue.commandId === "transport.update"));
});

test("the Physics lesson builds a world, maps it to sound, then hands over", () => {
  assert.deepEqual(PHYSICS_WALKTHROUGH.steps.map(step => step.id), [
    "open-physics",
    "build-gas",
    "play",
    "sound",
    "formulas",
    "debug",
    "your-body",
    "finish",
  ]);
  const build = PHYSICS_WALKTHROUGH.steps.find(step => step.id === "build-gas");
  assert.ok(build.cues.some(cue => cue.commandId === "physics.example.gas"));
  const play = PHYSICS_WALKTHROUGH.steps.find(step => step.id === "play");
  assert.equal(play.advance.assertion.playing, true);
  const sound = PHYSICS_WALKTHROUGH.steps.find(step => step.id === "sound");
  assert.equal(sound.advance.assertion.minMappings, 1);
  // Musical gas authors five wall bodies, so the learner's own body is the sixth.
  const own = PHYSICS_WALKTHROUGH.steps.find(step => step.id === "your-body");
  assert.equal(own.advance.assertion.minBodies, 6);
  assert.equal(own.allowSkip, true);
  assert.ok(own.failureText.length > 0);
});

test("the Timeline lesson separates transport time, node clock, and clips", () => {
  assert.deepEqual(TIMELINE_WALKTHROUGH.steps.map(step => step.id), [
    "open-transport",
    "time-modes",
    "loop",
    "linked-node",
    "quantize",
    "clip",
    "clip-lanes",
    "record",
    "finish",
  ]);
  const modes = TIMELINE_WALKTHROUGH.steps.find(step => step.id === "time-modes");
  assert.equal(modes.cues[0].args.state.displayMode, "beats");
  assert.equal(modes.cues[0].args.state.tempo, 96);
  const linked = TIMELINE_WALKTHROUGH.steps.find(step => step.id === "linked-node");
  assert.equal(linked.cues[0].args.transportMode, "linked");
  const quantize = TIMELINE_WALKTHROUGH.steps.find(step => step.id === "quantize");
  assert.deepEqual(quantize.cues[0].args.state.launchQuantization, { enabled: true, interval: "bar" });
  // "Add clip at playhead" throws without a selection, so it stays a learner action.
  const clip = TIMELINE_WALKTHROUGH.steps.find(step => step.id === "clip");
  assert.equal(clip.cues.length, 0);
  assert.equal(clip.advance.mode, "continue");
  // Object lanes and Clip lanes answer different questions; teaching only the
  // first leaves the timeline half-explained.
  const lanes = TIMELINE_WALKTHROUGH.steps.find(step => step.id === "clip-lanes");
  assert.match(clip.narration, /Object lanes/);
  assert.match(lanes.narration, /Clip lanes/);
  assert.match(lanes.info, /local playhead/);
});

test("bundled marionette case study is discoverable and staged", () => {
  assert.ok(BUNDLED_WALKTHROUGHS.some(item => item.id === MARIONETTE_WALKTHROUGH_ID));
  assert.equal(MARIONETTE_WALKTHROUGH.steps.length, 7);
  assert.deepEqual(MARIONETTE_WALKTHROUGH.steps.map(step => step.id), [
    "construct-costume",
    "inspect-rig",
    "live-pose",
    "wind-chime",
    "mediapipe-second-rig",
    "record-take",
    "review-take",
  ]);
  assert.equal(MARIONETTE_WALKTHROUGH.steps[0].advance.assertion.type, "physics.state");
  assert.equal(MARIONETTE_WALKTHROUGH.steps[3].cues[1].commandId, "physics.mapping.create");
  assert.equal(MARIONETTE_WALKTHROUGH.steps[4].cues[0].args.example, "mediapipe-schlemmer-pose");
  assert.equal(BUNDLED_HELP_CATALOG.find(item => item.id === "physics-marionette")?.walkthroughId, MARIONETTE_WALKTHROUGH_ID);
});

test("every help-catalog entry points at a real walkthrough and step", () => {
  assert.ok(BUNDLED_HELP_CATALOG.some(item => item.id === "onboarding"), "Documentation uses gettingStartedId=onboarding");
  for (const entry of BUNDLED_HELP_CATALOG) {
    assert.ok(entry.title && entry.summary && entry.category, entry.id);
    if (!entry.walkthroughId) continue;
    const walkthrough = byId.get(entry.walkthroughId);
    assert.ok(walkthrough, `${entry.id} references unknown walkthrough ${entry.walkthroughId}`);
    if (entry.stepId) {
      assert.ok(walkthrough.steps.some(step => step.id === entry.stepId), `${entry.id} references unknown step ${entry.stepId}`);
    }
  }
});

test("each priority area has a Getting started entry a learner can start", () => {
  const gettingStarted = BUNDLED_HELP_CATALOG.filter(entry => entry.category === "Getting started");
  assert.deepEqual(gettingStarted.map(entry => entry.walkthroughId), [
    ONBOARDING_WALKTHROUGH_ID,
    LIVECODE_WALKTHROUGH_ID,
    PHYSICS_WALKTHROUGH_ID,
    TIMELINE_WALKTHROUGH_ID,
  ]);
});

test("the wayang lesson builds the rig, sounds it, then hands over both rods", () => {
  assert.deepEqual(WAYANG_WALKTHROUGH.steps.map(step => step.id), [
    "build",
    "read-rig",
    "play",
    "sound",
    "mouse",
    "controller",
    "mediapipe",
    "finish",
  ]);
  const build = WAYANG_WALKTHROUGH.steps[0];
  assert.ok(build.cues.some(cue => cue.commandId === "physics.example.wayang"));
  assert.equal(build.advance.assertion.type, "physics.state");
  const play = WAYANG_WALKTHROUGH.steps.find(step => step.id === "play");
  assert.equal(play.advance.assertion.playing, true);
  // The mouse step is deliberately a learner action: one pointer is one rod.
  const mouse = WAYANG_WALKTHROUGH.steps.find(step => step.id === "mouse");
  assert.equal(mouse.cues.length, 0);
  const controller = WAYANG_WALKTHROUGH.steps.find(step => step.id === "controller");
  assert.equal(controller.cues[0].args.example, "wayang-rod-controller");
  assert.deepEqual(controller.advance.assertion, { type: "scene.exists", kind: "p5", name: "Wayang rods" });
  const mediapipe = WAYANG_WALKTHROUGH.steps.find(step => step.id === "mediapipe");
  assert.ok(mediapipe.cues.some(cue => cue.args?.panelId === "media-input"));
  // Both control paths have to be reachable, and neither may be a hard gate.
  assert.match(mouse.narration, /drag/i);
  assert.match(mediapipe.hint, /mouse/i);
});
