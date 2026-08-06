const finiteNumber = value => (
  value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null
);

export const formatNumericDraft = value => {
  const number = finiteNumber(value);
  return number === null ? "" : String(number);
};

// Empty is intentionally a valid editing state. On commit it uses the caller's
// field default; when no default exists (for example a mixed multi-selection),
// it leaves the value untouched.
export const resolveNumericDraft = (draft, { value, defaultValue, min, max } = {}) => {
  const text = String(draft ?? "").trim();
  const current = finiteNumber(value);
  const fallback = finiteNumber(defaultValue) ?? current;
  const parsed = text === "" ? fallback : finiteNumber(text);
  if (parsed === null) return fallback;
  const lower = finiteNumber(min);
  const upper = finiteNumber(max);
  return Math.min(upper ?? Infinity, Math.max(lower ?? -Infinity, parsed));
};
