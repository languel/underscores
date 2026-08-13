import test from "node:test";
import assert from "node:assert/strict";
import { buildAICommandCatalog, buildAIAutomationGuide, isAICommandAllowed, parseUnderscoresCommandTags } from "./aiTooling.js";

test("AI command tags preserve ordered calls and isolate malformed JSON", () => {
  const calls = parseUnderscoresCommandTags(`before
    <underscores-command id="scene.create.objects">{"objects":[]}</underscores-command>
    <underscores-command id="bad">not json</underscores-command>
    <underscores-command id="grid.global.update">{"patch":{"appearance":{"visible":true}}}</underscores-command>`);
  assert.deepEqual(calls[0], { id: "scene.create.objects", args: { objects: [] }, error: null });
  assert.equal(calls[1].id, "bad");
  assert.match(calls[1].error, /Invalid command JSON/);
  assert.deepEqual(calls[2].args, { patch: { appearance: { visible: true } } });
});

test("AI catalog exposes only explicitly allowed commands", () => {
  const commands = [
    { id: "scene.create.objects", args: { objects: "object[]" }, ai: { expose: true, description: "Create objects", example: { objects: [] } } },
    { id: "settings.secret", args: { token: "string" } },
  ];
  const catalog = buildAICommandCatalog(commands);
  assert.deepEqual(catalog, [{
    id: "scene.create.objects",
    description: "Create objects",
    args: { objects: "object[]" },
    example: { objects: [] },
  }]);
  assert.match(buildAIAutomationGuide(commands), /scene\.create\.objects/);
  assert.doesNotMatch(buildAIAutomationGuide(commands), /settings\.secret/);
  assert.equal(isAICommandAllowed("scene.create.objects", commands), true);
  assert.equal(isAICommandAllowed("settings.secret", commands), false);
});

test("AI guide injects the relevant script contract only for a script request", () => {
  const commands = [{ id: "script.iannix.create", ai: { expose: true, description: "Create IanniX script" } }];
  const iannixGuide = buildAIAutomationGuide(commands, { prompt: "Write an IanniX score script for three orbits" });
  assert.match(iannixGuide, /IanniX-compatible script contract/);
  assert.match(iannixGuide, /makeWithScript/);
  assert.doesNotMatch(buildAIAutomationGuide(commands, { prompt: "Draw a blue circle" }), /IanniX-compatible script contract/);
});

test("AI catalog can expose a focused p5 frame action", () => {
  const commands = [{
    id: "p5.frame.create",
    args: { source: "p5 instance-mode source?" },
    ai: { expose: true, description: "Create a trusted p5 frame", example: { source: "p.setup = () => {};" } },
  }];
  const guide = buildAIAutomationGuide(commands, { prompt: "Make an animated p5 sketch" });
  assert.match(guide, /p5\.frame\.create/);
  assert.match(guide, /Create a trusted p5 frame/);
  assert.equal(isAICommandAllowed("p5.frame.create", commands), true);
});
