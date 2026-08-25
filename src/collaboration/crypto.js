import { decodeBase64Url, encodeBase64Url } from "./roomUrl.js";

export const COLLABORATION_ENVELOPE_VERSION = 1;

const subtleCrypto = () => {
  if (!globalThis.crypto?.subtle) throw new Error("Encrypted multiplayer rooms are unavailable in this browser.");
  return globalThis.crypto.subtle;
};

const importRoomKey = secret => {
  const bytes = decodeBase64Url(secret);
  if (bytes.byteLength !== 32) throw new Error("The multiplayer room key is invalid.");
  return subtleCrypto().importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

const randomIv = () => {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  return iv;
};

export const encryptBytes = async (bytes, secret) => {
  const iv = randomIv();
  const key = await importRoomKey(secret);
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const encrypted = await subtleCrypto().encrypt({ name: "AES-GCM", iv }, key, source);
  return { version: COLLABORATION_ENVELOPE_VERSION, iv: encodeBase64Url(iv), data: encodeBase64Url(new Uint8Array(encrypted)) };
};

export const decryptBytes = async (envelope, secret) => {
  if (!envelope || envelope.version !== COLLABORATION_ENVELOPE_VERSION) throw new Error("Unsupported multiplayer encryption envelope.");
  try {
    const key = await importRoomKey(secret);
    const decrypted = await subtleCrypto().decrypt(
      { name: "AES-GCM", iv: decodeBase64Url(envelope.iv) },
      key,
      decodeBase64Url(envelope.data),
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    throw new Error("The multiplayer payload could not be decrypted.", { cause: error });
  }
};

export const encryptJson = (value, secret) => encryptBytes(new TextEncoder().encode(JSON.stringify(value)), secret);

export const decryptJson = async (envelope, secret) => {
  const bytes = await decryptBytes(envelope, secret);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("The multiplayer payload is not valid JSON.", { cause: error });
  }
};
