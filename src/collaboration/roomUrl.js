export const COLLABORATION_HASH_KEY = "room";
export const COLLABORATION_ROOM_ID_BYTES = 16;
export const COLLABORATION_SECRET_BYTES = 32;

const cryptoSource = () => {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure room links are unavailable in this browser.");
  return globalThis.crypto;
};

export const encodeBase64Url = bytes => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof btoa === "function") {
    let binary = "";
    for (let offset = 0; offset < data.length; offset += 0x8000) {
      binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  return Buffer.from(data).toString("base64url");
};

export const decodeBase64Url = value => {
  const input = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error("The room link contains malformed key data.");
  if (typeof atob === "function") {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(input, "base64url"));
};

export const generateRoomCredentials = () => {
  const roomIdBytes = new Uint8Array(COLLABORATION_ROOM_ID_BYTES);
  const secretBytes = new Uint8Array(COLLABORATION_SECRET_BYTES);
  cryptoSource().getRandomValues(roomIdBytes);
  cryptoSource().getRandomValues(secretBytes);
  return { roomId: encodeBase64Url(roomIdBytes), secret: encodeBase64Url(secretBytes) };
};

export const validateRoomCredentials = ({ roomId, secret } = {}) => {
  const normalizedRoomId = String(roomId || "").trim();
  const normalizedSecret = String(secret || "").trim();
  if (decodeBase64Url(normalizedRoomId).byteLength !== COLLABORATION_ROOM_ID_BYTES) {
    throw new Error("The room link contains an invalid room id.");
  }
  if (decodeBase64Url(normalizedSecret).byteLength !== COLLABORATION_SECRET_BYTES) {
    throw new Error("The room link contains an invalid room key.");
  }
  return { roomId: normalizedRoomId, secret: normalizedSecret };
};

export const createCollaborationUrl = (credentials, baseUrl = globalThis.location?.href || "http://localhost/") => {
  const { roomId, secret } = validateRoomCredentials(credentials);
  const url = new URL(baseUrl);
  url.hash = `${COLLABORATION_HASH_KEY}=${roomId},${secret}`;
  return url.toString();
};

export const parseCollaborationUrl = (value = globalThis.location?.href || "") => {
  let hash;
  try {
    hash = new URL(String(value || ""), globalThis.location?.href || "http://localhost/").hash;
  } catch {
    hash = String(value || "").startsWith("#") ? String(value) : `#${String(value || "")}`;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const room = params.get(COLLABORATION_HASH_KEY);
  if (!room) return null;
  const separator = room.indexOf(",");
  if (separator <= 0) throw new Error("The multiplayer room link is malformed.");
  return validateRoomCredentials({ roomId: room.slice(0, separator), secret: room.slice(separator + 1) });
};

export const hasCollaborationRoom = (value = globalThis.location?.href || "") => {
  try {
    return Boolean(parseCollaborationUrl(value));
  } catch {
    return true;
  }
};

export const redactCollaborationUrl = value => {
  try {
    const url = new URL(String(value || ""), globalThis.location?.href || "http://localhost/");
    const credentials = parseCollaborationUrl(url.toString());
    if (credentials) url.hash = `${COLLABORATION_HASH_KEY}=${credentials.roomId},[redacted]`;
    return url.toString();
  } catch {
    return String(value || "").replace(/(#room=[^,\s]+),[^\s]+/g, "$1,[redacted]");
  }
};
