export const IANNIX_ROLES = ["curve", "cursor", "trigger"];
export const IANNIX_LOOP_MODES = ["once", "loop", "pingPong"];

export const createDefaultIannixData = (overrides = {}) => ({
  version: 1,
  role: null,
  active: true,
  label: "",
  ...overrides,
  time: {
    start: 0,
    duration: 5,
    rate: 1,
    loopMode: "once",
    ...(overrides.time || {}),
  },
  cursor: {
    curveId: null,
    followTangent: true,
    visualSmoothing: 0.65,
    ...(overrides.cursor || {}),
  },
  midi: {
    baseNote: 60,
    pitchRangeOctaves: 2,
    velocity: 100,
    ...(overrides.midi || {}),
  },
  trigger: {
    duration: 0.35,
    midiEnabled: false,
    midiTemplate: "iannixXY",
    midiChannel: 1,
    midiBaseSource: "cursor",
    midiVelocity: 100,
    midiFixedNote: 69,
    midiController: 0,
    midiPattern: "midi://midi_out/notef 1 trigger_value_y trigger_value_x trigger_duration",
    ...(overrides.trigger || {}),
  },
});

export const normalizeIannixData = (data) => {
  const defaults = createDefaultIannixData();
  const role = IANNIX_ROLES.includes(data?.role) ? data.role : null;
  const loopMode = IANNIX_LOOP_MODES.includes(data?.time?.loopMode)
    ? data.time.loopMode
    : defaults.time.loopMode;
  const midiTemplates = ["iannixXY", "relativePitch", "fixedNote", "cursorCC", "custom"];
  const hasLegacyCustomPattern = data?.trigger?.midiPattern
    && data.trigger.midiPattern !== defaults.trigger.midiPattern;
  const midiTemplate = midiTemplates.includes(data?.trigger?.midiTemplate)
    ? data.trigger.midiTemplate
    : hasLegacyCustomPattern ? "custom" : defaults.trigger.midiTemplate;

  return {
    ...defaults,
    ...(data || {}),
    role,
    active: data?.active !== false,
    time: {
      ...defaults.time,
      ...(data?.time || {}),
      start: Number.isFinite(Number(data?.time?.start)) ? Number(data.time.start) : defaults.time.start,
      duration: Math.max(0.001, Number(data?.time?.duration) || defaults.time.duration),
      rate: Math.max(0, Number.isFinite(Number(data?.time?.rate)) ? Number(data.time.rate) : defaults.time.rate),
      loopMode,
    },
    cursor: {
      ...defaults.cursor,
      ...(data?.cursor || {}),
      curveId: data?.cursor?.curveId || null,
      followTangent: data?.cursor?.followTangent !== false,
      visualSmoothing: Math.min(0.95, Math.max(0,
        Number.isFinite(Number(data?.cursor?.visualSmoothing))
          ? Number(data.cursor.visualSmoothing)
          : defaults.cursor.visualSmoothing
      )),
    },
    midi: {
      ...defaults.midi,
      ...(data?.midi || {}),
      baseNote: Math.min(127, Math.max(0, Math.round(
        Number.isFinite(Number(data?.midi?.baseNote)) ? Number(data.midi.baseNote) : defaults.midi.baseNote
      ))),
      pitchRangeOctaves: Math.min(5, Math.max(0,
        Number.isFinite(Number(data?.midi?.pitchRangeOctaves))
          ? Number(data.midi.pitchRangeOctaves)
          : defaults.midi.pitchRangeOctaves
      )),
      velocity: Math.min(127, Math.max(0, Math.round(
        Number.isFinite(Number(data?.midi?.velocity)) ? Number(data.midi.velocity) : defaults.midi.velocity
      ))),
    },
    trigger: {
      ...defaults.trigger,
      ...(data?.trigger || {}),
      duration: Math.max(0, Number.isFinite(Number(data?.trigger?.duration))
        ? Number(data.trigger.duration)
        : defaults.trigger.duration),
      midiEnabled: data?.trigger?.midiEnabled === true,
      midiTemplate,
      midiChannel: Math.min(16, Math.max(1, Math.round(
        Number.isFinite(Number(data?.trigger?.midiChannel)) ? Number(data.trigger.midiChannel) : defaults.trigger.midiChannel
      ))),
      midiBaseSource: data?.trigger?.midiBaseSource === "curve" ? "curve" : "cursor",
      midiVelocity: Math.min(127, Math.max(0, Math.round(
        Number.isFinite(Number(data?.trigger?.midiVelocity)) ? Number(data.trigger.midiVelocity) : defaults.trigger.midiVelocity
      ))),
      midiFixedNote: Math.min(127, Math.max(0, Math.round(
        Number.isFinite(Number(data?.trigger?.midiFixedNote)) ? Number(data.trigger.midiFixedNote) : defaults.trigger.midiFixedNote
      ))),
      midiController: Math.min(127, Math.max(0, Math.round(
        Number.isFinite(Number(data?.trigger?.midiController)) ? Number(data.trigger.midiController) : defaults.trigger.midiController
      ))),
      midiPattern: String(data?.trigger?.midiPattern || defaults.trigger.midiPattern),
    },
  };
};

const roleLabelPrefix = (role) => role
  ? `${role.charAt(0).toUpperCase()}${role.slice(1)}`
  : "";

export const allocateIannixRoleLabels = (elements, targetIds, role) => {
  const targets = new Set(targetIds || []);
  const used = new Set();
  const labels = new Map();

  for (const element of elements || []) {
    if (!element || element.isDeleted || targets.has(element.id)) continue;
    const data = normalizeIannixData(element.customData?.iannix);
    const label = data.role ? data.label.trim() : "";
    if (label) used.add(label.toLocaleLowerCase());
  }

  if (!role) {
    for (const element of elements || []) {
      if (targets.has(element?.id)) labels.set(element.id, "");
    }
    return labels;
  }

  const prefix = roleLabelPrefix(role);
  let nextNumber = 1;
  for (const element of elements || []) {
    if (!element || element.isDeleted || !targets.has(element.id)) continue;
    const current = normalizeIannixData(element.customData?.iannix);
    const currentLabel = current.label.trim();
    if (current.role === role && currentLabel && !used.has(currentLabel.toLocaleLowerCase())) {
      labels.set(element.id, currentLabel);
      used.add(currentLabel.toLocaleLowerCase());
      continue;
    }
    let candidate = `${prefix} ${nextNumber}`;
    while (used.has(candidate.toLocaleLowerCase())) {
      nextNumber += 1;
      candidate = `${prefix} ${nextNumber}`;
    }
    labels.set(element.id, candidate);
    used.add(candidate.toLocaleLowerCase());
    nextNumber += 1;
  }
  return labels;
};

export const isRuntimeCursor = (element) => {
  const data = normalizeIannixData(element?.customData?.iannix);
  return data.role === "cursor" && data.active && Boolean(data.cursor.curveId);
};

export const getObjectTimeState = (globalTime, timing) => {
  const normalized = normalizeIannixData({ time: timing }).time;
  const elapsed = (Math.max(0, Number(globalTime) || 0) - normalized.start) * normalized.rate;
  const beforeStart = (Number(globalTime) || 0) < normalized.start;
  const rawProgress = beforeStart ? 0 : elapsed / normalized.duration;

  let progress = rawProgress;
  let active = !beforeStart;
  let iteration = Math.max(0, Math.floor(rawProgress));

  if (normalized.loopMode === "loop") {
    progress = rawProgress - Math.floor(rawProgress);
  } else if (normalized.loopMode === "pingPong") {
    const phase = rawProgress - Math.floor(rawProgress);
    progress = iteration % 2 === 0 ? phase : 1 - phase;
  } else {
    progress = Math.min(1, Math.max(0, rawProgress));
    active = active && rawProgress <= 1;
    iteration = rawProgress >= 1 ? 1 : 0;
  }

  if (normalized.rate === 0) {
    progress = 0;
    active = !beforeStart;
    iteration = 0;
  }

  return {
    globalTime: Math.max(0, Number(globalTime) || 0),
    localTime: Math.max(0, elapsed),
    progress,
    iteration,
    active,
    beforeStart,
    complete: normalized.loopMode === "once" && rawProgress >= 1,
  };
};

const rotatePoint = (point, center, angle) => {
  if (!angle) return [...point];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [
    center[0] + dx * cos - dy * sin,
    center[1] + dx * sin + dy * cos,
  ];
};

export const getElementCenter = (element) => [
  element.x + (element.width || 0) / 2,
  element.y + (element.height || 0) / 2,
];

const getBoxPath = (element) => {
  const x = element.x;
  const y = element.y;
  const width = Math.max(1, element.width || 0);
  const height = Math.max(1, element.height || 0);
  if (element.type === "ellipse") {
    const points = [];
    for (let index = 0; index <= 48; index++) {
      const angle = index / 48 * Math.PI * 2;
      points.push([
        x + width / 2 + Math.cos(angle) * width / 2,
        y + height / 2 + Math.sin(angle) * height / 2,
      ]);
    }
    return points;
  }
  if (element.type === "diamond") {
    return [
      [x + width / 2, y],
      [x + width, y + height / 2],
      [x + width / 2, y + height],
      [x, y + height / 2],
      [x + width / 2, y],
    ];
  }
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y],
  ];
};

export const getElementCorePaths = (element) => {
  if (!element || element.isDeleted) return [];
  const center = getElementCenter(element);
  const angle = element.angle || 0;

  if (
    (element.type === "line" || element.type === "arrow" || element.type === "freedraw") &&
    Array.isArray(element.customData?.originalPoints) &&
    element.customData.originalPoints.length >= 2
  ) {
    return [element.customData.originalPoints.map(point => rotatePoint(point, center, angle))];
  }

  if (
    (element.type === "line" || element.type === "arrow" || element.type === "freedraw") &&
    Array.isArray(element.points) &&
    element.points.length >= 2
  ) {
    const path = element.points.map(point => rotatePoint([
      element.x + point[0],
      element.y + point[1],
    ], center, angle));
    return [path];
  }

  return [getBoxPath(element).map(point => rotatePoint(point, center, angle))];
};

const getPathMetrics = (path) => {
  const segments = [];
  let length = 0;
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (segmentLength <= 0.000001) continue;
    segments.push({ start, end, startDistance: length, length: segmentLength });
    length += segmentLength;
  }
  return { segments, length };
};

export const samplePath = (path, progress) => {
  if (!Array.isArray(path) || path.length < 2) return null;
  const metrics = getPathMetrics(path);
  if (metrics.length <= 0 || metrics.segments.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, Number(progress) || 0));
  const targetDistance = clamped * metrics.length;
  const segment = metrics.segments.find(candidate =>
    targetDistance <= candidate.startDistance + candidate.length + 0.000001
  ) || metrics.segments.at(-1);
  const segmentProgress = Math.min(1, Math.max(0,
    (targetDistance - segment.startDistance) / segment.length
  ));
  const dx = segment.end[0] - segment.start[0];
  const dy = segment.end[1] - segment.start[1];
  return {
    point: [
      segment.start[0] + dx * segmentProgress,
      segment.start[1] + dy * segmentProgress,
    ],
    angle: Math.atan2(dy, dx),
    distance: targetDistance,
    length: metrics.length,
  };
};

export const getCursorTransform = (cursorElement, curveElement, progress, followTangent = true) => {
  const curvePath = getElementCorePaths(curveElement)[0];
  const current = samplePath(curvePath, progress);
  const start = samplePath(curvePath, 0);
  if (!current || !start) return null;
  const cursorCenter = getElementCenter(cursorElement);
  return {
    anchor: cursorCenter,
    position: current.point,
    translate: [current.point[0] - cursorCenter[0], current.point[1] - cursorCenter[1]],
    angle: followTangent ? current.angle - start.angle : 0,
    tangentAngle: current.angle,
  };
};

export const transformPaths = (paths, transform) => {
  if (!transform) return paths;
  const cos = Math.cos(transform.angle || 0);
  const sin = Math.sin(transform.angle || 0);
  return paths.map(path => path.map(point => {
    const dx = point[0] - transform.anchor[0];
    const dy = point[1] - transform.anchor[1];
    return [
      transform.anchor[0] + dx * cos - dy * sin + transform.translate[0],
      transform.anchor[1] + dx * sin + dy * cos + transform.translate[1],
    ];
  }));
};

const dampAngle = (from, to, amount) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
};

export const dampCursorTransform = (previous, target, smoothing, deltaSeconds) => {
  const damping = Math.min(0.95, Math.max(0, Number(smoothing) || 0));
  if (!previous || damping === 0) return target;
  if (deltaSeconds <= 0) return previous;
  const timeConstant = Math.max(0.001, damping * damping * 0.25);
  const amount = 1 - Math.exp(-Math.min(0.1, deltaSeconds) / timeConstant);
  const position = [
    previous.position[0] + (target.position[0] - previous.position[0]) * amount,
    previous.position[1] + (target.position[1] - previous.position[1]) * amount,
  ];
  return {
    ...target,
    position,
    translate: [
      position[0] - target.anchor[0],
      position[1] - target.anchor[1],
    ],
    angle: dampAngle(previous.angle || 0, target.angle || 0, amount),
    tangentAngle: dampAngle(previous.tangentAngle || 0, target.tangentAngle || 0, amount),
  };
};

const orientation = (a, b, c) => {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
};

const onSegment = (a, b, c) =>
  b[0] <= Math.max(a[0], c[0]) + 0.000001 &&
  b[0] >= Math.min(a[0], c[0]) - 0.000001 &&
  b[1] <= Math.max(a[1], c[1]) + 0.000001 &&
  b[1] >= Math.min(a[1], c[1]) - 0.000001;

export const segmentsIntersect = (a1, a2, b1, b2) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  return o4 === 0 && onSegment(b1, a2, b2);
};

const pathSegments = (paths) => paths.flatMap(path => {
  const segments = [];
  for (let index = 1; index < path.length; index++) {
    segments.push([path[index - 1], path[index]]);
  }
  return segments;
});

export const pathsIntersect = (pathsA, pathsB) => {
  const segmentsA = pathSegments(pathsA);
  const segmentsB = pathSegments(pathsB);
  return segmentsA.some(([a1, a2]) =>
    segmentsB.some(([b1, b2]) => segmentsIntersect(a1, a2, b1, b2))
  );
};

export const sweptPathsIntersect = (previousPaths, currentPaths, targetPaths) => {
  if (pathsIntersect(currentPaths, targetPaths) || pathsIntersect(previousPaths, targetPaths)) return true;
  const targetSegments = pathSegments(targetPaths);
  for (let pathIndex = 0; pathIndex < Math.min(previousPaths.length, currentPaths.length); pathIndex++) {
    const previous = previousPaths[pathIndex];
    const current = currentPaths[pathIndex];
    const pointCount = Math.min(previous.length, current.length);
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      if (targetSegments.some(([start, end]) =>
        segmentsIntersect(previous[pointIndex], current[pointIndex], start, end)
      )) return true;
    }
  }
  return false;
};

export const getScoreObjects = (elements) => (elements || [])
  .filter(element => !element.isDeleted && IANNIX_ROLES.includes(element.customData?.iannix?.role));

export const advanceScoreCollisionState = (collisions, previousCollisions, playing) => {
  if (!playing) return { entered: [], active: new Set() };
  const active = new Set(collisions || []);
  const previous = previousCollisions || new Set();
  return {
    entered: [...active].filter(key => !previous.has(key)),
    active,
  };
};

export const evaluateScoreFrame = (elements, globalTime, previousCursorStates = new Map()) => {
  const scoreObjects = getScoreObjects(elements);
  const byId = new Map(scoreObjects.map(element => [element.id, element]));
  const triggers = scoreObjects.filter(element => element.customData.iannix.role === "trigger");
  const cursors = [];
  const collisions = new Set();
  const nextCursorPaths = new Map();

  for (const cursorElement of scoreObjects.filter(element => element.customData.iannix.role === "cursor")) {
    const data = normalizeIannixData(cursorElement.customData.iannix);
    if (!data.active || !data.cursor.curveId) continue;
    const curveElement = byId.get(data.cursor.curveId) || elements.find(element => element.id === data.cursor.curveId && !element.isDeleted);
    if (!curveElement || curveElement.customData?.iannix?.role !== "curve") continue;
    const timeState = getObjectTimeState(globalTime, data.time);
    const transform = getCursorTransform(cursorElement, curveElement, timeState.progress, data.cursor.followTangent);
    if (!transform) continue;
    const paths = transformPaths(getElementCorePaths(cursorElement), transform);
    const previousState = previousCursorStates.get(cursorElement.id);
    const canSweep = previousState &&
      previousState.iteration === timeState.iteration &&
      Math.abs(previousState.progress - timeState.progress) < 0.5;
    const previousPaths = canSweep ? previousState.paths : paths;
    nextCursorPaths.set(cursorElement.id, {
      paths,
      iteration: timeState.iteration,
      progress: timeState.progress,
    });
    cursors.push({ element: cursorElement, curveElement, data, timeState, transform, paths });

    if (!timeState.active) continue;
    for (const triggerElement of triggers) {
      const triggerData = normalizeIannixData(triggerElement.customData.iannix);
      if (!triggerData.active) continue;
      const triggerPaths = getElementCorePaths(triggerElement);
      if (sweptPathsIntersect(previousPaths, paths, triggerPaths)) {
        collisions.add(`${cursorElement.id}:${triggerElement.id}`);
      }
    }
  }

  return { cursors, collisions, nextCursorPaths };
};
