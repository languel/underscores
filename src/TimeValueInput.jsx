import React, { useEffect, useRef, useState } from "react";
import { adjustTimeValue, createTimeValue, cycleTimeValueUnit, formatTimeValueForDisplay, parseTimeValue, resolveTimeValue } from "./timeValue.js";

const labelFromProps = props => props["aria-label"] || props.name || "Time value";
const dataPathFromProps = props => props["data-route-path"] || props.name || labelFromProps(props).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

export default function TimeValueInput({
  value,
  context,
  defaultValue = "0 s",
  onChange,
  onCommit,
  minSeconds = 0,
  disabled = false,
  className = "",
  ...inputProps
}) {
  const normalized = createTimeValue(value, undefined, context);
  const [draft, setDraft] = useState(normalized.expression);
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(null);
  const inputRef = useRef(null);
  const startValueRef = useRef(normalized);
  const dragRef = useRef(null);
  const cycledPointerRef = useRef(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current && !dragRef.current) setDraft(normalized.expression);
  }, [normalized.expression]);

  const emit = (nextValue, commit = false) => {
    const seconds = Math.max(minSeconds, resolveTimeValue(nextValue, context));
    const next = { ...nextValue, fallbackSeconds: seconds };
    setDraft(next.expression);
    onChange?.(next, seconds);
    if (commit) onCommit?.(next, seconds);
    return next;
  };

  const commitDraft = () => {
    const parsed = parseTimeValue(draft, context);
    if (!parsed.ok || parsed.descriptor.seconds < minSeconds) {
      setDraft(startValueRef.current.expression);
      return false;
    }
    emit(parsed.value, true);
    startValueRef.current = parsed.value;
    return true;
  };

  const reset = () => {
    const next = createTimeValue(defaultValue, undefined, context);
    emit(next, true);
    startValueRef.current = next;
    inputRef.current?.classList.add("number-box-resetting");
    window.setTimeout(() => inputRef.current?.classList.remove("number-box-resetting"), 180);
    setMenu(null);
  };

  const pointerDown = event => {
    if (event.button !== 0 || disabled) return;
    if (event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      const next = cycleTimeValueUnit(focused ? draft : value, context);
      emit(next, true);
      startValueRef.current = next;
      cycledPointerRef.current = event.pointerId;
      return;
    }
    const parsed = parseTimeValue(draft, context);
    if (!parsed.ok) return;
    startValueRef.current = parsed.value;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, value: parsed.value, dragged: false, lastSteps: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const pointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.dragged && Math.abs(deltaX) < 3) return;
    drag.dragged = true;
    event.preventDefault();
    document.documentElement.classList.add("number-box-global-dragging");
    inputRef.current?.classList.add("number-box-dragging");
    const steps = Math.trunc(deltaX / 4);
    if (steps === drag.lastSteps) return;
    drag.lastSteps = steps;
    const next = adjustTimeValue(drag.value, steps, { context, fine: event.shiftKey });
    if (resolveTimeValue(next, context) >= minSeconds) emit(next);
  };

  const pointerUp = event => {
    if (cycledPointerRef.current === event.pointerId) {
      cycledPointerRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    inputRef.current?.classList.remove("number-box-dragging");
    document.documentElement.classList.remove("number-box-global-dragging");
    if (drag.dragged) {
      const parsed = parseTimeValue(draft, context);
      if (parsed.ok) emit(parsed.value, true);
    } else {
      event.currentTarget.focus();
      event.currentTarget.select();
    }
    dragRef.current = null;
  };

  const keyDown = event => {
    if (event.key === "Backspace" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      reset();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(startValueRef.current.expression);
      event.currentTarget.blur();
    }
    inputProps.onKeyDown?.(event);
  };

  const copyPath = async () => {
    await navigator.clipboard?.writeText?.(dataPathFromProps(inputProps));
    setMenu(null);
  };

  const addRoute = () => {
    const detail = {
      path: dataPathFromProps(inputProps),
      label: labelFromProps(inputProps),
      value: resolveTimeValue(value, context),
      timeValue: createTimeValue(value, undefined, context),
    };
    window.dispatchEvent(new CustomEvent("underscore:parameter-route-request", { detail }));
    setMenu(null);
  };

  const valid = parseTimeValue(draft, context);
  return (
    <span className={`time-value-input-shell ${className}`.trim()}>
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        inputMode="text"
        disabled={disabled}
        value={focused ? draft : formatTimeValueForDisplay(draft)}
        aria-invalid={!valid.ok || (valid.ok && valid.descriptor.seconds < minSeconds) ? "true" : undefined}
        data-time-value="true"
        data-default={createTimeValue(defaultValue, undefined, context).expression}
        title={`${inputProps.title ? `${inputProps.title} · ` : ""}Option/Alt-click cycles seconds, beats, timecode, and frames.`}
        onFocus={() => {
          startValueRef.current = createTimeValue(value, undefined, context);
          setDraft(normalized.expression);
          setFocused(true);
        }}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          commitDraft();
          setFocused(false);
        }}
        onKeyDown={keyDown}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onContextMenu={event => {
          event.preventDefault();
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 270), y: Math.min(event.clientY, window.innerHeight - 190) });
        }}
      />
      <span className="time-value-scrub-arrows" aria-hidden="true">↔</span>
      {menu ? (
        <div className="custom-floating-context-menu number-box-menu time-value-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`${labelFromProps(inputProps)} options`}>
          <div className="number-box-menu-title">{labelFromProps(inputProps)}</div>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={reset}><span className="number-box-menu-icon">↶</span><span>Reset to Default Value</span><kbd>Shift+Backspace</kbd></button>
          <div className="custom-floating-context-menu-separator" />
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={copyPath}><span className="number-box-menu-icon">⌘</span><span>Copy Data Path</span><kbd>⇧⌘C</kbd></button>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={addRoute}><span className="number-box-menu-icon">◎</span><span>Add Route…</span><kbd>R</kbd></button>
        </div>
      ) : null}
    </span>
  );
}
