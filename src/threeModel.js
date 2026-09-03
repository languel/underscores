import * as THREE from "three";
import { strFromU8, unzipSync } from "fflate";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";

// Model loading is deliberately explicit and format allow-listed. A model
// source may come from a local session blob or a caller-supplied URL, but it
// can never execute authored JavaScript or reach arbitrary DOM state.
export const THREE_MODEL_FORMATS = Object.freeze(["obj", "gltf", "glb", "usd", "usda", "usdc", "usdz", "zip"]);
export const THREE_MODEL_EXTENSIONS = Object.freeze([".obj", ".gltf", ".glb", ".usd", ".usda", ".usdc", ".usdz", ".zip"]);

const MODEL_FORMAT_BY_EXTENSION = Object.freeze({
  obj: "obj",
  gltf: "gltf",
  glb: "glb",
  usd: "usd",
  usda: "usda",
  usdc: "usdc",
  usdz: "usdz",
  zip: "zip",
});

const cleanString = value => String(value ?? "").trim();

/**
 * Center and scale a loaded model for the shared preview camera.
 *
 * The translation is intentionally computed after scaling. Three.js composes
 * an object's transform as translation * rotation * scale; translating the
 * pre-scale bounds first leaves models with large authored coordinate offsets
 * (for example Walt Head) outside the camera even though the loader succeeds.
 */
export const fitThreeModelRootToFrame = (root, targetSize = 2.4) => {
  if (!root?.updateWorldMatrix) return false;
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return false;
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  root.scale.setScalar(Math.max(0.001, Number(targetSize) || 2.4) / largest);
  root.updateWorldMatrix(true, true);
  const fittedCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  root.position.sub(fittedCenter);
  root.updateWorldMatrix(true, true);
  return true;
};

// Archives are a convenient way to distribute OBJ plus its companion MTL and
// textures, but they are still untrusted input. Keep decompression bounded so
// a malformed or highly-compressed archive cannot allocate an unbounded model
// in the browser.
export const THREE_MODEL_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
export const THREE_MODEL_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;
export const THREE_MODEL_ARCHIVE_MAX_FILES = 256;

const normalizeArchivePath = value => {
  let decoded = String(value || "").replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch { /* retain the raw path */ }
  const parts = [];
  decoded.split("/").forEach(part => {
    if (!part || part === ".") return;
    if (part === "..") { parts.pop(); return; }
    parts.push(part);
  });
  return parts.join("/");
};

const archiveBasename = value => normalizeArchivePath(value).split("/").pop() || "";

const findArchiveFile = (files, requested, baseDir = "") => {
  const raw = cleanString(requested);
  if (!raw) return null;
  const candidate = normalizeArchivePath(baseDir ? `${baseDir}/${raw}` : raw);
  if (files.has(candidate)) return { name: candidate, bytes: files.get(candidate) };
  const lowerCandidate = candidate.toLowerCase();
  for (const [name, bytes] of files) {
    if (name.toLowerCase() === lowerCandidate) return { name, bytes };
  }
  const basename = archiveBasename(candidate).toLowerCase();
  const matches = [...files.entries()].filter(([name]) => archiveBasename(name).toLowerCase() === basename);
  return matches.length === 1 ? { name: matches[0][0], bytes: matches[0][1] } : null;
};

const chooseArchiveObj = (files, preferredEntry = "") => {
  const preferred = findArchiveFile(files, preferredEntry);
  if (preferred?.name.toLowerCase().endsWith(".obj")) return preferred;
  const candidates = [...files.entries()]
    .filter(([name]) => name.toLowerCase().endsWith(".obj"))
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => {
      const score = value => {
        const base = archiveBasename(value.name).toLowerCase();
        return (base === "scene.obj" ? 0 : base === "model.obj" ? 1 : base === "bunny.obj" ? 2 : value.name.includes("/") ? 4 : 3);
      };
      return score(a) - score(b) || a.name.length - b.name.length || a.name.localeCompare(b.name);
    });
  return candidates[0] || null;
};

const toBase64 = bytes => {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return globalThis.btoa(binary);
  }
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  throw new Error("This browser cannot decode an in-archive texture.");
};

const archiveMimeType = name => {
  const extension = archiveBasename(name).split(".").pop()?.toLowerCase();
  return extension === "png" ? "image/png"
    : ["jpg", "jpeg"].includes(extension) ? "image/jpeg"
      : extension === "webp" ? "image/webp"
        : extension === "gif" ? "image/gif"
          : extension === "svg" ? "image/svg+xml"
            : "application/octet-stream";
};

/**
 * Decode a bounded ZIP archive and select its OBJ entry. This small helper is
 * exported so import behavior can be tested without downloading a fixture.
 */
export const extractThreeModelArchive = (value, preferredEntry = "") => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  if (!bytes.byteLength) throw new Error("The model archive is empty.");
  if (bytes.byteLength > THREE_MODEL_ARCHIVE_MAX_BYTES) throw new Error("The model archive is larger than 64 MB.");
  let decoded;
  try {
    let fileCount = 0;
    let uncompressedBytes = 0;
    decoded = unzipSync(bytes, {
      // fflate invokes the filter with central-directory metadata before it
      // allocates each output buffer. Reject oversized archives at that point
      // rather than decompressing a zip bomb and checking only afterwards.
      filter: entry => {
        const normalized = normalizeArchivePath(entry.name);
        if (!normalized || String(entry.name).endsWith("/")) return false;
        fileCount += 1;
        uncompressedBytes += Math.max(0, Number(entry.originalSize) || 0);
        if (fileCount > THREE_MODEL_ARCHIVE_MAX_FILES) throw new Error("The model archive contains too many files.");
        if (uncompressedBytes > THREE_MODEL_ARCHIVE_MAX_UNCOMPRESSED_BYTES) throw new Error("The uncompressed model archive is larger than 256 MB.");
        return true;
      },
    });
  } catch (error) {
    if (/^The (?:model archive|uncompressed model archive)/.test(String(error?.message || ""))) throw error;
    throw new Error("The model archive is not a valid ZIP file.");
  }
  const entries = Object.entries(decoded)
    .filter(([name, entry]) => normalizeArchivePath(name) && !String(name).endsWith("/") && entry instanceof Uint8Array);
  if (entries.length > THREE_MODEL_ARCHIVE_MAX_FILES) throw new Error("The model archive contains too many files.");
  const totalBytes = entries.reduce((total, [, entry]) => total + entry.byteLength, 0);
  if (totalBytes > THREE_MODEL_ARCHIVE_MAX_UNCOMPRESSED_BYTES) throw new Error("The uncompressed model archive is larger than 256 MB.");
  const files = new Map(entries.map(([name, entry]) => [normalizeArchivePath(name), entry]));
  const objectEntry = chooseArchiveObj(files, preferredEntry);
  if (!objectEntry) throw new Error("The ZIP archive does not contain an OBJ file.");
  return {
    files,
    objEntry: objectEntry.name,
    objText: strFromU8(objectEntry.bytes),
  };
};

export const inferThreeModelFormat = (value = "", explicit = "") => {
  const requested = cleanString(explicit).toLowerCase().replace(/^\./, "");
  if (THREE_MODEL_FORMATS.includes(requested)) return requested;
  const source = cleanString(value).split(/[?#]/)[0].toLowerCase();
  const extension = source.match(/\.([a-z0-9]+)$/)?.[1] || "";
  return MODEL_FORMAT_BY_EXTENSION[extension] || "";
};

export const isThreeModelFile = file => {
  if (!file) return false;
  const type = cleanString(file.type).toLowerCase();
  const name = cleanString(file.name);
  return type === "model/obj"
    || type === "model/gltf+json"
    || type === "model/gltf-binary"
    || type === "model/usd"
    || type === "application/zip"
    || type === "application/x-zip-compressed"
    || /\.(obj|gltf|glb|usd|usda|usdc|usdz|zip)$/i.test(name);
};

export const normalizeThreeModelSettings = value => {
  const raw = value && typeof value === "object" ? value : {};
  const morphTargets = raw.morphTargets && typeof raw.morphTargets === "object" && !Array.isArray(raw.morphTargets)
    ? Object.fromEntries(Object.entries(raw.morphTargets)
      .filter(([key]) => cleanString(key))
      .slice(0, 128)
      .map(([key, target]) => [cleanString(key), Math.max(0, Math.min(1, Number(target) || 0))]))
    : {};
  const playbackRate = Number(raw.playbackRate);
  return {
    version: 1,
    animation: cleanString(raw.animation),
    playing: raw.playing !== false,
    loop: raw.loop !== false,
    playbackRate: Number.isFinite(playbackRate) ? Math.max(0, Math.min(8, playbackRate)) : 1,
    morphTargets,
  };
};

const loadZipThreeModel = async (source, preferredEntry = "") => {
  let response;
  try {
    response = await fetch(source);
  } catch {
    throw new Error("Could not download the model archive. Check the URL and its CORS policy.");
  }
  if (!response.ok) throw new Error(`Could not download the model archive (${response.status}).`);
  let payload;
  try {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > THREE_MODEL_ARCHIVE_MAX_BYTES) {
      throw new Error("The model archive is larger than 64 MB.");
    }
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        totalBytes += result.value?.byteLength || 0;
        if (totalBytes > THREE_MODEL_ARCHIVE_MAX_BYTES) {
          void reader.cancel();
          throw new Error("The model archive is larger than 64 MB.");
        }
        chunks.push(result.value);
      }
      payload = new Uint8Array(totalBytes);
      let offset = 0;
      chunks.forEach(chunk => { payload.set(chunk, offset); offset += chunk.byteLength; });
    } else {
      payload = new Uint8Array(await response.arrayBuffer());
      if (payload.byteLength > THREE_MODEL_ARCHIVE_MAX_BYTES) throw new Error("The model archive is larger than 64 MB.");
    }
  } catch (error) {
    if (/^The model archive is larger/.test(String(error?.message || ""))) throw error;
    throw new Error("Could not read the model archive. Check the URL and its CORS policy.");
  }
  const archive = extractThreeModelArchive(payload, preferredEntry);
  const objDirectory = archive.objEntry.includes("/") ? archive.objEntry.slice(0, archive.objEntry.lastIndexOf("/")) : "";
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(requested => {
    const entry = findArchiveFile(archive.files, requested);
    return entry ? `data:${archiveMimeType(entry.name)};base64,${toBase64(entry.bytes)}` : requested;
  });

  // OBJ files refer to their material library from inside the text file. When
  // that library is bundled, resolve it through the same in-memory archive so
  // MTL textures never require a second upload or a server-side unpack step.
  const materialName = archive.objText.match(/^\s*mtllib\s+(.+?)\s*$/im)?.[1] || "";
  const materialEntry = findArchiveFile(archive.files, materialName, objDirectory);
  const objLoader = new OBJLoader(manager);
  if (materialEntry) {
    const materials = new MTLLoader(manager).parse(strFromU8(materialEntry.bytes), materialEntry.name.includes("/") ? `${materialEntry.name.slice(0, materialEntry.name.lastIndexOf("/"))}/` : "");
    materials.preload();
    objLoader.setMaterials(materials);
  }
  return {
    asset: objLoader.parse(archive.objText),
    format: "obj",
    sourceFormat: "zip",
    archiveEntry: archive.objEntry,
  };
};

export const loadThreeModel = async (url, { format = "", archiveEntry = "" } = {}) => {
  const source = cleanString(url);
  if (!source) throw new Error("A model URL or local file is required.");
  const resolvedFormat = inferThreeModelFormat(source, format);
  if (!resolvedFormat) throw new Error("Unsupported 3D model format. Use OBJ, glTF/GLB, USD/USDZ, or a ZIP containing an OBJ.");
  let asset;
  let sourceFormat = resolvedFormat;
  let selectedArchiveEntry = "";
  if (resolvedFormat === "zip") {
    const loaded = await loadZipThreeModel(source, archiveEntry);
    asset = loaded.asset;
    sourceFormat = loaded.sourceFormat;
    selectedArchiveEntry = loaded.archiveEntry;
  } else if (resolvedFormat === "obj") asset = await new OBJLoader().loadAsync(source);
  else if (["gltf", "glb"].includes(resolvedFormat)) asset = await new GLTFLoader().loadAsync(source);
  else asset = await new USDLoader().loadAsync(source);
  const root = asset?.scene || asset;
  if (!root || !(root instanceof THREE.Object3D)) throw new Error("The model did not contain a renderable scene.");
  return Object.freeze({
    format: resolvedFormat === "zip" ? "obj" : resolvedFormat,
    sourceFormat,
    archiveEntry: selectedArchiveEntry,
    root,
    scene: root,
    animations: Array.isArray(asset?.animations) ? asset.animations : [],
    asset,
  });
};

export const THREE_MODEL_EXAMPLES = Object.freeze([
  {
    id: "damaged-helmet",
    name: "Damaged Helmet · glTF",
    format: "glb",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    description: "Khronos glTF sample with physically based materials.",
  },
  {
    id: "animated-morph-cube",
    name: "Animated Morph Cube · glTF",
    format: "glb",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimatedMorphCube/glTF-Binary/AnimatedMorphCube.glb",
    description: "Small Khronos sample combining animation and morph targets.",
  },
  {
    id: "mit-teapot",
    name: "Utah Teapot · OBJ",
    format: "obj",
    url: "https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/teapot.obj",
    description: "Classic Utah teapot OBJ mirrored in a CORS-enabled GitHub model collection.",
  },
  {
    id: "stanford-bunny-zip",
    name: "Stanford Bunny · OBJ",
    format: "obj",
    url: "https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/stanford-bunny.obj",
    description: "Common Stanford Bunny OBJ from a CORS-enabled GitHub model collection.",
  },
  {
    id: "three-walt-head",
    name: "Walt Head · OBJ",
    format: "obj",
    url: "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/obj/walt/WaltHead.obj",
    description: "CORS-friendly OBJ sample from the Three.js examples.",
  },
]);

export const getThreeModelExample = id => THREE_MODEL_EXAMPLES.find(example => example.id === cleanString(id)) || null;
