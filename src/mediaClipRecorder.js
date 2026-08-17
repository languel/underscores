import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

export const MEDIA_CLIP_FORMATS = Object.freeze({
  GIF: "gif",
  MP4: "mp4",
  ALPHA: "alpha",
  AUDIO: "audio",
});

const RECORDER_MIME_CANDIDATES = Object.freeze({
  [MEDIA_CLIP_FORMATS.MP4]: [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ],
  // VP9 WebM is broadly available in Chromium/Firefox and, unlike MP4,
  // can preserve the transparent video track produced by a canvas. Browser
  // support is still feature-tested at runtime rather than assumed.
  [MEDIA_CLIP_FORMATS.ALPHA]: [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ],
  [MEDIA_CLIP_FORMATS.AUDIO]: [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ],
});

const extensionForMime = mimeType => {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "video/mp4" || mime.startsWith("video/mp4;")) return "mp4";
  if (mime === "audio/mp4" || mime.startsWith("audio/mp4;")) return "m4a";
  if (mime === "audio/ogg" || mime.startsWith("audio/ogg;")) return "ogg";
  return "webm";
};

export const resolveRecorderMimeType = (format, recorderConstructor = globalThis.MediaRecorder) => {
  if (!recorderConstructor || format === MEDIA_CLIP_FORMATS.GIF) return "";
  const candidates = RECORDER_MIME_CANDIDATES[format] || [];
  const supports = typeof recorderConstructor.isTypeSupported === "function"
    ? mimeType => recorderConstructor.isTypeSupported(mimeType)
    : () => true;
  return candidates.find(supports) || "";
};

const tracksForFormat = (stream, format) => {
  if (!stream) return [];
  if (format === MEDIA_CLIP_FORMATS.AUDIO) return stream.getAudioTracks?.() || [];
  if (format === MEDIA_CLIP_FORMATS.ALPHA) return stream.getVideoTracks?.() || [];
  return stream.getTracks?.() || [];
};

const requestFrame = callback => {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(() => callback(performance.now()), 16);
};

const cancelFrame = handle => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
  else clearTimeout(handle);
};

const encodeGif = (frames, width, height, delayMs, { transparent = false } = {}) => {
  if (!frames.length) throw new Error("No frames were captured.");
  const gif = GIFEncoder();
  frames.forEach((frame, index) => {
    const palette = quantize(frame, 256, {
      format: "rgba4444",
      oneBitAlpha: transparent,
      clearAlpha: false,
    });
    const indexed = applyPalette(frame, palette, "rgba4444");
    const transparentIndex = transparent
      ? palette.findIndex(color => Array.isArray(color) && color[3] === 0)
      : -1;
    const hasTransparency = transparentIndex >= 0;
    gif.writeFrame(indexed, width, height, {
      palette,
      delay: delayMs,
      repeat: index === 0 ? 0 : undefined,
      transparent: hasTransparency,
      transparentIndex,
      dispose: hasTransparency ? 2 : 0,
    });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
};

export const createGifClipRecorder = ({ canvas, durationMs = 5000, fps = 15, transparent = false } = {}) => {
  let resolveResult;
  let rejectResult;
  let frameHandle = 0;
  let startedAt = 0;
  let lastSampleAt = -Infinity;
  let stopped = false;
  const frames = [];
  const promise = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelFrame(frameHandle);
    try {
      const context = canvas?.getContext("2d");
      const width = Number(canvas?.width) || 0;
      const height = Number(canvas?.height) || 0;
      if (!context || !width || !height) throw new Error("The selected source has no visual frames to record.");
      const delayMs = Math.max(10, 1000 / Math.max(1, Number(fps) || 15));
      const blob = encodeGif(frames, width, height, delayMs, { transparent });
      resolveResult({
        blob,
        extension: "gif",
        format: MEDIA_CLIP_FORMATS.GIF,
        mimeType: "image/gif",
      });
    } catch (error) {
      rejectResult(error);
    }
  };

  const sample = now => {
    if (stopped) return;
    if (!startedAt) startedAt = now;
    const interval = 1000 / Math.max(1, Number(fps) || 15);
    if (now - lastSampleAt >= interval || !frames.length) {
      const context = canvas?.getContext("2d");
      const width = Number(canvas?.width) || 0;
      const height = Number(canvas?.height) || 0;
      if (context && width && height) frames.push(new Uint8ClampedArray(context.getImageData(0, 0, width, height).data));
      lastSampleAt = now;
    }
    if (now - startedAt >= Math.max(100, Number(durationMs) || 5000)) {
      finish();
      return;
    }
    frameHandle = requestFrame(sample);
  };

  frameHandle = requestFrame(sample);
  return Object.freeze({ promise, stop: finish });
};

export const createMediaRecorderClip = ({ stream, format, durationMs = 5000 } = {}) => {
  const Recorder = globalThis.MediaRecorder;
  let timer = 0;
  let recorder = null;
  let stopped = false;
  let settled = false;
  let resolveResult;
  let rejectResult;
  const chunks = [];
  const promise = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (recorder?.state === "recording") {
      // Some Chromium versions do not flush the final encoded packet until
      // requestData() is called. It is harmless where unsupported and avoids
      // producing a zero-byte clip when a short capture is stopped manually.
      try { recorder.requestData?.(); } catch { /* recorder is already closing */ }
      recorder.stop();
    }
  };

  if (!Recorder) {
    rejectResult(new Error("MediaRecorder is unavailable in this browser."));
    return Object.freeze({ promise, stop: finish });
  }
  const tracks = tracksForFormat(stream, format);
  if (!tracks.length) {
    rejectResult(new Error("The selected source has no recordable media track."));
    return Object.freeze({ promise, stop: finish });
  }
  let recordingStream = stream;
  // Keep the requested output honest: audio-only recordings must not contain
  // a video track, and alpha recordings must not accidentally include source
  // audio. Constructing a fresh MediaStream also avoids mutating the live
  // source stream or stopping tracks owned by the preview.
  if (format === MEDIA_CLIP_FORMATS.AUDIO || format === MEDIA_CLIP_FORMATS.ALPHA) {
    if (typeof globalThis.MediaStream !== "function") {
      rejectResult(new Error("This browser cannot create a filtered recording stream."));
      return Object.freeze({ promise, stop: finish });
    }
    recordingStream = new globalThis.MediaStream(tracks);
  }
  const mimeType = resolveRecorderMimeType(format, Recorder);
  if (format === MEDIA_CLIP_FORMATS.ALPHA && !mimeType) {
    rejectResult(new Error("Transparent video is not supported by this browser. Try GIF or MP4 instead."));
    return Object.freeze({ promise, stop: finish });
  }
  try {
    recorder = mimeType ? new Recorder(recordingStream, { mimeType }) : new Recorder(recordingStream);
  } catch (error) {
    rejectResult(error);
    return Object.freeze({ promise, stop: finish });
  }
  recorder.ondataavailable = event => {
    if (event.data?.size) chunks.push(event.data);
  };
  recorder.onerror = event => {
    if (settled) return;
    settled = true;
    rejectResult(event.error || new Error("Media recording failed."));
  };
  recorder.onstop = () => {
    if (settled) return;
    const actualMimeType = recorder.mimeType || mimeType || (format === MEDIA_CLIP_FORMATS.AUDIO ? "audio/webm" : "video/webm");
    const blob = new Blob(chunks, { type: actualMimeType });
    if (!chunks.length || blob.size === 0) {
      settled = true;
      rejectResult(new Error("The browser produced an empty recording. Check that the source is loaded, playing, and has a live media track."));
      return;
    }
    settled = true;
    resolveResult({
      blob,
      extension: extensionForMime(actualMimeType),
      format,
      mimeType: actualMimeType,
      requestedMimeType: mimeType,
      fallback: (format === MEDIA_CLIP_FORMATS.MP4 && !actualMimeType.startsWith("video/mp4"))
        || (format === MEDIA_CLIP_FORMATS.ALPHA && !/video\/webm(?:;|$)/i.test(actualMimeType)),
    });
  };
  try {
    recorder.start();
  } catch (error) {
    settled = true;
    rejectResult(error);
    return Object.freeze({ promise, stop: finish });
  }
  timer = setTimeout(finish, Math.max(100, Number(durationMs) || 5000));
  return Object.freeze({ promise, stop: finish });
};
