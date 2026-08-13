import assert from "node:assert/strict";
import test from "node:test";
import { MEDIA_CLIP_FORMATS, resolveRecorderMimeType } from "./mediaClipRecorder.js";

test("recorder MIME selection prefers MP4 and falls back to WebM", () => {
  const mp4Recorder = { isTypeSupported: mime => mime.startsWith("video/mp4") };
  const webmRecorder = { isTypeSupported: mime => mime === "video/webm" };
  assert.equal(resolveRecorderMimeType(MEDIA_CLIP_FORMATS.MP4, mp4Recorder), "video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  assert.equal(resolveRecorderMimeType(MEDIA_CLIP_FORMATS.MP4, webmRecorder), "video/webm");
});

test("audio recorder MIME selection accepts browser audio codecs", () => {
  const recorder = { isTypeSupported: mime => mime === "audio/ogg;codecs=opus" };
  assert.equal(resolveRecorderMimeType(MEDIA_CLIP_FORMATS.AUDIO, recorder), "audio/ogg;codecs=opus");
});

test("GIF recording does not require MediaRecorder", () => {
  assert.equal(resolveRecorderMimeType(MEDIA_CLIP_FORMATS.GIF, null), "");
});
