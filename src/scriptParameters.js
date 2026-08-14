const NUMBER_PATTERN = "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const OBJECT_PARAMETER_PATTERN = /^\s*\/\/\s*@param\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.*?)\s*\(\s*(?:object|canvas|element)\s*\)\s*$/i;
const TYPED_PARAMETER_PATTERN = /^\s*\/\/\s*@param\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.*?)\s*\(\s*(string|text|color|json|boolean|bool)\s*\)\s*$/i;

const inferRange = defaultValue => {
  let min = defaultValue < 0 ? defaultValue * 2 : 0;
  let max = defaultValue > 0 ? defaultValue * 2 : 100;
  if (min === max) {
    min = 0;
    max = 100;
  }
  return {
    min,
    max,
    step: Number.isInteger(defaultValue) ? 1 : 0.01,
  };
};

const finiteValue = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const unquote = value => {
  const raw = String(value ?? "").trim();
  if (raw.length < 2) return raw;
  const quote = raw[0];
  if (!["\"", "'"].includes(quote) || raw.at(-1) !== quote) return raw;
  if (quote === "\"") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw.slice(1, -1).replace(/\\(['\\])/g, "$1");
};

const parseJsonValue = value => {
  if (typeof value !== "string") return { ok: value !== undefined, value };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
};

const booleanValue = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(?:true|yes|on|1)$/i.test(value.trim())) return true;
    if (/^(?:false|no|off|0)$/i.test(value.trim())) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
};

const SCRIPT_COLOR_KEYS = new Set(["foreground", "accent", "highlight", "muted", "panel", "input", "timeline", "canvas", "grid"]);

const colorReferenceValue = (value, preferredKey) => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value[preferredKey] || value.css || value.color || null;
};

export const resolveScriptColorReference = (value, appearance = {}) => {
  const source = String(value ?? "").trim();
  const colors = appearance && typeof appearance.colors === "object" ? appearance.colors : {};
  if (source === "__.currentColor") return appearance.currentColor || colors.foreground?.css || source;
  if (source === "__.currentBackgroundColor") {
    return appearance.currentBackgroundColor || colors.excalidraw?.background?.css || source;
  }
  const reference = /^__\.colors\.(.+)$/.exec(source);
  if (reference) {
    const segments = reference[1].split(".").filter(Boolean);
    const leaf = segments.at(-1);
    let entry = colors;
    for (const segment of segments) {
      if (entry === null || entry === undefined) break;
      entry = entry[segment];
    }
    const resolved = colorReferenceValue(entry, leaf === "color" || leaf === "css" ? leaf : "css");
    if (resolved) return resolved;
    if (segments.length === 1 && SCRIPT_COLOR_KEYS.has(segments[0])) {
      const legacyEntry = colors[segments[0]];
      return colorReferenceValue(legacyEntry, "css") || source;
    }
  }
  if (SCRIPT_COLOR_KEYS.has(source)) {
    const entry = colors[source];
    if (entry && typeof entry === "object") return entry.css || entry.color || source;
  }
  return value;
};

export const normalizeScriptParameterValue = (parameter, value) => {
  const fallback = parameter?.default;
  switch (parameter?.type) {
    case "object":
      return String(value ?? fallback ?? "");
    case "string":
    case "color":
      return String(value ?? fallback ?? "");
    case "boolean":
      return booleanValue(value, booleanValue(fallback));
    case "json": {
      const parsed = parseJsonValue(value);
      if (parsed.ok) return parsed.value;
      // A JSON string value has already been parsed by the editor and is
      // indistinguishable from an unquoted draft here. Keep it as a value;
      // the editor itself rejects malformed drafts before calling onChange.
      if (typeof value === "string") return value;
      return fallback;
    }
    default:
      return finiteValue(value, fallback);
  }
};

/**
 * Parses Underscores's shared script parameter schema. Brush scripts declare
 * `// @param`, while trusted IanniX scripts may use the native `ask()` helper.
 * Both declarations resolve to the same editor-ready records.
 */
export const parseScriptParameters = (source, options = {}) => {
  const code = String(source || "");
  const values = options.values || {};
  const byName = new Map();

  for (const line of code.split("\n")) {
    const objectMatch = OBJECT_PARAMETER_PATTERN.exec(line);
    if (objectMatch) {
      const name = objectMatch[1];
      const rawDefault = String(objectMatch[2] ?? "").trim();
      const quotedDefault = /^(?:"([\s\S]*)"|'([\s\S]*)')$/.exec(rawDefault);
      const defaultValue = String(quotedDefault?.[1] ?? quotedDefault?.[2] ?? rawDefault).trim();
      byName.set(name, {
        name,
        label: name,
        category: "",
        default: defaultValue,
        type: "object",
        source: "param-object",
      });
      continue;
    }
    const typedMatch = TYPED_PARAMETER_PATTERN.exec(line);
    if (typedMatch) {
      const name = typedMatch[1];
      const rawType = typedMatch[3].toLowerCase();
      const type = rawType === "text" ? "string" : rawType === "bool" ? "boolean" : rawType;
      const rawDefault = String(typedMatch[2] ?? "").trim();
      const defaultValue = type === "json"
        ? parseJsonValue(rawDefault).value
        : type === "boolean" ? booleanValue(rawDefault) : unquote(rawDefault);
      byName.set(name, {
        name,
        label: name,
        category: "",
        default: defaultValue,
        type,
        source: "param",
      });
      continue;
    }
    const match = new RegExp(`^\\s*//\\s*@param\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(${NUMBER_PATTERN})(?:\\s*\\(([^)]+)\\))?`).exec(line);
    if (!match) continue;
    const name = match[1];
    const defaultValue = Number(match[2]);
    const inferred = inferRange(defaultValue);
    const range = match[3] || "";
    const rangeMatch = new RegExp(`(${NUMBER_PATTERN})\\s*\\.\\.\\s*(${NUMBER_PATTERN})`).exec(range);
    const stepMatch = new RegExp(`step\\s*:\\s*(${NUMBER_PATTERN})`, "i").exec(range);
    byName.set(name, {
      name,
      label: name,
      category: "",
      default: defaultValue,
      min: rangeMatch ? Number(rangeMatch[1]) : inferred.min,
      max: rangeMatch ? Number(rangeMatch[2]) : inferred.max,
      step: stepMatch ? Number(stepMatch[1]) : inferred.step,
      source: "param",
    });
  }

  if (options.includeIannixAsk) {
    const askPattern = new RegExp(`\\bask\\s*\\(\\s*(["'])(.*?)\\1\\s*,\\s*(["'])(.*?)\\3\\s*,\\s*(["'])([a-zA-Z_$][a-zA-Z0-9_$]*)\\5\\s*,\\s*(${NUMBER_PATTERN})\\s*\\)`, "g");
    let match;
    while ((match = askPattern.exec(code))) {
      const category = match[2];
      const label = match[4];
      const name = match[6];
      const defaultValue = Number(match[7]);
      const existing = byName.get(name);
      if (existing) {
        byName.set(name, {
          ...existing,
          category,
          label: label || existing.label,
          source: "iannix-ask",
        });
      } else {
        byName.set(name, {
          name,
          label: label || name,
          category,
          default: defaultValue,
          ...inferRange(defaultValue),
          source: "iannix-ask",
        });
      }
    }
  }

  return [...byName.values()].map(parameter => {
    const value = Object.prototype.hasOwnProperty.call(values, parameter.name)
      ? values[parameter.name]
      : parameter.default;
    return {
      ...parameter,
      value: normalizeScriptParameterValue(parameter, value),
    };
  });
};

export const getScriptParameterValues = parameters => Object.fromEntries(
  (parameters || []).map(parameter => [
    parameter.name,
    normalizeScriptParameterValue(parameter, parameter.value),
  ]),
);
