import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_PROVIDER_OPTIONS,
  buildAIChatRequest,
  buildAIModelsRequest,
  cleanAIBaseUrl,
  extractAIStreamText,
  filterAIModels,
  getAIProviderHelp,
  normalizeAISettings,
  parseAIModelList,
  resolveAIRequestBase,
} from "./aiProviders.js";

test("provider catalog contains local and requested remote routes", () => {
  const ids = AI_PROVIDER_OPTIONS.map(provider => provider.id);
  for (const id of ["ollama", "lmstudio", "openrouter", "nvidia", "openai", "anthropic", "github", "google"]) {
    assert.ok(ids.includes(id), id);
  }
});

test("every provider exposes setup guidance and hosted providers include the storage warning", () => {
  for (const provider of AI_PROVIDER_OPTIONS) assert.ok(getAIProviderHelp(provider.id).length > 40, provider.id);
  assert.match(getAIProviderHelp("openrouter"), /localStorage/);
  assert.doesNotMatch(getAIProviderHelp("ollama"), /localStorage/);
  assert.match(getAIProviderHelp("github"), /models:read/);
});

test("model filtering deduplicates entries and sorts provider favorites first", () => {
  assert.deepEqual(filterAIModels(["zeta", "alpha", "zeta", "beta"], { favorites: ["beta"] }), ["beta", "alpha", "zeta"]);
  assert.deepEqual(filterAIModels(["alpha-chat", "alpha-embed", "beta-chat"], { query: "chat" }), ["alpha-chat", "beta-chat"]);
  assert.deepEqual(filterAIModels(["alpha", "beta"], { favorites: ["beta"], favoritesOnly: true }), ["beta"]);
});

test("legacy custom OpenAI-compatible settings migrate without losing credentials", () => {
  const settings = normalizeAISettings({ provider: "openai", url: "http://localhost:9000/v1", apiKey: "secret", model: "local" });
  assert.equal(settings.provider, "openai-compatible");
  assert.equal(settings.apiKeys["openai-compatible"], "secret");
  assert.equal(cleanAIBaseUrl(settings.url, settings.provider), "http://localhost:9000");
});

test("model requests use provider authentication and routes", () => {
  const openrouter = buildAIModelsRequest(normalizeAISettings({ provider: "openrouter", apiKey: "or-key" }));
  assert.equal(openrouter.url, "https://openrouter.ai/api/v1/models");
  assert.equal(openrouter.options.headers.Authorization, "Bearer or-key");

  const google = buildAIModelsRequest(normalizeAISettings({ provider: "google", apiKey: "google-key" }));
  assert.match(google.url, /v1beta\/models/);
  assert.equal(google.options.headers["x-goog-api-key"], "google-key");

  const github = buildAIModelsRequest(normalizeAISettings({ provider: "github", apiKey: "github-token" }));
  assert.equal(github.url, "https://models.github.ai/catalog/models");
  assert.equal(github.options.headers.Authorization, "Bearer github-token");
});

test("hosted NVIDIA requests use the local same-origin relay without changing custom endpoints", () => {
  const hosted = normalizeAISettings({ provider: "nvidia", apiKey: "nvapi-test" });
  assert.equal(resolveAIRequestBase(hosted, "http://localhost:8089"), "http://localhost:8089/api/nvidia");
  assert.equal(buildAIModelsRequest(hosted, "http://localhost:8089").url, "http://localhost:8089/api/nvidia/v1/models");
  assert.equal(buildAIChatRequest(hosted, [], "http://localhost:8089").url, "http://localhost:8089/api/nvidia/v1/chat/completions");
  assert.equal(resolveAIRequestBase(hosted, "https://languel.github.io"), "https://integrate.api.nvidia.com");

  const custom = normalizeAISettings({ provider: "nvidia", url: "http://localhost:9000", apiKey: "nvapi-test" });
  assert.equal(resolveAIRequestBase(custom, "http://localhost:8089"), "http://localhost:9000");
});

test("model list parsing handles OpenAI, Ollama, Google, and GitHub shapes", () => {
  assert.deepEqual(parseAIModelList("openai", { data: [{ id: "gpt-a" }] }), ["gpt-a"]);
  assert.deepEqual(parseAIModelList("ollama", { models: [{ name: "llama" }] }), ["llama"]);
  assert.deepEqual(parseAIModelList("google", { models: [{ name: "models/gemini", supportedGenerationMethods: ["generateContent"] }] }), ["gemini"]);
  assert.deepEqual(parseAIModelList("github", [{ id: "openai/gpt" }]), ["openai/gpt"]);
});

test("native Claude request separates system text and converts embedded images", () => {
  const settings = normalizeAISettings({ provider: "anthropic", apiKey: "claude-key", model: "claude-test" });
  const request = buildAIChatRequest(settings, [
    { role: "system", content: "Draw precisely" },
    { role: "user", content: [{ type: "text", text: "Look" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
  ]);
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["x-api-key"], "claude-key");
  assert.equal(request.options.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(body.system, "Draw precisely");
  assert.equal(body.messages[0].content[1].source.media_type, "image/png");
});

test("native Gemini request maps roles and inline image data", () => {
  const settings = normalizeAISettings({ provider: "google", apiKey: "gemini-key", model: "gemini-test" });
  const request = buildAIChatRequest(settings, [
    { role: "system", content: "Draw precisely" },
    { role: "assistant", content: "Ready" },
    { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } }] },
  ]);
  const body = JSON.parse(request.options.body);
  assert.match(request.url, /gemini-test:streamGenerateContent\?alt=sse$/);
  assert.equal(request.options.headers["x-goog-api-key"], "gemini-key");
  assert.equal(body.contents[0].role, "model");
  assert.equal(body.contents[1].parts[0].inline_data.mime_type, "image/jpeg");
});

test("stream text extraction handles all protocols", () => {
  assert.equal(extractAIStreamText("ollama", { message: { content: "a" } }), "a");
  assert.equal(extractAIStreamText("openai", { choices: [{ delta: { content: "b" } }] }), "b");
  assert.equal(extractAIStreamText("anthropic", { type: "content_block_delta", delta: { text: "c" } }), "c");
  assert.equal(extractAIStreamText("google", { candidates: [{ content: { parts: [{ text: "d" }] } }] }), "d");
});
