import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaStreamConfig,
  HOLISTIC_SETTINGS_STORAGE_KEY,
  createMediaBinding,
  createMediaSource,
  canUseAsObjectBoundsTarget,
  inferMediaType,
  isMediaSourceElement,
  MEDIA_STREAM_KINDS,
  MEDIA_BINDING_TYPES,
  normalizeMediaBinding,
  normalizeMediaStreamConfig,
  normalizeHolisticSettingsPreset,
  objectBoundsTargetLabel,
  normalizeMediaSources,
  patchMediaSource,
  patchMediaStreamConfig,
  readHolisticSettingsPreset,
  resolveHolisticProcessingIntervalMs,
  shouldProcessMediaStream,
  shouldRenderMediaStream,
  writeHolisticSettingsPreset,
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
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.processingFps, 15);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.performanceMode, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.swapHandedness, true);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.pointSize, 3);
  assert.equal(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.lineThickness, 2);
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.colors, {
    pose: "#6fa5ff", poseBody: "#6fa5ff", poseHead: "#52d5ff", poseLeftHand: "#6ee795", poseRightHand: "#ed7ab8",
    leftHand: "#6ee795", rightHand: "#ed7ab8", face: "#f2df55",
  });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.poseGroups, {
    body: true, head: false, leftHand: false, rightHand: false,
  });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).holistic.faceGroups, {
    outline: true, eyes: true, iris: true, nose: true, mouth: true, brows: true, remaining: false,
  });
  assert.deepEqual(createMediaStreamConfig(MEDIA_STREAM_KINDS.HOLISTIC).bindings, []);
  const unicursal = createMediaStreamConfig(MEDIA_STREAM_KINDS.UNICURSAL);
  assert.equal(unicursal.unicursal.preset, "smooth");
  assert.equal(unicursal.unicursal.geometry.pointBudget, 384);
  assert.equal(unicursal.unicursal.motion.echoCount, 2);
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
  assert.equal(next.version, 8);
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
  assert.equal(normalized.holistic.processingFps, 15);
  assert.equal(normalized.holistic.performanceMode, true);
  assert.equal(normalized.holistic.pointSize, 3);
  assert.equal(normalized.holistic.lineThickness, 2);
});

test("Holistic settings presets round-trip display choices without remembering a source", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(writeHolisticSettingsPreset({
    sourceId: "camera-a",
    swapHandedness: false,
    pointSize: 4.5,
    lineThickness: 1.5,
    poseGroups: { body: true, head: true, leftHand: false, rightHand: false },
  }, storage), true);
  assert.ok(values.has(HOLISTIC_SETTINGS_STORAGE_KEY));
  const preset = readHolisticSettingsPreset(storage);
  assert.equal(preset.sourceId, undefined);
  assert.equal(preset.swapHandedness, false);
  assert.equal(preset.pointSize, 4.5);
  assert.equal(preset.lineThickness, 1.5);
  assert.equal(preset.poseGroups.head, true);
  assert.deepEqual(normalizeHolisticSettingsPreset(preset), preset);
});

test("holistic processing throttle accepts supported persisted rates and rejects arbitrary values", () => {
  const slowed = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { processingFps: 8 } });
  assert.equal(slowed.holistic.processingFps, 8);
  assert.equal(patchMediaStreamConfig(slowed, { holistic: { performanceMode: false } }).holistic.performanceMode, false);
  assert.equal(normalizeMediaStreamConfig({ kind: "holistic", holistic: { processingFps: 17 } }).holistic.processingFps, 15);
});

test("holistic processing interval follows the configured ceiling without latency backoff", () => {
  assert.equal(resolveHolisticProcessingIntervalMs(15), 1000 / 15);
  assert.equal(resolveHolisticProcessingIntervalMs(8), 125);
  assert.equal(resolveHolisticProcessingIntervalMs(17), 1000 / 15);
});

test("holistic overlay palette and display controls retain legacy color compatibility", () => {
  const legacy = normalizeMediaStreamConfig({ kind: "holistic", holistic: { color: "#ff0000", showPoints: false, showConnections: false, showIds: true } });
  assert.deepEqual(legacy.holistic.colors, {
    pose: "#ff0000", poseBody: "#ff0000", poseHead: "#ff0000", poseLeftHand: "#ff0000", poseRightHand: "#ff0000",
    leftHand: "#ff0000", rightHand: "#ff0000", face: "#ff0000",
  });
  assert.equal(legacy.holistic.showPoints, false);
  assert.equal(legacy.holistic.showConnections, false);
  assert.equal(legacy.holistic.showIds, true);
  const patched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { colors: { face: "#000000" } } });
  assert.equal(patched.holistic.colors.face, "#000000");
  assert.equal(patched.holistic.colors.pose, "#6fa5ff");
  const facePatched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { faceGroups: { iris: false } } });
  assert.equal(facePatched.holistic.faceGroups.iris, false);
  assert.equal(facePatched.holistic.faceGroups.outline, true);
  assert.equal(facePatched.holistic.faceGroups.nose, true);
  const posePatched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { poseGroups: { head: false }, showRightHand: false } });
  assert.equal(posePatched.holistic.poseGroups.head, false);
  assert.equal(posePatched.holistic.poseGroups.body, true);
  assert.equal(posePatched.holistic.showRightHand, false);
  const handednessPatched = patchMediaStreamConfig(createMediaStreamConfig("holistic"), { holistic: { swapHandedness: true } });
  assert.equal(handednessPatched.holistic.swapHandedness, true);
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

test("holistic rectangle hosts remain valid object-bounds targets", () => {
  const rectangle = { id: "rect", type: "rectangle" };
  const frame = { id: "frame", type: "frame" };
  const holistic = { id: "holistic", type: "rectangle", customData: { draweratorMediaStream: createMediaStreamConfig("holistic") } };
  const preview = { id: "preview", type: "rectangle", customData: { draweratorMediaStream: createMediaStreamConfig("preview") } };
  const camera = { id: "camera", type: "rectangle", customData: { draweratorMediaStream: createMediaStreamConfig("camera") } };
  assert.equal(canUseAsObjectBoundsTarget(rectangle), true);
  assert.equal(canUseAsObjectBoundsTarget(frame), true);
  assert.equal(canUseAsObjectBoundsTarget(holistic), true);
  assert.equal(canUseAsObjectBoundsTarget(preview), false);
  assert.equal(canUseAsObjectBoundsTarget(camera), false);
  assert.equal(objectBoundsTargetLabel(holistic), "Holistic");
  assert.equal(objectBoundsTargetLabel(rectangle), "rectangle");
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
