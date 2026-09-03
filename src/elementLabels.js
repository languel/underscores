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

export const getDefaultExcalidrawLabel = element => {
  if (!element || typeof element !== "object") return "";
  const id = String(element?.id || "");
  const suffix = id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toLowerCase() || "item";
  return `${labelPrefixFor(element?.type)}_${suffix}`;
};
