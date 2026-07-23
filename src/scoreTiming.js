import { gridUnitsToSeconds, normalizeGlobalGrid, quantizeGridValue, worldToGridPoint, worldToGridValue } from "./gridSystem.js";
import { createTimeValue, resolveTimeValue } from "./timeValue.js";

export const SCORE_TIMING_SCHEMA_VERSION = 2;
export const GRID_BINDING_METRICS = Object.freeze(["auto", "xSpan", "ySpan", "arcLength", "manhattan"]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum, fallback) => Math.min(maximum, Math.max(minimum, finite(value, fallback)));
const geometryMeasurementCache = new WeakMap();

export const createDefaultGridBinding = (overrides = {}) => ({
  gridId: "global",
  metric: "auto",
  quantize: { geometry: false, time: false, value: false },
  ...overrides,
  quantize: {
    geometry: false,
    time: false,
    value: false,
    ...(overrides.quantize || {}),
  },
});

export const normalizeGridBinding = bindingValue => {
  const source = bindingValue && typeof bindingValue === "object" ? bindingValue : {};
  const quantize = source.quantize && typeof source.quantize === "object" ? source.quantize : {};
  return {
    gridId: String(source.gridId || "global"),
    metric: GRID_BINDING_METRICS.includes(source.metric) ? source.metric : "auto",
    quantize: {
      geometry: quantize.geometry === true,
      time: quantize.time === true,
      value: quantize.value === true,
    },
  };
};

const localPaths = (paths, grid) => (paths || []).map(path => (path || []).map(point => worldToGridPoint(grid, point)));

export const measureGridGeometry = (paths, gridValue, metricValue = "auto") => {
  const grid = normalizeGlobalGrid(gridValue);
  const cacheKey = `${metricValue}|${grid.transform.origin.join(",")}|${grid.transform.rotation}|${grid.spacing.x}|${grid.spacing.y}`;
  if (paths && typeof paths === "object") {
    const cache = geometryMeasurementCache.get(paths);
    if (cache?.has(cacheKey)) return cache.get(cacheKey);
  }
  const normalizedPaths = localPaths(paths, grid);
  const points = normalizedPaths.flat();
  if (!points.length) return { metric: metricValue === "auto" ? "xSpan" : metricValue, units: 0, xSpan: 0, ySpan: 0, arcLength: 0, manhattan: 0 };
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  let arcLength = 0;
  let manhattan = 0;
  for (const path of normalizedPaths) {
    for (let index = 1; index < path.length; index += 1) {
      const dx = path[index][0] - path[index - 1][0];
      const dy = path[index][1] - path[index - 1][1];
      arcLength += Math.hypot(dx, dy);
      manhattan += Math.abs(dx) + Math.abs(dy);
    }
  }
  const metric = metricValue === "auto" ? (xSpan + 1e-9 >= ySpan ? "xSpan" : "ySpan") : metricValue;
  const units = metric === "ySpan" ? ySpan : metric === "arcLength" ? arcLength : metric === "manhattan" ? manhattan : xSpan;
  const result = { metric, units, xSpan, ySpan, arcLength, manhattan };
  if (paths && typeof paths === "object") {
    let cache = geometryMeasurementCache.get(paths);
    if (!cache) {
      cache = new Map();
      geometryMeasurementCache.set(paths, cache);
    }
    cache.set(cacheKey, result);
  }
  return result;
};

export const resolveGeometryDuration = (paths, grid, metric, context) => {
  const measurement = measureGridGeometry(paths, grid, metric);
  return { ...measurement, seconds: Math.max(0.001, gridUnitsToSeconds(measurement.units, grid, context)) };
};

export const normalizeCursorTiming = cursorValue => {
  const source = cursorValue && typeof cursorValue === "object" ? cursorValue : {};
  const range = Array.isArray(source.range) ? source.range : [0, 1];
  return {
    range: [clamp(range[0], 0, 1, 0), clamp(range[1], 0, 1, 1)],
    startOffsetValue: createTimeValue(source.startOffsetValue || "0 s", 0),
    durationRatio: Math.max(0, finite(source.durationRatio, 1)),
  };
};

export const resolveScoreTiming = (data, options = {}) => {
  const time = data?.time || {};
  const context = options.context || {};
  const grid = options.grid;
  const curveTiming = options.curveTiming || null;
  const cursorTiming = normalizeCursorTiming(data?.cursor);
  const startMode = time.startMode === "curve" ? "curve" : "manual";
  const durationModes = ["geometry", "manual", "curve", "ratio"];
  const durationMode = durationModes.includes(time.durationMode) ? time.durationMode : "manual";
  const manualStart = resolveTimeValue(time.startValue || `${finite(time.start)} s`, context);
  const manualDuration = Math.max(0.001, resolveTimeValue(time.durationValue || `${finite(time.duration, 5)} s`, context));
  const offset = resolveTimeValue(cursorTiming.startOffsetValue, context);
  const rangeFraction = Math.abs(cursorTiming.range[1] - cursorTiming.range[0]);

  let start = startMode === "curve" && curveTiming ? curveTiming.start + offset : manualStart;
  let duration = manualDuration;
  let measurement = null;
  if (durationMode === "geometry" && grid) {
    measurement = resolveGeometryDuration(options.paths || [], grid, data?.gridBinding?.metric || "auto", context);
    duration = measurement.seconds;
  } else if ((durationMode === "curve" || durationMode === "ratio") && curveTiming) {
    duration = Math.max(0.001, curveTiming.duration * rangeFraction * (durationMode === "ratio" ? cursorTiming.durationRatio : 1));
  }
  start = Math.max(0, finite(start));
  duration = Math.max(0.001, finite(duration, 5));
  const points = (options.paths || []).flat();
  const valuePoint = points.length ? [
    (Math.min(...points.map(point => point[0])) + Math.max(...points.map(point => point[0]))) / 2,
    (Math.min(...points.map(point => point[1])) + Math.max(...points.map(point => point[1]))) / 2,
  ] : null;
  const mappedValue = grid && valuePoint ? worldToGridValue(grid, valuePoint) : null;
  const resolvedValue = mappedValue && data?.gridBinding?.quantize?.value
    ? { ...quantizeGridValue(mappedValue, grid), coordinate: mappedValue.coordinate, local: mappedValue.local, quantized: true }
    : mappedValue;
  return {
    start,
    duration,
    rate: Math.max(0, finite(time.rate, 1)),
    loopMode: time.loopMode || "once",
    startMode,
    durationMode,
    startValue: createTimeValue(time.startValue || `${start} s`, start, context),
    durationValue: createTimeValue(time.durationValue || `${duration} s`, duration, context),
    measurement,
    cursorRange: cursorTiming.range,
    mappedValue,
    resolvedValue,
  };
};

const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
const lcm = (a, b) => Math.abs(a * b) / Math.max(1, gcd(a, b));

export const gridTimeQuantumCells = (gridValue, metric = "auto", resolution) => {
  const grid = normalizeGlobalGrid(gridValue);
  if ((resolution || grid.snap.resolution) === "major") return 1;
  if (metric === "xSpan") return 1 / grid.spacing.subdivisionsX;
  if (metric === "ySpan") return 1 / grid.spacing.subdivisionsY;
  return 1 / lcm(grid.spacing.subdivisionsX, grid.spacing.subdivisionsY);
};
