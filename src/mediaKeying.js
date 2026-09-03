// Optional, CPU-side color keying for media frames. Native webcam tracks and
// most video codecs are opaque even when their producer has an alpha preview,
// so this stays opt-in and only runs when a source explicitly asks for it.

export const MEDIA_KEY_MODES = Object.freeze([
  "off",
  "black",
  "green",
  "color",
]);

export const DEFAULT_MEDIA_KEY = Object.freeze({
  mode: "off",
  color: "#00ff00",
  threshold: 0.2,
  softness: 0.08,
});

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

const normalizeHex = (value, fallback) => {
  const source = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(source)) return source.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(source)) {
    return `#${source.slice(1).split("").map(channel => `${channel}${channel}`).join("")}`.toLowerCase();
  }
  return fallback;
};

export const normalizeMediaKey = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    mode: MEDIA_KEY_MODES.includes(source.mode) ? source.mode : DEFAULT_MEDIA_KEY.mode,
    color: normalizeHex(source.color, DEFAULT_MEDIA_KEY.color),
    threshold: clamp(source.threshold, 0, 1, DEFAULT_MEDIA_KEY.threshold),
    softness: clamp(source.softness, 0.001, 1, DEFAULT_MEDIA_KEY.softness),
  };
};

const hexChannels = value => {
  const normalized = normalizeHex(value, DEFAULT_MEDIA_KEY.color);
  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ];
};

const smoothstep = (edge0, edge1, value) => {
  const span = Math.max(0.0001, edge1 - edge0);
  const t = Math.min(1, Math.max(0, (value - edge0) / span));
  return t * t * (3 - (2 * t));
};

// Mutates a rendered output canvas in place. Returns false when no keyed pass
// was needed, which lets the hot path remain a single drawImage for normal
// camera/video sources.
export const applyMediaKey = (context, width, height, value) => {
  const key = normalizeMediaKey(value);
  if (!context || key.mode === "off" || width <= 0 || height <= 0) return false;
  const target = key.mode === "black"
    ? [0, 0, 0]
    : key.mode === "green"
      ? [0, 1, 0]
      : hexChannels(key.color);
  let image;
  try {
    image = context.getImageData(0, 0, width, height);
  } catch {
    return false;
  }
  const pixels = image.data;
  const end = pixels.length - 3;
  const threshold = key.threshold;
  const featherEnd = threshold + key.softness;
  for (let index = 0; index <= end; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index] / 255 - target[0];
    const green = pixels[index + 1] / 255 - target[1];
    const blue = pixels[index + 2] / 255 - target[2];
    const distance = Math.sqrt((red * red) + (green * green) + (blue * blue));
    const keyed = 1 - smoothstep(threshold, featherEnd, distance);
    if (keyed > 0) pixels[index + 3] = Math.round(pixels[index + 3] * (1 - keyed));
  }
  try {
    context.putImageData(image, 0, 0);
  } catch {
    return false;
  }
  return true;
};
