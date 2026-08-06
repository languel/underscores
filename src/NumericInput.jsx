import { useEffect, useRef, useState } from "react";
import { formatNumericDraft, resolveNumericDraft } from "./numericInput.js";

// Native number inputs reject an empty intermediate value when their parent
// immediately writes the parsed number back. Keep that intermediate text local
// and only publish a finite value when the user commits the field.
export default function NumericInput({
  value,
  defaultValue,
  onCommit,
  onBlur,
  onFocus,
  onKeyDown,
  ...inputProps
}) {
  const focusedRef = useRef(false);
  const [draft, setDraft] = useState(() => formatNumericDraft(value));

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatNumericDraft(value));
  }, [value]);

  const commit = () => {
    const next = resolveNumericDraft(draft, {
      value,
      defaultValue,
      min: inputProps.min,
      max: inputProps.max,
    });
    setDraft(formatNumericDraft(next));
    const current = value === null || value === undefined || value === ""
      ? null
      : Number.isFinite(Number(value)) ? Number(value) : null;
    if (next !== null && !Object.is(next, current)) onCommit?.(next);
  };

  return <input
    {...inputProps}
    type="number"
    value={draft}
    onFocus={event => {
      focusedRef.current = true;
      onFocus?.(event);
    }}
    onChange={event => setDraft(event.target.value)}
    onBlur={event => {
      focusedRef.current = false;
      commit();
      onBlur?.(event);
    }}
    onKeyDown={event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
        return;
      }
      onKeyDown?.(event);
    }}
  />;
}
