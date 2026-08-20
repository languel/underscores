import test from "node:test";
import assert from "node:assert/strict";
import { buildAICommandCatalog, buildAIAutomationGuide, isAICommandAllowed, parseStructuredActionBlocks, parseUnderscoresCommandTags } from "./aiTooling.js";

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

test("AI command tags accept JSON-stringified multiline source", () => {
  const payload = JSON.stringify({
    kind: "shader",
    source: '// "screen"\nvoid main() {\n  outColor = vec4(1.0);\n}',
  });
  const [call] = parseUnderscoresCommandTags(`<underscores-command id="livecode.node.update">${payload}</underscores-command>`);
  assert.equal(call.error, null);
  assert.match(call.args.source, /"screen"/);
  assert.match(call.args.source, /void main/);
});

test("AI command tags tolerate harmless XML attribute variation", () => {
  const [call] = parseUnderscoresCommandTags(
    `<underscores-command data-source="model" id='livecode.node.update'>{"elementId":"node-1"}</underscores-command >`,
  );
  assert.deepEqual(call, { id: "livecode.node.update", args: { elementId: "node-1" }, error: null });
});

test("AI command parser accepts a fenced structured action envelope", () => {
  const calls = parseStructuredActionBlocks(`Here is the edit:\n\n\`\`\`json\n${JSON.stringify({
    id: "model-request-1",
    action: "livecode.node.update",
    payload: { elementId: "node-1", source: "function draw() {}" },
  })}\n\`\`\``);
  assert.deepEqual(calls, [{
    id: "livecode.node.update",
    args: { elementId: "node-1", source: "function draw() {}" },
    error: null,
  }]);
  assert.deepEqual(parseUnderscoresCommandTags(`\`\`\`json\n${JSON.stringify({
    action: "scene.clear",
    payload: {},
  })}\n\`\`\``), [{ id: "scene.clear", args: {}, error: null }]);
});

test("AI command parser tolerates flat structured envelopes from local models", () => {
  assert.deepEqual(parseStructuredActionBlocks(`\`\`\`json
${JSON.stringify({
    action: "livecode.node.update",
    elementId: "node-1",
    source: "function draw() {}",
    parameters: {},
    view: "code",
  })}
\`\`\``), [{
    id: "livecode.node.update",
    args: { elementId: "node-1", source: "function draw() {}", parameters: {}, view: "code" },
    error: null,
  }]);
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

test("AI guide makes source escaping and livecode updates explicit", () => {
  const guide = buildAIAutomationGuide([
    { id: "livecode.node.update", args: { elementId: "string", source: "string?" }, ai: { expose: true, description: "Update a Livecode node" } },
  ], { prompt: "Explain and edit this shader" });
  assert.match(guide, /valid JSON/);
  assert.match(guide, /JSON\.stringify/);
  assert.match(guide, /livecode\.node\.update/);
});

test("AI guide explains authored @param declarations and persisted overrides", () => {
  const guide = buildAIAutomationGuide([
    { id: "livecode.node.update", args: { source: "string?", parameters: "object?" }, ai: { expose: true, description: "Update a Livecode node" } },
  ], { prompt: "Expose maxlines as @param on this p5 node" });
  assert.match(guide, /`@param` is an authored source annotation/);
  assert.match(guide, /__\.params\.maxlines/);
  assert.match(guide, /no implicit global `parameters` object/);
  assert.match(guide, /does not create an @param control/);
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
