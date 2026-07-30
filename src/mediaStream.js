export const MEDIA_STREAM_KINDS = Object.freeze({
  CAMERA: "camera",
  MEDIA: "media",
  HOLISTIC: "holistic",
});

export const MEDIA_STREAM_VERSION = 1;
export const MEDIA_SOURCE_STORAGE_KEY = "drawerator_media_source_catalog_v1";

const DEFAULT_CROP = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

const cleanString = (value, fallback = "") => {
  const next = String(value ?? "").trim();
  return next || fallback;
};

export const inferMediaType = (url = "", explicit = "") => {
  if (explicit === "image" || explicit === "video") return explicit;
  const source = String(url).split(/[?#]/)[0].toLowerCase();
  return /\.(gif|png|jpe?g|webp|avif|svg)$/.test(source) ? "image" : "video";
};

export const createMediaStreamConfig = (kind = MEDIA_STREAM_KINDS.MEDIA, overrides = {}) =>
  normalizeMediaStreamConfig({
    version: MEDIA_STREAM_VERSION,
    kind,
    sourceId: "",
    name: kind === MEDIA_STREAM_KINDS.CAMERA
      ? "Camera"
      : kind === MEDIA_STREAM_KINDS.HOLISTIC
        ? "Holistic"
        : "Media",
    enabled: true,
    mirror: kind === MEDIA_STREAM_KINDS.CAMERA,
    crop: DEFAULT_CROP,
    camera: { deviceId: "", facingMode: "user" },
    media: { url: "", mediaType: "video", fileName: "", loop: true, muted: true, playbackRate: 1 },
    holistic: {
      sourceId: "",
      sourceElementId: "",
      showSource: false,
      showPose: true,
      showHands: true,
      showFace: true,
      refineFaceLandmarks: true,
      color: "#52d5ff",
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    },
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
  const holistic = source.holistic && typeof source.holistic === "object" ? source.holistic : {};
  const mediaUrl = cleanString(media.url);
  return {
    version: MEDIA_STREAM_VERSION,
    kind,
    sourceId: cleanString(source.sourceId),
    name: cleanString(source.name, kind === MEDIA_STREAM_KINDS.CAMERA ? "Camera" : kind === MEDIA_STREAM_KINDS.HOLISTIC ? "Holistic" : "Media"),
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
      playbackRate: clamp(media.playbackRate, 0.1, 8, 1),
    },
    holistic: {
      sourceId: cleanString(holistic.sourceId || holistic.sourceElementId),
      sourceElementId: cleanString(holistic.sourceElementId),
      showSource: holistic.showSource === true,
      showPose: holistic.showPose !== false,
      showHands: holistic.showHands !== false,
      showFace: holistic.showFace !== false,
      refineFaceLandmarks: holistic.refineFaceLandmarks !== false,
      color: /^#[0-9a-f]{6}$/i.test(String(holistic.color || "")) ? String(holistic.color).toLowerCase() : "#52d5ff",
      modelComplexity: Math.round(clamp(holistic.modelComplexity, 0, 2, 0)),
      minDetectionConfidence: clamp(holistic.minDetectionConfidence, 0, 1, 0.5),
      minTrackingConfidence: clamp(holistic.minTrackingConfidence, 0, 1, 0.5),
    },
  };
};

export const isMediaStreamElement = element =>
  Boolean(element && !element.isDeleted && element.customData?.draweratorMediaStream);

export const isMediaSourceElement = element => {
  if (!isMediaStreamElement(element)) return false;
  const kind = normalizeMediaStreamConfig(element.customData.draweratorMediaStream).kind;
  return kind === MEDIA_STREAM_KINDS.CAMERA || kind === MEDIA_STREAM_KINDS.MEDIA;
};

export const shouldRenderMediaStream = element =>
  isMediaStreamElement(element)
  && !element.customData?.outlinerHidden
  && Number(element.opacity ?? 100) > 0
  && normalizeMediaStreamConfig(element.customData.draweratorMediaStream).enabled;

export const patchMediaStreamConfig = (value, patch = {}) => {
  const current = normalizeMediaStreamConfig(value);
  const media = { ...current.media, ...(patch.media || {}) };
  if (Object.hasOwn(patch.media || {}, "url") && !Object.hasOwn(patch.media || {}, "mediaType")) {
    media.mediaType = inferMediaType(patch.media.url);
  }
  return normalizeMediaStreamConfig({
    ...current,
    ...patch,
    crop: { ...current.crop, ...(patch.crop || {}) },
    camera: { ...current.camera, ...(patch.camera || {}) },
    media,
    holistic: { ...current.holistic, ...(patch.holistic || {}) },
  });
};

const createSourceId = () => `media_source_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const createMediaSource = (kind = MEDIA_STREAM_KINDS.MEDIA, overrides = {}) => {
  const config = createMediaStreamConfig(kind, overrides);
  if (config.kind === MEDIA_STREAM_KINDS.HOLISTIC) throw new Error("Holistic is a processor, not an input source.");
  return {
    id: cleanString(overrides.id, createSourceId()),
    ...config,
    sourceId: "",
  };
};

export const normalizeMediaSource = value => {
  const source = value && typeof value === "object" ? value : {};
  const config = normalizeMediaStreamConfig(source);
  if (config.kind === MEDIA_STREAM_KINDS.HOLISTIC) return null;
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
