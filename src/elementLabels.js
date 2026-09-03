const EXCALIDRAW_LABEL_PREFIXES = Object.freeze({
  freedraw: "stroke",
  line: "line",
  arrow: "arrow",
  rectangle: "rectangle",
  diamond: "diamond",
  ellipse: "ellipse",
  text: "text",
  image: "image",
  iframe: "embed",
  embeddable: "embed",
  frame: "frame",
  magicframe: "frame",
});

const labelPrefixFor = type => {
  const normalized = String(type || "object").trim().toLowerCase();
  if (EXCALIDRAW_LABEL_PREFIXES[normalized]) return EXCALIDRAW_LABEL_PREFIXES[normalized];
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "object";
};

const ordinalFor = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.floor(numeric));
};

// Native objects are named by their type and one-based ordinal in scene order.
// Keep the four-digit suffix compact for the common case while allowing a
// scene with more than 9,999 objects to continue numbering without collision.
export const getDefaultExcalidrawLabel = (element, ordinal = 1) => {
  if (!element || typeof element !== "object") return "";
  const suffix = String(ordinalFor(ordinal)).padStart(4, "0");
  return `${labelPrefixFor(element?.type)}_${suffix}`;
};

// Build labels from the canonical Excalidraw scene order (back to front). The
// caller supplies native elements only so managed objects such as Livecode
// hosts do not consume an ordinal for their underlying rectangle type.
export const buildDefaultExcalidrawLabelMap = (elements = []) => {
  const counts = new Map();
  const labels = new Map();
  if (!Array.isArray(elements)) return labels;
  for (const element of elements) {
    if (!element || typeof element !== "object" || element.isDeleted || !element.id) continue;
    const prefix = labelPrefixFor(element.type);
    const ordinal = (counts.get(prefix) || 0) + 1;
    counts.set(prefix, ordinal);
    labels.set(element.id, getDefaultExcalidrawLabel(element, ordinal));
  }
  return labels;
};
