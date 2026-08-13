import { useEffect, useRef, useState } from "react";
import {
  getNumberInputDefault,
  isNumberInputResetShortcut,
  isTransientNumberInputValue,
  numberInputDataPath,
  valueFromNumberDrag,
} from "./numberInputSystem.js";

const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
// NumericInput deliberately uses type=text so a user can temporarily leave a
// field blank or type a leading minus sign. Treat it as a first-class numeric
// field here as well, so it keeps all of the number-box affordances.
const isDraftNumericInput = target => target instanceof HTMLInputElement && target.classList.contains("numeric-input");
const isNumberInput = target => target instanceof HTMLInputElement
  && (target.type === "number" || isDraftNumericInput(target))
  && !target.disabled;

const setInputValue = (input, value) => {
  if (!input || !nativeValueSetter) return;
  nativeValueSetter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // React's draft-safe text inputs intentionally do not publish their normal
  // input event until a commit. Scrubs, steppers, and resets are already a
  // committed gesture, so notify the shared component explicitly.
  if (isDraftNumericInput(input)) {
    input.dispatchEvent(new CustomEvent("underscores:numeric-scrub", {
      bubbles: true,
      detail: { value },
    }));
  }
};

const getLabel = input => {
  const aria = input.getAttribute("aria-label");
  if (aria) return aria;
  const label = input.closest("label");
  const text = label?.querySelector("span")?.textContent?.trim();
  return text || input.name || "Number";
};

export default function NumberInputController({ onRouteRequest }) {
  const defaultsRef = useRef(new WeakMap());
  const editStartValuesRef = useRef(new WeakMap());
  const dragRef = useRef(null);
  const stepperInputRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [stepper, setStepper] = useState(null);

  useEffect(() => {
    const showStepper = input => {
      if (!isNumberInput(input)) return;
      stepperInputRef.current = input;
      const rect = input.getBoundingClientRect();
      setStepper({
        input,
        left: rect.right - 18,
        top: rect.top,
        height: rect.height,
      });
    };
    const rememberDefault = input => {
      if (!defaultsRef.current.has(input)) {
        const explicit = input.dataset.default;
        const initial = explicit !== undefined && explicit !== "" ? Number(explicit) : Number(input.value);
        defaultsRef.current.set(input, Number.isFinite(initial) ? initial : getNumberInputDefault(input));
        input.dataset.initialValue = String(defaultsRef.current.get(input));
      }
      return defaultsRef.current.get(input);
    };
    const reset = input => {
      const value = rememberDefault(input);
      setInputValue(input, value);
      input.classList.add("number-box-resetting");
      window.setTimeout(() => input.classList.remove("number-box-resetting"), 180);
    };
    const pointerDown = event => {
      if (event.button !== 0 || !isNumberInput(event.target)) return;
      const input = event.target;
      rememberDefault(input);
      dragRef.current = {
        input,
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue: Number.isFinite(Number(input.value)) ? Number(input.value) : rememberDefault(input),
        dragged: false,
      };
      input.setPointerCapture?.(event.pointerId);
    };
    const pointerOver = event => {
      if (isNumberInput(event.target)) showStepper(event.target);
    };
    const pointerOut = event => {
      if (!isNumberInput(event.target)) return;
      if (event.relatedTarget?.closest?.(".number-box-stepper")) return;
      if (document.activeElement !== event.target) {
        stepperInputRef.current = null;
        setStepper(null);
      }
    };
    const pointerMove = event => {
      const drag = dragRef.current;
      if (!drag) {
        if (isNumberInput(event.target) && stepperInputRef.current !== event.target) showStepper(event.target);
        return;
      }
      if (drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      if (!drag.dragged && Math.abs(deltaX) < 3) return;
      drag.dragged = true;
      event.preventDefault();
      drag.input.classList.add("number-box-dragging");
      document.documentElement.classList.add("number-box-global-dragging");
      const value = valueFromNumberDrag({
        startValue: drag.startValue,
        deltaX,
        step: drag.input.step || 1,
        fine: event.shiftKey,
        min: drag.input.min === "" ? -Infinity : drag.input.min,
        max: drag.input.max === "" ? Infinity : drag.input.max,
      });
      setInputValue(drag.input, value);
    };
    const pointerUp = event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag.input.releasePointerCapture?.(event.pointerId);
      drag.input.classList.remove("number-box-dragging");
      document.documentElement.classList.remove("number-box-global-dragging");
      if (!drag.dragged) {
        drag.input.focus();
        drag.input.select();
      }
      dragRef.current = null;
    };
    const keyDown = event => {
      if (!isNumberInput(event.target)) return;
      rememberDefault(event.target);
      if (isNumberInputResetShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        reset(event.target);
      }
    };
    const focusIn = event => {
      if (!isNumberInput(event.target)) return;
      rememberDefault(event.target);
      editStartValuesRef.current.set(event.target, event.target.value);
      showStepper(event.target);
    };
    const input = event => {
      if (!isNumberInput(event.target)) return;
      // NumericInput owns its own transient draft state. Let its local React
      // handler observe every keystroke, including an empty field or "-".
      if (isDraftNumericInput(event.target)) return;
      if (!isTransientNumberInputValue(event.target.value)) return;

      // A controlled React number input commonly turns an empty native value
      // straight back into zero via Number(""). Keep the browser's temporary
      // editing state local until it becomes a complete number instead.
      event.stopPropagation();
    };
    const focusOut = event => {
      if (!isNumberInput(event.target)) return;
      if (isDraftNumericInput(event.target)) {
        editStartValuesRef.current.delete(event.target);
        if (!event.relatedTarget?.closest?.(".number-box-stepper")) {
          stepperInputRef.current = null;
          setStepper(null);
        }
        return;
      }
      if (isTransientNumberInputValue(event.target.value)) {
        const startValue = editStartValuesRef.current.get(event.target);
        const fallback = startValue !== undefined && startValue !== ""
          ? startValue
          : rememberDefault(event.target);
        setInputValue(event.target, fallback);
      }
      editStartValuesRef.current.delete(event.target);
      if (!event.relatedTarget?.closest?.(".number-box-stepper")) {
        stepperInputRef.current = null;
        setStepper(null);
      }
    };
    const contextMenu = event => {
      if (!isNumberInput(event.target)) return;
      event.preventDefault();
      rememberDefault(event.target);
      setMenu({
        input: event.target,
        x: Math.min(event.clientX, window.innerWidth - 270),
        y: Math.min(event.clientY, window.innerHeight - 190),
        label: getLabel(event.target),
        path: numberInputDataPath(event.target),
      });
    };
    const dismiss = event => {
      if (event.key === "Escape") setMenu(null);
    };
    const closeOnPointer = event => {
      if (!event.target.closest?.(".number-box-menu")) setMenu(null);
    };

    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerover", pointerOver, true);
    document.addEventListener("pointerout", pointerOut, true);
    document.addEventListener("pointermove", pointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("focusin", focusIn, true);
    document.addEventListener("input", input, true);
    document.addEventListener("focusout", focusOut, true);
    document.addEventListener("contextmenu", contextMenu, true);
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("pointerdown", closeOnPointer);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerover", pointerOver, true);
      document.removeEventListener("pointerout", pointerOut, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("focusin", focusIn, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("focusout", focusOut, true);
      document.removeEventListener("contextmenu", contextMenu, true);
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("pointerdown", closeOnPointer);
    };
  }, []);

  const stepValue = direction => {
    const input = stepper?.input;
    if (!isNumberInput(input) || !input.isConnected) return;
    const step = Number(input.step);
    const increment = Number.isFinite(step) && step > 0 ? step : 1;
    const current = Number(input.value);
    const min = input.min === "" ? -Infinity : Number(input.min);
    const max = input.max === "" ? Infinity : Number(input.max);
    const base = Number.isFinite(current) ? current : getNumberInputDefault(input);
    setInputValue(input, Math.min(max, Math.max(min, base + direction * increment)));
    input.focus();
  };

  const resetMenuValue = () => {
    if (!menu?.input?.isConnected) return;
    setInputValue(menu.input, getNumberInputDefault(menu.input));
    setMenu(null);
  };
  const copyPath = async () => {
    if (!menu) return;
    await navigator.clipboard?.writeText?.(menu.path);
    setMenu(null);
  };
  const addRoute = () => {
    if (!menu) return;
    const detail = { path: menu.path, label: menu.label, value: Number(menu.input.value) };
    window.dispatchEvent(new CustomEvent("underscores:parameter-route-request", { detail }));
    onRouteRequest?.(detail);
    setMenu(null);
  };

  return (
    <>
      {stepper?.input?.isConnected ? (
        <div
          className="number-box-stepper"
          style={{ left: stepper.left, top: stepper.top, height: stepper.height }}
          onPointerLeave={() => {
            if (document.activeElement !== stepper.input) {
              stepperInputRef.current = null;
              setStepper(null);
            }
          }}
          aria-hidden="true"
        >
          <button type="button" tabIndex={-1} onPointerDown={event => { event.preventDefault(); stepValue(1); }} aria-label="Increase value"><span /></button>
          <button type="button" tabIndex={-1} onPointerDown={event => { event.preventDefault(); stepValue(-1); }} aria-label="Decrease value"><span /></button>
        </div>
      ) : null}
      {menu ? (
        <div className="custom-floating-context-menu number-box-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`${menu.label} options`}>
          <div className="number-box-menu-title">{menu.label}</div>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={resetMenuValue}><span className="number-box-menu-icon">↶</span><span>Reset to Default Value</span><kbd>Shift+Backspace</kbd></button>
          <div className="custom-floating-context-menu-separator" />
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={copyPath}><span className="number-box-menu-icon">⌘</span><span>Copy Data Path</span><kbd>⇧⌘C</kbd></button>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={addRoute}><span className="number-box-menu-icon">◎</span><span>Add Route…</span><kbd>R</kbd></button>
        </div>
      ) : null}
    </>
  );
}
