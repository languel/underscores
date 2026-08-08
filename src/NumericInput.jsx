import { useEffect, useRef, useState } from "react";
import { formatNumericDraft, resolveNumericDraft } from "./numericInput.js";

// Native number inputs reject an empty intermediate value when their parent
// immediately writes the parsed number back. Keep that intermediate text local
// and only publish a finite value when the user commits the field.
export default function NumericInput({
  value,
  defaultValue,
  emptyValue,
  onCommit,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  className,
  ...inputProps
}) {
  const focusedRef = useRef(false);
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => formatNumericDraft(value));

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatNumericDraft(value));
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;
    const applyScrub = event => {
      const next = Number(event.detail?.value);
      if (!Number.isFinite(next)) return;
      setDraft(formatNumericDraft(next));
      // Horizontal scrubbing, the floating stepper, and a number reset are
      // explicit committed gestures. Publish them live while preserving the
      // no-coercion behaviour of ordinary typed drafts.
      onCommit?.(next);
      onChange?.({
        target: { value: String(next), valueAsNumber: next },
        currentTarget: { value: String(next), valueAsNumber: next },
      });
    };
    input.addEventListener("drawerator:numeric-scrub", applyScrub);
    return () => input.removeEventListener("drawerator:numeric-scrub", applyScrub);
  }, [onChange, onCommit]);

  const commit = () => {
    const current = value === null || value === undefined || value === ""
      ? null
      : Number.isFinite(Number(value)) ? Number(value) : null;
    if (String(draft ?? "").trim() === "" && emptyValue !== undefined) {
      setDraft("");
      if (!Object.is(emptyValue, value)) {
        onCommit?.(emptyValue);
        onChange?.({
          target: { value: "", valueAsNumber: Number.NaN },
          currentTarget: { value: "", valueAsNumber: Number.NaN },
        });
      }
      return;
    }
    const next = resolveNumericDraft(draft, {
      value,
      defaultValue,
      min: inputProps.min,
      max: inputProps.max,
    });
    setDraft(formatNumericDraft(next));
    if (next !== null && !Object.is(next, current)) {
      onCommit?.(next);
      // Compatibility for existing native-input handlers. The callback runs on
      // commit, never while an intermediate draft ("-", ".", or empty) is
      // being typed.
      onChange?.({
        target: { value: String(next), valueAsNumber: next },
        currentTarget: { value: String(next), valueAsNumber: next },
      });
    }
  };

  return <input
    {...inputProps}
    ref={inputRef}
    // type=number sanitizes a standalone '-' in Chromium before React sees
    // it. A text field with decimal keyboard intent preserves real drafts.
    type="text"
    className={["numeric-input", className].filter(Boolean).join(" ")}
    inputMode={inputProps.inputMode ?? "decimal"}
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
