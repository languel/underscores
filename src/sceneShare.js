// A scene share link carries the existing Underscores exchange JSON in the
// URL fragment. Fragments stay client-side (they are not sent in requests),
// and the payload is compressed before URL-safe Base64 encoding so a modest
// scene remains practical to copy or turn into a QR code. A separate ?scene=
// query can point at a published raw Markdown, JSON, or .excalidraw source.

export const SCENE_SHARE_HASH_KEY = "u";
export const SCENE_SHARE_VERSION = "1";
export const SCENE_SHARE_MAX_URL_LENGTH = 250_000;
export const SCENE_SHARE_MAX_DECODED_BYTES = 8_000_000;
export const SCENE_SOURCE_QUERY_KEY = "scene";
export const SCENE_SOURCE_MAX_BYTES = 20_000_000;

const isSceneDocument = value => (
  value &&
  typeof value === "object" &&
  Array.isArray(value.elements)
);

const normalizeSceneDocument = value => {
  if (!isSceneDocument(value)) return null;
  const document = { ...value, type: value.type || "excalidraw" };
  // Remote scene references are deliberately media-free. Keep authored media
  // URLs and file names in customData, but never copy local/blob file payloads.
  delete document.files;
  return document;
};

const tryParseSceneDocument = candidate => {
  try {
    return normalizeSceneDocument(JSON.parse(String(candidate || "")));
  } catch {
    return null;
  }
};

/**
 * Turn a raw JSON, .excalidraw JSON, or Markdown document containing a fenced
 * Excalidraw JSON block into the media-free scene exchange text consumed by
 * the normal importer. Markdown is intentionally parsed as data, not HTML:
 * a rendered Quartz page is not itself a scene source and should publish a
 * raw .md or sidecar .json asset for this loader.
 */
export const normalizeSceneSourceText = (sourceText, sourceUrl = "") => {
  const raw = String(sourceText ?? "").trim();
  const direct = tryParseSceneDocument(raw);
  if (direct) return JSON.stringify(direct);

  const candidates = [];
  const fenced = /```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = fenced.exec(raw))) candidates.push(match[1]);
  for (const candidate of candidates) {
    const document = tryParseSceneDocument(candidate);
    if (document) return JSON.stringify(document);
  }

  const sourceLabel = sourceUrl ? ` (${sourceUrl})` : "";
  throw new Error(`Scene source${sourceLabel} does not contain an Excalidraw JSON document. Publish a raw Markdown file with a fenced JSON scene or a .json/.excalidraw sidecar.`);
};

export const readSceneSourceReference = (search = globalThis.location?.search || "") => {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return params.get(SCENE_SOURCE_QUERY_KEY)?.trim() || "";
};

export const resolveSceneSourceUrl = (reference, baseUrl = globalThis.location?.href || "http://localhost/") => {
  const value = String(reference || "").trim();
  if (!value) throw new Error("The scene source URL is empty.");
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new Error("The scene source URL is not valid.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Scene sources must use an HTTP(S) URL.");
  }
  return url.toString();
};

export const fetchSceneSource = async (reference, { baseUrl, fetchImpl = globalThis.fetch } = {}) => {
  if (typeof fetchImpl !== "function") throw new Error("This browser cannot fetch a remote scene source.");
  const url = resolveSceneSourceUrl(reference, baseUrl);
  const response = await fetchImpl(url, { credentials: "omit" });
  if (!response?.ok) throw new Error(`Scene source could not be fetched (${response?.status || "network error"}).`);
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > SCENE_SOURCE_MAX_BYTES) {
    throw new Error("The remote scene source is too large to open safely.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > SCENE_SOURCE_MAX_BYTES) {
    throw new Error("The remote scene source is too large to open safely.");
  }
  return { url, text };
};

// Keep the share contract explicit: authored scene metadata (including media
// URLs and file names) is retained, while Excalidraw's binary file map is not.
// This keeps links portable and makes missing local media visible on import.
export const createMediaFreeSceneJson = sceneJson => {
  const payload = JSON.parse(String(sceneJson || ""));
  if (payload && typeof payload === "object") delete payload.files;
  return JSON.stringify(payload);
};

const encodeBase64Url = bytes => {
  if (typeof btoa !== "function") throw new Error("This browser cannot create share links.");
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = value => {
  if (typeof atob !== "function") throw new Error("This browser cannot open share links.");
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const transformBytes = async (bytes, Stream, mode) => {
  if (typeof Stream !== "function" || typeof Blob !== "function" || typeof Response !== "function") return null;
  try {
    const compressed = new Blob([bytes]).stream().pipeThrough(new Stream(mode));
    return new Uint8Array(await new Response(compressed).arrayBuffer());
  } catch {
    // CompressionStream is deliberately an optimization. Older browsers can
    // still use the uncompressed form, which keeps the share format portable.
    return null;
  }
};

const encodeText = value => new TextEncoder().encode(String(value ?? ""));

export const encodeSceneSharePayload = async sceneJson => {
  const bytes = encodeText(sceneJson);
  const compressed = await transformBytes(bytes, globalThis.CompressionStream, "deflate");
  const mode = compressed ? "d" : "p";
  return `${SCENE_SHARE_VERSION}.${mode}.${encodeBase64Url(compressed || bytes)}`;
};

export const decodeSceneSharePayload = async payload => {
  const match = String(payload || "").match(/^(\d+)\.([dp])\.([A-Za-z0-9_-]+)$/);
  if (!match || match[1] !== SCENE_SHARE_VERSION) throw new Error("Unsupported or malformed scene share link.");
  const bytes = decodeBase64Url(match[3]);
  if (bytes.byteLength > SCENE_SHARE_MAX_DECODED_BYTES) throw new Error("This scene share link is too large to open safely.");
  let decoded = bytes;
  if (match[2] === "d") {
    decoded = await transformBytes(bytes, globalThis.DecompressionStream, "deflate");
    if (!decoded) throw new Error("This browser cannot decompress the scene share link.");
    if (decoded.byteLength > SCENE_SHARE_MAX_DECODED_BYTES) throw new Error("This scene share link is too large to open safely.");
  }
  return new TextDecoder().decode(decoded);
};

export const createSceneShareUrl = async (sceneJson, baseUrl = globalThis.location?.href || "http://localhost/") => {
  const url = new URL(baseUrl);
  url.hash = `${SCENE_SHARE_HASH_KEY}=${await encodeSceneSharePayload(sceneJson)}`;
  if (url.href.length > SCENE_SHARE_MAX_URL_LENGTH) {
    throw new Error("This scene is too large for a share link. Export the scene file instead.");
  }
  return url.toString();
};

export const readSceneSharePayload = (hash = globalThis.location?.hash || "") => {
  const value = String(hash || "").replace(/^#/, "");
  const params = new URLSearchParams(value);
  return params.get(SCENE_SHARE_HASH_KEY) || "";
};
