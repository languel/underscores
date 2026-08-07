const finiteNumber = value => (
  value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null
);

export const formatNumericDraft = value => {
  const number = finiteNumber(value);
  return number === null ? "" : String(number);
};

// These are valid *editing* states but not valid numeric values yet. Keeping
// them separate from parsing lets fields accept "-" before the user completes
// a negative number, rather than coercing it to a guessed value mid-keystroke.
export const isIncompleteNumericDraft = value => {
  const text = String(value ?? "").trim();
  return text === "" || text === "+" || text === "-" || text === "." || text === "+." || text === "-." || /^[+-]?\d+\.$/.test(text);
};

// Empty is intentionally a valid editing state. On commit it uses the caller's
// field default; when no default exists (for example a mixed multi-selection),
// it leaves the value untouched.
export const resolveNumericDraft = (draft, { value, defaultValue, min, max } = {}) => {
  const text = String(draft ?? "").trim();
  const current = finiteNumber(value);
  const fallback = finiteNumber(defaultValue) ?? current;
  // An empty field intentionally resets to its documented default. An invalid
  // or incomplete draft (such as "-" while typing a negative number) must
  // never turn into that default by accident: restore the prior value instead.
  if (text === "") return fallback;
  const parsed = finiteNumber(text);
  if (parsed === null) return current;
  const lower = finiteNumber(min);
  const upper = finiteNumber(max);
  return Math.min(upper ?? Infinity, Math.max(lower ?? -Infinity, parsed));
};
