import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaFreeSceneJson,
  createSceneShareUrl,
  decodeSceneSharePayload,
  encodeSceneSharePayload,
  readSceneSharePayload,
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
