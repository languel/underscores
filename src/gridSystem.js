import { createTimeValue, formatTimeValue, resolveTimeValue } from "./timeValue.js";

export const GRID_SCHEMA_VERSION = 2;
export const GLOBAL_GRID_ID = "global";
export const GRID_STORAGE_KEY = "drawerator_global_grid_v2";
export const LEGACY_GRID_STORAGE_KEY = "drawerator_global_grid_v1";

const SNAP_MODES = new Set(["off", "hard", "magnetic"]);
const SNAP_RESOLUTIONS = new Set(["minor", "major"]);
const SNAP_AXES = new Set(["both", "x", "y"]);
const VALUE_AXES = new Set(["x", "y"]);
const VALUE_DIRECTIONS = new Set(["up", "down", "left", "right", "positive", "negative"]);
const VALUE_UNITS = new Set(["semitone", "cent", "hertz", "ratio", "scaleDegree"]);
const EPSILON = 1e-8;

export const GRID_SCALE_PRESETS = Object.freeze({
  chromatic: Object.freeze({ id: "chromatic", root: 0, degrees: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), octave: 12 }),
  major: Object.freeze({ id: "major", root: 0, degrees: Object.freeze([0, 2, 4, 5, 7, 9, 11]), octave: 12 }),
  naturalMinor: Object.freeze({ id: "naturalMinor", root: 0, degrees: Object.freeze([0, 2, 3, 5, 7, 8, 10]), octave: 12 }),
  harmonicMinor: Object.freeze({ id: "harmonicMinor", root: 0, degrees: Object.freeze([0, 2, 3, 5, 7, 8, 11]), octave: 12 }),
  melodicMinor: Object.freeze({ id: "melodicMinor", root: 0, degrees: Object.freeze([0, 2, 3, 5, 7, 9, 11]), octave: 12 }),
  majorPentatonic: Object.freeze({ id: "majorPentatonic", root: 0, degrees: Object.freeze([0, 2, 4, 7, 9]), octave: 12 }),
  minorPentatonic: Object.freeze({ id: "minorPentatonic", root: 0, degrees: Object.freeze([0, 3, 5, 7, 10]), octave: 12 }),
});

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
  time: Object.freeze({ perCell: Object.freeze({ version: 1, expression: "1 beat", fallbackSeconds: 0.5 }) }),
  value: Object.freeze({
    axis: "y",
    direction: "up",
    amount: 1,
    unit: "semitone",
    originCell: 0,
    originValue: 60,
    tuningHz: 440,
    scale: GRID_SCALE_PRESETS.chromatic,
  }),
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
  time: patch?.time && !Object.prototype.hasOwnProperty.call(patch.time, "perCell") && (
    Object.prototype.hasOwnProperty.call(patch.time, "amount") || Object.prototype.hasOwnProperty.call(patch.time, "unit")
  ) ? { ...(patch.time || {}) } : { ...(grid?.time || {}), ...(patch?.time || {}) },
  value: {
    ...(grid?.value || {}),
    ...(patch?.value || {}),
    scale: { ...(grid?.value?.scale || {}), ...(patch?.value?.scale || {}) },
  },
});

const legacyTimeExpression = time => {
  const amount = clamp(time?.amount, 0.000001, 1000000, 1);
  if (time?.unit === "bar") return `${amount} bars`;
  if (time?.unit === "second") return `${amount} s`;
  if (time?.unit === "millisecond") return `${amount} ms`;
  if (time?.unit === "frame") return `${amount} f`;
  if (time?.unit === "custom") return `${amount * clamp(time?.customSeconds, 0.000001, 1000000, 1)} s`;
  return `${amount} beat${amount === 1 ? "" : "s"}`;
};

const normalizeScale = scaleValue => {
  const source = scaleValue && typeof scaleValue === "object" ? scaleValue : GRID_SCALE_PRESETS.chromatic;
  const preset = GRID_SCALE_PRESETS[source.id] || null;
  const degreesSource = preset?.degrees || (Array.isArray(source.degrees) ? source.degrees : GRID_SCALE_PRESETS.chromatic.degrees);
  const degrees = degreesSource.map(value => finite(value)).filter((value, index, values) => index === 0 || value > values[index - 1]);
  return {
    id: preset ? preset.id : "custom",
    root: finite(source.root, preset?.root || 0),
    degrees: degrees.length ? degrees : [...GRID_SCALE_PRESETS.chromatic.degrees],
    octave: clamp(source.octave, 0.000001, 1200, preset?.octave || 12),
  };
};

export const normalizeGlobalGrid = value => {
  const source = value && typeof value === "object" ? value : {};
  const transform = source.transform && typeof source.transform === "object" ? source.transform : {};
  const spacing = source.spacing && typeof source.spacing === "object" ? source.spacing : {};
  const appearance = source.appearance && typeof source.appearance === "object" ? source.appearance : {};
  const snap = source.snap && typeof source.snap === "object" ? source.snap : {};
  const targets = snap.targets && typeof snap.targets === "object" ? snap.targets : {};
  const time = source.time && typeof source.time === "object" ? source.time : {};
  const valueMapping = source.value && typeof source.value === "object" ? source.value : {};
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
      perCell: createTimeValue(time.perCell || legacyTimeExpression(time), DEFAULT_GLOBAL_GRID.time.perCell.fallbackSeconds),
    },
    value: {
      axis: VALUE_AXES.has(valueMapping.axis) ? valueMapping.axis : DEFAULT_GLOBAL_GRID.value.axis,
      direction: VALUE_DIRECTIONS.has(valueMapping.direction) ? valueMapping.direction : DEFAULT_GLOBAL_GRID.value.direction,
      amount: clamp(valueMapping.amount, 0.000001, 1000000, DEFAULT_GLOBAL_GRID.value.amount),
      unit: VALUE_UNITS.has(valueMapping.unit) ? valueMapping.unit : DEFAULT_GLOBAL_GRID.value.unit,
      originCell: finite(valueMapping.originCell, DEFAULT_GLOBAL_GRID.value.originCell),
      originValue: finite(valueMapping.originValue, DEFAULT_GLOBAL_GRID.value.originValue),
      tuningHz: clamp(valueMapping.tuningHz, 1, 40000, DEFAULT_GLOBAL_GRID.value.tuningHz),
      scale: normalizeScale(valueMapping.scale),
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

export const gridTimeUnitSeconds = (gridValue, clockValue = {}) => {
  const grid = normalizeGlobalGrid(gridValue);
  return resolveTimeValue(grid.time.perCell, clockValue);
};

export const gridUnitsToSeconds = (units, gridValue, clock) => {
  const grid = normalizeGlobalGrid(gridValue);
  return finite(units) * gridTimeUnitSeconds(grid, clock);
};

export const secondsToGridUnits = (seconds, gridValue, clock) => {
  const grid = normalizeGlobalGrid(gridValue);
  return finite(seconds) / Math.max(EPSILON, gridTimeUnitSeconds(grid, clock));
};

const valueAxisCoordinate = (grid, local) => {
  const axisIndex = grid.value.axis === "x" ? 0 : 1;
  const coordinate = finite(local?.[axisIndex]);
  const negative = grid.value.direction === "up" || grid.value.direction === "left" || grid.value.direction === "negative";
  return (negative ? -coordinate : coordinate) - grid.value.originCell;
};

const midiToFrequency = (note, tuningHz) => tuningHz * 2 ** ((note - 69) / 12);

const scaleOffsetAt = (degree, scale) => {
  const count = scale.degrees.length;
  if (!count) return degree;
  const lower = Math.floor(degree);
  const fraction = degree - lower;
  const offset = index => {
    const octaveIndex = Math.floor(index / count);
    const wrapped = ((index % count) + count) % count;
    return octaveIndex * scale.octave + scale.root + scale.degrees[wrapped];
  };
  return offset(lower) + (offset(lower + 1) - offset(lower)) * fraction;
};

export const gridCoordinateToValue = (coordinate, gridValue) => {
  const grid = normalizeGlobalGrid(gridValue);
  const delta = finite(coordinate) * grid.value.amount;
  if (grid.value.unit === "hertz") {
    const frequency = Math.max(0, grid.value.originValue + delta);
    return { kind: "frequency", unit: "hertz", value: frequency, frequency };
  }
  if (grid.value.unit === "ratio") {
    const base = midiToFrequency(grid.value.originValue, grid.value.tuningHz);
    const frequency = base * grid.value.amount ** finite(coordinate);
    return { kind: "frequency", unit: "ratio", value: frequency, frequency };
  }
  const midi = grid.value.unit === "cent"
    ? grid.value.originValue + delta / 100
    : grid.value.unit === "scaleDegree"
      ? grid.value.originValue + scaleOffsetAt(delta, grid.value.scale) - scaleOffsetAt(0, grid.value.scale)
      : grid.value.originValue + delta;
  return { kind: "midi", unit: grid.value.unit, value: midi, midi, frequency: midiToFrequency(midi, grid.value.tuningHz) };
};

export const worldToGridValue = (gridValue, point) => {
  const grid = normalizeGlobalGrid(gridValue);
  const local = worldToGridPoint(grid, point);
  const coordinate = valueAxisCoordinate(grid, local);
  return { ...gridCoordinateToValue(coordinate, grid), coordinate, local };
};

export const gridValueToCoordinate = (mappedValue, gridValue) => {
  const grid = normalizeGlobalGrid(gridValue);
  const target = finite(mappedValue?.value ?? mappedValue);
  if (grid.value.unit === "hertz") return (target - grid.value.originValue) / grid.value.amount;
  if (grid.value.unit === "ratio") {
    const base = midiToFrequency(grid.value.originValue, grid.value.tuningHz);
    const divisor = Math.log(grid.value.amount);
    return Math.abs(divisor) < EPSILON ? 0 : Math.log(Math.max(EPSILON, target) / base) / divisor;
  }
  if (grid.value.unit === "cent") return (target - grid.value.originValue) * 100 / grid.value.amount;
  if (grid.value.unit === "semitone") return (target - grid.value.originValue) / grid.value.amount;
  const targetOffset = target - grid.value.originValue + scaleOffsetAt(0, grid.value.scale);
  let low = -4096;
  let high = 4096;
  for (let index = 0; index < 48; index += 1) {
    const middle = (low + high) / 2;
    if (scaleOffsetAt(middle * grid.value.amount, grid.value.scale) < targetOffset) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
};

export const gridValueToWorld = (mappedValue, gridValue, options = {}) => {
  const grid = normalizeGlobalGrid(gridValue);
  const coordinate = gridValueToCoordinate(mappedValue, grid);
  const negative = grid.value.direction === "up" || grid.value.direction === "left" || grid.value.direction === "negative";
  const axisCoordinate = (negative ? -coordinate : coordinate) + (negative ? -grid.value.originCell : grid.value.originCell);
  const local = Array.isArray(options.local) ? [...options.local] : [0, 0];
  local[grid.value.axis === "x" ? 0 : 1] = axisCoordinate;
  return gridToWorldPoint(grid, local);
};

export const quantizeGridValue = (mappedValue, gridValue) => {
  const grid = normalizeGlobalGrid(gridValue);
  const value = finite(mappedValue?.value ?? mappedValue);
  let step = grid.value.amount;
  if (grid.value.unit === "cent") step /= 100;
  if (grid.value.unit === "scaleDegree" || grid.value.unit === "ratio") {
    const coordinate = Math.round(gridValueToCoordinate(value, grid));
    return gridCoordinateToValue(coordinate, grid);
  }
  const quantized = grid.value.originValue + Math.round((value - grid.value.originValue) / step) * step;
  return grid.value.unit === "hertz"
    ? { kind: "frequency", unit: "hertz", value: quantized, frequency: quantized }
    : { kind: "midi", unit: grid.value.unit, value: quantized, midi: quantized, frequency: midiToFrequency(quantized, grid.value.tuningHz) };
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
  return `1 cell = ${formatTimeValue(grid.time.perCell)} = ${seconds.toFixed(seconds < 0.1 ? 3 : 2)} s`;
};
