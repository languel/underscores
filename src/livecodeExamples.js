import { P5_EXAMPLES } from "./p5Frame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";
import { SHADER_EXAMPLES } from "./shaderLivecode.js";
import { MANIM_DEMO_EXAMPLES } from "./manimDemoExamples.js";
import { LIVECODE_KINDS, defaultLivecodeSource } from "./livecodeNode.js";
import { ORCA_GRID_HEIGHT, ORCA_GRID_WIDTH } from "./orcaEngine.js";
import { THREE_MODEL_EXAMPLES } from "./threeModel.js";

const orcaGrid = (...rows) => Array.from(
  { length: ORCA_GRID_HEIGHT },
  (_, index) => String(rows[index] || "").padEnd(ORCA_GRID_WIDTH, ".").slice(0, ORCA_GRID_WIDTH),
).join("\n");

// Build a row from coordinates so musical examples stay readable and do not
// depend on counting a long run of placeholder cells by hand.
const orcaRow = entries => {
  const row = Array(ORCA_GRID_WIDTH).fill(".");
  entries.forEach(([x, glyph]) => {
    if (Number.isInteger(x) && x >= 0 && x < ORCA_GRID_WIDTH) row[x] = String(glyph || ".").slice(0, 1);
  });
  return row.join("");
};

// Keep one deliberately small source template for every persisted Livecode
// kind. These are available to callers that want to seed a node, but they do
// not need a synthetic "Barebones" entry in the user-facing example list.
export const LIVECODE_TEMPLATES = Object.freeze({
  [LIVECODE_KINDS.strudel]: `// Ctrl/Cmd+Enter evaluates this node.\n$: note("c3 e3 g3 b3")\n  .s("sine")\n  .slow(2)`,
  [LIVECODE_KINDS.p5]: defaultLivecodeSource(LIVECODE_KINDS.p5),
  [LIVECODE_KINDS.manim]: defaultLivecodeSource(LIVECODE_KINDS.manim),
  [LIVECODE_KINDS.three]: defaultLivecodeSource(LIVECODE_KINDS.three),
  [LIVECODE_KINDS.playcore]: defaultLivecodeSource(LIVECODE_KINDS.playcore),
  [LIVECODE_KINDS.markdown]: `# Markdown starter\n\nWrite **rich text** here. Inline math: $E = mc^2$.\n\n- one\n- two`,
  [LIVECODE_KINDS.latex]: `\\frac{\\partial}{\\partial t} \\Psi = i \\nabla^2 \\Psi`,
  [LIVECODE_KINDS.html]: `<!doctype html>\n<main>\n  <h1>HTML starter</h1>\n  <p>Edit this isolated document.</p>\n</main>`,
  [LIVECODE_KINDS.orca]: defaultLivecodeSource(LIVECODE_KINDS.orca),
  [LIVECODE_KINDS.shader]: defaultLivecodeSource(LIVECODE_KINDS.shader),
  [LIVECODE_KINDS.tixy]: defaultLivecodeSource(LIVECODE_KINDS.tixy),
  [LIVECODE_KINDS.svg]: defaultLivecodeSource(LIVECODE_KINDS.svg),
});

const p5Examples = Object.freeze([
  ...P5_EXAMPLES.map(example => ({ id: example.id, label: example.name, name: example.name, source: example.source, mode: example.mode })),
]);

const manimExamples = Object.freeze([
  {
    id: "circle-to-square",
    label: "Basics · Circle to square",
    name: "Circle to square",
    source: `const circle = new Circle({ radius: 1.5 });
const square = new Square({ sideLength: 3 });

await scene.play(new Create(circle));
await scene.play(new Transform(circle, square));
await scene.play(new FadeOut(circle));`,
  },
  {
    id: "parameter-circle",
    label: "Interactive · Parameterized circle",
    name: "Parameterized circle",
    source: `// @param radius = 1.5 (0.25..3 step:0.05)
// @param scale = 1 (0.25..2 step:0.05)
const circle = new Circle({ radius: __.params.radius });
circle.scale(__.params.scale);
await scene.play(new Create(circle));`,
  },
  {
    id: "equation",
    label: "Math · Equation reveal",
    name: "Equation reveal",
    source: `const title = new MathTex({ latex: "e^{i\\\\pi}+1=0" });
await scene.play(new Write(title));
await scene.play(title.animate.scale(1.35));`,
  },
  {
    id: "cue-build",
    label: "Presentation · Cue build",
    name: "Cue build",
    settings: { progressionMode: "cue" },
    source: `const axes = new Axes({ xRange: [-4, 4, 1], yRange: [-2, 4, 1] });
await scene.play(new Create(axes));

await cue("Function");
const graph = new FunctionGraph({ func: x => 0.25 * x * x });
await scene.play(new Create(graph));

await cue("Equation");
const equation = new MathTex({ latex: "f(x)=\\\\frac{x^2}{4}" });
await scene.play(new Write(equation));`,
  },
  ...MANIM_DEMO_EXAMPLES,
]);

// Standalone Three.js starters. These examples deliberately use only the
// small runtime contract exposed by ThreeFrame so they can be copied into a
// node, edited in place, and run without a Manim scene or any external DOM.
const threeExamples = Object.freeze([
  {
    id: "unit-cube",
    label: "Basics · Unit cube",
    name: "Unit cube",
    source: `const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial(),
);
scene.add(cube);

tick(({ delta }) => {
  cube.rotation.x += delta * 0.7;
  cube.rotation.y += delta * 1.1;
});`,
  },
  {
    id: "lit-torus-knot",
    label: "Materials · Lit torus knot",
    name: "Lit torus knot",
    source: `const knot = new THREE.Mesh(
  new THREE.TorusKnotGeometry(0.85, 0.25, 128, 24),
  new THREE.MeshStandardMaterial({
    color: 0x8bd5ff,
    roughness: 0.3,
    metalness: 0.5,
  }),
);
scene.add(knot);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(2, 3, 4);
scene.add(key);
scene.add(new THREE.AmbientLight(0x334155, 1.2));

tick(({ time, delta }) => {
  knot.rotation.x = time * 0.35;
  knot.rotation.y += delta * 0.8;
});`,
  },
  {
    id: "orbiting-spheres",
    label: "Motion · Orbiting spheres",
    name: "Orbiting spheres",
    source: `const group = new THREE.Group();
const geometry = new THREE.SphereGeometry(0.16, 24, 16);
const colors = [0xff7aa2, 0x8bd5ff, 0xf5d76e, 0x9df59d];

colors.forEach((color, index) => {
  const sphere = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2 }),
  );
  const angle = (index / colors.length) * Math.PI * 2;
  sphere.position.set(Math.cos(angle) * 1.1, Math.sin(angle) * 1.1, 0);
  group.add(sphere);
});
scene.add(group);

const light = new THREE.PointLight(0xffffff, 18, 8);
light.position.set(0, 0, 2.5);
scene.add(light);

tick(({ time }) => {
  group.rotation.z = time * 0.55;
  group.rotation.x = Math.sin(time * 0.8) * 0.25;
});`,
  },
  {
    id: "parameter-dancing-lights",
    label: "Interactive · Parameter dancing lights",
    name: "Parameter dancing lights",
    source: `// A small light dance. Change these controls in Node settings.
// @param count = 12 (4..24 step:1)
// @param energy = 1.6 (0.4..3 step:0.1)
// @param radius = 1.15 (0.5..2 step:0.05)
const count = Math.max(4, Math.round(__.params.count));
const energy = Number(__.params.energy);
const radius = Number(__.params.radius);
const palette = [0x8bd5ff, 0xff7aa2, 0xf5d76e, 0x9df59d];
const geometry = new THREE.SphereGeometry(0.12, 16, 12);
const rig = new THREE.Group();
const dancers = [];

for (let index = 0; index < count; index += 1) {
  const color = palette[index % palette.length];
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.25,
    metalness: 0.35,
  });
  const orb = new THREE.Mesh(geometry, material);
  rig.add(orb);
  dancers.push({ orb, phase: (index / count) * Math.PI * 2, speed: 0.55 + (index % 5) * 0.08 });
}
scene.add(rig);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x080b14, 1.2));

const glowLights = [
  new THREE.PointLight(0x8bd5ff, energy * 8, 6),
  new THREE.PointLight(0xff7aa2, energy * 8, 6),
  new THREE.PointLight(0xf5d76e, energy * 6, 5),
];
glowLights.forEach(light => scene.add(light));

tick(({ time }) => {
  dancers.forEach(({ orb, phase, speed }, index) => {
    const angle = phase + time * speed;
    const orbit = radius * (0.55 + (index % 4) * 0.15);
    orb.position.set(
      Math.cos(angle) * orbit,
      Math.sin(angle * 1.3) * 0.85,
      Math.sin(angle) * orbit * 0.75,
    );
    orb.scale.setScalar(0.8 + 0.25 * Math.sin(time * 2 + phase));
    orb.material.emissiveIntensity = 0.45 + energy * 0.65;
  });
  glowLights.forEach((light, index) => {
    const angle = time * (0.35 + index * 0.12) + index * 2.1;
    light.position.set(Math.cos(angle) * radius, Math.sin(time + index) * 1.2, Math.sin(angle) * radius);
    light.intensity = energy * (index === 2 ? 6 : 8);
  });
  });`,
  },
  {
    id: "model-viewer-gltf",
    label: "Models · glTF viewer",
    name: "glTF model viewer",
    source: `// loadModel is the safe Three.js model loader. It accepts CORS-enabled
// OBJ, glTF/GLB, and USD/USDZ URLs and returns { scene, animations }.
const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "damaged-helmet")?.url || "")});
scene.add(asset.scene);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x101522, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(3, 4, 5);
scene.add(key);

tick(({ time }) => {
  asset.scene.rotation.y = time * 0.25;
});`,
  },
  {
    id: "model-viewer-animation-morph",
    label: "Models · Animation + blendshape",
    name: "Animated glTF blendshape",
    source: `// Khronos AnimatedMorphCube includes an animation and morph targets.
const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "animated-morph-cube")?.url || "")});
scene.add(asset.scene);
const mixer = new THREE.AnimationMixer(asset.scene);
if (asset.animations[0]) mixer.clipAction(asset.animations[0]).play();
let morph = 0;

tick(({ delta, time }) => {
  mixer.update(delta);
  morph = 0.5 + 0.5 * Math.sin(time * 1.7);
  asset.scene.traverse(object => {
    if (!object.morphTargetInfluences) return;
    object.morphTargetInfluences.fill(morph);
  });
});`,
  },
  {
    id: "model-viewer-obj-teapot",
    label: "Models · OBJ teapot",
    name: "MIT OBJ teapot",
    source: `const asset = await loadModel(${JSON.stringify(THREE_MODEL_EXAMPLES.find(example => example.id === "mit-teapot")?.url || "")});
scene.add(asset.scene);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x111827, 2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(2, 3, 4);
scene.add(light);

tick(({ time }) => {
  asset.scene.rotation.y = time * 0.15;
});`,
  },
  {
    id: "mediapipe-unicursal-3d",
    label: "MediaPipe · Unicursal ribbon (3D)",
    name: "MediaPipe · Unicursal ribbon (3D)",
    source: `// A volumetric unicursal drawing driven by Holistic pose landmarks.
// It weaves a closed ribbon through the pose instead of tracing the p5 path.
// Blender-style camera: Option-drag orbits, Shift+Option-drag pans,
// Ctrl+Option-drag zooms; two-finger drag orbits, Shift-two-finger pans,
// and Ctrl-two-finger zooms. WASD / arrow keys are also available.
const FEATURE_IDS = Object.freeze([
  "pose.left_wrist", "pose.left_elbow", "pose.left_shoulder", "pose.nose",
  "pose.right_shoulder", "pose.right_elbow", "pose.right_wrist",
  "pose.right_hip", "pose.right_knee", "pose.left_knee", "pose.left_hip",
]);
const FALLBACK = Object.freeze([
  { x: 0.16, y: 0.56, z: 0 }, { x: 0.25, y: 0.35, z: 0.1 },
  { x: 0.37, y: 0.42, z: 0.2 }, { x: 0.5, y: 0.23, z: 0.1 },
  { x: 0.63, y: 0.42, z: 0.2 }, { x: 0.75, y: 0.35, z: 0.1 },
  { x: 0.84, y: 0.56, z: 0 }, { x: 0.68, y: 0.7, z: -0.15 },
  { x: 0.58, y: 0.86, z: 0.05 }, { x: 0.42, y: 0.86, z: 0.05 },
  { x: 0.32, y: 0.7, z: -0.15 },
]);
let source = null;
const maxPoints = 180;
const positions = new Float32Array(maxPoints * 3);
const pathGeometry = new THREE.BufferGeometry();
const positionAttribute = new THREE.BufferAttribute(positions, 3);
positionAttribute.setUsage(THREE.DynamicDrawUsage);
pathGeometry.setAttribute("position", positionAttribute);
pathGeometry.setDrawRange(0, 0);
const ribbonMaterial = new THREE.LineBasicMaterial({
  color: __.colors?.foreground?.color || __.currentColor || 0x8bd5ff,
  transparent: true,
  opacity: 0.9,
});
const ribbon = new THREE.Line(pathGeometry, ribbonMaterial);
const points = new THREE.Points(pathGeometry, new THREE.PointsMaterial({
  color: 0xf5d76e,
  size: 0.075,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.8,
}));
scene.add(ribbon);
scene.add(points);
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x090b14, 1.8));
const rim = new THREE.PointLight(0xff7aa2, 12, 8);
rim.position.set(0, 1.5, 2.5);
scene.add(rim);

const readPoint = (stream, id) => {
  const feature = stream?.feature?.(id, { space: "normalized" });
  const point = feature?.position || feature?.normalized;
  return feature?.available && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: point.x, y: point.y, z: Number(point.z) || 0 }
    : null;
};
const readAnchors = () => {
  source ||= __.streams?.list?.().find(stream => stream.kind === "holistic");
  if (!source) return null;
  const anchors = FEATURE_IDS.map(id => readPoint(source, id));
  return anchors.every(Boolean) ? anchors : null;
};
const toWorld = point => new THREE.Vector3(
  (point.x - 0.5) * 3.8,
  (0.5 - point.y) * 2.8,
  -point.z * 1.8,
);
const makeRibbon = (anchors, time) => {
  const world = anchors.map(toWorld);
  const output = [];
  for (let index = 0; index < world.length; index += 1) {
    const from = world[index];
    const to = world[(index + 1) % world.length];
    const segmentCount = index === world.length - 1 ? 18 : 14;
    const tangent = new THREE.Vector3().subVectors(to, from).normalize();
    const weave = new THREE.Vector3(-tangent.y, tangent.x, tangent.z * 0.35).normalize();
    for (let step = 0; step < segmentCount; step += 1) {
      const amount = step / segmentCount;
      const point = new THREE.Vector3().lerpVectors(from, to, amount);
      const curl = Math.sin(amount * Math.PI * 2 + time * 1.2 + index * 0.65) * (0.08 + index * 0.004);
      point.addScaledVector(weave, curl);
      point.z += Math.cos(amount * Math.PI + time * 0.7) * 0.055;
      output.push(point);
    }
  }
  return output.slice(0, maxPoints);
};

tick(({ time }) => {
  const anchors = readAnchors() || FALLBACK;
  const path = makeRibbon(anchors, time);
  path.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });
  positionAttribute.needsUpdate = true;
  pathGeometry.setDrawRange(0, path.length);
  ribbonMaterial.color.set(__.colors?.foreground?.color || __.currentColor || "#8bd5ff");
  ribbon.rotation.y = Math.sin(time * 0.38) * 0.16;
  points.rotation.y = ribbon.rotation.y;
  rim.position.x = Math.sin(time * 0.7) * 1.4;
  rim.position.y = 1.2 + Math.cos(time * 0.9) * 0.45;
});`,
  },
  {
    id: "mediapipe-schlemmer-3d",
    label: "MediaPipe · Schlemmer costume (3D)",
    name: "MediaPipe · Schlemmer costume (3D)",
    source: `// A 3D Bauhaus costume assembled from primitives and driven by pose.
// This is intentionally a different construction from the p5 figurine:
// cylinders articulate the skeleton while boxes, cones, and torus hoops make
// an abstract costume volume. If no Holistic frame is ready, it holds a T-pose.
const T_POSE = Object.freeze({
  nose: { x: 0.5, y: 0.18, z: 0 },
  leftShoulder: { x: 0.34, y: 0.36, z: 0 }, rightShoulder: { x: 0.66, y: 0.36, z: 0 },
  leftElbow: { x: 0.18, y: 0.36, z: 0 }, rightElbow: { x: 0.82, y: 0.36, z: 0 },
  leftWrist: { x: 0.07, y: 0.36, z: 0 }, rightWrist: { x: 0.93, y: 0.36, z: 0 },
  leftHip: { x: 0.42, y: 0.58, z: 0 }, rightHip: { x: 0.58, y: 0.58, z: 0 },
  leftKnee: { x: 0.42, y: 0.78, z: 0 }, rightKnee: { x: 0.58, y: 0.78, z: 0 },
  leftAnkle: { x: 0.42, y: 0.97, z: 0 }, rightAnkle: { x: 0.58, y: 0.97, z: 0 },
});
const FEATURE_IDS = Object.freeze({
  nose: "pose.nose", leftShoulder: "pose.left_shoulder", rightShoulder: "pose.right_shoulder",
  leftElbow: "pose.left_elbow", rightElbow: "pose.right_elbow", leftWrist: "pose.left_wrist", rightWrist: "pose.right_wrist",
  leftHip: "pose.left_hip", rightHip: "pose.right_hip", leftKnee: "pose.left_knee", rightKnee: "pose.right_knee",
  leftAnkle: "pose.left_ankle", rightAnkle: "pose.right_ankle",
});
let source = null;
const primary = __.colors?.foreground?.color || __.currentColor || "#e8e8e8";
const blue = __.colors?.accent?.color || __.colors?.accent?.css || "#2f6de1";
const red = __.colors?.highlight?.color || __.colors?.highlight?.css || "#d94c3d";
const yellow = __.colors?.warning?.color || __.colors?.warning?.css || "#f5c84c";
const materials = {
  primary: new THREE.MeshStandardMaterial({ color: primary, roughness: 0.42, metalness: 0.15 }),
  blue: new THREE.MeshStandardMaterial({ color: blue, roughness: 0.32, metalness: 0.28 }),
  red: new THREE.MeshStandardMaterial({ color: red, roughness: 0.36, metalness: 0.2 }),
  yellow: new THREE.MeshStandardMaterial({ color: yellow, roughness: 0.38, metalness: 0.18 }),
};
const figure = new THREE.Group();
scene.add(figure);
// Standard materials need an explicit light rig. Keep it small and shared by
// the whole costume so the primitive volumes stay legible without adding a
// per-part light or an expensive post-processing pass.
scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x090b14, 1.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(-2.5, 3.5, 4.5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff7aa2, 10, 8);
rimLight.position.set(2.2, 0.8, 2.8);
scene.add(rimLight);
const makeMesh = (geometry, material) => { const mesh = new THREE.Mesh(geometry, material); figure.add(mesh); return mesh; };
const torso = makeMesh(new THREE.BoxGeometry(1, 1, 1), materials.blue);
const chestBlock = makeMesh(new THREE.BoxGeometry(1, 1, 1), materials.red);
const shoulderBeam = makeMesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 16), materials.yellow);
const hipHoop = makeMesh(new THREE.TorusGeometry(0.72, 0.08, 12, 32), materials.red);
const chestHoop = makeMesh(new THREE.TorusGeometry(0.64, 0.055, 12, 32), materials.yellow);
const headOuter = makeMesh(new THREE.SphereGeometry(0.42, 20, 14), materials.primary);
const headInner = makeMesh(new THREE.SphereGeometry(0.29, 16, 12), materials.yellow);
const headRing = makeMesh(new THREE.TorusGeometry(0.53, 0.045, 10, 28), materials.blue);
const eyeLeft = makeMesh(new THREE.SphereGeometry(0.052, 12, 8), materials.blue);
const eyeRight = makeMesh(new THREE.SphereGeometry(0.052, 12, 8), materials.blue);
const halo = makeMesh(new THREE.TorusGeometry(1.05, 0.035, 10, 40), materials.blue);
const wedge = makeMesh(new THREE.ConeGeometry(0.36, 0.8, 4), materials.yellow);
const armParts = [
  ["leftShoulder", "leftElbow", materials.blue], ["leftElbow", "leftWrist", materials.yellow],
  ["rightShoulder", "rightElbow", materials.red], ["rightElbow", "rightWrist", materials.yellow],
  ["leftHip", "leftKnee", materials.red], ["leftKnee", "leftAnkle", materials.blue],
  ["rightHip", "rightKnee", materials.yellow], ["rightKnee", "rightAnkle", materials.blue],
].map(([from, to, material]) => ({ from, to, mesh: makeMesh(new THREE.CylinderGeometry(0.13, 0.17, 1, 12), material) }));
const joints = Object.fromEntries(Object.keys(FEATURE_IDS).filter(id => id !== "nose").map(id => [id, makeMesh(new THREE.SphereGeometry(0.14, 14, 10), materials.primary)]));
const readPoint = (stream, id) => {
  const feature = stream?.feature?.(id, { space: "normalized" });
  const point = feature?.position || feature?.normalized;
  return feature?.available && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: point.x, y: point.y, z: Number(point.z) || 0 }
    : null;
};
const toWorld = point => new THREE.Vector3((point.x - 0.5) * 3.2, (0.5 - point.y) * 3.0, -point.z * 1.8);
const readPose = () => {
  source ||= __.streams?.list?.().find(stream => stream.kind === "holistic");
  if (!source) return { pose: T_POSE, live: false };
  const pose = Object.fromEntries(Object.entries(FEATURE_IDS).map(([name, id]) => [name, readPoint(source, id)]));
  return Object.values(pose).every(Boolean) ? { pose, live: true } : { pose: T_POSE, live: false };
};
const midpoint = (a, b) => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
const placeLimb = (part, from, to) => {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(0.01, direction.length());
  part.mesh.position.copy(midpoint(from, to));
  part.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  part.mesh.scale.set(1, length, 1);
};
const placeBlock = (mesh, center, width, height, depth, direction) => {
  mesh.position.copy(center);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.scale.set(width, height, depth);
};

tick(({ time }) => {
  const { pose, live } = readPose();
  const world = Object.fromEntries(Object.entries(pose).map(([name, point]) => [name, toWorld(point)]));
  const shoulderMid = midpoint(world.leftShoulder, world.rightShoulder);
  const hipMid = midpoint(world.leftHip, world.rightHip);
  const shoulderSpan = world.leftShoulder.distanceTo(world.rightShoulder);
  const torsoHeight = shoulderMid.distanceTo(hipMid);
  const torsoDirection = new THREE.Vector3().subVectors(hipMid, shoulderMid);
  placeBlock(torso, midpoint(shoulderMid, hipMid), shoulderSpan * 0.82, torsoHeight * 1.08, shoulderSpan * 0.48, torsoDirection);
  placeBlock(chestBlock, midpoint(shoulderMid, hipMid).add(new THREE.Vector3(0, 0, 0.3)), shoulderSpan * 0.34, torsoHeight * 0.65, shoulderSpan * 0.62, torsoDirection);
  shoulderBeam.position.copy(shoulderMid);
  shoulderBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(world.rightShoulder, world.leftShoulder).normalize());
  shoulderBeam.scale.set(1, shoulderSpan, 1);
  hipHoop.position.copy(hipMid);
  hipHoop.scale.set(shoulderSpan * 1.05, shoulderSpan * 0.68, 1);
  chestHoop.position.copy(shoulderMid).add(new THREE.Vector3(0, -torsoHeight * 0.18, 0.1));
  chestHoop.rotation.x = Math.PI / 2;
  chestHoop.scale.set(shoulderSpan * 0.9, shoulderSpan * 0.58, 1);
  armParts.forEach(part => placeLimb(part, world[part.from], world[part.to]));
  Object.entries(joints).forEach(([name, mesh]) => mesh.position.copy(world[name]));
  headOuter.position.copy(world.nose);
  headInner.position.copy(world.nose).add(new THREE.Vector3(0, 0, 0.12));
  headRing.position.copy(world.nose);
  headRing.rotation.x = Math.PI / 2;
  eyeLeft.position.copy(world.nose).add(new THREE.Vector3(-0.13, 0.03, 0.35));
  eyeRight.position.copy(world.nose).add(new THREE.Vector3(0.13, 0.03, 0.35));
  halo.position.copy(shoulderMid).add(new THREE.Vector3(0, 0, -0.35));
  halo.rotation.x = Math.PI / 2;
  halo.rotation.z = time * 0.22;
  wedge.position.copy(hipMid).add(new THREE.Vector3(0, -torsoHeight * 0.22, 0.15));
  wedge.rotation.y = time * 0.35;
  wedge.scale.setScalar(Math.max(0.55, shoulderSpan * 0.8));
  figure.rotation.y = Math.sin(time * 0.3) * 0.08;
  figure.userData.poseMode = live ? "mediapipe" : "t-pose";
});`,
  },
]);

const playCoreExamples = Object.freeze([
  ...PLAY_CORE_EXAMPLES.map(example => ({ id: example.id, label: `${example.category} · ${example.name}`, name: example.name, source: example.source })),
]);

const orcaExamples = Object.freeze([
  {
    id: "single-note",
    label: "Basics · Single MIDI note",
    name: "Single MIDI note",
    source: orcaGrid(
      "................................",
      "...........*:04Cf1..............",
    ),
  },
  {
    id: "clocked-note",
    label: "Loops · Clocked MIDI note",
    name: "Clocked MIDI note",
    source: orcaGrid(
      "................................",
      "..........1D4...................",
      "...........*....................",
      "...........:04Cf1...............",
    ),
  },
  {
    id: "counter",
    label: "Basics · Counter",
    name: "Counter",
    source: orcaGrid(
      "................................",
      "..........1I8...................",
      "................................",
    ),
  },
  {
    id: "random-pattern",
    label: "Patterns · Random value",
    name: "Random value",
    source: orcaGrid(
      "................................",
      "..........0Rf...................",
      "................................",
    ),
  },
  {
    id: "random-melody-2bar",
    label: "Melody · Random 2-bar quarter notes",
    name: "Random 2-bar quarter-note melody",
    settings: { orcaLoopFrames: 32 },
    source: orcaGrid(
      orcaRow([[10, "1"], [11, "D"], [12, "4"]]),
      orcaRow([[11, "*"], [13, "a"], [14, "R"], [15, "f"]]),
      orcaRow([[11, ":"], [12, "0"], [13, "4"], [15, "f"], [16, "1"]]),
    ),
  },
]);

const tixyExamples = Object.freeze([
  {
    id: "waves",
    label: "Basics · Waves",
    name: "Waves",
    source: defaultLivecodeSource(LIVECODE_KINDS.tixy),
  },
  {
    id: "ripple",
    label: "Motion · Ripple",
    name: "Ripple",
    source: "sin(t * 2 - sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2))",
  },
  {
    id: "checkerboard",
    label: "Logic · Checkerboard",
    name: "Checkerboard",
    source: "(x + y + floor(t * 0.01 * 2)) % 2 ? 1 : 0",
  },
  {
    id: "orbit",
    label: "Math · Orbit",
    name: "Orbit",
    source: "sin(t * 3 + atan2(y - 7.5, x - 7.5) * 4) * (1 - min(1, sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2) / 8))",
  },
]);

// A small, local Strudel library: the first entries teach one idea at a time,
// while the final theme demonstrates several voices, effects, and a frame
// visualizer in one editable node. Keep the source self-contained so examples
// remain useful offline and can be freely modified after selection.
const strudelExamples = Object.freeze([
  {
    id: "starter",
    label: "Starter · Chord piano roll",
    name: "Chord piano roll",
    source: defaultLivecodeSource(LIVECODE_KINDS.strudel),
  },
  {
    id: "four-on-the-floor",
    label: "Basics · Four-on-the-floor",
    name: "Four-on-the-floor",
    source: `// A steady kick and backbeat.
$: s("bd ~ bd ~, ~ sd ~ sd")`,
  },
  {
    id: "hi-hat-grid",
    label: "Basics · Hi-hat grid",
    name: "Hi-hat grid",
    source: `// Layer a bright eighth-note hat pattern.
$: s("hh*8")
  .gain(0.35)`,
  },
  {
    id: "slow-arpeggio",
    label: "Basics · Slow arpeggio",
    name: "Slow arpeggio",
    source: `// Mini notation turns the note list into a repeating pattern.
$: note("c4 e4 g4 b4")
  .s("sine")
  .slow(2)`,
  },
  {
    id: "bass-and-drums",
    label: "Grooves · Bass and drums",
    name: "Bass and drums",
    source: `// Two voices: a low pulse and a compact drum groove.
$: note("<c2 c2 g1 g1>")
  .s("sawtooth")
  .lpf(420)
  .gain(0.45)
$: s("bd ~ sd ~, ~ hh*2 ~ hh*2")
  .gain(0.55)`,
  },
  {
    id: "neon-night",
    label: "Theme · Neon night",
    name: "Neon night",
    source: `// A small theme with chords, bass, drums, color, and a piano roll.
$: note("<[c3,e3,g3] [a2,c3,e3] [f2,a2,c3] [g2,b2,d3]>")
  .s("triangle")
  .slow(2)
  .room(0.35)
  .gain(0.42)
  .color("<#ff7aa2 #7ad7ff #ffe08a #b5ff9a>")
  ._pianoroll({ height: 88, fold: 1 })
$: note("<c2 c2 a1 g1>")
  .s("sawtooth")
  .slow(2)
  .lpf(360)
  .gain(0.28)
$: s("bd ~ bd ~, ~ sd ~ sd, hh*8")
  .gain(0.5)`,
  },
]);

export const getLivecodeExamples = kind => {
  if (kind === LIVECODE_KINDS.p5) return p5Examples;
  if (kind === LIVECODE_KINDS.manim) return manimExamples;
  if (kind === LIVECODE_KINDS.three) return threeExamples;
  if (kind === LIVECODE_KINDS.playcore) return playCoreExamples;
  if (kind === LIVECODE_KINDS.strudel) return strudelExamples;
  if (kind === LIVECODE_KINDS.orca) return orcaExamples;
  if (kind === LIVECODE_KINDS.shader) return SHADER_EXAMPLES.map(example => ({ id: example.id, label: example.label, name: example.name, source: example.source, mode: example.mode, dialect: example.dialect }));
  if (kind === LIVECODE_KINDS.tixy) return tixyExamples;
  return [];
};
