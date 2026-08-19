// A scene share link carries the existing Underscores exchange JSON in the
// URL fragment. Fragments stay client-side (they are not sent in requests),
// and the payload is compressed before URL-safe Base64 encoding so a modest
// scene remains practical to copy or turn into a QR code.

export const SCENE_SHARE_HASH_KEY = "u";
export const SCENE_SHARE_VERSION = "1";
export const SCENE_SHARE_MAX_URL_LENGTH = 250_000;
export const SCENE_SHARE_MAX_DECODED_BYTES = 8_000_000;

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
