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
  isMediaStreamElement,
  normalizeMediaStreamConfig,
  shouldProcessMediaStream,
  shouldRenderMediaStream,
} from "./mediaStream.js";

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

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17],
];

const publishStatus = detail => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("drawerator:media-stream-status", { detail }));
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
  if (canvas.width !== sourceWidth || canvas.height !== sourceHeight) {
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
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

function ProcessedMediaSource({ source }) {
  const inputRef = useRef(null);
  const gifCanvasRef = useRef(null);
  const outputRef = useRef(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sessionUrl = useSessionFileUrl(source.id);
  const url = sessionUrl || source.media.url;
  const isCamera = source.kind === MEDIA_STREAM_KINDS.CAMERA;
  const isImage = !isCamera && source.media.mediaType === "image";
  const isGif = isImage && /\.gif(?:$|[?#])/i.test(url || source.media.fileName);

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
        const output = outputRef.current;
        const outputContext = output?.getContext("2d", { alpha: true });
        if (output && outputContext && drawProcessedFrame(outputContext, output, canvas, sourceRef.current)) {
          output.dataset.frameTime = String(performance.now());
          output.dataset.sourceFrame = String(index);
        }
        previous = frame;
        index = (index + 1) % frames.length;
        timer = window.setTimeout(advance, Math.max(20, frame.delay || 100));
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
      stream: () => typeof output.captureStream === "function" ? output.captureStream(30) : null,
    };
    const unregister = registerMediaRuntimeSource(source.id, registered);
    const tick = () => {
      const decodedGif = gifCanvasRef.current;
      const input = isGif && decodedGif?.dataset.gifFrame !== undefined ? decodedGif : inputRef.current;
      if (input && drawProcessedFrame(context, output, input, sourceRef.current)) {
        output.dataset.frameTime = String(performance.now());
        if (input.dataset?.gifFrame !== undefined) output.dataset.sourceFrame = input.dataset.gifFrame;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unregister();
    };
  }, [isGif, source.enabled, source.id]);

  useEffect(() => {
    const media = inputRef.current;
    if (media instanceof HTMLVideoElement) media.playbackRate = source.media.playbackRate;
  }, [source.media.playbackRate, url]);

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
                void event.currentTarget.play().catch(() => {});
                publishStatus({ elementId: source.id, kind: "success", message: "Media ready." });
              }}
              onError={() => publishStatus({ elementId: source.id, kind: "error", message: "Media could not be loaded. Check the URL, format, and CORS policy." })}
            />}
  </div>;
}

export function MediaSourceRuntimeLayer({ sources }) {
  return <div className="drawerator-media-runtime-layer" aria-hidden="true">
    {(sources || []).filter(source => source.enabled).map(source => <ProcessedMediaSource key={source.id} source={source} />)}
  </div>;
}

export function MediaRuntimePreview({ sourceId, className = "" }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const input = getMediaRuntimeSource(sourceId)?.element;
      const output = canvasRef.current;
      if (input?.width && input?.height && output) {
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
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sourceId]);
  return <canvas ref={canvasRef} className={`drawerator-media-surface ${className}`.trim()} data-media-preview-source-id={sourceId} />;
}

const drawLandmarks = (context, landmarks, connections, width, height, color, pointRadius = 2) => {
  if (!Array.isArray(landmarks)) return;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1, Math.min(width, height) / 240);
  for (const [from, to] of connections) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b || a.visibility < 0.2 || b.visibility < 0.2) continue;
    context.beginPath();
    context.moveTo(a.x * width, a.y * height);
    context.lineTo(b.x * width, b.y * height);
    context.stroke();
  }
  landmarks.forEach(point => {
    if (!point || point.visibility < 0.2) return;
    context.beginPath();
    context.arc(point.x * width, point.y * height, pointRadius, 0, Math.PI * 2);
    context.fill();
  });
};

function HolisticSource({ element, config, sourceAvailable, onResults }) {
  const canvasRef = useRef(null);
  const configRef = useRef(config);
  const resultsRef = useRef(null);
  const onResultsRef = useRef(onResults);
  configRef.current = config;
  onResultsRef.current = onResults;

  useEffect(() => {
    let disposed = false;
    let holistic = null;
    let raf = 0;
    let pending = false;
    let lastFrameAt = 0;
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
      if (current.holistic.showPose) drawLandmarks(context, results.poseLandmarks, POSE_CONNECTIONS, width, height, current.holistic.color, 2.4);
      if (current.holistic.showHands) {
        drawLandmarks(context, results.leftHandLandmarks, HAND_CONNECTIONS, width, height, current.holistic.color, 2);
        drawLandmarks(context, results.rightHandLandmarks, HAND_CONNECTIONS, width, height, current.holistic.color, 2);
      }
      if (current.holistic.showFace && Array.isArray(results.faceLandmarks)) {
        context.fillStyle = current.holistic.color;
        results.faceLandmarks.forEach((point, index) => {
          if (index < 468 && index % 8 !== 0) return;
          context.fillRect(point.x * width - 1, point.y * height - 1, 2, 2);
        });
      }
    };

    const process = timestamp => {
      if (disposed) return;
      source = getMediaRuntimeSource(configRef.current.holistic.sourceId);
      const media = source?.element;
      const ready = source?.kind === "canvas" && media?.width > 0 && media?.height > 0;
      if (ready) paint(resultsRef.current);
      if (holistic && ready && !pending && timestamp - lastFrameAt >= 33) {
        pending = true;
        lastFrameAt = timestamp;
        holistic.send({ image: media }).catch(error => {
          publishStatus({ elementId: element.id, kind: "error", message: error?.message || "MediaPipe frame failed." });
        }).finally(() => {
          pending = false;
        });
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
        resultsRef.current = results;
        const result = {
          poseLandmarks: results.poseLandmarks || [],
          leftHandLandmarks: results.leftHandLandmarks || [],
          rightHandLandmarks: results.rightHandLandmarks || [],
          faceLandmarks: results.faceLandmarks || [],
          updatedAt: performance.now(),
          sourceId: configRef.current.holistic.sourceId,
        };
        setMediaRuntimeResult(element.id, result);
        onResultsRef.current?.(element.id, result);
        paint(results);
      });
      publishStatus({ elementId: element.id, kind: "success", message: "MediaPipe Holistic ready." });
    }).catch(error => publishStatus({ elementId: element.id, kind: "error", message: error?.message || "MediaPipe Holistic failed to load." }));

    raf = requestAnimationFrame(process);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearMediaRuntimeResult(element.id);
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

  if (!config.holistic.sourceId) {
    return <div className="drawerator-media-empty">Choose an input stream</div>;
  }
  if (!sourceAvailable) {
    return <div className="drawerator-media-empty">Input stream is missing</div>;
  }
  return <canvas ref={canvasRef} className="drawerator-media-surface" />;
}

export default function MediaStreamOverlay({ elements, appState, sources = [], onResults }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const objects = (elements || []).filter(element => {
    if (!isMediaStreamElement(element)) return false;
    const config = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
    return shouldRenderMediaStream(element)
      || (config.kind === MEDIA_STREAM_KINDS.HOLISTIC && shouldProcessMediaStream(element));
  });
  const sourceIds = useMemo(() => new Set(sources.map(source => source.id)), [sources]);

  if (!objects.length) return null;
  return <div className="drawerator-media-stream-overlay" aria-hidden="true">
    {objects.map((element, layerIndex) => {
      const config = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
      const visible = shouldRenderMediaStream(element);
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
      return <div key={element.id} className={`drawerator-media-stream-frame is-${config.kind}`} data-drawerator-media-stream-id={element.id} style={style}>
        <div className="drawerator-media-stream-content">
          {config.kind === MEDIA_STREAM_KINDS.CAMERA || config.kind === MEDIA_STREAM_KINDS.MEDIA
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
