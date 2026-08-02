import { useEffect, useMemo, useRef, useState } from "react";
import { decompressFrames, parseGIF } from "gifuct-js";
import {
  getMediaRuntimeSource,
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
  isMediaStreamElement,
  normalizeMediaStreamConfig,
  resolveHolisticProcessingIntervalMs,
  shouldProcessMediaStream,
  shouldRenderMediaStream,
} from "./mediaStream.js";
import { getHolisticDisplayLayers, interpolateHolisticResult } from "./mediaLandmarkOntology.js";

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
    script.dataset.draweratorMediapipe = "holistic";
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
    window.dispatchEvent(new CustomEvent("drawerator:media-stream-status", { detail }));
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
  const staticDrawnRef = useRef(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sessionUrl = useSessionFileUrl(source.id);
  const url = sessionUrl || source.media.url;
  const isCamera = source.kind === MEDIA_STREAM_KINDS.CAMERA;
  const isImage = !isCamera && source.media.mediaType === "image";
  const isGif = isImage && /\.gif(?:$|[?#])/i.test(url || source.media.fileName);

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
      let index = 0;
      let previous = null;
      let restore = null;
      const patchCanvas = document.createElement("canvas");
      const patchContext = patchCanvas.getContext("2d");
      const advance = () => {
        if (disposed) return;
        const current = sourceRef.current;
        if (current.media.playing === false) {
          timer = window.setTimeout(advance, 50);
          return;
        }
        if (previous?.disposalType === 2) {
          context.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
        } else if (previous?.disposalType === 3 && restore) {
          context.putImageData(restore, 0, 0);
        }
        const frame = frames[index];
        restore = frame.disposalType === 3 ? context.getImageData(0, 0, canvas.width, canvas.height) : null;
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        patchContext.clearRect(0, 0, patchCanvas.width, patchCanvas.height);
        patchContext.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
        context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
        canvas.dataset.gifFrame = String(index);
        if (publishFrame(canvas)) outputRef.current.dataset.sourceFrame = String(index);
        previous = frame;
        const isFinalFrame = index === frames.length - 1;
        if (isFinalFrame && !current.media.loop) return;
        index = (index + 1) % frames.length;
        timer = window.setTimeout(advance, Math.max(20, (frame.delay || 100) / current.media.playbackRate));
      };
      advance();
      publishStatus({ elementId: source.id, kind: "success", message: `Animated GIF ready (${frames.length} frames).` });
    }).catch(error => {
      if (!disposed) publishStatus({ elementId: source.id, kind: "error", message: error?.message || "Animated GIF decoding failed." });
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
    if (!output || !context) return undefined;
    let raf = 0;
    const registered = {
      element: output,
      kind: "canvas",
      isPlaying: () => sourceRef.current.media.playing !== false,
      stream: () => typeof output.captureStream === "function" ? output.captureStream(30) : null,
    };
    const unregister = registerMediaRuntimeSource(source.id, registered);
    const tick = () => {
      const decodedGif = gifCanvasRef.current;
      const input = isGif && decodedGif?.dataset.gifFrame !== undefined ? decodedGif : inputRef.current;
      const staticImage = isImage && !isGif;
      if (sourceRef.current.media.playing !== false && input && (!staticImage || !staticDrawnRef.current) && publishFrame(input)) {
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
  }, [isGif, isImage, source.enabled, source.id]);

  useEffect(() => {
    staticDrawnRef.current = false;
    lastOutputAtRef.current = 0;
  }, [source.id, url, source.crop.x, source.crop.y, source.crop.width, source.crop.height, source.mirror, source.output.fps, source.output.maxDimension]);

  useEffect(() => {
    const media = inputRef.current;
    if (!(media instanceof HTMLVideoElement)) return;
    media.playbackRate = source.media.playbackRate;
    if (source.media.playing === false) {
      media.pause();
      return;
    }
    void media.play().catch(() => {});
  }, [source.media.playbackRate, source.media.playing, url]);

  return <div className="drawerator-media-runtime-source" data-media-runtime-source-id={source.id}>
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
              onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Image could not be loaded. Check the URL and CORS policy." })}
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
                event.currentTarget.playbackRate = source.media.playbackRate;
                if (sourceRef.current.media.playing !== false) void event.currentTarget.play().catch(() => {});
                publishStatus({ elementId: source.id, kind: "success", message: "Media ready." });
              }}
              onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Media could not be loaded. Check the URL, format, and CORS policy." })}
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
      const frame = await captureCanvasSource?.(current.canvas.elementId);
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
  }, [captureCanvasSource, captureRevision, source.canvas.elementId, source.canvas.live, source.enabled, source.id, source.output.fps, source.output.maxDimension]);

  return <div className="drawerator-media-runtime-source" data-media-runtime-source-id={source.id}><canvas ref={outputRef} /></div>;
}

export function MediaSourceRuntimeLayer({ sources, captureCanvasSource, captureRevision = 0 }) {
  return <div className="drawerator-media-runtime-layer" aria-hidden="true">
    {(sources || []).filter(source => source.enabled).map(source => source.kind === MEDIA_STREAM_KINDS.CANVAS
      ? <CanvasMediaSource key={source.id} source={source} captureCanvasSource={captureCanvasSource} captureRevision={captureRevision} />
      : <ProcessedMediaSource key={source.id} source={source} />)}
  </div>;
}

export function MediaRuntimePreview({ sourceId, className = "" }) {
  const canvasRef = useRef(null);
  const lastFrameTimeRef = useRef("");
  useEffect(() => {
    let raf = 0;
    lastFrameTimeRef.current = "";
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
  return <canvas ref={canvasRef} className={`drawerator-media-surface ${className}`.trim()} data-media-preview-source-id={sourceId} />;
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

function HolisticSource({ element, config, sourceAvailable, onResults }) {
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
        enableSegmentation: false,
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
    return <div className="drawerator-media-empty">Choose an input stream</div>;
  }
  if (!sourceAvailable) {
    return <div className="drawerator-media-empty">Input stream is missing</div>;
  }
  return <canvas ref={canvasRef} className="drawerator-media-surface" />;
}

function PreviewChrome({ config, sources, onPatch, onFocusSource }) {
  return <div className="drawerator-media-preview-chrome" onPointerDown={event => event.stopPropagation()}>
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

export default function MediaStreamOverlay({ elements, appState, sources = [], onResults, onPatch, onFocusSource }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const selectedElementIds = appState?.selectedElementIds || {};
  const objects = (elements || []).filter(element => {
    if (!isMediaStreamElement(element)) return false;
    const config = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
    if (config.kind === MEDIA_STREAM_KINDS.PREVIEW) return shouldRenderMediaStream(element);
    return config.kind === MEDIA_STREAM_KINDS.HOLISTIC
      && (shouldRenderMediaStream(element) || shouldProcessMediaStream(element));
  });
  const sourceIds = useMemo(() => new Set(sources.map(source => source.id)), [sources]);

  if (!objects.length) return null;
  return <div className="drawerator-media-stream-overlay" aria-hidden="true">
    {objects.map((element, layerIndex) => {
      const config = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
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
      return <div key={element.id} className={`drawerator-media-stream-frame is-${config.kind} ${selected && config.kind === MEDIA_STREAM_KINDS.PREVIEW ? "selected" : ""}`} data-drawerator-media-stream-id={element.id} style={style}>
        {selected && config.kind === MEDIA_STREAM_KINDS.PREVIEW && <PreviewChrome
          config={config}
          sources={sources}
          onPatch={patch => onPatch?.(element.id, patch)}
          onFocusSource={onFocusSource}
        />}
        <div className="drawerator-media-stream-content">
          {config.kind === MEDIA_STREAM_KINDS.PREVIEW
            ? config.sourceId && sourceIds.has(config.sourceId)
              ? <MediaRuntimePreview sourceId={config.sourceId} />
              : <div className="drawerator-media-empty">Input stream is missing</div>
              : <HolisticSource
                  element={element}
                  config={config}
                  sourceAvailable={sourceIds.has(config.holistic.sourceId)}
                  onResults={onResults}
                />}
        </div>
      </div>;
    })}
  </div>;
}
