const NUMBER_PATTERN = "-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const OBJECT_PARAMETER_PATTERN = /^\s*\/\/\s*@param\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(.*?)\s*\(\s*(?:object|canvas|element)\s*\)\s*$/i;

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

/**
 * Parses Underscore's shared script parameter schema. Brush scripts declare
 * `// @param`, while trusted IanniX scripts may use the native `ask()` helper.
 * Both declarations resolve to the same slider-ready records.
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

  return [...byName.values()].map(parameter => ({
    ...parameter,
    value: parameter.type === "object"
      ? String(values[parameter.name] ?? parameter.default ?? "")
      : finiteValue(values[parameter.name], parameter.default),
  }));
};

export const getScriptParameterValues = parameters => Object.fromEntries(
  (parameters || []).map(parameter => [
    parameter.name,
    parameter.type === "object"
      ? String(parameter.value ?? parameter.default ?? "")
      : finiteValue(parameter.value, parameter.default),
  ]),
);
