import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaStreamConfig,
  createMediaBinding,
  createMediaSource,
  inferMediaType,
  isMediaSourceElement,
  MEDIA_STREAM_KINDS,
  MEDIA_BINDING_TYPES,
  normalizeMediaBinding,
  normalizeMediaStreamConfig,
  normalizeMediaSources,
  patchMediaSource,
  patchMediaStreamConfig,
  shouldProcessMediaStream,
  shouldRenderMediaStream,
} from "./mediaStream.js";

test("media stream defaults distinguish acquisition and derived stream kinds", () => {
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.CAMERA).mirror, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.MEDIA).media.loop, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.MEDIA).media.playing, true);
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.CANVAS).canvas, { elementId: "", live: false });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.MEDIA).output, { fps: 30, maxDimension: 0 });
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.PREVIEW).sourceId, "");
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.showHands, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.showSource, false);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.refineFaceLandmarks, true);
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.colors, {
    pose: "#6fa5ff", leftHand: "#6ee795", rightHand: "#ed7ab8", face: "#f2df55",
  });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.faceGroups, {
    outline: true, eyes: true, iris: true, mouth: true, brows: true, remaining: true,
  });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).bindings, []);
});

test("media bindings normalize actor, gate, filtering, and style contracts", () => {
  const pen = createMediaBinding(MEDIA_BINDING_TYPES.FREEDRAW_ACTOR);
  assert.equal(pen.featureId, "left_hand.index_finger_tip");
  assert.equal(pen.gate.featureId, "right_hand.pinch");
  assert.equal(pen.signal.smoothingMs, 40);
  const clamped = normalizeMediaBinding({
    type: "freedraw-actor",
    signal: { smoothingMs: -2, confidenceMin: 4, missingGraceMs: 99999 },
    style: { strokeWidth: 99, opacity: -2 },
  });
  assert.deepEqual(clamped.signal, { smoothingMs: 0, confidenceMin: 1, missingGraceMs: 5000 });
  assert.equal(clamped.style.strokeWidth, 32);
  assert.equal(clamped.style.opacity, 0);
});

test("holistic binding patches remain versioned and nested", () => {
  const current = createMediaStreamConfig("holistic");
  const binding = createMediaBinding("drive-position", { id: "driver-a", targetElementId: "cursor-a" });
  const next = patchMediaStreamConfig(current, { bindings: [binding] });
  assert.equal(next.version, 3);
  assert.equal(next.bindings[0].id, "driver-a");
  assert.equal(next.bindings[0].targetElementId, "cursor-a");
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

test("holistic overlay palette and display controls retain legacy color compatibility", () => {
  const legacy = normalizeMediaStreamConfig({ kind: "holistic", holistic: { color: "#ff0000", showPoints: false, showConnections: false, showIds: true } });
  assert.deepEqual(legacy.holistic.colors, { pose: "#ff0000", leftHand: "#ff0000", rightHand: "#ff0000", face: "#ff0000" });
  assert.equal(legacy.holistic.showPoints, false);
  assert.equal(legacy.holistic.showConnections, false);
  assert.equal(legacy.holistic.showIds, true);
  const patched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { colors: { face: "#000000" } } });
  assert.equal(patched.holistic.colors.face, "#000000");
  assert.equal(patched.holistic.colors.pose, "#6fa5ff");
  const facePatched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { faceGroups: { iris: false } } });
  assert.equal(facePatched.holistic.faceGroups.iris, false);
  assert.equal(facePatched.holistic.faceGroups.outline, true);
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

test("canvas inputs and processed-output limits normalize independently", () => {
  const source = createMediaSource("canvas", {
    canvas: { elementId: "frame-a", live: true },
    output: { fps: 999, maxDimension: 123 },
  });
  const next = patchMediaSource(source, { output: { fps: 12, maxDimension: 960 } });
  assert.equal(source.canvas.elementId, "frame-a");
  assert.equal(source.canvas.live, true);
  assert.equal(source.output.fps, 60);
  assert.equal(source.output.maxDimension, 0);
  assert.deepEqual(next.output, { fps: 12, maxDimension: 960 });
});

test("media sources preserve an independent processed-output play state and rate", () => {
  const source = createMediaSource("media", {
    id: "clip-a",
    media: { url: "https://example.test/loop.gif", playing: false, playbackRate: 3 },
  });
  const next = patchMediaSource(source, { media: { playing: true, playbackRate: 99 } });
  assert.equal(source.media.playing, false);
  assert.equal(next.media.playing, true);
  assert.equal(next.media.playbackRate, 8);
});

test("source element predicate excludes derived streams", () => {
  const camera = { customData: { draweratorMediaStream: createMediaStreamConfig("camera") } };
  const canvas = { customData: { draweratorMediaStream: createMediaStreamConfig("canvas") } };
  const holistic = { customData: { draweratorMediaStream: createMediaStreamConfig("holistic") } };
  const preview = { customData: { draweratorMediaStream: createMediaStreamConfig("preview") } };
  assert.equal(isMediaSourceElement(camera), true);
  assert.equal(isMediaSourceElement(canvas), true);
  assert.equal(isMediaSourceElement(holistic), false);
  assert.equal(isMediaSourceElement(preview), false);
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
  assert.equal(shouldProcessMediaStream({ ...visible, opacity: 0 }), true);
  assert.equal(shouldProcessMediaStream({
    ...visible,
    customData: { ...visible.customData, outlinerHidden: true },
  }), true);
});
