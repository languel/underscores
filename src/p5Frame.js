import {
  LIVECODE_BACKGROUND_MODES,
  LIVECODE_PERSISTENCE_MODES,
  shouldClearLivecodeFrame,
} from "./livecodeComposition.js";

export const P5_FRAME_STORAGE_KEY = "underscores_p5_scripts";

export const P5_RUNTIME_OPTIONS = Object.freeze([
  Object.freeze({ id: "2", version: "2.3.2", label: "2.3.2 · latest 2.x" }),
  Object.freeze({ id: "1", version: "1.11.13", label: "1.11.13 · latest 1.x" }),
]);

export const DEFAULT_P5_VERSION = "2";
export const DEFAULT_P5_CDN_URL = "https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.min.js";
export const DEFAULT_P5_LEGACY_CDN_URL = "https://cdn.jsdelivr.net/npm/p5@1.11.13/lib/p5.min.js";

export const normalizeP5Version = value => (
  String(value || "").trim().startsWith("1") ? "1" : DEFAULT_P5_VERSION
);

export const getP5RuntimeOption = value => (
  P5_RUNTIME_OPTIONS.find(option => option.id === normalizeP5Version(value)) || P5_RUNTIME_OPTIONS[0]
);

export const DEFAULT_P5_SOURCE = `// p5 instance-mode sketch. __ is the node-local Underscores bridge.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
};

p.draw = () => {
  if (__.frame.transparent) p.clear();
  else p.background(18);
  p.noFill();
  p.stroke(220);
  p.strokeWeight(3);
  const radius = Math.min(p.width, p.height) * 0.28;
  p.circle(p.width / 2, p.height / 2, radius * 2);
  p.line(p.width / 2 - radius, p.height / 2, p.width / 2 + radius, p.height / 2);
};`;

export const DEFAULT_P5_CLASSIC_SOURCE = `// Classic p5 global-mode sketch. __ is the node-local Underscores bridge.
function setup() {
  createCanvas(__.element.width, __.element.height);
}

function draw() {
  if (__.frame.transparent) clear();
  else background(18);
  noFill();
  stroke(220);
  strokeWeight(3);
  const radius = Math.min(width, height) * 0.28;
  circle(width / 2, height / 2, radius * 2);
  line(width / 2 - radius, height / 2, width / 2 + radius, height / 2);
}`;

// These are deliberately small, readable starting points rather than a
// gallery of opaque effects. Loading one creates an editable catalog script;
// it never overwrites an existing sketch.
export const P5_EXAMPLES = Object.freeze([
  Object.freeze({
    id: "mediapipe-unicursal",
    name: "MediaPipe · Unicursal portrait",
    mode: "instance",
    source: `// Artistic single-line portrait from the first live Holistic stream.
// Add a Media Input and Holistic object before running this sketch.
let source = null;

p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.pixelDensity(1);
};

p.draw = () => {
  p.clear();
  source ||= __.streams.list().find(stream => stream.kind === "holistic");
  const frame = source && __.art?.unicursal.generate(source.id, {
    preset: "smooth",
    outputSpace: "normalized",
    geometry: { pointBudget: 384 },
    ink: { color: __.currentColor, width: 3 },
  });
  if (!frame?.available) {
    p.fill(__.currentColor);
    p.noStroke();
    p.text("Waiting for a Holistic frame…", 18, 28);
    return;
  }
  p.noFill();
  p.stroke(__.currentColor);
  p.strokeCap(p.ROUND);
  for (let index = 1; index < frame.points.length; index += 1) {
    const a = frame.points[index - 1];
    const b = frame.points[index];
    p.strokeWeight(Math.max(0.5, (a.width + b.width) / 2));
    p.line(a.x * p.width, a.y * p.height, b.x * p.width, b.y * p.height);
  }
};`,
  }),
  Object.freeze({
    id: "mediapipe-schlemmer-pose",
    name: "MediaPipe · Schlemmer pose",
    mode: "instance",
    source: `// Abstract figurine driven by a Holistic pose.
// If MediaPipe is unavailable, the same Bauhaus costume is shown in a stable T-pose.
// The circles, cylinders, hoops, blocks, and wedges echo Schlemmer's transformed body.
const T_POSE = Object.freeze({
  nose: { x: 0.5, y: 0.18 },
  leftShoulder: { x: 0.34, y: 0.36 },
  rightShoulder: { x: 0.66, y: 0.36 },
  leftElbow: { x: 0.18, y: 0.36 },
  rightElbow: { x: 0.82, y: 0.36 },
  leftWrist: { x: 0.07, y: 0.36 },
  rightWrist: { x: 0.93, y: 0.36 },
  leftHip: { x: 0.42, y: 0.58 },
  rightHip: { x: 0.58, y: 0.58 },
  leftKnee: { x: 0.42, y: 0.78 },
  rightKnee: { x: 0.58, y: 0.78 },
  leftAnkle: { x: 0.42, y: 0.97 },
  rightAnkle: { x: 0.58, y: 0.97 },
});

const POSE_FEATURES = Object.freeze({
  nose: "pose.nose",
  leftShoulder: "pose.left_shoulder",
  rightShoulder: "pose.right_shoulder",
  leftElbow: "pose.left_elbow",
  rightElbow: "pose.right_elbow",
  leftWrist: "pose.left_wrist",
  rightWrist: "pose.right_wrist",
  leftHip: "pose.left_hip",
  rightHip: "pose.right_hip",
  leftKnee: "pose.left_knee",
  rightKnee: "pose.right_knee",
  leftAnkle: "pose.left_ankle",
  rightAnkle: "pose.right_ankle",
});

const readPosePoint = (stream, featureId) => {
  const feature = stream?.feature(featureId, { space: "normalized" });
  const point = feature?.position || feature?.normalized;
  return feature?.available && Number.isFinite(point?.x) && Number.isFinite(point?.y)
    ? { x: point.x, y: point.y }
    : null;
};

const readPose = stream => {
  // Descriptors are snapshots, while feature() reads the current semantic
  // frame. A processor can be registered before its first frame and then
  // become live without replacing its descriptor object.
  if (typeof stream?.feature !== "function") return null;
  const pose = Object.fromEntries(Object.entries(POSE_FEATURES).map(([name, featureId]) => [name, readPosePoint(stream, featureId)]));
  return Object.values(pose).every(Boolean) ? pose : null;
};

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

const drawDisc = (at, radius, fill, outline = null, outlineWidth = 2) => {
  p.fill(fill);
  if (outline) {
    p.stroke(outline);
    p.strokeWeight(outlineWidth);
  } else p.noStroke();
  p.circle(at.x, at.y, radius * 2);
};

const drawBlock = (at, width, height, rotation, fill, outline = null) => {
  p.push();
  p.translate(at.x, at.y);
  p.rotate(rotation);
  p.rectMode(p.CENTER);
  p.fill(fill);
  if (outline) {
    p.stroke(outline);
    p.strokeWeight(2);
  } else p.noStroke();
  p.rect(0, 0, width, height, Math.min(8, height * 0.16));
  p.rectMode(p.CORNER);
  p.pop();
};

const drawRod = (from, to, width, fill) => {
  p.stroke(fill);
  p.strokeWeight(width);
  p.strokeCap(p.SQUARE);
  p.line(from.x, from.y, to.x, to.y);
};

const drawCostumeRod = (from, to, width, fill, endFill) => {
  drawRod(from, to, width, fill);
  const center = midpoint(from, to);
  const rotation = angle(from, to);
  drawBlock(center, width * 1.35, width * 0.82, rotation, fill, endFill);
  drawDisc(from, width * 0.64, endFill);
  drawDisc(to, width * 0.72, endFill);
};

let lastStream = null;

p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.pixelDensity(1);
  p.textFont("monospace");
};

p.draw = () => {
  p.clear();
  const discoveredStream = __.streams.list().find(stream => stream.kind === "holistic");
  if (discoveredStream) lastStream = discoveredStream;
  const livePose = readPose(lastStream);
  const pose = livePose || T_POSE;
  const point = name => ({ x: pose[name].x * p.width, y: pose[name].y * p.height });
  const nose = point("nose");
  const leftShoulder = point("leftShoulder");
  const rightShoulder = point("rightShoulder");
  const leftElbow = point("leftElbow");
  const rightElbow = point("rightElbow");
  const leftWrist = point("leftWrist");
  const rightWrist = point("rightWrist");
  const leftHip = point("leftHip");
  const rightHip = point("rightHip");
  const leftKnee = point("leftKnee");
  const rightKnee = point("rightKnee");
  const leftAnkle = point("leftAnkle");
  const rightAnkle = point("rightAnkle");
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const torsoCenter = midpoint(shoulderMid, hipMid);
  const shoulderSpan = distance(leftShoulder, rightShoulder);
  const torsoHeight = distance(shoulderMid, hipMid);
  const torsoWidth = Math.max(24, shoulderSpan * 0.62);
  const headSize = Math.max(28, torsoWidth * 0.48);
  const primary = __.currentColor || "#e8e8e8";
  const blue = __.colors?.accent?.css || "#2f6de1";
  const red = __.colors?.highlight?.css || "#d94c3d";
  const yellow = __.colors?.warning?.css || "#f5c84c";

  // The rear halo and shoulder beam establish the costume silhouette before
  // its smaller articulated forms are placed on top.
  p.noFill();
  p.stroke(blue);
  p.strokeWeight(Math.max(4, torsoWidth * 0.08));
  p.ellipse(shoulderMid.x, shoulderMid.y + torsoHeight * 0.22, torsoWidth * 1.75, torsoWidth * 0.96);
  drawRod(leftShoulder, rightShoulder, Math.max(16, torsoWidth * 0.23), yellow);
  drawDisc(leftShoulder, Math.max(12, torsoWidth * 0.18), red, primary);
  drawDisc(rightShoulder, Math.max(12, torsoWidth * 0.18), blue, primary);

  // Arms become alternating coloured rods with block cuffs and circular joints.
  drawCostumeRod(leftShoulder, leftElbow, Math.max(11, torsoWidth * 0.17), blue, red);
  drawCostumeRod(leftElbow, leftWrist, Math.max(10, torsoWidth * 0.14), yellow, primary);
  drawCostumeRod(rightShoulder, rightElbow, Math.max(11, torsoWidth * 0.17), red, blue);
  drawCostumeRod(rightElbow, rightWrist, Math.max(10, torsoWidth * 0.14), yellow, primary);

  // The torso is a moving quadrilateral wrapped in a Bauhaus hoop and a
  // contrasting central block rather than a naturalistic shirt or chest.
  p.noStroke();
  p.fill(blue);
  p.quad(
    leftShoulder.x, leftShoulder.y,
    rightShoulder.x, rightShoulder.y,
    rightHip.x, rightHip.y,
    leftHip.x, leftHip.y,
  );
  drawBlock(torsoCenter, torsoWidth * 0.42, torsoHeight * 0.7, angle(shoulderMid, hipMid), red, primary);
  p.fill(yellow);
  p.triangle(
    shoulderMid.x, shoulderMid.y + torsoHeight * 0.02,
    hipMid.x - torsoWidth * 0.35, hipMid.y,
    hipMid.x + torsoWidth * 0.35, hipMid.y,
  );
  p.noFill();
  p.stroke(red);
  p.strokeWeight(Math.max(4, torsoWidth * 0.07));
  p.ellipse(hipMid.x, hipMid.y + torsoHeight * 0.03, torsoWidth * 1.48, torsoWidth * 0.72);
  drawDisc(hipMid, Math.max(11, torsoWidth * 0.18), primary, red);

  // Legs read as mechanical costume parts: long rods, knee discs, and square feet.
  drawCostumeRod(leftHip, leftKnee, Math.max(14, torsoWidth * 0.2), red, yellow);
  drawCostumeRod(leftKnee, leftAnkle, Math.max(12, torsoWidth * 0.17), blue, primary);
  drawCostumeRod(rightHip, rightKnee, Math.max(14, torsoWidth * 0.2), yellow, red);
  drawCostumeRod(rightKnee, rightAnkle, Math.max(12, torsoWidth * 0.17), blue, primary);
  drawBlock(leftAnkle, torsoWidth * 0.36, torsoWidth * 0.22, 0, red, primary);
  drawBlock(rightAnkle, torsoWidth * 0.36, torsoWidth * 0.22, 0, yellow, primary);

  // A cylindrical neck and nested head discs complete the figurine. Small
  // eye discs keep the face legible without turning it into a portrait.
  const neck = { x: shoulderMid.x, y: shoulderMid.y - torsoHeight * 0.17 };
  drawRod(neck, nose, Math.max(10, torsoWidth * 0.16), red);
  drawDisc(neck, Math.max(9, torsoWidth * 0.12), yellow, primary);
  drawDisc(nose, headSize * 0.9, primary, red, 3);
  drawDisc(nose, headSize * 0.65, yellow);
  drawDisc({ x: nose.x - headSize * 0.24, y: nose.y - headSize * 0.08 }, headSize * 0.1, blue);
  drawDisc({ x: nose.x + headSize * 0.24, y: nose.y - headSize * 0.08 }, headSize * 0.1, blue);
  p.noFill();
  p.stroke(blue);
  p.strokeWeight(3);
  p.circle(nose.x, nose.y, headSize * 1.55);

  p.noStroke();
  p.fill(primary);
  p.textSize(11);
  p.text(livePose ? "MediaPipe figurine" : "T-pose fallback · add MediaPipe input", 12, 20);
};`,
  }),
  Object.freeze({
    id: "bare-instance",
    name: "Bare instance mode",
    mode: "instance",
    source: `// p5 instance-mode starter. Use p.* for p5 calls.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
};

p.draw = () => {
  p.background(18);
  p.noFill();
  p.stroke(220);
  p.circle(p.width / 2, p.height / 2, Math.min(p.width, p.height) * 0.4);
};`,
  }),
  Object.freeze({
    id: "bare-global",
    name: "Bare classic global mode",
    mode: "global",
    source: `// Classic p5 global-mode starter. Use setup(), draw(), and ordinary p5 calls.
function setup() {
  createCanvas(__.element.width, __.element.height);
}

function draw() {
  background(18);
  noFill();
  stroke(220);
  circle(width / 2, height / 2, Math.min(width, height) * 0.4);
}`,
  }),
  Object.freeze({
    id: "ten-print",
    name: "10 PRINT",
    mode: "global",
    source: `// 10 PRINT, adapted for a p5 frame. Press R to redraw.
const cell = 18;

function setup() {
  createCanvas(__.element.width, __.element.height);
  noLoop();
  redrawPattern();
}

function redrawPattern() {
  background(18);
  stroke(220);
  strokeWeight(2);
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (random() < 0.5) line(x, y, x + cell, y + cell);
      else line(x + cell, y, x, y + cell);
    }
  }
}

function keyPressed() {
  if (key === "r" || key === "R") redrawPattern();
}`,
  }),
  Object.freeze({
    id: "mouse-draw",
    name: "Mouse drawing",
    mode: "global",
    source: `// Draw directly into this p5 frame. Press C to clear.
function setup() {
  createCanvas(__.element.width, __.element.height);
  background(18);
  stroke(220);
  strokeWeight(3);
}

function mouseDragged() {
  line(pmouseX, pmouseY, mouseX, mouseY);
}

function keyPressed() {
  if (key === "c" || key === "C") background(18);
}`,
  }),
  Object.freeze({
    id: "random-lines",
    name: "Random lines",
    mode: "instance",
    source: `// Animated instance-mode random lines.
p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.background(18);
  p.stroke(220, 38);
  p.strokeWeight(2);
};

p.draw = () => {
  const x1 = p.random(p.width);
  const y1 = p.random(p.height);
  const x2 = p.random(p.width);
  const y2 = p.random(p.height);
  p.line(x1, y1, x2, y2);
};`,
  }),
  Object.freeze({
    id: "underscores-bridge",
    name: "Underscores canvas and time",
    mode: "instance",
    source: `// Underscores-aware p5 example.
// Pick a curve, cursor, trigger, label, or group in the optional Driver field.
// @param driver = "" (object)

let latestEvent = null;

const currentDriver = () => (
  __.params.driver
  || __.canvas.selected()[0]
  || __.canvas.find(object => object.role === "cursor")[0]
  || null
);

p.setup = () => {
  p.createCanvas(__.element.width, __.element.height);
  p.textFont("monospace");
  p.frameRate(__.frame.fps || 60);
  __.events.on("*", event => { latestEvent = event; });
};

p.draw = () => {
  const objects = __.canvas.all();
  const selected = __.canvas.selected();
  const driver = currentDriver();
  const progress = Number(driver?.time?.progress);
  const phase = Number.isFinite(progress)
    ? progress
    : (__.transport.time % 4) / 4;
  const radius = Math.min(p.width, p.height) * (0.12 + phase * 0.32);

  p.background(18);
  p.noFill();
  p.stroke(90, 180, 255);
  p.strokeWeight(2);
  p.circle(p.width / 2, p.height / 2, radius * 2);
  p.stroke(220, 120);
  p.line(0, p.height / 2, p.width, p.height / 2);

  p.noStroke();
  p.fill(220);
  p.text("canvas objects: " + objects.length, 12, 22);
  p.text("selected: " + selected.length, 12, 40);
  p.text("transport: " + __.transport.time.toFixed(2) + " s", 12, 58);
  p.text("driver: " + (driver?.label || driver?.id || "none"), 12, 76);
  p.text("last event: " + (latestEvent?.name || latestEvent?.type || "waiting"), 12, 94);
};`,
  }),
]);

export const getP5Example = id => P5_EXAMPLES.find(example => example.id === id) || null;

export const P5_SOURCE_MODES = Object.freeze({
  auto: "auto",
  instance: "instance",
  global: "global",
});

// In classic/global mode p5 discovers these names on the window. Underscores
// evaluates each sketch in an isolated proxy instead, so we explicitly carry
// the complete callback surface back to the p5 instance. Keeping this list in
// one place also makes the two authoring styles behave the same way.
export const P5_GLOBAL_CALLBACK_NAMES = Object.freeze([
  "preload",
  "setup",
  "draw",
  "mouseMoved",
  "mouseDragged",
  "mousePressed",
  "mouseReleased",
  "mouseClicked",
  "doubleClicked",
  "mouseWheel",
  "keyPressed",
  "keyReleased",
  "keyTyped",
  "touchStarted",
  "touchMoved",
  "touchEnded",
  "windowResized",
  "deviceMoved",
  "deviceTurned",
  "deviceShaken",
]);

// Web Serial is not a native p5 API, but classic sketches can use these
// familiar callback names after calling __.serial.requestPort().
export const P5_SERIAL_CALLBACK_NAMES = Object.freeze([
  "serialConnect",
  "serialDisconnect",
  "serialData",
  "serialError",
]);

export const P5_CALLBACK_NAMES = Object.freeze([
  ...P5_GLOBAL_CALLBACK_NAMES,
  ...P5_SERIAL_CALLBACK_NAMES,
]);

export const normalizeP5SourceMode = value => (
  Object.values(P5_SOURCE_MODES).includes(value) ? value : P5_SOURCE_MODES.auto
);

export const detectP5SourceMode = source => {
  const code = typeof source === "string" ? source : "";
  const hasInstanceCallbacks = /\bp\.(?:preload|setup|draw)\s*=/.test(code);
  const hasGlobalCallbacks = /\bfunction\s+(?:preload|setup|draw)\s*\(/.test(code)
    || /\b(?:preload|setup|draw)\s*=\s*(?:function\b|\(?[^=]*\)?\s*=>)/.test(code);
  return hasGlobalCallbacks && !hasInstanceCallbacks ? P5_SOURCE_MODES.global : P5_SOURCE_MODES.instance;
};

export const resolveP5SourceMode = value => {
  const config = value && typeof value === "object" ? value : {};
  const mode = normalizeP5SourceMode(config.mode);
  return mode === P5_SOURCE_MODES.auto ? detectP5SourceMode(config.source) : mode;
};

// Keep validation deliberately side-effect free: live editors use it to retain
// the last runnable version while the user is midway through a broken edit.
export const validateP5Source = source => {
  try {
    // p5 sketches are evaluated in a function wrapper in both supported modes.
    // Matching that wrapper here catches syntax failures without executing code.
    new Function(typeof source === "string" ? source : "");
    return { valid: true, error: "" };
  } catch (reason) {
    return {
      valid: false,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  }
};

export const DEFAULT_P5_FRAME = Object.freeze({
  scriptId: "",
  hostType: "rectangle",
  source: DEFAULT_P5_SOURCE,
  mode: P5_SOURCE_MODES.auto,
  p5Version: DEFAULT_P5_VERSION,
  runtime: "bundled",
  cdnUrl: DEFAULT_P5_CDN_URL,
  autoplay: true,
  fps: 60,
  transparent: false,
  backgroundMode: "auto",
  persistence: "auto",
  allowInteraction: true,
  parameters: {},
  reloadNonce: 0,
});

export const isP5FrameElement = element => Boolean(element?.customData?.underscoresP5);

// p5 frames have a Underscores-owned overlay in addition to their Excalidraw
// host. Keep the overlay aligned with the outliner's visibility state so
// hiding a p5 frame hides the rendered sketch as well.
export const shouldRenderP5Frame = element => Boolean(
  element
  && !element.isDeleted
  && !element.customData?.outlinerHidden
  && !element.customData?.presentationMaskActive
  && isP5FrameElement(element)
);

// p5 runners are Underscores-owned overlays. Keep a regular Excalidraw host
// beneath them so they remain selectable and resizable without surfacing
// Excalidraw's link/embed decorators.
export const getP5HostElementType = value => {
  const frame = value?.customData?.underscoresP5 || value;
  return frame?.hostType === "frame" ? "frame" : "rectangle";
};

export const canHostP5Frame = element => Boolean(
  element
  && !element.isDeleted
  && (isP5FrameElement(element) || ["rectangle", "frame", "embeddable"].includes(element.type))
);

// Classic p5 global mode is normally installed on window. Underscores instead
// evaluates it in a frame-local function scope, which preserves the familiar
// setup()/draw() syntax without letting two frames overwrite each other's
// callbacks or globals. The scope is compiled into lexical bindings rather
// than a `with (Proxy)` environment: a proxy is convenient, but it puts every
// identifier lookup in a hot draw loop on the slow path.
export const compileClassicP5Source = (p, bridge, source, interactionState = {}, scriptConsole = bridge?.console || globalThis.console) => {
  const code = typeof source === "string" ? source : "";
  const identifiers = new Set(code.match(/[A-Za-z_$][\w$]*/g) || []);
  const declared = new Set([...code.matchAll(/\b(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1]));
  const reserved = new Set([
    "arguments", "as", "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "enum", "eval", "export", "extends", "false", "finally", "for",
    "from", "function", "if", "implements", "import", "in", "instanceof", "interface", "let", "new",
    "null", "of", "package", "private", "protected", "public", "return", "static", "super", "switch",
    "this", "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
  ]);
  const internal = base => {
    let name = base;
    while (identifiers.has(name)) name = `_${name}`;
    identifiers.add(name);
    return name;
  };
  const syncName = internal("__underscoresClassicSync");
  const callbackObjectName = internal("__underscoresClassicCallbacks");
  const originalCreateCanvasName = internal("__underscoresClassicCreateCanvas");
  const originalResizeCanvasName = internal("__underscoresClassicResizeCanvas");
  const globalScopeName = internal("__underscoresClassicGlobal");
  const dynamicP5Globals = new Set([
    "width", "height", "windowWidth", "windowHeight", "displayWidth", "displayHeight",
    "mouseX", "mouseY", "pmouseX", "pmouseY", "winMouseX", "winMouseY", "movedX", "movedY",
    "mouseIsPressed", "mouseButton", "key", "keyCode", "keyIsPressed", "keyIsDown",
    "frameCount", "deltaTime", "focused", "touches", "deviceOrientation", "accelerationX",
    "accelerationY", "accelerationZ", "rotationX", "rotationY", "rotationZ",
  ]);
  const names = [...identifiers].filter(name => (
    !reserved.has(name)
    && !declared.has(name)
    && !["p", "__", "console", syncName, callbackObjectName, originalCreateCanvasName, originalResizeCanvasName, globalScopeName].includes(name)
  ));
  const dynamicNames = names.filter(name => (
    dynamicP5Globals.has(name)
    || name === "mouseIsDragged"
    || (name in p && typeof p[name] !== "function")
  ));
  const declarations = names.map(name => {
    if (name === "createCanvas" || name === "resizeCanvas") return `let ${name};`;
    if (name in p) {
      return typeof p[name] === "function"
        ? `let ${name} = p[${JSON.stringify(name)}].bind(p);`
        : `let ${name} = p[${JSON.stringify(name)}];`;
    }
    if (name in globalThis) return `let ${name} = ${globalScopeName}[${JSON.stringify(name)}];`;
    if (name === "mouseIsDragged") return `let ${name} = Boolean(interactionState.mouseIsDragged);`;
    return `let ${name};`;
  }).join("\n");
  const syncAssignments = dynamicNames.map(name => (
    name === "mouseIsDragged"
      ? `${name} = Boolean(interactionState.mouseIsDragged);`
      : `${name} = p[${JSON.stringify(name)}];`
  )).join("\n");
  const callbackAssignments = P5_CALLBACK_NAMES
    .map(name => `${callbackObjectName}.${name} = typeof ${name} === "function" ? ${name} : ${callbackObjectName}.${name};`)
    .join("\n");
  const callbackWrappers = P5_CALLBACK_NAMES
    .map(name => `if (typeof ${callbackObjectName}.${name} === "function") {
      const authored = ${callbackObjectName}.${name};
      ${callbackObjectName}.${name} = function (...args) {
        ${syncName}();
        return authored.apply(this, args);
      };
    }`)
    .join("\n");
  const callbacks = new Function("p", "__", "console", "interactionState", `
    const ${globalScopeName} = globalThis;
    ${declarations}
    const ${syncName} = () => {
      ${syncAssignments}
    };
    ${syncName}();
    const ${originalCreateCanvasName} = typeof p.createCanvas === "function" ? p.createCanvas.bind(p) : null;
    const ${originalResizeCanvasName} = typeof p.resizeCanvas === "function" ? p.resizeCanvas.bind(p) : null;
    createCanvas = (...args) => {
      const result = ${originalCreateCanvasName}?.(...args);
      ${syncName}();
      return result;
    };
    resizeCanvas = (...args) => {
      const result = ${originalResizeCanvasName}?.(...args);
      ${syncName}();
      return result;
    };
    const ${callbackObjectName} = {};
    ${code}
    ${callbackAssignments}
    ${callbackWrappers}
    return ${callbackObjectName};
  `)(p, bridge, scriptConsole, interactionState);
  return callbacks || {};
};

export const compileInstanceP5Source = (p, bridge, source, scriptConsole = bridge?.console || globalThis.console) => (
  new Function(
    "p",
    "__",
    "console",
    `${typeof source === "string" ? source : ""}\nreturn { ${P5_GLOBAL_CALLBACK_NAMES.map(name => `${name}: p.${name}`).join(", ")} };`,
  )(p, bridge, scriptConsole) || {}
);

export const normalizeP5Frame = value => {
  const raw = value && typeof value === "object" ? value : {};
  const p5Version = normalizeP5Version(raw.p5Version);
  return {
    ...DEFAULT_P5_FRAME,
    ...raw,
    scriptId: typeof raw.scriptId === "string" ? raw.scriptId : "",
    // Legacy p5 frames were stored as embeddables. Preserve their geometry but
    // migrate them to a normal rectangle host during scene reconciliation.
    hostType: raw.hostType === "frame" ? "frame" : "rectangle",
    source: typeof raw.source === "string" ? raw.source : DEFAULT_P5_SOURCE,
    mode: normalizeP5SourceMode(raw.mode),
    p5Version,
    runtime: raw.runtime === "cdn" ? "cdn" : "bundled",
    cdnUrl: typeof raw.cdnUrl === "string" && raw.cdnUrl.trim()
      ? raw.cdnUrl.trim()
      : (p5Version === "1" ? DEFAULT_P5_LEGACY_CDN_URL : DEFAULT_P5_CDN_URL),
    autoplay: raw.autoplay !== false,
    fps: Math.max(1, Math.min(120, Number(raw.fps) || DEFAULT_P5_FRAME.fps)),
    transparent: Boolean(raw.transparent),
    backgroundMode: LIVECODE_BACKGROUND_MODES.includes(raw.backgroundMode) ? raw.backgroundMode : "auto",
    persistence: LIVECODE_PERSISTENCE_MODES.includes(raw.persistence) ? raw.persistence : "auto",
    allowInteraction: raw.allowInteraction !== false,
    parameters: raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
      ? raw.parameters
      : {},
    reloadNonce: Math.max(0, Number(raw.reloadNonce) || 0),
  };
};

export const shouldAutoClearP5Frame = value => shouldClearLivecodeFrame(normalizeP5Frame(value));

// A p5 instance is deliberately independent from ordinary Excalidraw element
// revisions. Moving, rotating, selecting, or locking its host should only
// reposition the overlay; it must not erase the sketch's live canvas state.
// Size and p5-runtime settings still define the runner identity and therefore
// recreate the instance when they actually change.
export const getP5ConfigKey = value => {
  const frame = normalizeP5Frame(value);
  return JSON.stringify([
    frame.scriptId,
    frame.source,
    frame.mode,
    frame.p5Version,
    frame.runtime,
    frame.cdnUrl,
    frame.autoplay,
    frame.fps,
    frame.pixelDensity ?? null,
    frame.transparent,
    frame.backgroundMode,
    frame.persistence,
    frame.allowInteraction,
    frame.parameters,
    frame.reloadNonce,
  ]);
};

export const getP5RunnerKey = (config, element) => JSON.stringify([
  getP5ConfigKey(config),
  typeof element?.id === "string" ? element.id : "",
  Math.max(1, Number(element?.width) || 1),
  Math.max(1, Number(element?.height) || 1),
]);

export const createP5ScriptId = () => `p5-script-${globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

export const normalizeP5Script = (value, { createId = createP5ScriptId, now = Date.now() } = {}) => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Untitled p5 sketch",
    source: typeof raw.source === "string" ? raw.source : DEFAULT_P5_SOURCE,
    mode: normalizeP5SourceMode(raw.mode),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
};

export const normalizeP5Scripts = (value, options = {}) => {
  const scripts = Array.isArray(value) ? value : [];
  const usedIds = new Set();
  return scripts.filter(script => script && typeof script === "object").map(script => {
    let normalized = normalizeP5Script(script, options);
    while (usedIds.has(normalized.id)) normalized = { ...normalized, id: options.createId?.() || createP5ScriptId() };
    usedIds.add(normalized.id);
    return normalized;
  });
};

// Scenes retain each p5 frame's source for portability, but the editor uses a
// script catalog. Recreate any missing catalog entry on import and migrate
// legacy embeddable hosts to ordinary Excalidraw rectangles or frames.
export const reconcileP5ScriptsWithElements = (scripts, elements, { createId = createP5ScriptId, now = Date.now() } = {}) => {
  const catalog = normalizeP5Scripts(scripts, { createId, now });
  const byId = new Map(catalog.map(script => [script.id, script]));
  const repairedElements = (elements || []).map(element => {
    if (!isP5FrameElement(element)) return element;
    const frame = normalizeP5Frame(element.customData?.underscoresP5);
    let script = frame.scriptId ? byId.get(frame.scriptId) : null;
    if (!script) {
      script = normalizeP5Script({
        id: frame.scriptId || createId(),
        name: "Recovered p5 sketch",
        source: frame.source,
        mode: frame.mode,
        createdAt: now,
        updatedAt: now,
      }, { createId, now });
      while (byId.has(script.id)) script = { ...script, id: createId() };
      byId.set(script.id, script);
      catalog.push(script);
    }
    const repairedFrame = normalizeP5Frame({
      ...frame,
      scriptId: script.id,
      source: script.source,
      mode: script.mode,
    });
    return {
      ...element,
      type: getP5HostElementType(repairedFrame),
      link: null,
      validated: false,
      customData: { ...(element.customData || {}), underscoresP5: repairedFrame },
      version: Math.max(1, (element.version || 0) + 1),
      versionNonce: Math.floor(Math.random() * 0x7fffffff),
      updated: now,
    };
  });
  return { scripts: catalog, elements: repairedElements };
};
