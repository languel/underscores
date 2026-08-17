import { normalizeUnicursalOptions } from "./unicursalPath.js";

export const MEDIA_STREAM_KINDS = Object.freeze({
  CAMERA: "camera",
  MEDIA: "media",
  CANVAS: "canvas",
  PREVIEW: "preview",
  HOLISTIC: "holistic",
  UNICURSAL: "unicursal",
});

export const MEDIA_STREAM_VERSION = 8;
// Reserved canvas-source target used by the media panel to request a
// composition of the complete scene instead of an individual frame.
export const CANVAS_CAPTURE_TARGET_FRAME_ALL = "__frame_all__";
export const MEDIA_SOURCE_STORAGE_KEY = "underscores_media_source_catalog_v1";
export const MEDIA_ACTORS_ARMED_STORAGE_KEY = "underscores_media_actors_armed_v1";
export const HOLISTIC_SETTINGS_STORAGE_KEY = "underscores_holistic_settings_v1";
export const HOLISTIC_PROCESSING_FPS_OPTIONS = Object.freeze([30, 24, 15, 12, 8, 4, 1]);
export const HOLISTIC_PERFORMANCE_PROCESSING_FPS = 8;
export const HOLISTIC_PERFORMANCE_DISPLAY_FPS = 30;

export const resolveHolisticProcessingIntervalMs = processingFps => {
  const fps = HOLISTIC_PROCESSING_FPS_OPTIONS.includes(Number(processingFps))
    ? Number(processingFps)
    : 15;
  return 1000 / fps;
};

export const MEDIA_BINDING_TYPES = Object.freeze({
  DRIVE_POSITION: "drive-position",
  FREEDRAW_ACTOR: "freedraw-actor",
});

const DEFAULT_CROP = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
const DEFAULT_HOLISTIC_COLORS = Object.freeze({
  pose: "#6fa5ff",
  poseBody: "#6fa5ff",
  poseHead: "#52d5ff",
  poseLeftHand: "#6ee795",
  poseRightHand: "#ed7ab8",
  leftHand: "#6ee795",
  rightHand: "#ed7ab8",
  face: "#f2df55",
});
const DEFAULT_POSE_GROUPS = Object.freeze({ body: true, head: false, leftHand: false, rightHand: false });
const DEFAULT_FACE_GROUPS = Object.freeze({ outline: true, eyes: true, iris: true, nose: true, mouth: true, brows: true, remaining: false });
const DEFAULT_OUTPUT = Object.freeze({ fps: 30, maxDimension: 0 });

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

const cleanString = (value, fallback = "") => {
  const next = String(value ?? "").trim();
  return next || fallback;
};

const createBindingId = () => `media_binding_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const createMediaBinding = (type = MEDIA_BINDING_TYPES.DRIVE_POSITION, overrides = {}) =>
  normalizeMediaBinding({
    version: 1,
    id: createBindingId(),
    type,
    name: type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "Pinch pen" : "Position driver",
    enabled: true,
    featureId: type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "left_hand.index_finger_tip" : "right_hand.palm",
    targetElementId: "",
    anchor: "center",
    offset: { x: 0, y: 0 },
    gate: {
      featureId: type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "right_hand.pinch" : "",
      comparator: "active",
      threshold: 0.5,
    },
    signal: {
      smoothingMs: 40,
      confidenceMin: 0.5,
      missingGraceMs: 120,
    },
    style: {
      strokeColor: "",
      strokeWidth: 2,
      opacity: 100,
    },
    visualize: true,
    trace: false,
    ...overrides,
  });

export const normalizeMediaBinding = value => {
  const source = value && typeof value === "object" ? value : {};
  const type = Object.values(MEDIA_BINDING_TYPES).includes(source.type)
    ? source.type
    : MEDIA_BINDING_TYPES.DRIVE_POSITION;
  const offset = source.offset && typeof source.offset === "object" ? source.offset : {};
  const gate = source.gate && typeof source.gate === "object" ? source.gate : {};
  const signal = source.signal && typeof source.signal === "object" ? source.signal : {};
  const style = source.style && typeof source.style === "object" ? source.style : {};
  return {
    version: 1,
    id: cleanString(source.id, createBindingId()),
    type,
    name: cleanString(source.name, type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "Pinch pen" : "Position driver"),
    enabled: source.enabled !== false,
    featureId: cleanString(source.featureId, type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "left_hand.index_finger_tip" : "right_hand.palm"),
    targetElementId: cleanString(source.targetElementId),
    anchor: ["center", "top-left", "top", "bottom", "left", "right"].includes(source.anchor) ? source.anchor : "center",
    offset: {
      x: clamp(offset.x, -100000, 100000, 0),
      y: clamp(offset.y, -100000, 100000, 0),
    },
    gate: {
      featureId: cleanString(gate.featureId, type === MEDIA_BINDING_TYPES.FREEDRAW_ACTOR ? "right_hand.pinch" : ""),
      comparator: ["active", "above", "below"].includes(gate.comparator) ? gate.comparator : "active",
      threshold: clamp(gate.threshold, -100000, 100000, 0.5),
    },
    signal: {
      smoothingMs: clamp(signal.smoothingMs, 0, 1000, 40),
      confidenceMin: clamp(signal.confidenceMin, 0, 1, 0.5),
      missingGraceMs: clamp(signal.missingGraceMs, 0, 5000, 120),
    },
    style: {
      strokeColor: /^#[0-9a-f]{6}$/i.test(String(style.strokeColor || "")) ? String(style.strokeColor).toLowerCase() : "",
      strokeWidth: clamp(style.strokeWidth, 1, 32, 2),
      opacity: clamp(style.opacity, 0, 100, 100),
    },
    visualize: source.visualize !== false,
    trace: source.trace === true,
  };
};

export const normalizeMediaBindings = value => {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  return entries.map(normalizeMediaBinding).filter(binding => {
    if (seen.has(binding.id)) return false;
    seen.add(binding.id);
    return true;
  });
};

export const inferMediaType = (url = "", explicit = "") => {
  if (["image", "video", "audio"].includes(explicit)) return explicit;
  const source = String(url).split(/[?#]/)[0].toLowerCase();
  if (/\.(gif|png|jpe?g|webp|avif|svg)$/.test(source)) return "image";
  if (/\.(mp3|wav|m4a|aac|flac|oga|ogg|opus)$/.test(source)) return "audio";
  return "video";
};

// Local files are represented by session-scoped blob URLs at runtime. Those
// URLs intentionally do not retain the original extension, so GIF detection
// must consider the authored file name as well as the current URL.
export const isGifMediaSource = value => {
  const media = value?.media && typeof value.media === "object" ? value.media : value;
  return [media?.url, media?.fileName]
    .some(candidate => /\.gif(?:$|[?#])/i.test(String(candidate || "")));
};

export const isSupportedMediaFile = file => {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "");
  return Boolean(file) && (
    type.startsWith("image/")
    || type.startsWith("video/")
    || type.startsWith("audio/")
    || /\.(gif|png|jpe?g|webp|avif|svg|mp4|webm|mov|m4v|ogg|mp3|wav|m4a|aac|flac|oga|opus)$/i.test(name)
  );
};

export const createMediaStreamConfig = (kind = MEDIA_STREAM_KINDS.MEDIA, overrides = {}) =>
  normalizeMediaStreamConfig({
    version: MEDIA_STREAM_VERSION,
    kind,
    sourceId: "",
    name: kind === MEDIA_STREAM_KINDS.CAMERA
      ? "Camera"
      : kind === MEDIA_STREAM_KINDS.CANVAS
        ? "Canvas"
        : kind === MEDIA_STREAM_KINDS.PREVIEW
          ? "Preview"
      : kind === MEDIA_STREAM_KINDS.HOLISTIC
        ? "Holistic"
      : kind === MEDIA_STREAM_KINDS.UNICURSAL
        ? "Unicursal portrait"
        : "Media",
    enabled: true,
    mirror: kind === MEDIA_STREAM_KINDS.CAMERA,
    crop: DEFAULT_CROP,
    camera: { deviceId: "", facingMode: "user" },
    media: { url: "", mediaType: "video", fileName: "", loop: true, muted: true, playing: true, playbackRate: 1, linkTransport: false },
    canvas: { elementId: "", live: false, background: "theme" },
    output: DEFAULT_OUTPUT,
    holistic: {
      sourceId: "",
      sourceElementId: "",
      showSource: false,
      // Retained for compatibility with existing scenes and scripts. New UI
      // controls use the finer poseGroups and independent hand toggles.
      showPose: true,
      showHands: true,
      poseGroups: DEFAULT_POSE_GROUPS,
      showLeftHand: true,
      showRightHand: true,
      swapHandedness: true,
      showFace: true,
      faceGroups: DEFAULT_FACE_GROUPS,
      refineFaceLandmarks: true,
      color: "#52d5ff",
      colors: DEFAULT_HOLISTIC_COLORS,
      showPoints: true,
      showConnections: true,
      showIds: false,
      pointSize: 3,
      lineThickness: 2,
      processingFps: 15,
      performanceMode: true,
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    },
    unicursal: {
      sourceId: "",
      ...normalizeUnicursalOptions(),
      includeEchoesInSnapshot: false,
    },
    bindings: [],
    ...overrides,
  });

export const normalizeMediaStreamConfig = value => {
  const source = value && typeof value === "object" ? value : {};
  const kind = Object.values(MEDIA_STREAM_KINDS).includes(source.kind)
    ? source.kind
    : MEDIA_STREAM_KINDS.MEDIA;
  const crop = source.crop && typeof source.crop === "object" ? source.crop : {};
  const camera = source.camera && typeof source.camera === "object" ? source.camera : {};
  const media = source.media && typeof source.media === "object" ? source.media : {};
  const canvas = source.canvas && typeof source.canvas === "object" ? source.canvas : {};
  const output = source.output && typeof source.output === "object" ? source.output : {};
  const holistic = source.holistic && typeof source.holistic === "object" ? source.holistic : {};
  const unicursal = source.unicursal && typeof source.unicursal === "object" ? source.unicursal : {};
  const holisticColors = holistic.colors && typeof holistic.colors === "object" ? holistic.colors : {};
  const poseGroups = holistic.poseGroups && typeof holistic.poseGroups === "object" ? holistic.poseGroups : {};
  const faceGroups = holistic.faceGroups && typeof holistic.faceGroups === "object" ? holistic.faceGroups : {};
  const mediaUrl = cleanString(media.url);
  const legacyColor = /^#[0-9a-f]{6}$/i.test(String(holistic.color || "")) ? String(holistic.color).toLowerCase() : "#52d5ff";
  const resolveHolisticColor = (...families) => {
    for (const family of families) {
      const explicit = String(holisticColors[family] || "");
      if (/^#[0-9a-f]{6}$/i.test(explicit)) return explicit.toLowerCase();
    }
    // Preserve a deliberately authored legacy single-color overlay, while
    // letting uncustomized legacy objects adopt the semantic palette.
    return legacyColor !== "#52d5ff" ? legacyColor : DEFAULT_HOLISTIC_COLORS[families[0]];
  };
  const showPose = holistic.showPose !== false;
  const showHands = holistic.showHands !== false;
  return {
    version: MEDIA_STREAM_VERSION,
    kind,
    sourceId: cleanString(source.sourceId),
    name: cleanString(source.name, kind === MEDIA_STREAM_KINDS.CAMERA ? "Camera" : kind === MEDIA_STREAM_KINDS.CANVAS ? "Canvas" : kind === MEDIA_STREAM_KINDS.PREVIEW ? "Preview" : kind === MEDIA_STREAM_KINDS.HOLISTIC ? "Holistic" : kind === MEDIA_STREAM_KINDS.UNICURSAL ? "Unicursal portrait" : "Media"),
    enabled: source.enabled !== false,
    mirror: source.mirror === undefined ? kind === MEDIA_STREAM_KINDS.CAMERA : Boolean(source.mirror),
    crop: {
      x: clamp(crop.x, 0, 0.99, DEFAULT_CROP.x),
      y: clamp(crop.y, 0, 0.99, DEFAULT_CROP.y),
      width: clamp(crop.width, 0.01, 1, DEFAULT_CROP.width),
      height: clamp(crop.height, 0.01, 1, DEFAULT_CROP.height),
    },
    camera: {
      deviceId: cleanString(camera.deviceId),
      facingMode: camera.facingMode === "environment" ? "environment" : "user",
    },
    media: {
      url: mediaUrl,
      mediaType: inferMediaType(mediaUrl || media.fileName, media.mediaType),
      fileName: cleanString(media.fileName),
      loop: media.loop !== false,
      muted: media.muted !== false,
      // Input sources run independently from the global score transport.  A
      // paused source keeps its most recently processed frame available to
      // MediaPipe and canvas hosts, rather than tearing down its runtime.
      playing: media.playing !== false,
      // Signed rates are intentional: positive plays forward, negative plays
      // backward, and zero holds the current decoded frame.
      playbackRate: clamp(media.playbackRate, -8, 8, 1),
      // Media inputs can either run independently or follow the shared score
      // transport. The latter is opt-in so catalog sources remain dormant.
      linkTransport: media.linkTransport === true,
    },
    canvas: {
      elementId: cleanString(canvas.elementId),
      live: canvas.live === true,
      // Canvas captures follow the board's visible theme by default. GIF
      // recording can temporarily request an alpha-only capture.
      background: canvas.background === "transparent" ? "transparent" : "theme",
    },
    output: {
      fps: Math.round(clamp(output.fps, 1, 60, DEFAULT_OUTPUT.fps)),
      // 0 retains the source's native dimensions. Positive values constrain
      // the long edge, keeping visual quality and MediaPipe cost explicit.
      maxDimension: [0, 320, 480, 640, 960, 1280, 1920].includes(Number(output.maxDimension)) ? Number(output.maxDimension) : DEFAULT_OUTPUT.maxDimension,
    },
    holistic: {
      sourceId: cleanString(holistic.sourceId || holistic.sourceElementId),
      sourceElementId: cleanString(holistic.sourceElementId),
      showSource: holistic.showSource === true,
      showPose,
      showHands,
      poseGroups: {
        body: showPose && poseGroups.body !== false,
        head: showPose && poseGroups.head === true,
        leftHand: showPose && poseGroups.leftHand === true,
        rightHand: showPose && poseGroups.rightHand === true,
      },
      showLeftHand: showHands && holistic.showLeftHand !== false,
      showRightHand: showHands && holistic.showRightHand !== false,
      swapHandedness: holistic.swapHandedness !== false,
      showFace: holistic.showFace !== false,
      faceGroups: {
        outline: faceGroups.outline !== false,
        eyes: faceGroups.eyes !== false,
        iris: faceGroups.iris !== false,
        nose: faceGroups.nose !== false,
        mouth: faceGroups.mouth !== false,
        brows: faceGroups.brows !== false,
        remaining: faceGroups.remaining === true,
      },
      refineFaceLandmarks: holistic.refineFaceLandmarks !== false,
      color: legacyColor,
      colors: {
        pose: resolveHolisticColor("pose"),
        poseBody: resolveHolisticColor("poseBody", "pose"),
        poseHead: resolveHolisticColor("poseHead", "pose"),
        poseLeftHand: resolveHolisticColor("poseLeftHand", "pose"),
        poseRightHand: resolveHolisticColor("poseRightHand", "pose"),
        leftHand: resolveHolisticColor("leftHand"),
        rightHand: resolveHolisticColor("rightHand"),
        face: resolveHolisticColor("face"),
      },
      showPoints: holistic.showPoints !== false,
      showConnections: holistic.showConnections !== false,
      showIds: holistic.showIds === true,
      pointSize: clamp(holistic.pointSize, 1, 20, 3),
      lineThickness: clamp(holistic.lineThickness, 0.5, 12, 2),
      processingFps: HOLISTIC_PROCESSING_FPS_OPTIONS.includes(Number(holistic.processingFps))
        ? Number(holistic.processingFps)
        : 15,
      performanceMode: holistic.performanceMode !== false,
      modelComplexity: Math.round(clamp(holistic.modelComplexity, 0, 2, 0)),
      minDetectionConfidence: clamp(holistic.minDetectionConfidence, 0, 1, 0.5),
      minTrackingConfidence: clamp(holistic.minTrackingConfidence, 0, 1, 0.5),
    },
    unicursal: {
      ...normalizeUnicursalOptions(unicursal),
      sourceId: cleanString(unicursal.sourceId),
      includeEchoesInSnapshot: unicursal.includeEchoesInSnapshot === true,
    },
    bindings: kind === MEDIA_STREAM_KINDS.HOLISTIC ? normalizeMediaBindings(source.bindings) : [],
  };
};

export const normalizeHolisticSettingsPreset = value => {
  const holistic = value?.holistic && typeof value.holistic === "object" ? value.holistic : value;
  const normalized = normalizeMediaStreamConfig({ kind: MEDIA_STREAM_KINDS.HOLISTIC, holistic }).holistic;
  const { sourceId: _sourceId, sourceElementId: _sourceElementId, ...settings } = normalized;
  return settings;
};

export const readHolisticSettingsPreset = (storage = globalThis.localStorage) => {
  try {
    const saved = JSON.parse(storage?.getItem?.(HOLISTIC_SETTINGS_STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? normalizeHolisticSettingsPreset(saved) : null;
  } catch {
    return null;
  }
};

export const writeHolisticSettingsPreset = (value, storage = globalThis.localStorage) => {
  try {
    storage?.setItem?.(HOLISTIC_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeHolisticSettingsPreset(value)));
    return true;
  } catch {
    return false;
  }
};

export const isMediaStreamElement = element =>
  Boolean(element && !element.isDeleted && element.customData?.underscoresMediaStream);

// Holistic processors are ordinary rectangle hosts whose visual content is rendered
// in an overlay. They remain useful geometric inputs (brush destinations, mapped
// regions, and other object-bound controls), whereas preview/source hosts should
// stay out of those pickers to avoid accidental feedback routes.
export const canUseAsObjectBoundsTarget = element => {
  if (!element || element.isDeleted || !["rectangle", "frame"].includes(element.type)) return false;
  if (!isMediaStreamElement(element)) return true;
  return [MEDIA_STREAM_KINDS.HOLISTIC, MEDIA_STREAM_KINDS.UNICURSAL].includes(
    normalizeMediaStreamConfig(element.customData.underscoresMediaStream).kind,
  );
};

// Canvas sources capture a bounded authored area. Derived media objects are
// deliberately excluded here; their live surfaces are composed when they sit
// inside an ordinary frame or rectangle target.
export const canUseAsCanvasCaptureTarget = element => Boolean(
  element
  && !element.isDeleted
  && ["rectangle", "frame"].includes(element.type)
  && !isMediaStreamElement(element),
);

export const objectBoundsTargetLabel = element => {
  if (isMediaStreamElement(element)) {
    const config = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
    if (config.kind === MEDIA_STREAM_KINDS.HOLISTIC) return config.name || "Holistic";
    if (config.kind === MEDIA_STREAM_KINDS.UNICURSAL) return config.name || "Unicursal portrait";
  }
  return element?.customData?.underscoresLabel || element?.name || element?.type || "Object";
};

export const isMediaSourceElement = element => {
  if (!isMediaStreamElement(element)) return false;
  const kind = normalizeMediaStreamConfig(element.customData.underscoresMediaStream).kind;
  return kind === MEDIA_STREAM_KINDS.CAMERA || kind === MEDIA_STREAM_KINDS.MEDIA || kind === MEDIA_STREAM_KINDS.CANVAS;
};

export const shouldProcessMediaStream = element =>
  isMediaStreamElement(element)
  && normalizeMediaStreamConfig(element.customData.underscoresMediaStream).enabled;

export const shouldRenderMediaStream = element =>
  shouldProcessMediaStream(element)
  && !element.customData?.outlinerHidden
  && !element.customData?.presentationMaskActive
  && Number(element.opacity ?? 100) > 0;

// Input sources are catalog entries until a panel selection or an enabled
// scene object asks for them. Follow derived processor references so a
// Unicursal object keeps the camera/media source used by its Holistic input
// alive without waking unrelated catalog entries.
export const getConnectedMediaSourceIds = (elements = [], sources = []) => {
  const sourceIds = new Set((sources || []).map(source => String(source?.id || "")).filter(Boolean));
  const configs = new Map();
  (elements || []).forEach(element => {
    if (!isMediaStreamElement(element)) return;
    const config = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
    if (config.enabled) configs.set(element.id, config);
  });
  const connected = new Set();
  const addReference = reference => {
    let candidate = String(reference || "");
    const visited = new Set();
    while (candidate && !visited.has(candidate)) {
      visited.add(candidate);
      if (sourceIds.has(candidate)) {
        connected.add(candidate);
        return;
      }
      const config = configs.get(candidate);
      if (!config) return;
      candidate = config.kind === MEDIA_STREAM_KINDS.HOLISTIC
        ? config.holistic.sourceId
        : config.kind === MEDIA_STREAM_KINDS.UNICURSAL
          ? config.unicursal.sourceId
          : "";
    }
  };
  configs.forEach(config => {
    if (config.kind === MEDIA_STREAM_KINDS.PREVIEW) addReference(config.sourceId);
    if (config.kind === MEDIA_STREAM_KINDS.HOLISTIC) addReference(config.holistic.sourceId);
    if (config.kind === MEDIA_STREAM_KINDS.UNICURSAL) addReference(config.unicursal.sourceId);
  });
  return connected;
};

export const patchMediaStreamConfig = (value, patch = {}) => {
  const current = normalizeMediaStreamConfig(value);
  const media = { ...current.media, ...(patch.media || {}) };
  const holisticPatch = patch.holistic || {};
  if (Object.hasOwn(patch.media || {}, "url") && !Object.hasOwn(patch.media || {}, "mediaType")) {
    media.mediaType = inferMediaType(patch.media.url);
  }
  return normalizeMediaStreamConfig({
    ...current,
    ...patch,
    crop: { ...current.crop, ...(patch.crop || {}) },
    camera: { ...current.camera, ...(patch.camera || {}) },
    media,
    canvas: { ...current.canvas, ...(patch.canvas || {}) },
    output: { ...current.output, ...(patch.output || {}) },
    holistic: {
      ...current.holistic,
      ...holisticPatch,
      colors: { ...current.holistic.colors, ...(holisticPatch.colors || {}) },
      poseGroups: { ...current.holistic.poseGroups, ...(holisticPatch.poseGroups || {}) },
      faceGroups: { ...current.holistic.faceGroups, ...(holisticPatch.faceGroups || {}) },
    },
    unicursal: {
      ...current.unicursal,
      ...(patch.unicursal || {}),
      anatomy: { ...current.unicursal.anatomy, ...(patch.unicursal?.anatomy || {}) },
      silhouette: { ...current.unicursal.silhouette, ...(patch.unicursal?.silhouette || {}) },
      geometry: { ...current.unicursal.geometry, ...(patch.unicursal?.geometry || {}) },
      ornament: { ...current.unicursal.ornament, ...(patch.unicursal?.ornament || {}) },
      ink: { ...current.unicursal.ink, ...(patch.unicursal?.ink || {}) },
      motion: { ...current.unicursal.motion, ...(patch.unicursal?.motion || {}) },
      background: { ...current.unicursal.background, ...(patch.unicursal?.background || {}) },
      landmarks: { ...current.unicursal.landmarks, ...(patch.unicursal?.landmarks || {}) },
    },
    bindings: Object.hasOwn(patch, "bindings") ? patch.bindings : current.bindings,
  });
};

const createSourceId = () => `media_source_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const createMediaSource = (kind = MEDIA_STREAM_KINDS.MEDIA, overrides = {}) => {
  const config = createMediaStreamConfig(kind, overrides);
  if ([MEDIA_STREAM_KINDS.HOLISTIC, MEDIA_STREAM_KINDS.PREVIEW, MEDIA_STREAM_KINDS.UNICURSAL].includes(config.kind)) throw new Error("Derived streams are not input sources.");
  return {
    id: cleanString(overrides.id, createSourceId()),
    ...config,
    sourceId: "",
  };
};

export const normalizeMediaSource = value => {
  const source = value && typeof value === "object" ? value : {};
  const config = normalizeMediaStreamConfig(source);
  if ([MEDIA_STREAM_KINDS.HOLISTIC, MEDIA_STREAM_KINDS.PREVIEW, MEDIA_STREAM_KINDS.UNICURSAL].includes(config.kind)) return null;
  return {
    id: cleanString(source.id, createSourceId()),
    ...config,
    sourceId: "",
  };
};

export const normalizeMediaSources = value => {
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set();
  return entries.map(normalizeMediaSource).filter(source => {
    if (!source || seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
};

export const patchMediaSource = (value, patch = {}) => {
  const current = normalizeMediaSource(value);
  if (!current) return null;
  const next = patchMediaStreamConfig(current, patch);
  return { id: current.id, ...next, sourceId: "" };
};
