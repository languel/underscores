import { useEffect, useRef, useState } from "react";
import { getNumberInputDefault, numberInputDataPath, valueFromNumberDrag } from "./numberInputSystem.js";

const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
const isNumberInput = target => target instanceof HTMLInputElement && target.type === "number" && !target.disabled;

const setInputValue = (input, value) => {
  if (!input || !nativeValueSetter) return;
  nativeValueSetter.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
  const dragRef = useRef(null);
  const [menu, setMenu] = useState(null);

  useEffect(() => {
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
        startValue: Number(input.value) || 0,
        dragged: false,
      };
      input.setPointerCapture?.(event.pointerId);
    };
    const pointerMove = event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
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
      if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        reset(event.target);
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
    document.addEventListener("pointermove", pointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("contextmenu", contextMenu, true);
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("pointerdown", closeOnPointer);
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("contextmenu", contextMenu, true);
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("pointerdown", closeOnPointer);
    };
  }, []);

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
    window.dispatchEvent(new CustomEvent("drawerator:parameter-route-request", { detail }));
    onRouteRequest?.(detail);
    setMenu(null);
  };

  return (
    <>
      {menu ? (
        <div className="custom-floating-context-menu number-box-menu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`${menu.label} options`}>
          <div className="number-box-menu-title">{menu.label}</div>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={resetMenuValue}><span className="number-box-menu-icon">↶</span><span>Reset to Default Value</span><kbd>Backspace</kbd></button>
          <div className="custom-floating-context-menu-separator" />
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={copyPath}><span className="number-box-menu-icon">⌘</span><span>Copy Data Path</span><kbd>⇧⌘C</kbd></button>
          <button className="custom-floating-context-menu-btn" type="button" role="menuitem" onClick={addRoute}><span className="number-box-menu-icon">◎</span><span>Add Route…</span><kbd>R</kbd></button>
        </div>
      ) : null}
    </>
  );
}
