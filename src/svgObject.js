import {
  SVG_DOCUMENT_SCHEMA_VERSION,
  buildSvgMetadataMirror,
  createSvgDocumentId,
  normalizeSvgRuntimePolicy,
  parseSvgDocument,
  patchSvgNodeAttribute,
  prepareSvgForStructuredEditing,
} from "./svgDocumentModel.js";

const NUMBER = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
const ATTRIBUTE = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

export const DEFAULT_SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <path id="wave" d="M20 90 C80 20 140 160 300 90" fill="none" stroke="#1769e0" stroke-width="5" stroke-linecap="round"/>
</svg>`;
export const SVG_SCRIPT_STORAGE_KEY = "underscore_svg_scripts_v1";

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clampDimension = value => Math.max(1, Math.min(16384, finite(value, 1)));

export const parseSvgAttributes = source => {
  const attributes = {};
  ATTRIBUTE.lastIndex = 0;
  let match;
  while ((match = ATTRIBUTE.exec(String(source || "")))) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
};

const parseLength = value => {
  const match = String(value ?? "").trim().match(new RegExp(`^(${NUMBER})(?:px)?$`, "i"));
  return match ? Number(match[1]) : null;
};

const parseViewBox = value => {
  const numbers = String(value || "").match(new RegExp(NUMBER, "g"))?.map(Number) || [];
  return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0
    ? numbers
    : null;
};

export const scanSvgNodes = source => {
  return parseSvgDocument(String(source || "")).nodes.map(node => ({
    ...node,
    end: node.openEnd,
  }));
};

export const analyzeSvgSource = source => {
  const authored = typeof source === "string" ? source : "";
  const document = parseSvgDocument(authored);
  if (!authored.trim() || !document.valid) {
    return {
      valid: false,
      error: document.error || "Source must contain one complete <svg> document.",
      source: authored,
      width: 320,
      height: 180,
      viewBox: [0, 0, 320, 180],
      nodes: [],
      nodeCount: 0,
      hasScript: false,
    };
  }

  if (typeof DOMParser !== "undefined") {
    const domDocument = new DOMParser().parseFromString(authored, "image/svg+xml");
    const parserError = domDocument.querySelector("parsererror");
    if (parserError || domDocument.documentElement?.localName?.toLowerCase() !== "svg") {
      return {
        valid: false,
        error: parserError?.textContent?.split("\n")[0] || "The SVG document is not valid XML.",
        source: authored,
        width: 320,
        height: 180,
        viewBox: [0, 0, 320, 180],
        nodes: [],
        nodeCount: 0,
        hasScript: /<script\b/i.test(authored),
      };
    }
  }

  const rootAttributes = document.root?.attributes || {};
  const authoredViewBox = parseViewBox(rootAttributes.viewBox);
  const authoredWidth = parseLength(rootAttributes.width);
  const authoredHeight = parseLength(rootAttributes.height);
  const width = clampDimension(authoredWidth ?? authoredViewBox?.[2] ?? 320);
  const height = clampDimension(authoredHeight ?? authoredViewBox?.[3] ?? 180);
  const viewBox = authoredViewBox || [0, 0, width, height];
  const nodes = document.nodes;

  return {
    valid: true,
    error: "",
    source: authored,
    width,
    height,
    viewBox,
    rootAttributes,
    nodes,
    nodeCount: nodes.length,
    hasScript: /<script\b/i.test(authored),
    styles: document.styles,
    duplicateUnderscoreIds: document.duplicateUnderscoreIds,
  };
};

export const normalizeSvgObject = value => {
  const raw = value && typeof value === "object" ? value : {};
  const analysis = analyzeSvgSource(typeof raw.source === "string" ? raw.source : DEFAULT_SVG_SOURCE);
  const fallback = analysis.valid ? analysis : analyzeSvgSource(DEFAULT_SVG_SOURCE);
  const revision = Math.max(0, finite(raw.revision, 0));
  return {
    version: SVG_DOCUMENT_SCHEMA_VERSION,
    documentId: typeof raw.documentId === "string" && raw.documentId.trim()
      ? raw.documentId.trim()
      : createSvgDocumentId(fallback.source),
    source: fallback.source,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled SVG",
    scriptId: typeof raw.scriptId === "string" ? raw.scriptId : "",
    revision,
    width: fallback.width,
    height: fallback.height,
    viewBox: [...fallback.viewBox],
    preserveAspectRatio: typeof fallback.rootAttributes?.preserveAspectRatio === "string"
      ? fallback.rootAttributes.preserveAspectRatio
      : "",
    nodeCount: fallback.nodeCount,
    runtime: normalizeSvgRuntimePolicy(raw.runtime),
    metadataMirror: raw.metadataMirror?.sourceRevision === revision
      ? structuredClone(raw.metadataMirror)
      : buildSvgMetadataMirror(fallback.source, revision),
  };
};

export const normalizeSvgScripts = value => {
  const scripts = Array.isArray(value) ? value : [];
  const seen = new Set();
  return scripts.flatMap((candidate, index) => {
    const source = typeof candidate?.source === "string" ? candidate.source.trim() : "";
    if (!analyzeSvgSource(source).valid) return [];
    const requestedId = typeof candidate?.id === "string" ? candidate.id.trim() : "";
    const id = requestedId && !seen.has(requestedId) ? requestedId : `svg-script-${index + 1}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: typeof candidate?.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Untitled SVG",
      source,
      createdAt: Math.max(0, finite(candidate?.createdAt, Date.now())),
      updatedAt: Math.max(0, finite(candidate?.updatedAt, Date.now())),
    }];
  });
};

export const isSvgObjectElement = element => Boolean(element?.customData?.underscoreSvg);

export const shouldRenderSvgObject = element => Boolean(
  element
  && !element.isDeleted
  && !element.customData?.outlinerHidden
  && !element.customData?.presentationMaskActive
  && isSvgObjectElement(element)
);

export const updateSvgNodeAttribute = (source, nodeIndex, name, value) => {
  try {
    return patchSvgNodeAttribute(source, nodeIndex, name, value);
  } catch {
    return String(source || "");
  }
};

export const updateStructuredSvgNodeAttribute = (sourceValue, nodeReference, name, value) => {
  const source = String(sourceValue || "");
  try {
    const original = parseSvgDocument(source);
    const originalNode = Number.isInteger(nodeReference)
      ? original.nodes[nodeReference]
      : original.nodeByUnderscoreId.get(typeof nodeReference === "string" ? nodeReference : nodeReference?.nodeId);
    if (!originalNode) return source;
    const prepared = prepareSvgForStructuredEditing(source);
    if (prepared.error) return source;
    const nodeId = originalNode.underscoreId
      || prepared.assigned.find(item => item.nodeIndex === originalNode.index)?.nodeId;
    return patchSvgNodeAttribute(prepared.source, nodeId || originalNode.index, name, value);
  } catch {
    return source;
  }
};

export const updateSvgRootDocument = (source, { width, height, viewBox } = {}) => {
  let next = String(source || "");
  if (width !== undefined) next = updateSvgNodeAttribute(next, 0, "width", width);
  if (height !== undefined) next = updateSvgNodeAttribute(next, 0, "height", height);
  if (viewBox !== undefined) next = updateSvgNodeAttribute(next, 0, "viewBox", viewBox);
  return next;
};

export const updateStructuredSvgRootDocument = (source, { width, height, viewBox } = {}) => {
  let next = String(source || "");
  if (width !== undefined) next = updateStructuredSvgNodeAttribute(next, 0, "width", width);
  if (height !== undefined) next = updateStructuredSvgNodeAttribute(next, 0, "height", height);
  if (viewBox !== undefined) next = updateStructuredSvgNodeAttribute(next, 0, "viewBox", viewBox);
  return next;
};

const CANVAS_FOREGROUND_COLORS = new Set([
  "#000000",
  "#1c1c1e",
  "#1e1e1e",
  "#121212",
  "rgb(0,0,0)",
  "black",
]);

const isCanvasForegroundColor = value => (
  CANVAS_FOREGROUND_COLORS.has(String(value || "").trim().toLowerCase().replaceAll(" ", ""))
);

// Excalidraw stores its neutral foreground as a dark authored color and
// resolves that color against the active canvas theme while rendering. A
// source-preserving SVG cannot inherit that behavior automatically, so use
// standard SVG `currentColor` for those exported neutral strokes/fills.
export const makeSvgCanvasForegroundAdaptive = source => {
  let next = String(source || "");
  const nodes = scanSvgNodes(next);
  for (const node of nodes) {
    for (const attribute of ["fill", "stroke"]) {
      if (isCanvasForegroundColor(node.attributes?.[attribute])) {
        next = updateSvgNodeAttribute(next, node.index, attribute, "currentColor");
      }
    }
    const style = node.attributes?.style;
    if (style) {
      const patchedStyle = String(style).replace(
        /(^|;)(\s*(?:fill|stroke)\s*:\s*)(#000000|#1c1c1e|#1e1e1e|#121212|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|black)(?=\s*(?:;|$))/gi,
        "$1$2currentColor",
      );
      if (patchedStyle !== style) next = updateSvgNodeAttribute(next, node.index, "style", patchedStyle);
    }
  }
  return next;
};

export const resolveSvgCurrentColor = (source, currentColor) => {
  const authored = String(source || "");
  const color = String(currentColor || "").trim();
  if (!color) return authored;
  const root = scanSvgNodes(authored)[0];
  if (!root || root.tag.toLowerCase() !== "svg" || root.attributes.color) return authored;
  return updateSvgNodeAttribute(authored, root.index, "color", color);
};

export const svgSourceToDataUrl = (source, { currentColor = "" } = {}) => (
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(resolveSvgCurrentColor(source, currentColor))}`
);

export const getSvgHostFrame = (selectionBounds, viewBox) => {
  const [minX, minY, maxX, maxY] = selectionBounds;
  const boundsWidth = Math.max(1, maxX - minX);
  const boundsHeight = Math.max(1, maxY - minY);
  // Excalidraw's exported SVG uses scene units in its viewBox and may include
  // symmetric padding around the selection. Keep that padding without moving
  // the selection's world-space center.
  const width = Math.max(boundsWidth, Math.min(4096, Number(viewBox?.[2]) || boundsWidth));
  const height = Math.max(boundsHeight, Math.min(4096, Number(viewBox?.[3]) || boundsHeight));
  return {
    x: minX - Math.max(0, width - boundsWidth) / 2,
    y: minY - Math.max(0, height - boundsHeight) / 2,
    width,
    height,
  };
};
