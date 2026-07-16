const cloneValue = value => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const comparable = value => JSON.stringify(value);
const pathParts = path => path.split(".");

const getPath = (object, path) => pathParts(path).reduce((value, part) => value?.[part], object);

const setPath = (object, path, value) => {
  const parts = pathParts(path);
  const root = { ...object };
  let cursor = root;
  let source = object;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = cloneValue(value);
      return;
    }
    cursor[part] = { ...(source?.[part] || {}) };
    source = source?.[part];
    cursor = cursor[part];
  });
  return root;
};

export const AUTO_KEY_PATHS = Object.freeze([
  "x", "y", "angle", "width", "height", "opacity", "strokeWidth", "strokeColor", "backgroundColor",
  "customData.modifiers", "customData.iannix", "customData.draweratorGeometry", "points",
]);

export const interpolationForPath = path => {
  if (path === "angle") return "angle";
  if (["x", "y", "width", "height", "opacity", "strokeWidth"].includes(path)) return "linear";
  return "step";
};

export const upsertAutomationKey = (tracks, path, time, value, interpolation = interpolationForPath(path)) => {
  const keys = [...(tracks[path] || [])].filter(key => Math.abs(key.time - time) > 0.0001);
  keys.push({ id: crypto.randomUUID(), time, value: cloneValue(value), interpolation });
  keys.sort((a, b) => a.time - b.time);
  return { ...tracks, [path]: keys };
};

export const autoKeyElement = (previous, next, time, paths = AUTO_KEY_PATHS) => {
  if (!previous || !next || previous.id !== next.id || next.isDeleted) return next;
  let tracks = cloneValue(next.customData?.draweratorAutomation?.tracks || previous.customData?.draweratorAutomation?.tracks || {});
  let changed = false;
  for (const path of paths) {
    const before = getPath(previous, path);
    const after = getPath(next, path);
    if (comparable(before) === comparable(after)) continue;
    tracks = upsertAutomationKey(tracks, path, time, after);
    changed = true;
  }
  if (!changed) return next;
  return {
    ...next,
    customData: {
      ...(next.customData || {}),
      draweratorAutomation: {
        version: 1,
        tracks,
      },
    },
  };
};

const interpolateAngle = (start, end, amount) => {
  let delta = (end - start) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return start + delta * amount;
};

export const evaluateTrack = (keys, time) => {
  if (!keys?.length) return undefined;
  if (time <= keys[0].time) return cloneValue(keys[0].value);
  if (time >= keys[keys.length - 1].time) return cloneValue(keys[keys.length - 1].value);
  const nextIndex = keys.findIndex(key => key.time >= time);
  const previous = keys[nextIndex - 1];
  const next = keys[nextIndex];
  if (previous.interpolation === "step" || typeof previous.value !== "number" || typeof next.value !== "number") {
    return cloneValue(previous.value);
  }
  const amount = (time - previous.time) / Math.max(0.000001, next.time - previous.time);
  return previous.interpolation === "angle"
    ? interpolateAngle(previous.value, next.value, amount)
    : previous.value + (next.value - previous.value) * amount;
};

export const evaluateElementAutomation = (element, time) => {
  const tracks = element.customData?.draweratorAutomation?.tracks;
  if (!tracks) return element;
  let next = element;
  for (const [path, keys] of Object.entries(tracks)) {
    const value = evaluateTrack(keys, time);
    if (value !== undefined) next = setPath(next, path, value);
  }
  return next;
};

export const collectAutomationKeys = elements => (elements || []).flatMap(element => {
  const tracks = element.customData?.draweratorAutomation?.tracks || {};
  return Object.entries(tracks).flatMap(([path, keys]) => keys.map(key => ({
    ...key,
    elementId: element.id,
    path,
  })));
});
