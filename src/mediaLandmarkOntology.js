const POSE_NAMES = Object.freeze([
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
]);

const HAND_NAMES = Object.freeze([
  "wrist",
  "thumb_cmc",
  "thumb_mcp",
  "thumb_ip",
  "thumb_tip",
  "index_finger_mcp",
  "index_finger_pip",
  "index_finger_dip",
  "index_finger_tip",
  "middle_finger_mcp",
  "middle_finger_pip",
  "middle_finger_dip",
  "middle_finger_tip",
  "ring_finger_mcp",
  "ring_finger_pip",
  "ring_finger_dip",
  "ring_finger_tip",
  "pinky_mcp",
  "pinky_pip",
  "pinky_dip",
  "pinky_tip",
]);

export const HAND_CONNECTIONS = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]);

export const POSE_CONNECTIONS = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
  [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
]);

// Display groups are a practical hierarchy over the official 33 pose
// landmarks. The pose-hand groups intentionally contain just the three palm /
// finger reference points; complete detected hands are represented by the
// separate `left_hand.*` and `right_hand.*` groups. They are visual groups
// only: the semantic `pose.*` feature API remains the canonical point-level
// interface.
const poseDisplayGroup = (label, indices) => {
  const visible = new Set(indices);
  return Object.freeze({
    label,
    indices: Object.freeze([...indices]),
    connections: Object.freeze(POSE_CONNECTIONS.filter(([from, to]) => visible.has(from) && visible.has(to))),
  });
};

export const POSE_DISPLAY_GROUPS = Object.freeze({
  body: poseDisplayGroup("Pose · body", [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]),
  head: poseDisplayGroup("Pose · head", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  leftHand: poseDisplayGroup("Pose · L hand", [17, 19, 21]),
  rightHand: poseDisplayGroup("Pose · R hand", [18, 20, 22]),
});

// Canonical point labels used by snapshots and semantic code. Keep Face Mesh
// numeric because MediaPipe does not provide names for every vertex.
export const mediaLandmarkFeatureId = (family, index) => {
  const landmarkIndex = Number(index);
  if (!Number.isInteger(landmarkIndex) || landmarkIndex < 0) return "";
  if (family === "pose") return POSE_NAMES[landmarkIndex] ? `pose.${POSE_NAMES[landmarkIndex]}` : "";
  if (family === "left_hand" || family === "right_hand") {
    return HAND_NAMES[landmarkIndex] ? `${family}.${HAND_NAMES[landmarkIndex]}` : "";
  }
  if (family === "face") return landmarkIndex < 478 ? `face.${landmarkIndex}` : "";
  return "";
};

// Official MediaPipe Face Mesh connection groups. The map assets use these
// indices as explanatory labels; this registry remains the runtime source.
const FACE_NOSE_CONNECTIONS = Object.freeze([
  [168, 6], [6, 197], [197, 195], [195, 5], [5, 4], [4, 1], [1, 19],
  [19, 94], [94, 2], [98, 97], [97, 2], [2, 326], [326, 327], [327, 294],
  [294, 278], [278, 344], [344, 440], [440, 275], [275, 4], [4, 45],
  [45, 220], [220, 115], [115, 48], [48, 64], [64, 98],
].map(connection => Object.freeze(connection)));

const FACE_OUTER_LIPS = Object.freeze([
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267,
  0, 37, 39, 40, 185, 61,
]);

const FACE_INNER_LIPS = Object.freeze([
  78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312,
  13, 82, 81, 80, 191, 78,
]);

export const FACE_GROUPS = Object.freeze({
  "face.face_oval": Object.freeze([
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
    379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
    234, 127, 162, 21, 54, 103, 67, 109, 10,
  ]),
  "face.left_eye": Object.freeze([
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387,
    388, 466, 263,
  ]),
  "face.right_eye": Object.freeze([
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160,
    161, 246, 33,
  ]),
  // Trace each brow as one open ribbon: outer upper edge to the inner join,
  // then back out along the lower edge. The official connection sets expose
  // the two edges separately; this ordering supplies the intended inner join
  // without drawing a diagonal from the inner upper point to the outer lower.
  "face.left_eyebrow": Object.freeze([276, 283, 282, 295, 285, 336, 296, 334, 293, 300]),
  "face.right_eyebrow": Object.freeze([46, 53, 52, 65, 55, 107, 66, 105, 63, 70]),
  "face.left_iris": Object.freeze([473, 474, 475, 476, 477, 474]),
  "face.right_iris": Object.freeze([468, 469, 470, 471, 472, 469]),
  "face.nose": Object.freeze([...new Set(FACE_NOSE_CONNECTIONS.flat())]),
  // FACE_LANDMARKS_LIPS comprises the outer and inner mouth contours.
  "face.lips": Object.freeze([...FACE_OUTER_LIPS, ...FACE_INNER_LIPS]),
});

const uniqueIndices = values => Object.freeze([...new Set(values)]);
const facePathConnections = path => Object.freeze(path.slice(1).map((to, index) => Object.freeze([path[index], to])));
const faceConnectionsForPaths = paths => Object.freeze(paths.flatMap(facePathConnections));
const faceDisplayGroup = (label, paths = [], connections = faceConnectionsForPaths(paths)) => Object.freeze({
  label,
  indices: uniqueIndices([...paths.flat(), ...connections.flat()]),
  connections: Object.freeze(connections.map(connection => Object.freeze([...connection]))),
});
const FACE_SEMANTIC_INDICES = uniqueIndices([
  ...FACE_GROUPS["face.face_oval"],
  ...FACE_GROUPS["face.left_eye"],
  ...FACE_GROUPS["face.right_eye"],
  ...FACE_GROUPS["face.left_iris"],
  ...FACE_GROUPS["face.right_iris"],
  ...FACE_GROUPS["face.nose"],
  ...FACE_GROUPS["face.lips"],
  ...FACE_GROUPS["face.left_eyebrow"],
  ...FACE_GROUPS["face.right_eyebrow"],
]);

// Display-oriented face sets deliberately use the official connection groups
// above.  Together they partition the complete 478-point refined Face Mesh,
// so a performer can turn on all points and then remove semantic regions.
export const FACE_DISPLAY_GROUPS = Object.freeze({
  outline: faceDisplayGroup("Outline", [FACE_GROUPS["face.face_oval"]]),
  eyes: faceDisplayGroup("Eyes", [FACE_GROUPS["face.left_eye"], FACE_GROUPS["face.right_eye"]]),
  iris: faceDisplayGroup("Iris", [FACE_GROUPS["face.left_iris"], FACE_GROUPS["face.right_iris"]]),
  nose: faceDisplayGroup("Nose", [], FACE_NOSE_CONNECTIONS),
  mouth: faceDisplayGroup("Mouth", [FACE_OUTER_LIPS, FACE_INNER_LIPS]),
  brows: faceDisplayGroup("Brows", [FACE_GROUPS["face.left_eyebrow"], FACE_GROUPS["face.right_eyebrow"]]),
  remaining: Object.freeze({
    label: "Remaining",
    indices: Object.freeze(Array.from({ length: 478 }, (_, index) => index).filter(index => !FACE_SEMANTIC_INDICES.includes(index))),
    connections: Object.freeze([]),
  }),
});

// This is the display contract shared by the live MediaPipe overlay and a
// baked landmark snapshot. Keeping the selected subsets and their connection
// topology here prevents a snapshot from silently falling back to an
// all-points representation when the performer is looking at a skeleton or a
// face-outline view.
export const getHolisticDisplayLayers = (result = {}, holistic = {}) => {
  const poseGroups = holistic.poseGroups || {};
  const faceGroups = holistic.faceGroups || {};
  const colors = holistic.colors || {};
  const swapped = holistic.swapHandedness === true;
  const layers = [];
  if (holistic.showPose !== false) {
    Object.entries(POSE_DISPLAY_GROUPS).forEach(([id, group]) => {
      if (poseGroups[id] === false) return;
      const colorKey = `pose${id[0].toUpperCase()}${id.slice(1)}`;
      layers.push({
        id: `pose:${id}`,
        family: "pose",
        landmarks: result.poseLandmarks || [],
        indices: group.indices,
        connections: group.connections,
        color: colors[colorKey] || colors.pose || "#6fa5ff",
      });
    });
  }
  if (holistic.showHands !== false && holistic.showLeftHand !== false) {
    layers.push({
      id: "left_hand",
      family: "left_hand",
      landmarks: swapped ? result.rightHandLandmarks || [] : result.leftHandLandmarks || [],
      indices: null,
      connections: HAND_CONNECTIONS,
      color: colors.leftHand || "#6ee795",
    });
  }
  if (holistic.showHands !== false && holistic.showRightHand !== false) {
    layers.push({
      id: "right_hand",
      family: "right_hand",
      landmarks: swapped ? result.leftHandLandmarks || [] : result.rightHandLandmarks || [],
      indices: null,
      connections: HAND_CONNECTIONS,
      color: colors.rightHand || "#ed7ab8",
    });
  }
  if (holistic.showFace !== false) {
    Object.entries(FACE_DISPLAY_GROUPS).forEach(([id, group]) => {
      if (faceGroups[id] === false) return;
      layers.push({
        id: `face:${id}`,
        family: "face",
        landmarks: result.faceLandmarks || [],
        indices: group.indices,
        connections: group.connections,
        color: colors.face || "#f2df55",
      });
    });
  }
  return layers;
};

const PALM_INDICES = Object.freeze([0, 1, 5, 9, 13, 17]);
const FINGER_GROUPS = Object.freeze({
  thumb: Object.freeze([1, 2, 3, 4]),
  index_finger: Object.freeze([5, 6, 7, 8]),
  middle_finger: Object.freeze([9, 10, 11, 12]),
  ring_finger: Object.freeze([13, 14, 15, 16]),
  pinky: Object.freeze([17, 18, 19, 20]),
});

const pointDefinition = (id, family, index, label) => Object.freeze({
  id,
  family,
  index,
  kind: "point",
  label,
  aliases: Object.freeze([]),
});

const pretty = value => String(value).split("_").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

const definitions = [
  ...POSE_NAMES.map((name, index) => pointDefinition(`pose.${name}`, "pose", index, pretty(name))),
  ...["left_hand", "right_hand"].flatMap(family => HAND_NAMES.map((name, index) => (
    pointDefinition(`${family}.${name}`, family, index, `${family === "left_hand" ? "Left" : "Right"} ${pretty(name)}`)
  ))),
  ...Object.entries(FACE_GROUPS).map(([id, indices]) => Object.freeze({
    id,
    family: "face",
    kind: "polyline",
    indices,
    closed: ["face.face_oval", "face.left_eye", "face.right_eye", "face.left_iris", "face.right_iris", "face.lips"].includes(id),
    label: pretty(id.slice(5)),
    aliases: Object.freeze([]),
  })),
  Object.freeze({
    id: "body.head_outline",
    family: "body",
    sourceFamily: "face",
    kind: "polyline",
    indices: FACE_GROUPS["face.face_oval"],
    closed: true,
    label: "Head Outline",
    aliases: Object.freeze(["HEAD_outline"]),
  }),
  ...["left_hand", "right_hand"].flatMap(family => [
    Object.freeze({
      id: family,
      family,
      kind: "aggregate",
      indices: Object.freeze(HAND_NAMES.map((_, index) => index)),
      label: family === "left_hand" ? "Left Hand" : "Right Hand",
      aliases: Object.freeze(family === "left_hand" ? ["LH"] : ["RH"]),
    }),
    Object.freeze({
      id: `${family}.palm`,
      family,
      kind: "region",
      indices: PALM_INDICES,
      label: `${family === "left_hand" ? "Left" : "Right"} Palm`,
      aliases: Object.freeze([]),
    }),
    ...Object.entries(FINGER_GROUPS).map(([name, indices]) => Object.freeze({
      id: `${family}.${name}`,
      family,
      kind: "polyline",
      indices,
      closed: false,
      label: `${family === "left_hand" ? "Left" : "Right"} ${pretty(name)}`,
      aliases: Object.freeze([]),
    })),
    Object.freeze({
      id: `${family}.pinch`,
      family,
      kind: "gesture",
      label: `${family === "left_hand" ? "Left" : "Right"} Pinch`,
      aliases: Object.freeze([]),
    }),
  ]),
];

const definitionById = new Map();
for (const definition of definitions) {
  definitionById.set(definition.id, definition);
  for (const alias of definition.aliases) definitionById.set(alias, definition);
}

export const MEDIA_LANDMARK_DEFINITIONS = Object.freeze(definitions);
export const MEDIA_LANDMARK_ALIASES = Object.freeze(Object.fromEntries(
  [...definitionById.entries()]
    .filter(([key, definition]) => key !== definition.id)
    .map(([key, definition]) => [key, definition.id]),
));

export const resolveMediaFeatureDefinition = reference => {
  const id = String(reference || "").trim();
  if (/^face\.\d+$/.test(id)) {
    const index = Number(id.slice(5));
    if (index >= 0 && index <= 477) return pointDefinition(id, "face", index, `Face ${index}`);
  }
  return definitionById.get(id) || null;
};

export const listMediaFeatureDefinitions = query => {
  const needle = String(query || "").trim().toLowerCase();
  const facePoints = needle.startsWith("face.") && /^face\.\d*$/.test(needle)
    ? Array.from({ length: 478 }, (_, index) => resolveMediaFeatureDefinition(`face.${index}`))
    : [];
  const candidates = [...MEDIA_LANDMARK_DEFINITIONS, ...facePoints];
  if (!needle) return candidates;
  return candidates.filter(definition => [
    definition.id,
    definition.label,
    ...(definition.aliases || []),
  ].some(value => String(value).toLowerCase().includes(needle)));
};

const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const sourceArrayFor = (family, result) => {
  if (family === "pose") return result?.poseLandmarks;
  if (family === "left_hand") return result?.leftHandLandmarks;
  if (family === "right_hand") return result?.rightHandLandmarks;
  if (family === "face") return result?.faceLandmarks;
  return null;
};

export const normalizedPointToMediaSpaces = (point, element) => {
  if (!point || !finite(point.x) || !finite(point.y) || !element) return null;
  const normalized = Object.freeze({
    x: Number(point.x),
    y: Number(point.y),
    z: finite(point.z) ? Number(point.z) : 0,
  });
  const width = Math.max(1, Number(element.width) || 1);
  const height = Math.max(1, Number(element.height) || 1);
  const local = Object.freeze({ x: normalized.x * width, y: normalized.y * height, z: normalized.z });
  const centerX = (Number(element.x) || 0) + width / 2;
  const centerY = (Number(element.y) || 0) + height / 2;
  const angle = Number(element.angle) || 0;
  const dx = local.x - width / 2;
  const dy = local.y - height / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const scene = Object.freeze({
    x: centerX + dx * cosine - dy * sine,
    y: centerY + dx * sine + dy * cosine,
    z: normalized.z,
  });
  return Object.freeze({ normalized, local, scene });
};

const confidenceFor = point => {
  if (finite(point?.visibility) && finite(point?.presence)) return Math.min(Number(point.visibility), Number(point.presence));
  if (finite(point?.visibility)) return Number(point.visibility);
  if (finite(point?.presence)) return Number(point.presence);
  return null;
};

const minimumConfidence = snapshots => {
  const values = snapshots.map(snapshot => snapshot?.confidence).filter(finite).map(Number);
  return values.length ? Math.min(...values) : null;
};

const boundsFor = points => {
  if (!points.length) return null;
  const xs = points.map(point => point.scene.x);
  const ys = points.map(point => point.scene.y);
  return Object.freeze({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  });
};

const centroidFor = points => {
  if (!points.length) return null;
  return Object.freeze({
    x: points.reduce((sum, point) => sum + point.scene.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.scene.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.scene.z, 0) / points.length,
  });
};

const pointSnapshot = (definition, result, element, updatedAt, now) => {
  const point = sourceArrayFor(definition.family, result)?.[definition.index];
  const spaces = normalizedPointToMediaSpaces(point, element);
  const available = Boolean(spaces);
  return Object.freeze({
    id: definition.id,
    aliases: definition.aliases,
    label: definition.label,
    family: definition.family,
    kind: definition.kind,
    index: definition.index,
    available,
    stale: !available,
    confidence: available ? confidenceFor(point) : null,
    updatedAt,
    ageMs: Math.max(0, now - updatedAt),
    normalized: spaces?.normalized || null,
    local: spaces?.local || null,
    scene: spaces?.scene || null,
  });
};

const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;

export const createMediaSemanticFrame = ({
  streamId,
  streamName,
  element,
  result,
  now = performance.now(),
  previousGestures = {},
} = {}) => {
  const updatedAt = Number(result?.updatedAt) || now;
  const cache = new Map();
  const feature = reference => {
    const definition = resolveMediaFeatureDefinition(reference);
    if (!definition) return null;
    if (cache.has(definition.id)) return cache.get(definition.id);
    if (definition.kind === "point") {
      const snapshot = pointSnapshot(definition, result, element, updatedAt, now);
      cache.set(definition.id, snapshot);
      return snapshot;
    }
    if (definition.kind === "gesture") {
      const thumb = feature(`${definition.family}.thumb_tip`);
      const index = feature(`${definition.family}.index_finger_tip`);
      const wrist = feature(`${definition.family}.wrist`);
      const middle = feature(`${definition.family}.middle_finger_mcp`);
      const palmSize = distance(wrist?.normalized, middle?.normalized);
      const value = palmSize > 1e-6 ? distance(thumb?.normalized, index?.normalized) / palmSize : Infinity;
      const previousActive = Boolean(previousGestures[definition.id]);
      const active = Number.isFinite(value) && (previousActive ? value < 0.45 : value < 0.35);
      const snapshot = Object.freeze({
        id: definition.id,
        aliases: definition.aliases,
        label: definition.label,
        family: definition.family,
        kind: definition.kind,
        available: Boolean(thumb?.available && index?.available && wrist?.available && middle?.available),
        stale: !(thumb?.available && index?.available && wrist?.available && middle?.available),
        confidence: minimumConfidence([thumb, index, wrist, middle]),
        updatedAt,
        ageMs: Math.max(0, now - updatedAt),
        value: Number.isFinite(value) ? value : null,
        active,
        normalized: null,
        local: null,
        scene: null,
      });
      cache.set(definition.id, snapshot);
      return snapshot;
    }
    const sourceFamily = definition.sourceFamily || definition.family;
    const points = definition.indices
      .map(index => feature(`${sourceFamily}.${sourceFamily === "face" ? index : HAND_NAMES[index]}`))
      .filter(point => point?.available);
    const centroid = centroidFor(points);
    const snapshot = Object.freeze({
      id: definition.id,
      aliases: definition.aliases,
      label: definition.label,
      family: definition.family,
      kind: definition.kind,
      available: points.length > 0,
      stale: points.length === 0,
      confidence: minimumConfidence(points),
      updatedAt,
      ageMs: Math.max(0, now - updatedAt),
      points: Object.freeze(points),
      centroid,
      bounds: boundsFor(points),
      normalized: points.length ? centroidFor(points.map(point => ({ scene: point.normalized }))) : null,
      local: points.length ? centroidFor(points.map(point => ({ scene: point.local }))) : null,
      scene: centroid,
      closed: Boolean(definition.closed),
    });
    cache.set(definition.id, snapshot);
    return snapshot;
  };
  return Object.freeze({
    id: streamId,
    name: streamName || streamId,
    kind: "holistic",
    available: Boolean(result),
    updatedAt,
    ageMs: Math.max(0, now - updatedAt),
    feature,
    features: query => listMediaFeatureDefinitions(query).map(definition => feature(definition.id)).filter(Boolean),
    gestureState: Object.freeze(Object.fromEntries(
      ["left_hand.pinch", "right_hand.pinch"].map(id => [id, Boolean(feature(id)?.active)]),
    )),
  });
};

export const getMediaFeaturePoint = (snapshot, space = "scene") => {
  if (!snapshot?.available) return null;
  if (snapshot.kind === "point") return snapshot[space] || snapshot.scene || null;
  if (snapshot.scene) return space === "scene" ? snapshot.scene : snapshot[space] || snapshot.scene;
  return null;
};

export const MEDIA_FEATURE_FAMILIES = Object.freeze([
  Object.freeze({ id: "pose", label: "Pose" }),
  Object.freeze({ id: "left_hand", label: "Left Hand" }),
  Object.freeze({ id: "right_hand", label: "Right Hand" }),
  Object.freeze({ id: "face", label: "Face" }),
  Object.freeze({ id: "body", label: "Derived Body" }),
]);
