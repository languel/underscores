import { useEffect, useMemo, useRef, useState } from "react";
import { decompressFrames, parseGIF } from "gifuct-js";
import {
  getMediaRuntimeSource,
  getMediaRuntimeResult,
  getMediaSegmentationConsumerIds,
  getMediaSessionFileUrl,
  registerMediaRuntimeSource,
  setMediaRuntimeResult,
  clearMediaRuntimeResult,
  subscribeMediaStreamRuntime,
} from "./mediaStreamRuntime.js";
import {
  MEDIA_STREAM_KINDS,
  HOLISTIC_PERFORMANCE_DISPLAY_FPS,
  HOLISTIC_PERFORMANCE_PROCESSING_FPS,
  isGifMediaSource,
  isMediaStreamElement,
  normalizeMediaStreamConfig,
  resolveHolisticProcessingIntervalMs,
  shouldProcessMediaStream,
  shouldRenderMediaStream,
} from "./mediaStream.js";
import { getHolisticDisplayLayers, interpolateHolisticResult } from "./mediaLandmarkOntology.js";
import {
  applyUnicursalFeatureGrace,
  drawUnicursalFrame,
  generateUnicursalPath,
  smoothUnicursalFrame,
  transformUnicursalFrame,
} from "./unicursalPath.js";
import { audioWaveformPath, createAudioWaveform } from "./audioWaveform.js";

const HOLISTIC_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js";
const HOLISTIC_ASSET_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/";
let holisticLoader = null;

const loadHolistic = () => {
  if (typeof window !== "undefined" && typeof window.Holistic === "function") return Promise.resolve(window.Holistic);
  if (holisticLoader) return holisticLoader;
  holisticLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${HOLISTIC_SCRIPT_URL}"]`);
    const script = existing || document.createElement("script");
    script.src = HOLISTIC_SCRIPT_URL;
    script.async = true;
    script.dataset.underscoresMediapipe = "holistic";
    script.onload = () => typeof window.Holistic === "function"
      ? resolve(window.Holistic)
      : reject(new Error("MediaPipe Holistic did not expose its browser runtime."));
    script.onerror = () => reject(new Error("Could not load MediaPipe Holistic."));
    if (!existing) document.head.appendChild(script);
  }).catch(error => {
    holisticLoader = null;
    throw error;
  });
  return holisticLoader;
};


const publishStatus = detail => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("underscores:media-stream-status", { detail }));
  }
};

// Runtime results are published with the configured semantic handedness so
// bindings, scripts, and snapshots all address the same left/right features.
// The canvas renderer still receives the raw detector result and applies this
// mapping through getHolisticDisplayLayers while painting.
const withConfiguredHandedness = (result, swapHandedness) => {
  if (!swapHandedness) return result;
  return {
    ...result,
    leftHandLandmarks: result?.rightHandLandmarks || [],
    rightHandLandmarks: result?.leftHandLandmarks || [],
  };
};

const captureSegmentationMask = mask => {
  if (!mask) return null;
  const sourceWidth = Number(mask.width || mask.videoWidth) || 0;
  const sourceHeight = Number(mask.height || mask.videoHeight) || 0;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, 192 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(8, Math.round(sourceWidth * scale));
  const height = Math.max(8, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(mask, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return { width, height, data: image.data };
  } catch {
    return null;
  }
};

const useSessionFileUrl = sourceId => {
  const [url, setUrl] = useState(() => getMediaSessionFileUrl(sourceId));
  useEffect(() => subscribeMediaStreamRuntime(detail => {
    if (detail.type === "file" && detail.elementId === sourceId) setUrl(getMediaSessionFileUrl(sourceId));
  }), [sourceId]);
  return url;
};

const getSourceDimensions = element => ({
  width: element?.videoWidth || element?.naturalWidth || element?.width || 0,
  height: element?.videoHeight || element?.naturalHeight || element?.height || 0,
});

const drawProcessedFrame = (context, canvas, input, config) => {
  const dimensions = getSourceDimensions(input);
  if (!dimensions.width || !dimensions.height) return false;
  const crop = config.crop;
  const sourceX = Math.round(crop.x * dimensions.width);
  const sourceY = Math.round(crop.y * dimensions.height);
  const sourceWidth = Math.max(1, Math.round(Math.min(crop.width, 1 - crop.x) * dimensions.width));
  const sourceHeight = Math.max(1, Math.round(Math.min(crop.height, 1 - crop.y) * dimensions.height));
  const maxDimension = Number(config.output?.maxDimension) || 0;
  const scale = maxDimension > 0 ? Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight)) : 1;
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
    canvas.width = outputWidth;
    canvas.height = outputHeight;
  }
  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (config.mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  try {
    context.drawImage(input, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  } catch {
    context.restore();
    return false;
  }
  context.restore();
  return true;
};

const markPublishedFrame = (output, input, previousAt = 0) => {
  const now = performance.now();
  const dimensions = getSourceDimensions(input);
  output.dataset.frameTime = String(now);
  output.dataset.originalWidth = String(dimensions.width || 0);
  output.dataset.originalHeight = String(dimensions.height || 0);
  if (previousAt > 0) output.dataset.liveFps = String(Math.round((1000 / Math.max(1, now - previousAt)) * 10) / 10);
  return now;
};

function ProcessedMediaSource({ source }) {
  const inputRef = useRef(null);
  const gifCanvasRef = useRef(null);
  const outputRef = useRef(null);
  const lastOutputAtRef = useRef(0);
  const lastVideoTickAtRef = useRef(0);
  const staticDrawnRef = useRef(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sessionUrl = useSessionFileUrl(source.id);
  const url = sessionUrl || source.media.url;
  const isCamera = source.kind === MEDIA_STREAM_KINDS.CAMERA;
  const isImage = !isCamera && source.media.mediaType === "image";
  const isAudio = !isCamera && source.media.mediaType === "audio";
  const isGif = isImage && isGifMediaSource(source);

  const publishFrame = input => {
    const output = outputRef.current;
    const context = output?.getContext("2d", { alpha: true });
    const current = sourceRef.current;
    const now = performance.now();
    const interval = 1000 / current.output.fps;
    if (!output || !context || now - lastOutputAtRef.current < interval) return false;
    if (!drawProcessedFrame(context, output, input, current)) return false;
    lastOutputAtRef.current = markPublishedFrame(output, input, lastOutputAtRef.current);
    return true;
  };

  useEffect(() => {
    if (!isCamera || !source.enabled) return undefined;
    let disposed = false;
    let stream = null;
    const video = inputRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      publishStatus({ elementId: source.id, kind: "error", message: "Camera input is not available in this browser." });
      return undefined;
    }
    const constraints = {
      audio: false,
      video: source.camera.deviceId
        ? { deviceId: { exact: source.camera.deviceId } }
        : { facingMode: source.camera.facingMode },
    };
    navigator.mediaDevices.getUserMedia(constraints).then(nextStream => {
      if (disposed) {
        nextStream.getTracks().forEach(track => track.stop());
        return;
      }
      stream = nextStream;
      video.srcObject = stream;
      return video.play();
    }).then(() => {
      if (!disposed) publishStatus({ elementId: source.id, kind: "success", message: "Camera connected." });
    }).catch(error => {
      if (!disposed) publishStatus({ elementId: source.id, kind: "error", message: error?.message || "Camera access failed." });
    });
    return () => {
      disposed = true;
      video.pause();
      video.srcObject = null;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [isCamera, source.camera.deviceId, source.camera.facingMode, source.enabled, source.id]);

  useEffect(() => {
    if (!source.enabled || !isGif || !url) return undefined;
    let disposed = false;
    let timer = 0;
    fetch(url).then(response => {
      if (!response.ok) throw new Error(`GIF request failed (${response.status}).`);
      return response.arrayBuffer();
    }).then(buffer => {
      if (disposed) return;
      const gif = parseGIF(buffer);
      const frames = decompressFrames(gif, true);
      const canvas = gifCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context || !frames.length) throw new Error("The GIF has no decodable frames.");
      canvas.width = gif.lsd.width;
      canvas.height = gif.lsd.height;
      const renderedFrames = [];
      let previous = null;
      let restore = null;
      const patchCanvas = document.createElement("canvas");
      const patchContext = patchCanvas.getContext("2d");
      for (const frame of frames) {
        if (previous?.disposalType === 2) {
          context.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
        } else if (previous?.disposalType === 3 && restore) {
          context.putImageData(restore, 0, 0);
        }
        restore = frame.disposalType === 3 ? context.getImageData(0, 0, canvas.width, canvas.height) : null;
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        patchContext.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
        patchContext.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
        context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
        const snapshot = document.createElement("canvas");
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext("2d")?.drawImage(canvas, 0, 0);
        renderedFrames.push({ canvas: snapshot, delay: frame.delay || 100 });
        previous = frame;
      }
      let index = Number(sourceRef.current.media.playbackRate) < 0 ? renderedFrames.length - 1 : 0;
      let direction = Number(sourceRef.current.media.playbackRate) < 0 ? -1 : 1;
      const drawFrame = () => {
        const rendered = renderedFrames[index];
        if (!rendered) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(rendered.canvas, 0, 0);
        canvas.dataset.gifFrame = String(index);
        if (publishFrame(canvas)) outputRef.current.dataset.sourceFrame = String(index);
      };
      const advance = () => {
        if (disposed) return;
        const current = sourceRef.current;
        const rate = Number(current.media.playbackRate) || 0;
        const nextDirection = rate < 0 ? -1 : 1;
        if (nextDirection !== direction) {
          direction = nextDirection;
          index = direction < 0 ? renderedFrames.length - 1 : 0;
        }
        drawFrame();
        if (current.media.playing === false || rate === 0) {
          timer = window.setTimeout(advance, 50);
          return;
        }
        const rendered = renderedFrames[index];
        const nextIndex = index + direction;
        const isFinalFrame = nextIndex < 0 || nextIndex >= renderedFrames.length;
        if (isFinalFrame && !current.media.loop) {
          timer = window.setTimeout(advance, 50);
          return;
        }
        index = isFinalFrame ? (direction < 0 ? renderedFrames.length - 1 : 0) : nextIndex;
        timer = window.setTimeout(advance, Math.max(20, rendered.delay / Math.abs(rate)));
      };
      advance();
      publishStatus({ elementId: source.id, kind: "success", message: `Animated GIF ready (${frames.length} frames).` });
    }).catch(error => {
      if (!disposed) {
        const message = /fetch|network|cors/i.test(String(error?.message || ""))
          ? "Animated GIF could not be fetched. Remote GIF URLs must allow CORS; choose a local file or a CORS-enabled URL."
          : error?.message || "Animated GIF decoding failed.";
        publishStatus({ elementId: source.id, kind: "error", message });
      }
    });
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [isGif, source.enabled, source.id, url]);

  useEffect(() => {
    if (!source.enabled) return undefined;
    const output = outputRef.current;
    const context = output?.getContext("2d", { alpha: true });
    const media = inputRef.current;
    const runtimeElement = isAudio ? media : output;
    if (!runtimeElement || (!isAudio && (!output || !context))) return undefined;
    let raf = 0;
    const registered = {
      element: runtimeElement,
      kind: isAudio ? "audio" : "canvas",
      isPlaying: () => sourceRef.current.media.playing !== false,
      stream: () => {
        const tracks = [];
        if (!isAudio && typeof output.captureStream === "function") tracks.push(...output.captureStream(sourceRef.current.output.fps).getVideoTracks());
        const mediaStream = media?.captureStream?.();
        if (mediaStream) tracks.push(...mediaStream.getAudioTracks());
        return typeof MediaStream === "function" && tracks.length ? new MediaStream(tracks) : null;
      },
    };
    const unregister = registerMediaRuntimeSource(source.id, registered);
    if (isAudio) return () => unregister();
    const tick = () => {
      const decodedGif = gifCanvasRef.current;
      const input = isGif && decodedGif?.dataset.gifFrame !== undefined ? decodedGif : inputRef.current;
      const staticImage = isImage && !isGif;
      const current = sourceRef.current;
      const video = !isCamera && !isImage && inputRef.current instanceof HTMLVideoElement ? inputRef.current : null;
      const rate = Number(current.media.playbackRate) || 0;
      if (video && rate < 0 && current.media.playing !== false && video.readyState >= 2) {
        const now = performance.now();
        const previous = lastVideoTickAtRef.current || now;
        const elapsed = Math.min(0.1, Math.max(0, (now - previous) / 1000));
        lastVideoTickAtRef.current = now;
        if (elapsed > 0) {
          const duration = Number(video.duration);
          const nextTime = video.currentTime - elapsed * Math.abs(rate);
          if (nextTime <= 0 && current.media.loop && Number.isFinite(duration) && duration > 0) {
            video.currentTime = Math.max(0, duration - 0.001);
          } else {
            video.currentTime = Math.max(0, nextTime);
          }
        }
      } else if (video) {
        lastVideoTickAtRef.current = performance.now();
      }
      if (current.media.playing !== false && input && (!staticImage || !staticDrawnRef.current) && publishFrame(input)) {
        if (staticImage) staticDrawnRef.current = true;
        if (input.dataset?.gifFrame !== undefined) output.dataset.sourceFrame = input.dataset.gifFrame;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unregister();
    };
  }, [isAudio, isCamera, isGif, isImage, source.enabled, source.id]);

  useEffect(() => {
    staticDrawnRef.current = false;
    lastOutputAtRef.current = 0;
  }, [source.id, url, source.crop.x, source.crop.y, source.crop.width, source.crop.height, source.mirror, source.output.fps, source.output.maxDimension]);

  useEffect(() => {
    const media = inputRef.current;
    if (!(media instanceof HTMLVideoElement) && !(media instanceof HTMLAudioElement)) return;
    const rate = Number(source.media.playbackRate) || 0;
    lastVideoTickAtRef.current = 0;
    if (source.media.playing === false || rate <= 0) {
      media.pause();
      return;
    }
    media.playbackRate = rate;
    void media.play().catch(() => {});
  }, [source.media.playbackRate, source.media.playing, url]);

  return <div className="underscores-media-runtime-source" data-media-runtime-source-id={source.id}>
    <canvas ref={outputRef} />
    {isGif && <canvas ref={gifCanvasRef} data-media-gif-decoder={source.id} />}
    {isCamera
      ? <video ref={inputRef} autoPlay muted playsInline />
      : !url
        ? null
        : isImage
          ? <img
              ref={inputRef}
              src={url}
              crossOrigin={sessionUrl ? undefined : "anonymous"}
              alt=""
              onLoad={() => publishStatus({ elementId: source.id, kind: "success", message: "Image loaded." })}
              onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Image could not be loaded. Remote URLs must allow CORS; choose a local file or a CORS-enabled URL." })}
            />
          : isAudio
            ? <audio
                ref={inputRef}
                src={url}
                crossOrigin={sessionUrl ? undefined : "anonymous"}
                autoPlay
                loop={source.media.loop}
                muted={source.media.muted}
                onCanPlay={event => {
                  const rate = Number(sourceRef.current.media.playbackRate) || 0;
                  if (rate > 0) event.currentTarget.playbackRate = rate;
                  if (sourceRef.current.media.playing !== false && rate > 0) void event.currentTarget.play().catch(() => {});
                  else event.currentTarget.pause();
                  publishStatus({ elementId: source.id, kind: "success", message: "Audio ready." });
                }}
                onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Audio could not be loaded. Check the URL, format, and CORS permissions." })}
              />
            : <video
                ref={inputRef}
                src={url}
                crossOrigin={sessionUrl ? undefined : "anonymous"}
                autoPlay
                playsInline
                loop={source.media.loop}
                muted={source.media.muted}
                onCanPlay={event => {
                  const rate = Number(sourceRef.current.media.playbackRate) || 0;
                  if (rate > 0) event.currentTarget.playbackRate = rate;
                  if (sourceRef.current.media.playing !== false && rate > 0) void event.currentTarget.play().catch(() => {});
                  else event.currentTarget.pause();
                  publishStatus({ elementId: source.id, kind: "success", message: "Media ready." });
                }}
                onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Media could not be loaded. Remote URLs must allow CORS; choose a local file or a CORS-enabled URL." })}
              />}
  </div>;
}

function CanvasMediaSource({ source, captureCanvasSource, captureRevision }) {
  const outputRef = useRef(null);
  const sourceRef = useRef(source);
  const lastOutputAtRef = useRef(0);
  sourceRef.current = source;

  useEffect(() => {
    if (!source.enabled) return undefined;
    const output = outputRef.current;
    if (!output) return undefined;
    const unregister = registerMediaRuntimeSource(source.id, {
      element: output,
      kind: "canvas",
      isPlaying: () => sourceRef.current.media.playing !== false,
      stream: () => typeof output.captureStream === "function" ? output.captureStream(sourceRef.current.output.fps) : null,
    });
    let disposed = false;
    let timer = 0;
    const capture = async () => {
      if (disposed || sourceRef.current.media.playing === false) return;
      const current = sourceRef.current;
      const frame = await captureCanvasSource?.(current.canvas.elementId, { background: current.canvas.background });
      if (disposed || !frame) return;
      const context = output.getContext("2d", { alpha: true });
      if (!context || !drawProcessedFrame(context, output, frame, current)) return;
      lastOutputAtRef.current = markPublishedFrame(output, frame, lastOutputAtRef.current);
    };
    void capture();
    if (source.canvas.live) {
      const tick = async () => {
        await capture();
        if (!disposed) timer = window.setTimeout(tick, 1000 / sourceRef.current.output.fps);
      };
      timer = window.setTimeout(tick, 1000 / source.output.fps);
    }
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unregister();
    };
  }, [captureCanvasSource, captureRevision, source.canvas.background, source.canvas.elementId, source.canvas.live, source.enabled, source.id, source.output.fps, source.output.maxDimension]);

  return <div className="underscores-media-runtime-source" data-media-runtime-source-id={source.id}><canvas ref={outputRef} /></div>;
}

export function MediaSourceRuntimeLayer({ sources, activeSourceId = "", connectedSourceIds = [], captureCanvasSource, captureRevision = 0 }) {
  const demandedSourceIds = useMemo(() => new Set([
    activeSourceId,
    ...(connectedSourceIds || []),
  ].filter(Boolean)), [activeSourceId, connectedSourceIds]);
  return <div className="underscores-media-runtime-layer" aria-hidden="true">
    {(sources || []).filter(source => source.enabled && demandedSourceIds.has(source.id)).map(source => source.kind === MEDIA_STREAM_KINDS.CANVAS
      ? <CanvasMediaSource key={source.id} source={source} captureCanvasSource={captureCanvasSource} captureRevision={captureRevision} />
      : <ProcessedMediaSource key={source.id} source={source} />)}
  </div>;
}

export function AudioWaveformPreview({ sourceId, source, className = "" }) {
  const amplitudes = useMemo(() => createAudioWaveform(
    source?.media?.fileName || source?.name || sourceId,
  ), [source?.media?.fileName, source?.name, sourceId]);
  const path = useMemo(() => audioWaveformPath(amplitudes), [amplitudes]);
  const isPlaying = source?.media?.playing !== false;
  const isMuted = source?.media?.muted === true;
  return <div
    className={`underscores-audio-waveform ${isPlaying ? "is-playing" : "is-paused"} ${isMuted ? "is-muted" : ""} ${className}`.trim()}
    data-media-preview-source-id={sourceId}
    aria-label={`${source?.name || "Audio"}${isPlaying ? " playing" : " paused"}${isMuted ? ", muted" : ""}`}
  >
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path className="underscores-audio-waveform-fill" d={path} />
      <path className="underscores-audio-waveform-line" d={path} />
    </svg>
    <span className="underscores-audio-waveform-label">{source?.name || "Audio"}</span>
  </div>;
}

function MediaRuntimeCanvasPreview({ sourceId, className = "" }) {
  const canvasRef = useRef(null);
  const lastFrameTimeRef = useRef("");
  useEffect(() => {
    let raf = 0;
    lastFrameTimeRef.current = "";
    const output = canvasRef.current;
    if (output) {
      output.width = 1;
      output.height = 1;
      output.getContext("2d")?.clearRect(0, 0, 1, 1);
    }
    const tick = () => {
      const input = getMediaRuntimeSource(sourceId)?.element;
      const output = canvasRef.current;
      const frameTime = input?.dataset?.frameTime || "";
      if (input?.width && input?.height && output && frameTime && frameTime !== lastFrameTimeRef.current) {
        if (output.width !== input.width || output.height !== input.height) {
          output.width = input.width;
          output.height = input.height;
        }
        const context = output.getContext("2d");
        context.clearRect(0, 0, output.width, output.height);
        try {
          context.drawImage(input, 0, 0);
        } catch {
          // A source may be replaced between animation frames.
        }
        lastFrameTimeRef.current = frameTime;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sourceId]);
  return <canvas ref={canvasRef} className={`underscores-media-surface ${className}`.trim()} data-media-preview-source-id={sourceId} />;
}

export function MediaRuntimePreview({ sourceId, source = null, className = "" }) {
  return source?.media?.mediaType === "audio"
    ? <AudioWaveformPreview sourceId={sourceId} source={source} className={className} />
    : <MediaRuntimeCanvasPreview sourceId={sourceId} className={className} />;
}

const drawLandmarks = (context, landmarks, connections, width, height, color, pointRadius = 2, options = {}) => {
  if (!Array.isArray(landmarks)) return;
  const visibleIndices = options.indices ? new Set(options.indices) : null;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Number.isFinite(Number(options.lineWidth))
    ? Math.max(0.5, Number(options.lineWidth))
    : Math.max(1, Math.min(width, height) / 240);
  if (options.connections !== false) {
    for (const [from, to] of connections) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (visibleIndices && (!visibleIndices.has(from) || !visibleIndices.has(to))) continue;
      if (!a || !b || a.visibility < 0.2 || b.visibility < 0.2) continue;
      context.beginPath();
      context.moveTo(a.x * width, a.y * height);
      context.lineTo(b.x * width, b.y * height);
      context.stroke();
    }
  }
  if (options.points === false && !options.ids) return;
  context.font = `${Math.max(8, Math.round(Math.min(width, height) / 54))}px Inter, sans-serif`;
  context.textBaseline = "middle";
  landmarks.forEach((point, index) => {
    if (visibleIndices && !visibleIndices.has(index)) return;
    if (!point || point.visibility < 0.2) return;
    if (options.points !== false) {
      context.beginPath();
      context.arc(point.x * width, point.y * height, pointRadius, 0, Math.PI * 2);
      context.fill();
    }
    if (options.ids) context.fillText(String(index), point.x * width + pointRadius + 2, point.y * height);
  });
};

const drawUnicursalLandmarkOverlay = (context, result, frame, width, height, options) => {
  if (!result || !options?.visible) return;
  context.save();
  context.globalAlpha *= options.opacity;
  const holistic = {
    showPose: true,
    showHands: true,
    showLeftHand: true,
    showRightHand: true,
    showFace: true,
    poseGroups: { body: true, head: false, leftHand: false, rightHand: false },
    faceGroups: { outline: true, eyes: true, iris: true, nose: true, mouth: true, brows: true, remaining: false },
    colors: {
      pose: "#6fa5ff", poseBody: "#6fa5ff", leftHand: "#6ee795",
      rightHand: "#ed7ab8", face: "#f2df55",
    },
  };
  if (options.matchInkColor && frame?.options?.ink?.color) {
    Object.keys(holistic.colors).forEach(key => { holistic.colors[key] = frame.options.ink.color; });
  }
  getHolisticDisplayLayers(result, holistic).forEach(layer => drawLandmarks(
    context,
    layer.landmarks,
    layer.connections,
    width,
    height,
    layer.color,
    options.pointSize,
    { points: options.points, connections: options.connections, indices: layer.indices, lineWidth: options.lineWidth },
  ));
  if (options.rawOutline && frame?.silhouette?.points?.length > 1) {
    const color = options.matchInkColor ? frame.options.ink.color : "#ff9f43";
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.5, Number(options.lineWidth) || 1);
    context.setLineDash?.([6, 4]);
    context.beginPath();
    frame.silhouette.points.forEach((item, index) => {
      const x = item.x * width;
      const y = item.y * height;
      if (index) context.lineTo(x, y); else context.moveTo(x, y);
    });
    context.stroke();
    context.setLineDash?.([]);
  }
  context.restore();
};

function HolisticSource({ element, config, sourceAvailable, segmentationRequested = false, onResults }) {
  const canvasRef = useRef(null);
  const configRef = useRef(config);
  const elementRef = useRef(element);
  const resultsRef = useRef(null);
  const paintRef = useRef(() => {});
  const onResultsRef = useRef(onResults);
  configRef.current = config;
  elementRef.current = element;
  onResultsRef.current = onResults;

  useEffect(() => {
    let disposed = false;
    let holistic = null;
    let raf = 0;
    let pending = false;
    let lastFrameAt = 0;
    let lastPublishedFrameTime = 0;
    let lastPaintAt = 0;
    let displayedResult = null;
    let transitionFrom = null;
    let transitionTarget = null;
    let transitionStartedAt = 0;
    let transitionActive = false;
    let source = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    const paint = results => {
      if (!canvas || !context || !source?.element) return;
      const sourceElement = source.element;
      const width = sourceElement.width || 640;
      const height = sourceElement.height || 480;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.clearRect(0, 0, width, height);
      if (configRef.current.holistic.showSource) {
        try {
          context.drawImage(sourceElement, 0, 0, width, height);
        } catch {
          return;
        }
      }
      const current = configRef.current;
      if (!results) return;
      const display = {
        points: current.holistic.showPoints,
        connections: current.holistic.showConnections,
        ids: current.holistic.showIds,
      };
      const hostScale = Math.min(
        width / Math.max(1, Math.abs(Number(elementRef.current.width) || 1)),
        height / Math.max(1, Math.abs(Number(elementRef.current.height) || 1)),
      );
      const pointRadius = current.holistic.pointSize * hostScale / 2;
      const lineWidth = current.holistic.lineThickness * hostScale;
      getHolisticDisplayLayers(results, current.holistic).forEach(layer => {
        drawLandmarks(
          context,
          layer.landmarks,
          layer.connections,
          width,
          height,
          layer.color,
          pointRadius,
          { ...display, indices: layer.indices, lineWidth },
        );
      });
    };
    paintRef.current = paint;

    const process = timestamp => {
      if (disposed) return;
      source = getMediaRuntimeSource(configRef.current.holistic.sourceId);
      const media = source?.element;
      const ready = source?.kind === "canvas" && media?.width > 0 && media?.height > 0;
      const sourcePlaying = source?.isPlaying?.() !== false;
      const publishedFrameTime = Number(media?.dataset?.frameTime) || 0;
      const holisticConfig = configRef.current.holistic;
      const effectiveProcessingFps = holisticConfig.performanceMode
        ? Math.min(holisticConfig.processingFps, HOLISTIC_PERFORMANCE_PROCESSING_FPS)
        : holisticConfig.processingFps;
      const processingInterval = resolveHolisticProcessingIntervalMs(effectiveProcessingFps);
      if (holistic && ready && sourcePlaying && publishedFrameTime > 0 && publishedFrameTime !== lastPublishedFrameTime && !pending && timestamp - lastFrameAt >= processingInterval) {
        pending = true;
        lastFrameAt = timestamp;
        lastPublishedFrameTime = publishedFrameTime;
        if (configRef.current.holistic.showSource) paint(resultsRef.current);
        holistic.send({ image: media }).catch(error => {
          publishStatus({ elementId: element.id, kind: "error", message: error?.message || "MediaPipe frame failed." });
        }).finally(() => {
          pending = false;
        });
      }
      const shouldAnimateDisplay = holisticConfig.performanceMode && transitionActive;
      const shouldRefreshSource = holisticConfig.showSource && resultsRef.current;
      if ((shouldAnimateDisplay || shouldRefreshSource) && timestamp - lastPaintAt >= 1000 / HOLISTIC_PERFORMANCE_DISPLAY_FPS) {
        lastPaintAt = timestamp;
        if (shouldAnimateDisplay) {
          const progress = Math.min(1, (timestamp - transitionStartedAt) / processingInterval);
          displayedResult = interpolateHolisticResult(transitionFrom, transitionTarget, progress);
          paint(displayedResult);
          if (progress >= 1) transitionActive = false;
        } else {
          paint(displayedResult || resultsRef.current);
        }
      }
      raf = requestAnimationFrame(process);
    };

    loadHolistic().then(Holistic => {
      if (disposed) return;
      holistic = new Holistic({ locateFile: file => `${HOLISTIC_ASSET_ROOT}${file}` });
      holistic.setOptions({
        modelComplexity: configRef.current.holistic.modelComplexity,
        smoothLandmarks: true,
        enableSegmentation: segmentationRequested,
        smoothSegmentation: true,
        refineFaceLandmarks: configRef.current.holistic.refineFaceLandmarks,
        minDetectionConfidence: configRef.current.holistic.minDetectionConfidence,
        minTrackingConfidence: configRef.current.holistic.minTrackingConfidence,
      });
      holistic.onResults(results => {
        if (disposed) return;
        const result = {
          poseLandmarks: results.poseLandmarks || [],
          leftHandLandmarks: results.leftHandLandmarks || [],
          rightHandLandmarks: results.rightHandLandmarks || [],
          faceLandmarks: results.faceLandmarks || [],
          segmentation: segmentationRequested ? captureSegmentationMask(results.segmentationMask) : null,
          updatedAt: performance.now(),
          sourceId: configRef.current.holistic.sourceId,
        };
        const previousDisplay = displayedResult || resultsRef.current;
        resultsRef.current = result;
        const configuredResult = withConfiguredHandedness(result, configRef.current.holistic.swapHandedness);
        setMediaRuntimeResult(element.id, configuredResult);
        onResultsRef.current?.(element.id, configuredResult);
        if (configRef.current.holistic.performanceMode && previousDisplay) {
          transitionFrom = previousDisplay;
          transitionTarget = result;
          transitionStartedAt = performance.now();
          transitionActive = true;
        } else {
          displayedResult = result;
          transitionActive = false;
          paint(result);
        }
      });
      publishStatus({ elementId: element.id, kind: "success", message: "MediaPipe Holistic ready." });
    }).catch(error => publishStatus({ elementId: element.id, kind: "error", message: error?.message || "MediaPipe Holistic failed to load." }));

    raf = requestAnimationFrame(process);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearMediaRuntimeResult(element.id);
      paintRef.current = () => {};
      if (holistic?.close) void holistic.close();
    };
  }, [
    config.holistic.minDetectionConfidence,
    config.holistic.minTrackingConfidence,
    config.holistic.modelComplexity,
    config.holistic.refineFaceLandmarks,
    config.holistic.sourceId,
    segmentationRequested,
    element.id,
  ]);

  useEffect(() => {
    if (!resultsRef.current) return;
    const configuredResult = withConfiguredHandedness(resultsRef.current, config.holistic.swapHandedness);
    setMediaRuntimeResult(element.id, configuredResult);
    onResultsRef.current?.(element.id, configuredResult);
  }, [config.holistic.swapHandedness, element.id]);

  const displaySignature = JSON.stringify({
    showSource: config.holistic.showSource,
    poseGroups: config.holistic.poseGroups,
    showLeftHand: config.holistic.showLeftHand,
    showRightHand: config.holistic.showRightHand,
    swapHandedness: config.holistic.swapHandedness,
    showFace: config.holistic.showFace,
    faceGroups: config.holistic.faceGroups,
    colors: config.holistic.colors,
    showPoints: config.holistic.showPoints,
    showConnections: config.holistic.showConnections,
    showIds: config.holistic.showIds,
    pointSize: config.holistic.pointSize,
    lineThickness: config.holistic.lineThickness,
    hostWidth: element.width,
    hostHeight: element.height,
  });
  useEffect(() => {
    paintRef.current(resultsRef.current);
  }, [displaySignature]);

  if (!config.holistic.sourceId) {
    return <div className="underscores-media-empty">Choose an input stream</div>;
  }
  if (!sourceAvailable) {
    return <div className="underscores-media-empty">Input stream is missing</div>;
  }
  return <canvas ref={canvasRef} className="underscores-media-surface" />;
}

function UnicursalSource({ element, config, sourceAvailable, onPathFrame }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const currentRef = useRef(null);
  const targetRef = useRef(null);
  const historyRef = useRef([]);
  const featureStateRef = useRef({});
  const lastSourceAtRef = useRef(0);
  const latestResultRef = useRef(null);
  const invalidatePaintRef = useRef(() => {});
  const configRef = useRef(config);
  const elementRef = useRef(element);
  const onPathFrameRef = useRef(onPathFrame);
  configRef.current = config;
  elementRef.current = element;
  onPathFrameRef.current = onPathFrame;

  useEffect(() => {
    const sourceId = config.unicursal.sourceId;
    if (!sourceId) return undefined;
    featureStateRef.current = {};
    historyRef.current = [];
    const update = result => {
      if (!result) return;
      latestResultRef.current = result;
      const now = performance.now();
      const retained = applyUnicursalFeatureGrace(
        result,
        featureStateRef.current,
        now,
        configRef.current.unicursal.motion.missingGraceMs,
      );
      featureStateRef.current = retained.state;
      const next = generateUnicursalPath({
        result: retained.result,
        segmentation: retained.result.segmentation,
        options: configRef.current.unicursal,
        sourceId,
      });
      if (next.available) lastSourceAtRef.current = now;
      if (!next.available && targetRef.current?.available && now - lastSourceAtRef.current < configRef.current.unicursal.motion.missingGraceMs) return;
      targetRef.current = next;
      const motion = configRef.current.unicursal.motion;
      const history = historyRef.current;
      if (motion.echoes && motion.echoCount > 0) {
        history.push({ frame: next, at: now });
        const cutoff = now - motion.echoDelayMs * (motion.echoCount + 1) - 250;
        while (history.length > motion.echoCount + 4 || history[0]?.at < cutoff) history.shift();
      } else history.length = 0;
      const echoFrames = motion.echoes ? history.slice(0, -1).slice(-motion.echoCount).reverse().map(entry => entry.frame) : [];
      setMediaRuntimeResult(element.id, Object.freeze({ ...next, echoes: Object.freeze(echoFrames) }));
      onPathFrameRef.current?.(element.id, transformUnicursalFrame(next, elementRef.current, "scene"));
      invalidatePaintRef.current();
    };
    update(getMediaRuntimeResult(sourceId));
    return subscribeMediaStreamRuntime(detail => {
      if (detail.type === "result" && detail.elementId === sourceId) update(detail.result);
    });
  }, [config.unicursal.sourceId, element.id]);

  const geometrySignature = JSON.stringify(config.unicursal);
  useEffect(() => {
    const result = getMediaRuntimeResult(config.unicursal.sourceId);
    if (!result) return;
    const retained = applyUnicursalFeatureGrace(
      result,
      featureStateRef.current,
      performance.now(),
      config.unicursal.motion.missingGraceMs,
    );
    featureStateRef.current = retained.state;
    const next = generateUnicursalPath({ result: retained.result, segmentation: retained.result.segmentation, options: config.unicursal, sourceId: config.unicursal.sourceId });
    latestResultRef.current = result;
    targetRef.current = next;
    currentRef.current = next;
    const echoes = getMediaRuntimeResult(element.id)?.echoes || [];
    setMediaRuntimeResult(element.id, Object.freeze({ ...next, echoes }));
    onPathFrameRef.current?.(element.id, transformUnicursalFrame(next, element, "scene"));
    invalidatePaintRef.current();
  }, [geometrySignature, element.id, element.x, element.y, element.width, element.height, element.angle]);

  useEffect(() => {
    let raf = 0;
    let previousAt = performance.now();
    const differs = (a, b) => {
      if (!a?.points || a.points.length !== b?.points?.length) return true;
      for (let index = 0; index < a.points.length; index += 8) {
        if (Math.abs(a.points[index].x - b.points[index].x) > 0.00025 || Math.abs(a.points[index].y - b.points[index].y) > 0.00025) return true;
      }
      return false;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const paint = now => {
      raf = 0;
      const canvas = canvasRef.current;
      const context = contextRef.current || canvas?.getContext("2d", { alpha: true });
      if (!canvas || !context) return;
      contextRef.current = context;
      const renderScale = Math.min(1.5, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(Math.abs(Number(elementRef.current.width) || 1) * renderScale));
      const height = Math.max(1, Math.round(Math.abs(Number(elementRef.current.height) || 1) * renderScale));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.clearRect(0, 0, width, height);
      const background = configRef.current.unicursal.background;
      if (background.mode === "solid") {
        context.save();
        context.globalAlpha = background.opacity / 100;
        context.fillStyle = background.color;
        context.fillRect(0, 0, width, height);
        context.restore();
      }
      const target = targetRef.current;
      if (target) currentRef.current = smoothUnicursalFrame(
        currentRef.current,
        target,
        now - previousAt,
        configRef.current.unicursal.motion.responseMs,
        configRef.current.unicursal.motion,
      );
      previousAt = now;
      const motion = configRef.current.unicursal.motion;
      if (motion.echoes && motion.echoCount > 0) {
        for (let echo = motion.echoCount; echo >= 1; echo -= 1) {
          const desired = now - motion.echoDelayMs * echo;
          let entry = null;
          let delta = Infinity;
          for (let index = historyRef.current.length - 1; index >= 0; index -= 1) {
            const candidateDelta = Math.abs(historyRef.current[index].at - desired);
            if (candidateDelta <= delta) { entry = historyRef.current[index]; delta = candidateDelta; }
            else break;
          }
          if (entry) drawUnicursalFrame(context, entry.frame, width, height, { opacity: motion.echoOpacity * Math.pow(motion.echoDecay, echo - 1) });
        }
      }
      drawUnicursalFrame(context, currentRef.current, width, height);
      drawUnicursalLandmarkOverlay(context, latestResultRef.current, currentRef.current, width, height, configRef.current.unicursal.landmarks);
      if (target && differs(currentRef.current, target)) schedule();
    };
    invalidatePaintRef.current = schedule;
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      invalidatePaintRef.current = () => {};
      clearMediaRuntimeResult(element.id);
    };
  }, [element.id]);

  if (!config.unicursal.sourceId) return <div className="underscores-media-empty">Choose a Holistic source</div>;
  if (!sourceAvailable) return <div className="underscores-media-empty">Holistic source is missing</div>;
  return <canvas ref={canvasRef} className="underscores-media-surface" />;
}

function PreviewChrome({ config, sources, onPatch, onFocusSource }) {
  return <div className="underscores-media-preview-chrome" onPointerDown={event => event.stopPropagation()}>
    <select
      value={config.sourceId || ""}
      aria-label="Preview input source"
      title="Preview input source"
      onChange={event => {
        const source = sources.find(candidate => candidate.id === event.target.value);
        onPatch?.({ sourceId: event.target.value, ...(source ? { name: source.name } : {}) });
      }}
    >
      <option value="">Choose input…</option>
      {sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
    </select>
    <button
      type="button"
      disabled={!config.sourceId}
      onClick={() => onFocusSource?.(config.sourceId)}
      title="Open this input in Media Input"
      aria-label="Open preview input"
    >⌖</button>
  </div>;
}

export default function MediaStreamOverlay({ elements, appState, sources = [], onResults, onPathFrame, onPatch, onFocusSource }) {
  const [segmentationDemandRevision, setSegmentationDemandRevision] = useState(0);
  useEffect(() => subscribeMediaStreamRuntime(detail => {
    if (detail.type === "segmentation-demand") setSegmentationDemandRevision(value => value + 1);
  }), []);
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const selectedElementIds = appState?.selectedElementIds || {};
  const objects = (elements || []).filter(element => {
    if (!isMediaStreamElement(element)) return false;
    const config = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
    if (config.kind === MEDIA_STREAM_KINDS.PREVIEW) return shouldRenderMediaStream(element);
    return [MEDIA_STREAM_KINDS.HOLISTIC, MEDIA_STREAM_KINDS.UNICURSAL].includes(config.kind)
      && (shouldRenderMediaStream(element) || shouldProcessMediaStream(element));
  });
  const sourceIds = useMemo(() => new Set(sources.map(source => source.id)), [sources]);
  const sourcesById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const holisticIds = useMemo(() => new Set((elements || []).filter(element => {
    if (!isMediaStreamElement(element)) return false;
    return normalizeMediaStreamConfig(element.customData.underscoresMediaStream).kind === MEDIA_STREAM_KINDS.HOLISTIC;
  }).map(element => element.id)), [elements]);
  const segmentationSourceIds = useMemo(() => new Set([
    ...getMediaSegmentationConsumerIds(),
    ...(elements || []).flatMap(element => {
    if (!isMediaStreamElement(element)) return [];
    const candidate = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
    return candidate.kind === MEDIA_STREAM_KINDS.UNICURSAL && candidate.enabled && candidate.unicursal.silhouette.mode !== "envelope"
      ? [candidate.unicursal.sourceId]
      : [];
    }),
  ].filter(Boolean)), [elements, segmentationDemandRevision]);

  if (!objects.length) return null;
  return <div className="underscores-media-stream-overlay" aria-hidden="true">
    {objects.map((element, layerIndex) => {
      const config = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
      const previewSource = config.kind === MEDIA_STREAM_KINDS.PREVIEW ? sourcesById.get(config.sourceId) : null;
      const visible = shouldRenderMediaStream(element);
      const selected = Boolean(selectedElementIds[element.id]);
      const elementOpacity = Number(element.opacity);
      const opacity = Math.max(0, Math.min(1, (Number.isFinite(elementOpacity) ? elementOpacity : 100) / 100));
      const style = {
        left: ((Number(element.x) || 0) + scrollX) * zoom,
        top: ((Number(element.y) || 0) + scrollY) * zoom,
        width: Math.max(1, (Number(element.width) || 1) * zoom),
        height: Math.max(1, (Number(element.height) || 1) * zoom),
        opacity,
        visibility: visible ? "visible" : "hidden",
        zIndex: layerIndex,
        transform: `rotate(${Number(element.angle) || 0}rad)`,
        transformOrigin: "center",
      };
      return <div key={element.id} className={`underscores-media-stream-frame is-${config.kind} ${selected && config.kind === MEDIA_STREAM_KINDS.PREVIEW ? "selected" : ""}`} data-underscores-media-stream-id={element.id} style={style}>
        {selected && config.kind === MEDIA_STREAM_KINDS.PREVIEW && <PreviewChrome
          config={config}
          sources={sources}
          onPatch={patch => onPatch?.(element.id, patch)}
          onFocusSource={onFocusSource}
        />}
        <div className="underscores-media-stream-content">
          {config.kind === MEDIA_STREAM_KINDS.PREVIEW
            ? config.sourceId && sourceIds.has(config.sourceId)
              ? previewSource?.media?.mediaType === "audio"
                ? <AudioWaveformPreview sourceId={config.sourceId} source={previewSource} />
                : <MediaRuntimePreview sourceId={config.sourceId} source={previewSource} />
              : <div className="underscores-media-empty">Input stream is missing</div>
            : config.kind === MEDIA_STREAM_KINDS.UNICURSAL
              ? <UnicursalSource
                  element={element}
                  config={config}
                  sourceAvailable={holisticIds.has(config.unicursal.sourceId)}
                  onPathFrame={onPathFrame}
                />
              : <HolisticSource
                  element={element}
                  config={config}
                  sourceAvailable={sourceIds.has(config.holistic.sourceId)}
                  segmentationRequested={segmentationSourceIds.has(element.id)}
                  onResults={onResults}
                />}
        </div>
      </div>;
    })}
  </div>;
}
