import { getObjectTimeState, resolveIannixObjectTiming } from "./iannixEngine.js";

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
  const iannix = element?.customData?.iannix || {};
  const imported = element?.customData?.iannixImport || {};
  const label = iannix.label || imported.label || element?.customData?.label || element?.id;
  return Object.freeze({
    id: element.id,
    type: element.type,
    label,
    name: label,
    group: imported.group || iannix.group || null,
    role: iannix.role || null,
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width: Number(element.width) || 0,
    height: Number(element.height) || 0,
    angle: Number(element.angle) || 0,
    visible: !element.isDeleted && element.customData?.outlinerHidden !== true,
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
    const query = typeof reference === "object" && reference ? String(reference.id || "") : String(reference ?? "");
    return elements().find(element => {
      const iannix = element?.customData?.iannix || {};
      const imported = element?.customData?.iannixImport || {};
      const label = iannix.label || imported.label || element?.customData?.label || element?.id;
      return element.id === query || label === query || imported.group === query || iannix.group === query;
    }) || null;
  };
  const get = reference => {
    const query = typeof reference === "object" && reference ? String(reference.id || "") : String(reference ?? "").trim();
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

export const resolveScriptParameterValues = (parameters, runtimeRef, canvas = createScriptCanvasApi(runtimeRef)) => {
  return Object.fromEntries((parameters || []).map(parameter => [
    parameter.name,
    parameter.type === "object"
      ? liveObject(parameter.value || parameter.default, canvas)
      : Number(parameter.value ?? parameter.default),
  ]));
};
