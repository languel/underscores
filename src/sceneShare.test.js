import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaFreeSceneJson,
  createSceneShareUrl,
  decodeSceneSharePayload,
  encodeSceneSharePayload,
  fetchSceneSource,
  normalizeSceneSourceText,
  readSceneSharePayload,
  readSceneSourceReference,
  resolveSceneSourceUrl,
} from "./sceneShare.js";

test("share JSON keeps metadata references while omitting binary files", () => {
  const source = JSON.stringify({ files: { image: { dataURL: "data:image/png;base64,not-included" } }, underscores: { authoredState: { mediaSources: [{ media: { url: "https://example.test/clip.mp4", fileName: "clip.mp4" } }] } } });
  const shared = JSON.parse(createMediaFreeSceneJson(source));
  assert.equal(Object.hasOwn(shared, "files"), false);
  assert.equal(shared.underscores.authoredState.mediaSources[0].media.url, "https://example.test/clip.mp4");
});

test("scene share payload round-trips through compressed URL-safe encoding", async () => {
  const source = JSON.stringify({ type: "excalidraw", elements: [{ id: "line", x: 10, y: 20, customData: { role: "curve" } }] });
  const encoded = await encodeSceneSharePayload(source);
  assert.match(encoded, /^1\.[dp]\.[A-Za-z0-9_-]+$/);
  assert.equal(await decodeSceneSharePayload(encoded), source);
});

test("scene share URLs keep the payload in a fragment and replace an old share", async () => {
  const url = await createSceneShareUrl('{"type":"excalidraw","elements":[]}', "https://example.test/studio?mode=canvas#u=old");
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://example.test");
  assert.equal(parsed.pathname, "/studio");
  assert.equal(parsed.search, "?mode=canvas");
  assert.ok(parsed.hash.startsWith("#u=1."));
  assert.equal(readSceneSharePayload(parsed.hash), parsed.hash.slice(3));
});

test("malformed scene share payloads are rejected", async () => {
  await assert.rejects(() => decodeSceneSharePayload("1.d.not-valid!"), /malformed/);
  await assert.rejects(() => decodeSceneSharePayload("2.p.aGVsbG8"), /Unsupported/);
});

test("scene source references resolve relative to the static app and read from the query", () => {
  assert.equal(readSceneSourceReference("?mode=canvas&scene=../../coursework/week-01.md"), "../../coursework/week-01.md");
  assert.equal(resolveSceneSourceUrl("../../coursework/week-01.md", "https://languel.github.io/paideia/static/underscores/"), "https://languel.github.io/paideia/coursework/week-01.md");
  assert.throws(() => resolveSceneSourceUrl("file:///Users/example/scene.json", "https://example.test/"), /HTTP\(S\)/);
});

test("raw JSON and fenced Markdown scene sources normalize to media-free Excalidraw JSON", () => {
  const scene = { type: "excalidraw", elements: [{ id: "line", type: "line" }], files: { local: { dataURL: "data:" } } };
  const raw = JSON.parse(normalizeSceneSourceText(JSON.stringify(scene), "scene.excalidraw"));
  assert.equal(raw.type, "excalidraw");
  assert.equal(raw.elements[0].id, "line");
  assert.equal(Object.hasOwn(raw, "files"), false);

  const markdown = `# Week 01\n\n\`\`\`excalidraw\n${JSON.stringify(scene)}\n\`\`\``;
  const fromMarkdown = JSON.parse(normalizeSceneSourceText(markdown, "scene.md"));
  assert.equal(fromMarkdown.elements[0].id, "line");
  assert.equal(Object.hasOwn(fromMarkdown, "files"), false);
  assert.throws(() => normalizeSceneSourceText("# no scene", "page.md"), /does not contain an Excalidraw JSON document/);
});

test("remote scene sources enforce HTTP response and return source text", async () => {
  const calls = [];
  const result = await fetchSceneSource("scene.json", {
    baseUrl: "https://example.test/studio/",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => '{"type":"excalidraw","elements":[]}' };
    },
  });
  assert.equal(result.url, "https://example.test/studio/scene.json");
  assert.equal(result.text, '{"type":"excalidraw","elements":[]}');
  assert.deepEqual(calls[0].options, { credentials: "omit" });
  await assert.rejects(() => fetchSceneSource("scene.json", {
    baseUrl: "https://example.test/",
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => "" }),
  }), /could not be fetched/);
});
