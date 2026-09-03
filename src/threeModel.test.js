import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { strToU8, zipSync } from "fflate";
import {
  extractThreeModelArchive,
  fitThreeModelRootToFrame,
  getThreeModelExample,
  inferThreeModelFormat,
  isThreeModelFile,
  loadThreeModel,
  normalizeThreeModelSettings,
  THREE_MODEL_EXAMPLES,
} from "./threeModel.js";
import { inferMediaType, isSupportedMediaFile, normalizeMediaStreamConfig, patchMediaStreamConfig } from "./mediaStream.js";

test("model format detection accepts common local and remote extensions", () => {
  assert.equal(inferThreeModelFormat("figure.GLB?download=1"), "glb");
  assert.equal(inferThreeModelFormat("figure.usdz"), "usdz");
  assert.equal(inferThreeModelFormat("models/bunny.zip"), "zip");
  assert.equal(inferThreeModelFormat("archive", ".zip"), "zip");
  assert.equal(inferThreeModelFormat("asset", "obj"), "obj");
  assert.equal(inferThreeModelFormat("notes.txt"), "");
});

test("model files are accepted alongside image, video, and audio inputs", () => {
  assert.equal(isThreeModelFile({ name: "teapot.obj", type: "" }), true);
  assert.equal(isThreeModelFile({ name: "bunny.zip", type: "application/zip" }), true);
  assert.equal(isThreeModelFile({ name: "avatar.bin", type: "application/octet-stream" }), false);
  assert.equal(isSupportedMediaFile({ name: "bunny.zip", type: "application/octet-stream" }), true);
  assert.equal(isSupportedMediaFile({ name: "avatar.glb", type: "application/octet-stream" }), true);
  assert.equal(inferMediaType("https://example.test/avatar.gltf"), "model");
  // A source created with the legacy default media type should still switch
  // to a model when its URL is edited to a recognized model extension.
  assert.equal(inferMediaType("https://example.test/avatar.glb", "video"), "model");
});

test("bounded model archive extraction selects the preferred OBJ and keeps companion files", () => {
  const bytes = zipSync({
    "assets/other.obj": strToU8("o other\nv 0 0 0\n"),
    "assets/bunny.obj": strToU8("mtllib bunny.mtl\no bunny\nv 0 0 0\n"),
    "assets/bunny.mtl": strToU8("newmtl bunny\nKd 0.8 0.8 0.8\n"),
    "assets/bunny.png": new Uint8Array([137, 80, 78, 71]),
  });
  const archive = extractThreeModelArchive(bytes, "assets/bunny.obj");
  assert.equal(archive.objEntry, "assets/bunny.obj");
  assert.match(archive.objText, /mtllib bunny\.mtl/);
  assert.equal(archive.files.has("assets/bunny.mtl"), true);
  assert.equal(archive.files.has("assets/bunny.png"), true);
});

test("model archive extraction reports invalid and OBJ-less archives", () => {
  assert.throws(() => extractThreeModelArchive(new Uint8Array([1, 2, 3])), /not a valid ZIP/);
  const bytes = zipSync({ "readme.txt": strToU8("no model here") });
  assert.throws(() => extractThreeModelArchive(bytes), /does not contain an OBJ/);
});

test("ZIP model loading parses an OBJ from a local data URL", async () => {
  const bytes = zipSync({
    "bunny.obj": strToU8("mtllib bunny.mtl\no bunny\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"),
    "bunny.mtl": strToU8("newmtl bunny\nKd 0.8 0.8 0.8\n"),
  });
  const dataUrl = `data:application/zip;base64,${Buffer.from(bytes).toString("base64")}`;
  const loaded = await loadThreeModel(dataUrl, { format: "zip" });
  assert.equal(loaded.format, "obj");
  assert.equal(loaded.sourceFormat, "zip");
  assert.equal(loaded.archiveEntry, "bunny.obj");
  assert.equal(loaded.root.children.some(child => child.isMesh), true);
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

test("model fitting scales and centers large-coordinate OBJ roots", () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 2));
  mesh.position.set(0, 36, -3);
  root.add(mesh);
  assert.equal(fitThreeModelRootToFrame(root), true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(center.length() < 1e-8);
  assert.equal(Math.max(size.x, size.y, size.z), 2.4);
});

test("bundled model examples expose Khronos and CORS-enabled GitHub resources", () => {
  assert.equal(THREE_MODEL_EXAMPLES.length >= 3, true);
  assert.match(getThreeModelExample("mit-teapot").url, /^https:\/\/raw\.githubusercontent\.com\/.*teapot\.obj$/);
  assert.match(getThreeModelExample("stanford-bunny-zip").url, /^https:\/\/raw\.githubusercontent\.com\/.*stanford-bunny\.obj$/);
  assert.equal(getThreeModelExample("stanford-bunny-zip").format, "obj");
  assert.match(getThreeModelExample("three-walt-head").url, /WaltHead\.obj$/);
  assert.equal(getThreeModelExample("missing"), null);
});
