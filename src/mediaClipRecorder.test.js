import assert from "node:assert/strict";
import test from "node:test";
import { createGifClipRecorder, MEDIA_CLIP_FORMATS, resolveRecorderMimeType } from "./mediaClipRecorder.js";

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

test("GIF transparency is opt-in and preserves alpha when requested", async () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 1);
  globalThis.cancelAnimationFrame = handle => clearTimeout(handle);
  const makeCanvas = data => ({
    width: 2,
    height: 1,
    getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(data) }) }),
  });
  const hasGifTransparency = bytes => {
    for (let index = 0; index + 3 < bytes.length; index += 1) {
      if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) {
        return (bytes[index + 3] & 0x01) === 0x01;
      }
    }
    return false;
  };
  try {
    const opaque = createGifClipRecorder({ canvas: makeCanvas([255, 255, 255, 255, 255, 0, 0, 255]), durationMs: 100, fps: 15 });
    setTimeout(() => opaque.stop(), 20);
    const opaqueResult = await opaque.promise;
    assert.equal(hasGifTransparency(new Uint8Array(await opaqueResult.blob.arrayBuffer())), false);

    const transparent = createGifClipRecorder({ canvas: makeCanvas([0, 0, 0, 0, 255, 0, 0, 255]), durationMs: 100, fps: 15, transparent: true });
    setTimeout(() => transparent.stop(), 20);
    const transparentResult = await transparent.promise;
    assert.equal(hasGifTransparency(new Uint8Array(await transparentResult.blob.arrayBuffer())), true);
  } finally {
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
  }
});
