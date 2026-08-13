import { FACE_GROUPS } from "./mediaLandmarkOntology.js";

export const UNICURSAL_PRESETS = Object.freeze({
  smooth: Object.freeze({ label: "Smooth", smoothing: 0.72, abstraction: 0.18, jitter: 0, flourish: 0.08, retrace: 0.02 }),
  cubist: Object.freeze({ label: "Cubist", smoothing: 0.08, abstraction: 0.72, jitter: 0, flourish: 0.04, retrace: 0.03 }),
  ornate: Object.freeze({ label: "Ornate", smoothing: 0.58, abstraction: 0.12, jitter: 0.015, flourish: 0.72, retrace: 0.2 }),
  messy: Object.freeze({ label: "Messy", smoothing: 0.28, abstraction: 0.3, jitter: 0.055, flourish: 0.22, retrace: 0.34 }),
});

const clamp = (value, min, max, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

// Expressive controls deliberately accept values beyond their suggested UI
// range. The broad guard only prevents accidental infinities from reaching
// geometry math; structural budgets retain their tighter performance caps.
const expressive = (value, fallback, min = 0, max = 1000) => clamp(value, min, max, fallback);

const finitePoint = point => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y));
const point = value => finitePoint(value) ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) || 0 } : null;
const mix = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t,
  ...(Number.isFinite(a.width) && Number.isFinite(b.width) ? { width: a.width + (b.width - a.width) * t } : {}),
  ...(Number.isFinite(a.pressure) && Number.isFinite(b.pressure) ? { pressure: a.pressure + (b.pressure - a.pressure) * t } : {}),
});
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const UNICURSAL_FEATURE_FIELDS = Object.freeze([
  "poseLandmarks",
  "faceLandmarks",
  "leftHandLandmarks",
  "rightHandLandmarks",
  "segmentation",
]);

export const applyUnicursalFeatureGrace = (result, previousState = {}, timestamp = 0, graceMs = 260) => {
  const source = result && typeof result === "object" ? result : {};
  const now = Number(timestamp) || 0;
  const grace = Math.max(0, Number(graceMs) || 0);
  const next = { ...source };
  const state = {};
  UNICURSAL_FEATURE_FIELDS.forEach(field => {
    const value = source[field];
    const available = field === "segmentation"
      ? Boolean(value?.data?.length && value.width && value.height)
      : Array.isArray(value) && value.length >= 2;
    if (available) {
      state[field] = { value, at: now };
      return;
    }
    const previous = previousState?.[field];
    if (previous?.value && now - Number(previous.at || 0) <= grace) {
      next[field] = previous.value;
      state[field] = previous;
    }
  });
  return Object.freeze({ result: Object.freeze(next), state: Object.freeze(state) });
};

export const normalizeUnicursalOptions = value => {
  const source = value && typeof value === "object" ? value : {};
  const preset = Object.hasOwn(UNICURSAL_PRESETS, source.preset) ? source.preset : "smooth";
  const base = UNICURSAL_PRESETS[preset];
  const anatomy = source.anatomy && typeof source.anatomy === "object" ? source.anatomy : {};
  const silhouette = source.silhouette && typeof source.silhouette === "object" ? source.silhouette : {};
  const geometry = source.geometry && typeof source.geometry === "object" ? source.geometry : {};
  const ornament = source.ornament && typeof source.ornament === "object" ? source.ornament : {};
  const ink = source.ink && typeof source.ink === "object" ? source.ink : {};
  const motion = source.motion && typeof source.motion === "object" ? source.motion : {};
  const background = source.background && typeof source.background === "object" ? source.background : {};
  const landmarks = source.landmarks && typeof source.landmarks === "object" ? source.landmarks : {};
  const silhouetteMode = ["hybrid", "segmentation", "envelope"].includes(silhouette.mode) ? silhouette.mode : "hybrid";
  return Object.freeze({
    preset,
    anatomy: Object.freeze({
      silhouette: anatomy.silhouette !== false,
      face: anatomy.face !== false,
      leftHand: anatomy.leftHand !== false,
      rightHand: anatomy.rightHand !== false,
      body: anatomy.body !== false,
      silhouetteWeight: expressive(anatomy.silhouetteWeight, 1),
      faceWeight: expressive(anatomy.faceWeight, 1),
      handWeight: expressive(anatomy.handWeight, 1),
      bodyWeight: expressive(anatomy.bodyWeight, 0.65),
      silhouetteExaggeration: expressive(anatomy.silhouetteExaggeration, 1),
      faceExaggeration: expressive(anatomy.faceExaggeration, 1),
      handExaggeration: expressive(anatomy.handExaggeration, 1),
      bodyExaggeration: expressive(anatomy.bodyExaggeration, 1),
    }),
    silhouette: Object.freeze({
      mode: silhouetteMode,
      threshold: clamp(silhouette.threshold, 0.05, 0.95, 0.5),
      detail: clamp(silhouette.detail, 0, 1, 0.55),
      simplify: clamp(silhouette.simplify, 0, 1, 0.16),
    }),
    geometry: Object.freeze({
      pointBudget: Math.round(clamp(geometry.pointBudget, 96, 1024, 384)),
      maxSegments: Math.round(clamp(geometry.maxSegments, 1, 12, 1)),
      smoothCurves: geometry.smoothCurves !== false,
      curveMode: ["catmull-rom", "quadratic", "polyline"].includes(geometry.curveMode) ? geometry.curveMode : "catmull-rom",
      smoothing: expressive(geometry.smoothing, base.smoothing),
      abstraction: expressive(geometry.abstraction, base.abstraction),
      tension: expressive(geometry.tension, 0.62),
      exaggeration: expressive(geometry.exaggeration, 0.12),
      bridgeCurvature: expressive(geometry.bridgeCurvature, 0.45),
      returnOffset: expressive(geometry.returnOffset, 0.012, 0, 10),
    }),
    ornament: Object.freeze({
      seed: Math.round(clamp(ornament.seed, 0, 2147483647, 1701)),
      jitter: expressive(ornament.jitter, base.jitter),
      flourish: expressive(ornament.flourish, base.flourish),
      retrace: expressive(ornament.retrace, base.retrace),
    }),
    ink: Object.freeze({
      color: /^#[0-9a-f]{6}$/i.test(String(ink.color || "")) ? String(ink.color).toLowerCase() : "#e7dce1",
      opacity: clamp(ink.opacity, 0, 100, 100),
      width: expressive(ink.width, 3, 0.01, 1000),
      variableWidth: ink.variableWidth !== false,
      widthVariation: expressive(ink.widthVariation, 0.42),
      featureWidthInfluence: expressive(ink.featureWidthInfluence, 0.35),
      taper: expressive(ink.taper, 0.58),
      feather: expressive(ink.feather, 0.08),
    }),
    motion: Object.freeze({
      responseMs: clamp(motion.responseMs, 0, 2000, 140),
      missingGraceMs: clamp(motion.missingGraceMs, 0, 5000, 260),
      // Echoes remain available, but are opt-in because every echo is another
      // complete portrait paint. This is the largest rendering-cost lever.
      echoes: motion.echoes === true,
      echoCount: Math.round(clamp(motion.echoCount, 0, 8, 2)),
      echoDelayMs: clamp(motion.echoDelayMs, 16, 2000, 180),
      echoOpacity: clamp(motion.echoOpacity, 0, 1, 0.22),
      echoDecay: clamp(motion.echoDecay, 0, 1, 0.55),
    }),
    background: Object.freeze({
      mode: background.mode === "solid" ? "solid" : "transparent",
      color: /^#[0-9a-f]{6}$/i.test(String(background.color || "")) ? String(background.color).toLowerCase() : "#08090a",
      opacity: clamp(background.opacity, 0, 100, 100),
    }),
    landmarks: Object.freeze({
      visible: landmarks.visible === true,
      opacity: clamp(landmarks.opacity, 0, 1, 0.72),
      points: landmarks.points !== false,
      connections: landmarks.connections !== false,
      rawOutline: landmarks.rawOutline === true,
      matchInkColor: landmarks.matchInkColor === true,
      pointSize: clamp(landmarks.pointSize, 0.5, 12, 1.8),
      lineWidth: clamp(landmarks.lineWidth, 0.5, 8, 1),
    }),
    outputSpace: ["normalized", "local", "scene"].includes(source.outputSpace) ? source.outputSpace : "normalized",
  });
};

const pathLength = points => points.slice(1).reduce((sum, current, index) => sum + distance(points[index], current), 0);

export const resamplePath = (values, count) => {
  const points = (values || []).map(point).filter(Boolean);
  const target = Math.max(2, Math.round(count) || 2);
  if (!points.length) return Array.from({ length: target }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  if (points.length === 1) return Array.from({ length: target }, () => ({ ...points[0] }));
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths[index - 1] + distance(points[index - 1], points[index]));
  const total = lengths.at(-1);
  if (total < 1e-8) return Array.from({ length: target }, () => ({ ...points[0] }));
  const output = [];
  let segment = 1;
  for (let index = 0; index < target; index += 1) {
    const desired = total * index / (target - 1);
    while (segment < lengths.length - 1 && lengths[segment] < desired) segment += 1;
    const startLength = lengths[segment - 1];
    const endLength = lengths[segment];
    const amount = endLength > startLength ? (desired - startLength) / (endLength - startLength) : 0;
    output.push(mix(points[segment - 1], points[segment], amount));
  }
  return output;
};

const chaikin = values => {
  if (values.length < 3) return values;
  const output = [values[0]];
  for (let index = 0; index < values.length - 1; index += 1) {
    output.push(mix(values[index], values[index + 1], 0.25), mix(values[index], values[index + 1], 0.75));
  }
  output.push(values.at(-1));
  return output;
};

const simplifyAngular = (values, amount) => {
  const stride = Math.max(1, Math.round(1 + amount * 11));
  const anchors = values.filter((_, index) => index === 0 || index === values.length - 1 || index % stride === 0);
  return resamplePath(anchors, values.length);
};

const noise = (seed, index, channel = 0) => {
  const value = Math.sin((seed + 1) * 12.9898 + index * 78.233 + channel * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
};

const perturb = (values, options) => values.map((current, index) => {
  const before = values[Math.max(0, index - 1)];
  const after = values[Math.min(values.length - 1, index + 1)];
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const nx = -dy / magnitude;
  const ny = dx / magnitude;
  const arc = index / Math.max(1, values.length - 1);
  const correlated = Math.sin(arc * Math.PI * (4 + options.flourish * 10) + noise(options.seed, 0) * Math.PI);
  const random = noise(options.seed, Math.floor(index / 3), 1);
  const offset = options.jitter * (0.58 * correlated + 0.42 * random)
    + options.flourish * 0.012 * Math.sin(arc * Math.PI * 14)
    + options.retrace * options.returnOffset * Math.sin(arc * Math.PI * 8 + noise(options.seed, 7) * Math.PI);
  return { ...current, x: current.x + nx * offset, y: current.y + ny * offset };
});

const sourcePoints = (result, field, indices) => (indices || []).map(index => point(result?.[field]?.[index])).filter(Boolean);

const HAND_ROUTE = Object.freeze([0, 1, 2, 3, 4, 3, 2, 1, 5, 6, 7, 8, 7, 6, 5, 9, 10, 11, 12, 11, 10, 9, 13, 14, 15, 16, 15, 14, 13, 17, 18, 19, 20, 19, 18, 17, 0]);
const LEFT_EYE = FACE_GROUPS["face.right_eye"];
const RIGHT_EYE = FACE_GROUPS["face.left_eye"];
const LEFT_BROW = FACE_GROUPS["face.right_eyebrow"];
const RIGHT_BROW = FACE_GROUPS["face.left_eyebrow"];
const MOUTH = FACE_GROUPS["face.lips"].slice(0, 21);
const NOSE = Object.freeze([168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 97, 98, 97, 2, 326, 327]);

const boundsOf = values => {
  const points = values.map(point).filter(Boolean);
  if (!points.length) return null;
  const xs = points.map(item => item.x);
  const ys = points.map(item => item.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

const envelopeFromLandmarks = result => {
  const pose = result?.poseLandmarks || [];
  const face = sourcePoints(result, "faceLandmarks", FACE_GROUPS["face.face_oval"]);
  const all = [
    ...face,
    ...[11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32].map(index => point(pose[index])).filter(Boolean),
  ];
  const bounds = boundsOf(all);
  if (!bounds) return [];
  const cx = bounds.x + bounds.width / 2;
  const top = bounds.y - bounds.height * 0.04;
  const bottom = bounds.y + bounds.height * 1.04;
  const shoulderLeft = point(pose[11]) || { x: bounds.x, y: bounds.y + bounds.height * 0.22 };
  const shoulderRight = point(pose[12]) || { x: bounds.x + bounds.width, y: bounds.y + bounds.height * 0.22 };
  const leftWrist = point(pose[15]) || shoulderLeft;
  const rightWrist = point(pose[16]) || shoulderRight;
  const leftAnkle = point(pose[27]) || { x: cx - bounds.width * 0.18, y: bottom };
  const rightAnkle = point(pose[28]) || { x: cx + bounds.width * 0.18, y: bottom };
  const margin = Math.max(0.012, bounds.width * 0.07);
  return [
    { x: cx, y: top },
    { x: bounds.x - margin, y: bounds.y + bounds.height * 0.08 },
    { x: shoulderLeft.x - margin, y: shoulderLeft.y },
    { x: leftWrist.x - margin, y: leftWrist.y },
    { x: leftAnkle.x - margin, y: leftAnkle.y },
    { x: cx, y: bottom },
    { x: rightAnkle.x + margin, y: rightAnkle.y },
    { x: rightWrist.x + margin, y: rightWrist.y },
    { x: shoulderRight.x + margin, y: shoulderRight.y },
    { x: bounds.x + bounds.width + margin, y: bounds.y + bounds.height * 0.08 },
    { x: cx, y: top },
  ];
};

// Convert a low-resolution segmentation image into a stable polar contour.
// Sorting boundary samples around their centroid intentionally favors a clean
// artist's envelope over a pixel-faithful visualization of the mask.
export const contourFromSegmentation = (segmentation, threshold = 0.5, bins = 96) => {
  const width = Math.max(0, Number(segmentation?.width) || 0);
  const height = Math.max(0, Number(segmentation?.height) || 0);
  const data = segmentation?.data;
  if (!width || !height || !data?.length) return [];
  const occupied = [];
  let hasRgbMask = false;
  for (let offset = 0; offset < data.length; offset += Math.max(4, Math.floor(data.length / 256 / 4) * 4)) {
    if (Number(data[offset]) || Number(data[offset + 1]) || Number(data[offset + 2])) {
      hasRgbMask = true;
      break;
    }
  }
  const alphaAt = (x, y) => {
    const offset = (y * width + x) * 4;
    const alpha = Number(data[offset + 3]) / 255;
    const luminance = (Number(data[offset]) + Number(data[offset + 1]) + Number(data[offset + 2])) / (255 * 3);
    return hasRgbMask ? luminance : alpha;
  };
  const filled = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (alphaAt(x, y) >= threshold) filled[y * width + x] = 1;
  }
  const visited = new Uint8Array(filled.length);
  let largest = [];
  for (let start = 0; start < filled.length; start += 1) {
    if (!filled[start] || visited[start]) continue;
    const component = [];
    const queue = [start];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [index - 1, index + 1, index - width, index + width];
      neighbors.forEach((neighbor, direction) => {
        if ((direction === 0 && x === 0) || (direction === 1 && x === width - 1) || (direction === 2 && y === 0) || (direction === 3 && y === height - 1)) return;
        if (filled[neighbor] && !visited[neighbor]) { visited[neighbor] = 1; queue.push(neighbor); }
      });
    }
    if (component.length > largest.length) largest = component;
  }
  const largestSet = new Set(largest);
  largest.forEach(index => {
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !largestSet.has(index - 1) || !largestSet.has(index + 1)
      || !largestSet.has(index - width) || !largestSet.has(index + width)) occupied.push({ x, y });
  });
  if (occupied.length < 8) return [];
  const center = occupied.reduce((sum, item) => ({ x: sum.x + item.x / occupied.length, y: sum.y + item.y / occupied.length }), { x: 0, y: 0 });
  const radial = Array.from({ length: Math.max(24, bins) }, () => null);
  occupied.forEach(item => {
    const angle = Math.atan2(item.y - center.y, item.x - center.x);
    const index = Math.min(radial.length - 1, Math.floor((angle + Math.PI) / (Math.PI * 2) * radial.length));
    const radius = Math.hypot(item.x - center.x, item.y - center.y);
    if (!radial[index] || radius > radial[index].radius) radial[index] = { ...item, radius };
  });
  const output = radial.filter(Boolean).map(item => ({ x: item.x / width, y: item.y / height, z: 0 }));
  if (output.length) output.push({ ...output[0] });
  return output;
};

const curvedBridge = (from, to, curvature, count = 8) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const bend = Math.sin(t * Math.PI) * curvature * length * 0.18;
    const base = mix(from, to, t);
    return { ...base, x: base.x + normal.x * bend, y: base.y + normal.y * bend };
  });
};

// Pose landmarks establish scale and placement, but this deliberately avoids
// walking MediaPipe's joint graph. The resulting bowed arm/leg sweeps and
// asymmetric torso ribbon read as drawn accents rather than a pose skeleton.
const bodyAccentsFromPose = result => {
  const pose = result?.poseLandmarks || [];
  const leftShoulder = point(pose[11]);
  const rightShoulder = point(pose[12]);
  const leftHip = point(pose[23]);
  const rightHip = point(pose[24]);
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every(Boolean)) return [];
  const leftWrist = point(pose[15]);
  const rightWrist = point(pose[16]);
  const leftAnkle = point(pose[27]);
  const rightAnkle = point(pose[28]);
  const shoulderCenter = mix(leftShoulder, rightShoulder, 0.5);
  const hipCenter = mix(leftHip, rightHip, 0.5);
  const torsoWidth = Math.max(0.02, distance(leftShoulder, rightShoulder));
  const torso = [
    leftShoulder,
    { ...shoulderCenter, y: shoulderCenter.y - torsoWidth * 0.06 },
    rightShoulder,
    { x: rightHip.x + torsoWidth * 0.12, y: mix(rightShoulder, rightHip, 0.52).y },
    rightHip,
    { ...hipCenter, y: hipCenter.y + torsoWidth * 0.05 },
    leftHip,
    { x: leftHip.x - torsoWidth * 0.12, y: mix(leftShoulder, leftHip, 0.52).y },
    leftShoulder,
  ];
  const output = [];
  const append = values => values?.length && output.push(...(output.length ? values.slice(1) : values));
  if (leftWrist) append(curvedBridge(leftWrist, leftShoulder, 0.42, 10));
  append(torso);
  if (rightAnkle) append(curvedBridge(rightHip, rightAnkle, 0.28, 10));
  if (leftAnkle && rightAnkle) append(curvedBridge(rightAnkle, leftAnkle, 0.18, 7));
  if (leftAnkle) append(curvedBridge(leftAnkle, leftHip, -0.28, 10));
  // Finish at the right wrist so the stable semantic route enters at the
  // left hand and leaves through the right hand instead of jumping from a hip.
  if (rightWrist) append(curvedBridge(leftHip, rightWrist, -0.42, 12));
  return output;
};

const moduleBudgets = Object.freeze([
  ["silhouette", 0.30], ["faceOval", 0.12], ["leftBrow", 0.045], ["leftEye", 0.055],
  ["nose", 0.08], ["rightEye", 0.055], ["rightBrow", 0.045], ["mouth", 0.075],
  ["leftHand", 0.095], ["body", 0.065], ["rightHand", 0.095],
]);

const allocateBudgets = (total, options) => {
  const anatomyWeights = {
    silhouette: options.anatomy.silhouetteWeight,
    faceOval: options.anatomy.faceWeight,
    leftBrow: options.anatomy.faceWeight,
    leftEye: options.anatomy.faceWeight,
    nose: options.anatomy.faceWeight,
    rightEye: options.anatomy.faceWeight,
    rightBrow: options.anatomy.faceWeight,
    mouth: options.anatomy.faceWeight,
    leftHand: options.anatomy.handWeight,
    body: options.anatomy.bodyWeight,
    rightHand: options.anatomy.handWeight,
  };
  const weighted = moduleBudgets.map(([name, weight]) => [name, weight * Math.max(0.05, anatomyWeights[name] ?? 1)]);
  const weightTotal = weighted.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const values = weighted.map(([name, weight]) => [name, Math.max(3, Math.round(total * weight / weightTotal))]);
  let difference = total - values.reduce((sum, [, count]) => sum + count, 0);
  let index = 0;
  while (difference !== 0) {
    const entry = values[index % values.length];
    if (difference > 0) { entry[1] += 1; difference -= 1; }
    else if (entry[1] > 3) { entry[1] -= 1; difference += 1; }
    index += 1;
  }
  return Object.fromEntries(values);
};

const roleFamily = role => {
  const name = String(role || "line").split(":")[0];
  if (["faceOval", "leftBrow", "leftEye", "nose", "rightEye", "rightBrow", "mouth"].includes(name)) return "face";
  if (name === "leftHand" || name === "rightHand") return "hand";
  return name === "silhouette" ? "silhouette" : name === "body" ? "body" : "line";
};

const roleImportance = family => ({ face: 1, hand: 0.82, silhouette: 0.68, body: 0.58 }[family] ?? 0.65);

const pressureProfile = (values, roles, options) => values.map((current, index) => {
  const before = values[Math.max(0, index - 1)];
  const after = values[Math.min(values.length - 1, index + 1)];
  const a = Math.atan2(current.y - before.y, current.x - before.x);
  const b = Math.atan2(after.y - current.y, after.x - current.x);
  const curvature = Math.min(1, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) / Math.PI);
  const t = index / Math.max(1, values.length - 1);
  const taper = Math.min(1, Math.min(t, 1 - t) * 8);
  const semantic = 1 + (roleImportance(roleFamily(roles[index])) - 0.7) * options.ink.featureWidthInfluence;
  const variation = options.ink.variableWidth ? options.ink.widthVariation : 0;
  const pressure = (0.72 + (1 - curvature) * variation * 0.28) * (1 - options.ink.taper + options.ink.taper * taper) * semantic;
  // Panel ranges are ergonomic suggestions, not artistic hard limits. Keep a
  // broad finite safety cap so manually entered variation values remain
  // visible in both the path stream and renderer.
  const expressivePressure = clamp(pressure, 0.01, 1000, 0.7);
  return { ...current, pressure: expressivePressure, width: options.ink.width * expressivePressure };
});

const segmentRangesForRoles = (roles, maxSegments) => {
  if (maxSegments <= 1 || roles.length < 2) return [[0, roles.length]];
  const semanticRuns = [];
  let start = 0;
  let family = roleFamily(roles[0]);
  for (let index = 1; index <= roles.length; index += 1) {
    const nextFamily = index < roles.length ? roleFamily(roles[index]) : null;
    if (nextFamily !== family) {
      semanticRuns.push({ start, end: index, family });
      start = index;
      family = nextFamily;
    }
  }
  // Face subfeatures remain one semantic curve until the segment budget is
  // large enough to separate them. This recovers structure without changing
  // topology from frame to frame.
  const merged = [];
  semanticRuns.forEach(run => {
    const previous = merged.at(-1);
    if (previous?.family === run.family) previous.end = run.end;
    else merged.push({ ...run });
  });
  while (merged.length > maxSegments) {
    let best = 0;
    let bestSize = Infinity;
    for (let index = 0; index < merged.length - 1; index += 1) {
      const size = (merged[index].end - merged[index].start) + (merged[index + 1].end - merged[index + 1].start);
      if (size < bestSize) { best = index; bestSize = size; }
    }
    merged.splice(best, 2, { start: merged[best].start, end: merged[best + 1].end, family: "mixed" });
  }
  return merged.map((run, index) => {
    let renderStart = run.start;
    // When semantic curves are allowed to separate, omit the incoming travel
    // bridge from every curve after the first. The canonical flattened point
    // stream remains stable for mappings; the renderer and snapshots no longer
    // draw a long jump across unrelated anatomy.
    if (index > 0) while (renderStart < run.end - 2 && String(roles[renderStart]).endsWith(":bridge")) renderStart += 1;
    return [renderStart, run.end];
  });
};

export const generateUnicursalPath = ({ result, segmentation = null, options: value = {}, sourceId = "", updatedAt } = {}) => {
  const options = normalizeUnicursalOptions(value);
  const segmentationContour = options.silhouette.mode !== "envelope"
    ? contourFromSegmentation(segmentation, options.silhouette.threshold, Math.round(48 + options.silhouette.detail * 112))
    : [];
  const silhouette = segmentationContour.length >= 12 ? segmentationContour : envelopeFromLandmarks(result);
  const silhouetteSource = segmentationContour.length >= 12 ? "segmentation" : "envelope";
  const modules = {
    silhouette: options.anatomy.silhouette ? silhouette : [],
    faceOval: options.anatomy.face ? sourcePoints(result, "faceLandmarks", FACE_GROUPS["face.face_oval"]) : [],
    leftBrow: options.anatomy.face ? sourcePoints(result, "faceLandmarks", LEFT_BROW) : [],
    leftEye: options.anatomy.face ? sourcePoints(result, "faceLandmarks", LEFT_EYE) : [],
    nose: options.anatomy.face ? sourcePoints(result, "faceLandmarks", NOSE) : [],
    rightEye: options.anatomy.face ? sourcePoints(result, "faceLandmarks", RIGHT_EYE) : [],
    rightBrow: options.anatomy.face ? sourcePoints(result, "faceLandmarks", RIGHT_BROW) : [],
    mouth: options.anatomy.face ? sourcePoints(result, "faceLandmarks", MOUTH) : [],
    leftHand: options.anatomy.leftHand ? sourcePoints(result, "leftHandLandmarks", HAND_ROUTE) : [],
    body: options.anatomy.body ? bodyAccentsFromPose(result) : [],
    rightHand: options.anatomy.rightHand ? sourcePoints(result, "rightHandLandmarks", HAND_ROUTE) : [],
  };
  const available = Object.values(modules).some(values => values.length >= 2);
  const budgets = allocateBudgets(options.geometry.pointBudget, options);
  let cursor = point(result?.faceLandmarks?.[152]) || point(result?.poseLandmarks?.[0]) || { x: 0.5, y: 0.5, z: 0 };
  const route = [];
  const roles = [];
  moduleBudgets.forEach(([name]) => {
    let source = modules[name];
    if (name === "silhouette" && source.length >= 3) source = simplifyAngular(source, options.silhouette.simplify);
    const desired = source.length >= 2 ? source : [cursor, cursor];
    const bridgeCount = Math.max(2, Math.round(budgets[name] * 0.2));
    const detailCount = Math.max(2, budgets[name] - bridgeCount);
    const bridge = curvedBridge(cursor, desired[0], options.geometry.bridgeCurvature * (0.45 + options.geometry.tension * 0.9), bridgeCount);
    let detail = resamplePath(desired, detailCount);
    if (options.geometry.abstraction > 0) {
      const abstraction = options.geometry.abstraction * (options.preset === "cubist" ? 1 : 0.35);
      detail = simplifyAngular(detail, abstraction);
    }
    route.push(...bridge, ...detail);
    roles.push(...Array(bridge.length).fill(`${name}:bridge`), ...Array(detail.length).fill(name));
    cursor = detail.at(-1) || cursor;
  });
  let shaped = route.slice(0, options.geometry.pointBudget);
  while (shaped.length < options.geometry.pointBudget) shaped.push({ ...(shaped.at(-1) || cursor) });
  const smoothPasses = options.preset === "cubist" ? 0 : Math.round(options.geometry.smoothing * 3);
  for (let pass = 0; pass < smoothPasses; pass += 1) shaped = resamplePath(chaikin(shaped), options.geometry.pointBudget);
  const pointRoles = shaped.map((_, index) => roles[Math.min(roles.length - 1, Math.floor(index / Math.max(1, shaped.length - 1) * Math.max(0, roles.length - 1)))] || "line");
  if (options.geometry.exaggeration > 0 && shaped.length) {
    const families = ["silhouette", "face", "hand", "body"];
    const centers = Object.fromEntries(families.map(family => {
      const members = shaped.filter((_, index) => roleFamily(pointRoles[index]) === family);
      return [family, members.length ? members.reduce((sum, item) => ({ x: sum.x + item.x / members.length, y: sum.y + item.y / members.length }), { x: 0, y: 0 }) : null];
    }));
    const factors = {
      silhouette: options.anatomy.silhouetteExaggeration,
      face: options.anatomy.faceExaggeration,
      hand: options.anatomy.handExaggeration,
      body: options.anatomy.bodyExaggeration,
    };
    shaped = shaped.map((item, index) => {
      const family = roleFamily(pointRoles[index]);
      const center = centers[family];
      if (!center) return item;
      const amount = 1 + options.geometry.exaggeration * 0.18 * (factors[family] ?? 1);
      return { ...item, x: center.x + (item.x - center.x) * amount, y: center.y + (item.y - center.y) * amount };
    });
  }
  shaped = perturb(shaped, { ...options.ornament, returnOffset: options.geometry.returnOffset });
  const points = pressureProfile(shaped, pointRoles, options);
  const frozenPoints = points.map((item, index) => Object.freeze({ ...item, role: pointRoles[index] || "line", t: index / Math.max(1, points.length - 1) }));
  const segments = segmentRangesForRoles(pointRoles, options.geometry.maxSegments)
    .map(([start, end], index) => Object.freeze({
      index,
      start,
      points: Object.freeze(frozenPoints.slice(start, Math.max(start + 2, end))),
    }))
    .filter(segment => segment.points.length >= 2);
  const bounds = boundsOf(points) || { x: 0, y: 0, width: 0, height: 0 };
  return Object.freeze({
    kind: "path",
    available,
    sourceId: String(sourceId || result?.sourceId || ""),
    updatedAt: Number(updatedAt ?? result?.updatedAt) || 0,
    sourceTimestamp: Number(result?.sourceTimestamp ?? updatedAt ?? result?.updatedAt) || 0,
    space: "normalized",
    closed: false,
    style: options.preset,
    bounds: Object.freeze(bounds),
    points: Object.freeze(frozenPoints),
    segments: Object.freeze(segments),
    silhouette: Object.freeze({ source: silhouetteSource, points: Object.freeze(silhouette.map(item => Object.freeze({ ...item }))) }),
    options,
    metrics: Object.freeze({ length: pathLength(points), pointCount: points.length, segmentation: segmentationContour.length >= 12 }),
  });
};

export const transformUnicursalFrame = (frame, element, space = "scene") => {
  if (!frame?.points) return frame;
  if (space === "normalized") return frame;
  const width = Math.max(1, Number(element?.width) || 1);
  const height = Math.max(1, Number(element?.height) || 1);
  const angle = Number(element?.angle) || 0;
  const cx = (Number(element?.x) || 0) + width / 2;
  const cy = (Number(element?.y) || 0) + height / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const points = frame.points.map(item => {
    const local = { ...item, x: item.x * width, y: item.y * height };
    if (space === "local") return Object.freeze(local);
    const dx = local.x - width / 2;
    const dy = local.y - height / 2;
    return Object.freeze({ ...local, x: cx + dx * cosine - dy * sine, y: cy + dx * sine + dy * cosine });
  });
  const transformedSegments = (frame.segments || [{ points: frame.points }]).map((segment, index) => {
    const start = frame.points.indexOf(segment.points[0]);
    const segmentPoints = start >= 0 ? points.slice(start, start + segment.points.length) : [];
    return Object.freeze({ ...segment, index, start, points: Object.freeze(segmentPoints) });
  });
  return Object.freeze({ ...frame, space, points: Object.freeze(points), segments: Object.freeze(transformedSegments), bounds: Object.freeze(boundsOf(points)) });
};

export const smoothUnicursalFrame = (previous, next, elapsedMs = 16, responseMs = 140) => {
  if (!previous?.points || previous.points.length !== next?.points?.length || responseMs <= 0) return next;
  const amount = 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, responseMs));
  const points = next.points.map((item, index) => Object.freeze({
    ...item,
    x: previous.points[index].x + (item.x - previous.points[index].x) * amount,
    y: previous.points[index].y + (item.y - previous.points[index].y) * amount,
    pressure: previous.points[index].pressure + (item.pressure - previous.points[index].pressure) * amount,
    width: previous.points[index].width + (item.width - previous.points[index].width) * amount,
  }));
  const segments = (next.segments || [{ points: next.points }]).map((segment, index) => {
    const start = Number.isInteger(segment.start) ? segment.start : next.points.indexOf(segment.points[0]);
    const segmentPoints = points.slice(Math.max(0, start), Math.max(0, start) + segment.points.length);
    return Object.freeze({ ...segment, index, points: Object.freeze(segmentPoints) });
  });
  return Object.freeze({
    ...next,
    points: Object.freeze(points),
    segments: Object.freeze(segments),
  });
};

export const drawUnicursalFrame = (context, frame, width, height, { opacity = 1 } = {}) => {
  if (!context || !frame?.available || frame.points.length < 2) return false;
  const normalized = frame.space === "normalized";
  context.save();
  context.globalAlpha *= Math.max(0, Math.min(1, opacity * frame.options.ink.opacity / 100));
  context.strokeStyle = frame.options.ink.color;
  context.fillStyle = frame.options.ink.color;
  context.shadowColor = frame.options.ink.color;
  context.shadowBlur = frame.options.ink.feather * Math.max(1, frame.options.ink.width * 1.5);
  context.lineCap = "round";
  context.lineJoin = "round";
  const scale = normalized ? Math.min(width, height) / 300 : 1;
  const project = item => ({ x: normalized ? item.x * width : item.x, y: normalized ? item.y * height : item.y, width: Math.max(0.5, item.width * scale) });
  const traceCurve = (values, move = true) => {
    if (move) context.moveTo(values[0].x, values[0].y);
    else context.lineTo(values[0].x, values[0].y);
    const mode = frame.options.geometry.smoothCurves ? frame.options.geometry.curveMode : "polyline";
    if (mode === "catmull-rom" && values.length >= 3) {
      const strength = Math.max(0, Number(frame.options.geometry.tension) || 0) / 6;
      for (let index = 0; index < values.length - 1; index += 1) {
        const p0 = values[Math.max(0, index - 1)];
        const p1 = values[index];
        const p2 = values[index + 1];
        const p3 = values[Math.min(values.length - 1, index + 2)];
        context.bezierCurveTo(
          p1.x + (p2.x - p0.x) * strength, p1.y + (p2.y - p0.y) * strength,
          p2.x - (p3.x - p1.x) * strength, p2.y - (p3.y - p1.y) * strength,
          p2.x, p2.y,
        );
      }
    } else if (mode === "quadratic" && values.length >= 3) {
      for (let index = 1; index < values.length - 1; index += 1) {
        const midpoint = mix(values[index], values[index + 1], 0.5);
        context.quadraticCurveTo(values[index].x, values[index].y, midpoint.x, midpoint.y);
      }
      context.lineTo(values.at(-1).x, values.at(-1).y);
    } else values.slice(1).forEach(item => context.lineTo(item.x, item.y));
  };
  const segments = frame.segments?.length ? frame.segments : [{ points: frame.points }];
  segments.forEach(segment => {
    let values = segment.points.map(project);
    if (frame.options.geometry.smoothCurves && values.length >= 4) values = chaikin(values);
    if (!frame.options.ink.variableWidth || frame.options.ink.widthVariation <= 0.001) {
      context.lineWidth = Math.max(0.5, frame.options.ink.width * scale);
      context.beginPath();
      traceCurve(values);
      context.stroke();
      return;
    }
    // A filled ribbon preserves the pressure profile with one draw call per
    // semantic segment instead of one stroke call per point pair.
    const left = [];
    const right = [];
    values.forEach((item, index) => {
      const before = values[Math.max(0, index - 1)];
      const after = values[Math.min(values.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const radius = item.width / 2;
      left.push({ x: item.x - dy / magnitude * radius, y: item.y + dx / magnitude * radius });
      right.push({ x: item.x + dy / magnitude * radius, y: item.y - dx / magnitude * radius });
    });
    context.beginPath();
    traceCurve(left);
    traceCurve(right.reverse(), false);
    context.closePath();
    context.fill();
  });
  context.restore();
  return true;
};
