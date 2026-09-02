import assert from "node:assert/strict";
import test from "node:test";
import {
  getThreeModelExample,
  inferThreeModelFormat,
  isThreeModelFile,
  normalizeThreeModelSettings,
  THREE_MODEL_EXAMPLES,
} from "./threeModel.js";
import { inferMediaType, isSupportedMediaFile, normalizeMediaStreamConfig, patchMediaStreamConfig } from "./mediaStream.js";

test("model format detection accepts common local and remote extensions", () => {
  assert.equal(inferThreeModelFormat("figure.GLB?download=1"), "glb");
  assert.equal(inferThreeModelFormat("figure.usdz"), "usdz");
  assert.equal(inferThreeModelFormat("asset", "obj"), "obj");
  assert.equal(inferThreeModelFormat("notes.txt"), "");
});

test("model files are accepted alongside image, video, and audio inputs", () => {
  assert.equal(isThreeModelFile({ name: "teapot.obj", type: "" }), true);
  assert.equal(isThreeModelFile({ name: "avatar.bin", type: "application/octet-stream" }), false);
  assert.equal(isSupportedMediaFile({ name: "avatar.glb", type: "application/octet-stream" }), true);
  assert.equal(inferMediaType("https://example.test/avatar.gltf"), "model");
  // A source created with the legacy default media type should still switch
  // to a model when its URL is edited to a recognized model extension.
  assert.equal(inferMediaType("https://example.test/avatar.glb", "video"), "model");
});

test("model settings clamp morph values and playback state", () => {
  const settings = normalizeThreeModelSettings({ playbackRate: 99, morphTargets: { smile: 2, frown: -1 } });
  assert.equal(settings.playbackRate, 8);
  assert.deepEqual(settings.morphTargets, { smile: 1, frown: 0 });
  assert.equal(normalizeMediaStreamConfig({ media: { mediaType: "model" } }).model.playing, true);
});

test("model source patches preserve animation settings and merge morph targets", () => {
  const source = normalizeMediaStreamConfig({
    kind: "media",
    media: { url: "model.glb", mediaType: "model" },
    model: { animation: "Walk", morphTargets: { smile: 0.2, frown: 0.1 } },
  });
  const patched = patchMediaStreamConfig(source, { model: { playing: false, morphTargets: { smile: 0.8, blink: 0.4 } } });
  assert.equal(patched.model.animation, "Walk");
  assert.equal(patched.model.playing, false);
  assert.deepEqual(patched.model.morphTargets, { smile: 0.8, frown: 0.1, blink: 0.4 });
});

test("bundled model examples expose Khronos and MIT resources", () => {
  assert.equal(THREE_MODEL_EXAMPLES.length >= 3, true);
  assert.match(getThreeModelExample("mit-teapot").url, /teapot\.obj$/);
  assert.equal(getThreeModelExample("missing"), null);
});
