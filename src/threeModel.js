import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { USDLoader } from "three/examples/jsm/loaders/USDLoader.js";

// Model loading is deliberately explicit and format allow-listed. A model
// source may come from a local session blob or a caller-supplied URL, but it
// can never execute authored JavaScript or reach arbitrary DOM state.
export const THREE_MODEL_FORMATS = Object.freeze(["obj", "gltf", "glb", "usd", "usda", "usdc", "usdz"]);
export const THREE_MODEL_EXTENSIONS = Object.freeze([".obj", ".gltf", ".glb", ".usd", ".usda", ".usdc", ".usdz"]);

const MODEL_FORMAT_BY_EXTENSION = Object.freeze({
  obj: "obj",
  gltf: "gltf",
  glb: "glb",
  usd: "usd",
  usda: "usda",
  usdc: "usdc",
  usdz: "usdz",
});

const cleanString = value => String(value ?? "").trim();

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
    || /\.(obj|gltf|glb|usd|usda|usdc|usdz)$/i.test(name);
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

export const loadThreeModel = async (url, { format = "" } = {}) => {
  const source = cleanString(url);
  if (!source) throw new Error("A model URL or local file is required.");
  const resolvedFormat = inferThreeModelFormat(source, format);
  if (!resolvedFormat) throw new Error("Unsupported 3D model format. Use OBJ, glTF/GLB, or USD/USDZ.");
  let asset;
  if (resolvedFormat === "obj") asset = await new OBJLoader().loadAsync(source);
  else if (["gltf", "glb"].includes(resolvedFormat)) asset = await new GLTFLoader().loadAsync(source);
  else asset = await new USDLoader().loadAsync(source);
  const root = asset?.scene || asset;
  if (!root || !(root instanceof THREE.Object3D)) throw new Error("The model did not contain a renderable scene.");
  return Object.freeze({
    format: resolvedFormat,
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
    url: "https://groups.csail.mit.edu/graphics/classes/6.837/F03/models/teapot.obj",
    description: "Classic OBJ teapot from MIT 6.837.",
  },
]);

export const getThreeModelExample = id => THREE_MODEL_EXAMPLES.find(example => example.id === cleanString(id)) || null;
