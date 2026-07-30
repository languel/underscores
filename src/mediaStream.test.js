import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaStreamConfig,
  createMediaSource,
  inferMediaType,
  isMediaSourceElement,
  MEDIA_STREAM_KINDS,
  normalizeMediaStreamConfig,
  normalizeMediaSources,
  patchMediaSource,
  patchMediaStreamConfig,
  shouldRenderMediaStream,
} from "./mediaStream.js";

test("media stream defaults distinguish cameras, media, and derived holistic streams", () => {
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.CAMERA).mirror, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.MEDIA).media.loop, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.showHands, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.showSource, false);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.refineFaceLandmarks, true);
});

test("media stream normalization clamps persisted processor and crop settings", () => {
  const normalized = normalizeMediaStreamConfig({
    kind: "holistic",
    crop: { x: -1, y: 4, width: 0, height: 8 },
    holistic: { modelComplexity: 9, minDetectionConfidence: -2, minTrackingConfidence: 7 },
  });
  assert.deepEqual(normalized.crop, { x: 0, y: 0.99, width: 0.01, height: 1 });
  assert.equal(normalized.holistic.modelComplexity, 2);
  assert.equal(normalized.holistic.minDetectionConfidence, 0);
  assert.equal(normalized.holistic.minTrackingConfidence, 1);
});

test("media patches preserve nested settings and infer image URLs", () => {
  const current = createMediaStreamConfig(MEDIA_STREAM_KINDS.MEDIA, {
    media: { url: "https://example.test/clip.mp4", playbackRate: 2 },
  });
  const next = patchMediaStreamConfig(current, { media: { url: "https://example.test/loop.gif" } });
  assert.equal(next.media.mediaType, "image");
  assert.equal(next.media.playbackRate, 2);
  assert.equal(inferMediaType("photo.webp?size=2"), "image");
});

test("source element predicate excludes derived streams", () => {
  const camera = { customData: { draweratorMediaStream: createMediaStreamConfig("camera") } };
  const holistic = { customData: { draweratorMediaStream: createMediaStreamConfig("holistic") } };
  assert.equal(isMediaSourceElement(camera), true);
  assert.equal(isMediaSourceElement(holistic), false);
});

test("panel sources have stable identities without requiring canvas elements", () => {
  const source = createMediaSource("camera", { id: "camera-a", name: "Desk camera" });
  const patched = patchMediaSource(source, { mirror: false, crop: { x: 0.2, width: 0.6 } });
  assert.equal(patched.id, "camera-a");
  assert.equal(patched.mirror, false);
  assert.equal(patched.crop.x, 0.2);
  assert.equal(patched.crop.width, 0.6);
  assert.deepEqual(normalizeMediaSources([source, source]).map(entry => entry.id), ["camera-a"]);
});

test("holistic output can hide its source feed while retaining a source link", () => {
  const output = createMediaStreamConfig("holistic", {
    holistic: { sourceId: "camera-a", showSource: false },
  });
  assert.equal(output.holistic.sourceId, "camera-a");
  assert.equal(output.holistic.showSource, false);
});

test("canvas visibility hides only the optional stream view", () => {
  const config = createMediaStreamConfig("media", { sourceId: "media-a" });
  const visible = { opacity: 100, customData: { draweratorMediaStream: config } };
  assert.equal(shouldRenderMediaStream(visible), true);
  assert.equal(shouldRenderMediaStream({ ...visible, opacity: 0 }), false);
  assert.equal(shouldRenderMediaStream({
    ...visible,
    customData: { ...visible.customData, outlinerHidden: true },
  }), false);
});
