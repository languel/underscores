// Console bridge shared by trusted livecode runtimes. Values are reduced to
// structured-clone-safe data before they enter the event bus so a sketch can
// log objects, arrays, errors, and circular references without breaking the
// console or the host runtime.

const MAX_DEPTH = 5;
const MAX_KEYS = 80;

export const serializeScriptConsoleValue = (value, seen = new WeakSet(), depth = 0) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (value instanceof Error) return {
    name: value.name || "Error",
    message: value.message || String(value),
    stack: typeof value.stack === "string" ? value.stack : undefined,
  };
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[Object]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map(item => serializeScriptConsoleValue(item, seen, depth + 1));
  const result = {};
  Object.keys(value).slice(0, MAX_KEYS).forEach(key => {
    try {
      result[key] = serializeScriptConsoleValue(value[key], seen, depth + 1);
    } catch {
      result[key] = "[Uninspectable]";
    }
  });
  return result;
};

export const serializeScriptConsoleArgs = args => (
  (Array.isArray(args) ? args : [args]).map(value => serializeScriptConsoleValue(value))
);

export const createScriptConsole = (scriptRuntimeRef, elementId) => {
  const send = (level, args) => {
    scriptRuntimeRef?.current?.emitScriptLog?.(
      elementId,
      level,
      serializeScriptConsoleArgs(args),
    );
  };
  const api = {
    log: (...args) => send("log", args),
    info: (...args) => send("info", args),
    warn: (...args) => send("warn", args),
    error: (...args) => send("error", args),
    debug: (...args) => send("debug", args),
  };
  return Object.freeze(api);
};
