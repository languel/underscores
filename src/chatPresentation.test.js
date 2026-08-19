import test from "node:test";
import assert from "node:assert/strict";
import { renderChatMessage, stripAssistantCommandTags } from "./chatPresentation.js";

test("assistant command tags stay out of the rendered conversation", () => {
  const source = `Here is the update.\n\n<underscores-command id="livecode.node.update">{"source":"line 1\\nline 2"}</underscores-command>`;
  assert.equal(stripAssistantCommandTags(source), "Here is the update.");
  const html = renderChatMessage({ source, role: "assistant" });
  assert.match(html, /Here is the update/);
  assert.doesNotMatch(html, /underscores-command/);
});

test("chat messages render fenced code and math", () => {
  const html = renderChatMessage({
    source: "Try this:\n\n```glsl\nvec3 color = vec3(1.0);\n```\n\n$E=mc^2$",
    role: "assistant",
  });
  assert.match(html, /livecode-markdown-code-block/);
  assert.match(html, /livecode-code-keyword/);
  assert.match(html, /katex/);
  assert.match(html, /data-chat-action="copy"/);
  assert.doesNotMatch(html, /data-chat-action="paste"/);
  assert.match(html, /data-chat-block-source="vec3%20color%20%3D%20vec3\(1.0\)%3B"/);
});

test("chat text blocks expose their own block actions", () => {
  const html = renderChatMessage({ source: "A **readable** paragraph.\n\n## A heading", role: "assistant" });
  assert.equal((html.match(/data-chat-action="copy"/g) || []).length, 2);
  assert.doesNotMatch(html, /data-chat-action="paste"/);
  assert.match(html, /chat-markdown-text-block/);
});

test("a dangling command tag is hidden while a response streams", () => {
  const html = renderChatMessage({ source: "Working...\n<underscores-command id=\"scene.clear\">", role: "assistant" });
  assert.match(html, /Working/);
  assert.doesNotMatch(html, /underscores-command/);
});

test("command return placeholders do not leak into the visible explanation", () => {
  const source = `Updated the shader.\n\n<underscores-command data-source="model" id='livecode.node.update'>{"elementId":"node-1"}</underscores-command>\n\nundefined`;
  assert.equal(stripAssistantCommandTags(source), "Updated the shader.");
  const html = renderChatMessage({ source, role: "assistant" });
  assert.match(html, /Updated the shader/);
  assert.doesNotMatch(html, />undefined</);
});

test("structured JSON action blocks stay out of the visible explanation", () => {
  const source = `Applied the edit.\n\n\`\`\`json\n{"action":"livecode.node.update","payload":{"elementId":"node-1","source":"function draw() {}"}}\n\`\`\``;
  assert.equal(stripAssistantCommandTags(source), "Applied the edit.");
  const html = renderChatMessage({ source, role: "assistant" });
  assert.match(html, /Applied the edit/);
  assert.doesNotMatch(html, /livecode\.node\.update/);
});
