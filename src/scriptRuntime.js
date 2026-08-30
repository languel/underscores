import { getObjectTimeState, getScoreData, resolveIannixObjectTiming } from "./iannixEngine.js";
import { normalizeScriptParameterValue, resolveScriptColorReference } from "./scriptParameters.js";
import { objectReferenceFromPath } from "./objectPath.js";

const matchesEvent = (event, pattern) => {
  const name = String(event?.name || "");
  const query = String(pattern || "");
  return query.endsWith(".*") ? name.startsWith(query.slice(0, -1)) : name === query;
};

const snapshotObject = (element, runtime) => {
  const timing = resolveIannixObjectTiming(element, {
    context: runtime.getTimeContext?.() || {},
    grid: runtime.getGrid?.(),
  });
  const time = getObjectTimeState(Number(runtime.getTime?.()) || 0, timing);
  const score = getScoreData(element) || {};
  const imported = element?.customData?.iannixImport || {};
  const label = score.label || imported.label || element?.customData?.label || element?.id;
  return Object.freeze({
    id: element.id,
    type: element.type,
    label,
    name: label,
    group: imported.group || score.group || null,
    role: score.role || null,
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width: Number(element.width) || 0,
    height: Number(element.height) || 0,
    angle: Number(element.angle) || 0,
    visible: !element.isDeleted && element.customData?.outlinerHidden !== true && element.customData?.presentationMaskActive !== true,
    locked: Boolean(element.locked),
    time: Object.freeze({
      start: timing.start,
      duration: timing.duration,
      end: timing.start + timing.duration,
      rate: timing.rate,
      loopMode: timing.loopMode,
      ...time,
    }),
  });
};

export const createScriptCanvasApi = (runtimeRef, options = {}) => {
  const runtime = () => runtimeRef?.current || {};
  const elements = () => (runtime().getElements?.() || []).filter(element => element && !element.isDeleted);
  const all = () => elements().map(element => snapshotObject(element, runtime()));
  const findElement = reference => {
    const query = typeof reference === "object" && reference
      ? String(reference.id || "")
      : objectReferenceFromPath(reference);
    return elements().find(element => {
      const score = getScoreData(element) || {};
      const imported = element?.customData?.iannixImport || {};
      const label = score.label || imported.label || element?.customData?.label || element?.id;
      return element.id === query || label === query || imported.group === query || score.group === query;
    }) || null;
  };
  const get = reference => {
    const query = typeof reference === "object" && reference
      ? String(reference.id || "")
      : objectReferenceFromPath(reference);
    if (!query) return null;
    const element = findElement(query);
    return element ? snapshotObject(element, runtime()) : null;
  };
  const find = query => {
    const objects = all();
    if (typeof query === "function") return objects.filter(query);
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return objects;
    return objects.filter(object => [object.id, object.label, object.name, object.group, object.role, object.type]
      .some(value => String(value || "").toLowerCase().includes(needle)));
  };
  const events = {
    on: (pattern, listener) => {
      const unsubscribe = runtime().eventBus?.subscribe?.(pattern, listener) || (() => {});
      options.onSubscription?.(unsubscribe);
      return unsubscribe;
    },
    emit: (name, detail = {}, metadata = {}) => runtime().eventBus?.emit?.(name, detail, {
      source: "livecode",
      ...metadata,
    }) || null,
    recent: (limit = 20) => runtime().eventBus?.recent?.(limit) || [],
    latest: pattern => [...(runtime().eventBus?.recent?.(100) || [])].reverse().find(event => matchesEvent(event, pattern)) || null,
  };
  const transport = {};
  Object.defineProperties(transport, {
    time: { enumerable: true, get: () => Number(runtime().getTime?.()) || 0 },
    context: { enumerable: true, get: () => runtime().getTimeContext?.() || {} },
  });
  return Object.freeze({
    all,
    get,
    find,
    selected: () => {
      const ids = new Set(runtime().getSelectedIds?.() || []);
      return all().filter(object => ids.has(object.id));
    },
    events,
    transport,
  });
};

const liveObject = (reference, canvas) => {
  if (!String(reference ?? "").trim()) return null;
  return new Proxy({}, {
  get(_target, property) {
    const object = canvas.get(reference);
    if (property === "toJSON") return () => object;
    if (property === Symbol.toPrimitive) return () => object?.id || "";
    return object?.[property];
  },
  });
};

export const resolveScriptParameterValues = (parameters, runtimeRef, canvas = createScriptCanvasApi(runtimeRef), options = {}) => {
  const readAppearance = () => options.getAppearance?.() || runtimeRef?.current?.getAppearance?.() || {};
  const appearance = readAppearance();
  const colorParameters = new Map();
  const values = Object.fromEntries((parameters || []).map(parameter => [
    parameter.name,
    parameter.type === "object"
      ? liveObject(parameter.value || parameter.default, canvas)
      : parameter.type === "color"
        ? (colorParameters.set(parameter.name, parameter), resolveScriptColorReference(normalizeScriptParameterValue(parameter, parameter.value), appearance))
      : normalizeScriptParameterValue(parameter, parameter.value),
  ]));
  // Color references are intentionally live. A script commonly keeps
  // `__.params.tint` in its draw loop, so resolving only once at startup
  // leaves it one palette click behind the Excalidraw app state. Keep the
  // ordinary values as a plain object and resolve only color keys on access.
  return new Proxy(values, {
    get(target, property, receiver) {
      const parameter = colorParameters.get(property);
      if (!parameter) return Reflect.get(target, property, receiver);
      const liveAppearance = readAppearance() || appearance;
      return resolveScriptColorReference(normalizeScriptParameterValue(parameter, parameter.value), liveAppearance);
    },
  });
};
