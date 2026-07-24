import test from "node:test";
import assert from "node:assert/strict";
import { buildAICommandCatalog, buildAIAutomationGuide, isAICommandAllowed, parseDraweratorCommandTags } from "./aiTooling.js";

test("AI command tags preserve ordered calls and isolate malformed JSON", () => {
  const calls = parseDraweratorCommandTags(`before
    <drawerator-command id="scene.create.objects">{"objects":[]}</drawerator-command>
    <drawerator-command id="bad">not json</drawerator-command>
    <drawerator-command id="grid.global.update">{"patch":{"appearance":{"visible":true}}}</drawerator-command>`);
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
