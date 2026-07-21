const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const decimalPlaces = value => {
  const text = String(value ?? "");
  if (/e-/i.test(text)) return Math.max(0, Number(text.split(/e-/i)[1]) || 0);
  return text.includes(".") ? text.split(".")[1].length : 0;
};

export const clampNumberInputValue = (value, min = -Infinity, max = Infinity) => (
  Math.min(finite(max, Infinity), Math.max(finite(min, -Infinity), finite(value)))
);

export const getNumberInputDefault = input => {
  const explicit = input?.dataset?.default;
  if (explicit !== undefined && explicit !== "") return finite(explicit);
  const attribute = input?.getAttribute?.("data-initial-value");
  if (attribute !== null && attribute !== "") return finite(attribute);
  const minimum = input?.min;
  return minimum !== undefined && minimum !== "" ? finite(minimum) : 0;
};

export const valueFromNumberDrag = ({ startValue, deltaX, step = 1, fine = false, min, max }) => {
  const safeStep = Math.abs(finite(step, 1)) || 1;
  const precision = Math.max(decimalPlaces(safeStep), fine ? decimalPlaces(safeStep) + 1 : 0);
  const units = deltaX / 4 * safeStep * (fine ? 0.1 : 1);
  const clamped = clampNumberInputValue(finite(startValue) + units, min, max);
  return Number(clamped.toFixed(Math.min(10, precision)));
};

export const numberInputDataPath = input => {
  if (!input) return "parameter";
  if (input.dataset?.routePath) return input.dataset.routePath;
  if (input.name) return input.name;
  const label = input.getAttribute?.("aria-label") || input.id || "parameter";
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "parameter";
};
