export const GRID_SCHEMA_VERSION = 1;
export const GLOBAL_GRID_ID = "global";
export const GRID_STORAGE_KEY = "drawerator_global_grid_v1";

const SNAP_MODES = new Set(["off", "hard", "magnetic"]);
const SNAP_RESOLUTIONS = new Set(["minor", "major"]);
const SNAP_AXES = new Set(["both", "x", "y"]);
const TIME_UNITS = new Set(["beat", "bar", "second", "millisecond", "frame", "custom"]);
const EPSILON = 1e-8;

export const DEFAULT_GLOBAL_GRID = Object.freeze({
  version: GRID_SCHEMA_VERSION,
  id: GLOBAL_GRID_ID,
  kind: "global",
  topology: "rectangular",
  transform: Object.freeze({ origin: Object.freeze([0, 0]), rotation: 0 }),
  spacing: Object.freeze({ x: 100, y: 100, subdivisionsX: 5, subdivisionsY: 5 }),
  appearance: Object.freeze({ visible: false, showMinor: true, showMajor: true, showAxes: true, opacity: 0.32 }),
  snap: Object.freeze({
    mode: "off",
    resolution: "minor",
    axes: "both",
    thresholdPx: 8,
    targets: Object.freeze({ input: true, transforms: true, points: true, generated: false }),
  }),
  time: Object.freeze({ amount: 1, unit: "beat", customSeconds: 1, customLabel: "unit" }),
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum, fallback) => Math.min(maximum, Math.max(minimum, finite(value, fallback)));
const integer = (value, minimum, maximum, fallback) => Math.round(clamp(value, minimum, maximum, fallback));
const clonePoint = (point, x = point?.[0], y = point?.[1]) => {
  const next = [x, y];
  if (!point || typeof point !== "object") return next;
  for (const key of Object.keys(point)) {
    if (key !== "0" && key !== "1") next[key] = point[key];
  }
  return next;
};

export const mergeGridPatch = (grid, patch = {}) => normalizeGlobalGrid({
  ...(grid || {}),
  ...(patch || {}),
  transform: { ...(grid?.transform || {}), ...(patch?.transform || {}) },
  spacing: { ...(grid?.spacing || {}), ...(patch?.spacing || {}) },
  appearance: { ...(grid?.appearance || {}), ...(patch?.appearance || {}) },
  snap: {
    ...(grid?.snap || {}),
    ...(patch?.snap || {}),
    targets: { ...(grid?.snap?.targets || {}), ...(patch?.snap?.targets || {}) },
  },
  time: { ...(grid?.time || {}), ...(patch?.time || {}) },
});

export const normalizeGlobalGrid = value => {
  const source = value && typeof value === "object" ? value : {};
  const transform = source.transform && typeof source.transform === "object" ? source.transform : {};
  const spacing = source.spacing && typeof source.spacing === "object" ? source.spacing : {};
  const appearance = source.appearance && typeof source.appearance === "object" ? source.appearance : {};
  const snap = source.snap && typeof source.snap === "object" ? source.snap : {};
  const targets = snap.targets && typeof snap.targets === "object" ? snap.targets : {};
  const time = source.time && typeof source.time === "object" ? source.time : {};
  const origin = Array.isArray(transform.origin) ? transform.origin : DEFAULT_GLOBAL_GRID.transform.origin;
  return {
    version: GRID_SCHEMA_VERSION,
    id: GLOBAL_GRID_ID,
    kind: "global",
    topology: "rectangular",
    transform: {
      origin: [finite(origin[0]), finite(origin[1])],
      rotation: finite(transform.rotation),
    },
    spacing: {
      x: clamp(spacing.x, 1, 100000, DEFAULT_GLOBAL_GRID.spacing.x),
      y: clamp(spacing.y, 1, 100000, DEFAULT_GLOBAL_GRID.spacing.y),
      subdivisionsX: integer(spacing.subdivisionsX, 1, 64, DEFAULT_GLOBAL_GRID.spacing.subdivisionsX),
      subdivisionsY: integer(spacing.subdivisionsY, 1, 64, DEFAULT_GLOBAL_GRID.spacing.subdivisionsY),
    },
    appearance: {
      visible: appearance.visible === true,
      showMinor: appearance.showMinor !== false,
      showMajor: appearance.showMajor !== false,
      showAxes: appearance.showAxes !== false,
      opacity: clamp(appearance.opacity, 0.02, 1, DEFAULT_GLOBAL_GRID.appearance.opacity),
    },
    snap: {
      mode: SNAP_MODES.has(snap.mode) ? snap.mode : DEFAULT_GLOBAL_GRID.snap.mode,
      resolution: SNAP_RESOLUTIONS.has(snap.resolution) ? snap.resolution : DEFAULT_GLOBAL_GRID.snap.resolution,
      axes: SNAP_AXES.has(snap.axes) ? snap.axes : DEFAULT_GLOBAL_GRID.snap.axes,
      thresholdPx: clamp(snap.thresholdPx, 1, 64, DEFAULT_GLOBAL_GRID.snap.thresholdPx),
      targets: {
        input: targets.input !== false,
        transforms: targets.transforms !== false,
        points: targets.points !== false,
        generated: targets.generated === true,
      },
    },
    time: {
      amount: clamp(time.amount, 0.000001, 1000000, DEFAULT_GLOBAL_GRID.time.amount),
      unit: TIME_UNITS.has(time.unit) ? time.unit : DEFAULT_GLOBAL_GRID.time.unit,
      customSeconds: clamp(time.customSeconds, 0.000001, 1000000, DEFAULT_GLOBAL_GRID.time.customSeconds),
      customLabel: String(time.customLabel || DEFAULT_GLOBAL_GRID.time.customLabel).trim().slice(0, 40) || "unit",
    },
  };
};

export const worldToGridPoint = (gridValue, point) => {
  const grid = normalizeGlobalGrid(gridValue);
  const x = finite(point?.[0]) - grid.transform.origin[0];
  const y = finite(point?.[1]) - grid.transform.origin[1];
  const cos = Math.cos(grid.transform.rotation);
  const sin = Math.sin(grid.transform.rotation);
  return [
    (x * cos + y * sin) / grid.spacing.x,
    (-x * sin + y * cos) / grid.spacing.y,
  ];
};

export const gridToWorldPoint = (gridValue, point) => {
  const grid = normalizeGlobalGrid(gridValue);
  const x = finite(point?.[0]) * grid.spacing.x;
  const y = finite(point?.[1]) * grid.spacing.y;
  const cos = Math.cos(grid.transform.rotation);
  const sin = Math.sin(grid.transform.rotation);
  return [
    grid.transform.origin[0] + x * cos - y * sin,
    grid.transform.origin[1] + x * sin + y * cos,
  ];
};

const gridStep = (grid, axis, resolution) => resolution === "major"
  ? 1
  : 1 / (axis === "x" ? grid.spacing.subdivisionsX : grid.spacing.subdivisionsY);

export const snapPointToGrid = (gridValue, point, options = {}) => {
  const grid = normalizeGlobalGrid(gridValue);
  const mode = SNAP_MODES.has(options.mode) ? options.mode : grid.snap.mode;
  const resolution = SNAP_RESOLUTIONS.has(options.resolution) ? options.resolution : grid.snap.resolution;
  const axes = SNAP_AXES.has(options.axes) ? options.axes : grid.snap.axes;
  const zoom = Math.max(0.0001, finite(options.zoom, 1));
  if (mode === "off") return { point: clonePoint(point), snapped: false, axes: { x: false, y: false }, grid: worldToGridPoint(grid, point) };

  const local = worldToGridPoint(grid, point);
  const next = [...local];
  const snappedAxes = { x: false, y: false };
  for (const [index, axis] of [[0, "x"], [1, "y"]]) {
    if (axes !== "both" && axes !== axis) continue;
    const step = gridStep(grid, axis, resolution);
    const target = Math.round(local[index] / step) * step;
    const worldDelta = Math.abs(target - local[index]) * grid.spacing[axis];
    if (mode === "hard" || worldDelta * zoom <= grid.snap.thresholdPx) {
      next[index] = target;
      snappedAxes[axis] = Math.abs(target - local[index]) > EPSILON;
    }
  }
  const world = gridToWorldPoint(grid, next);
  return {
    point: clonePoint(point, world[0], world[1]),
    snapped: snappedAxes.x || snappedAxes.y,
    axes: snappedAxes,
    grid: next,
    delta: [world[0] - finite(point?.[0]), world[1] - finite(point?.[1])],
  };
};

export const snapPointsToGrid = (grid, points, options) => (points || []).map(point => snapPointToGrid(grid, point, options).point);

const normalizeClock = clock => ({
  tempo: clamp(clock?.tempo, 20, 400, 120),
  signature: {
    numerator: integer(clock?.signature?.numerator, 1, 32, 4),
    denominator: [1, 2, 4, 8, 16].includes(Number(clock?.signature?.denominator)) ? Number(clock.signature.denominator) : 4,
  },
  fps: [24, 25, 30, 50, 60].includes(Number(clock?.fps)) ? Number(clock.fps) : 30,
});

export const gridTimeUnitSeconds = (gridValue, clockValue = {}) => {
  const grid = normalizeGlobalGrid(gridValue);
  const clock = normalizeClock(clockValue);
  const quarterNote = 60 / clock.tempo;
  const meterBeat = quarterNote * 4 / clock.signature.denominator;
  if (grid.time.unit === "beat") return meterBeat;
  if (grid.time.unit === "bar") return meterBeat * clock.signature.numerator;
  if (grid.time.unit === "millisecond") return 0.001;
  if (grid.time.unit === "frame") return 1 / clock.fps;
  if (grid.time.unit === "custom") return grid.time.customSeconds;
  return 1;
};

export const gridUnitsToSeconds = (units, gridValue, clock) => {
  const grid = normalizeGlobalGrid(gridValue);
  return finite(units) * grid.time.amount * gridTimeUnitSeconds(grid, clock);
};

export const secondsToGridUnits = (seconds, gridValue, clock) => {
  const grid = normalizeGlobalGrid(gridValue);
  return finite(seconds) / Math.max(EPSILON, grid.time.amount * gridTimeUnitSeconds(grid, clock));
};

const lineType = (coordinate, showAxes) => {
  if (showAxes && Math.abs(coordinate) < EPSILON) return "axis";
  return Math.abs(coordinate - Math.round(coordinate)) < EPSILON ? "major" : "minor";
};

const visibleAxisLines = ({ axis, minimum, maximum, crossMinimum, crossMaximum, grid, zoom, maxLines }) => {
  const subdivisions = axis === "x" ? grid.spacing.subdivisionsX : grid.spacing.subdivisionsY;
  const spacing = axis === "x" ? grid.spacing.x : grid.spacing.y;
  let step = grid.appearance.showMinor && spacing / subdivisions * zoom >= 6 ? 1 / subdivisions : 1;
  const span = Math.max(0, maximum - minimum);
  while (span / step > maxLines || step * spacing * zoom < 5) step *= 2;
  const startIndex = Math.floor(minimum / step) - 1;
  const endIndex = Math.ceil(maximum / step) + 1;
  const lines = [];
  for (let index = startIndex; index <= endIndex && lines.length < maxLines; index += 1) {
    const coordinate = index * step;
    const type = lineType(coordinate, grid.appearance.showAxes);
    if (type === "minor" && !grid.appearance.showMinor) continue;
    if (type === "major" && !grid.appearance.showMajor) continue;
    if (type === "axis" && !grid.appearance.showAxes) continue;
    const start = axis === "x" ? [coordinate, crossMinimum] : [crossMinimum, coordinate];
    const end = axis === "x" ? [coordinate, crossMaximum] : [crossMaximum, coordinate];
    lines.push({ axis, coordinate, type, start: gridToWorldPoint(grid, start), end: gridToWorldPoint(grid, end) });
  }
  return lines;
};

export const createVisibleGridLines = (gridValue, viewport, options = {}) => {
  const grid = normalizeGlobalGrid(gridValue);
  if (!grid.appearance.visible) return [];
  const zoom = Math.max(0.0001, finite(options.zoom, 1));
  const maxLines = integer(options.maxLines, 16, 1000, 240);
  const corners = [
    [viewport?.minX, viewport?.minY], [viewport?.maxX, viewport?.minY],
    [viewport?.maxX, viewport?.maxY], [viewport?.minX, viewport?.maxY],
  ].map(point => worldToGridPoint(grid, point));
  const xs = corners.map(point => point[0]);
  const ys = corners.map(point => point[1]);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumY = Math.min(...ys);
  const maximumY = Math.max(...ys);
  return [
    ...visibleAxisLines({ axis: "x", minimum: minimumX, maximum: maximumX, crossMinimum: minimumY, crossMaximum: maximumY, grid, zoom, maxLines }),
    ...visibleAxisLines({ axis: "y", minimum: minimumY, maximum: maximumY, crossMinimum: minimumX, crossMaximum: maximumX, grid, zoom, maxLines }),
  ];
};

export const formatGridTimeMapping = (gridValue, clock) => {
  const grid = normalizeGlobalGrid(gridValue);
  const seconds = gridUnitsToSeconds(1, grid, clock);
  const label = grid.time.unit === "custom" ? grid.time.customLabel : grid.time.unit;
  return `1 cell = ${grid.time.amount} ${label}${grid.time.amount === 1 ? "" : "s"} = ${seconds.toFixed(seconds < 0.1 ? 3 : 2)} s`;
};
