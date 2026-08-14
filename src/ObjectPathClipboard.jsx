import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const editableTargetFor = target => {
  if (!(target instanceof Element)) return null;
  const editable = target.closest("input:not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true'], .cm-content");
  if (!editable || editable.disabled || editable.readOnly) return null;
  if (editable.tagName === "INPUT") {
    const type = String(editable.type || "text").toLowerCase();
    if (!["text", "search", "url", "tel", "email", "password"].includes(type)) return null;
  }
  return editable;
};

const selectionSnapshotFor = target => {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return {
      kind: "control",
      target,
      start: Number.isFinite(target.selectionStart) ? target.selectionStart : target.value.length,
      end: Number.isFinite(target.selectionEnd) ? target.selectionEnd : target.value.length,
    };
  }
  const selection = window.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  return { kind: "contenteditable", target, range };
};

const insertText = (snapshot, value) => {
  if (!snapshot?.target) return false;
  const target = snapshot.target;
  target.focus?.();
  if (snapshot.kind === "control") {
    const start = Math.max(0, snapshot.start ?? target.value.length);
    const end = Math.max(start, snapshot.end ?? start);
    const next = `${target.value.slice(0, start)}${value}${target.value.slice(end)}`;
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value");
    descriptor?.set?.call(target, next);
    target.setSelectionRange?.(start + value.length, start + value.length);
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    return true;
  }

  const selection = window.getSelection?.();
  selection?.removeAllRanges();
  if (snapshot.range) selection?.addRange(snapshot.range);
  if (document.execCommand?.("insertText", false, value)) return true;
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(value));
  range.collapse(false);
  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  return true;
};

export default function ObjectPathClipboardController({ getSelectedObjectPath, onStatus }) {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  const getPathRef = useRef(getSelectedObjectPath);
  const onStatusRef = useRef(onStatus);
  getPathRef.current = getSelectedObjectPath;
  onStatusRef.current = onStatus;

  useEffect(() => {
    const close = event => {
      if (!menuRef.current?.contains(event.target)) setMenu(null);
    };
    const handleContextMenu = event => {
      const target = editableTargetFor(event.target);
      if (!target) return;
      const path = getPathRef.current?.() || "";
      if (!path) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ x: event.clientX, y: event.clientY, path, selection: selectionSnapshotFor(target) });
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);

  if (!menu || typeof document === "undefined") return null;
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(menu.path);
      onStatusRef.current?.(`Copied ${menu.path}.`);
    } catch {
      onStatusRef.current?.("Could not copy the selected object path.");
    }
    setMenu(null);
  };
  const pastePath = () => {
    if (insertText(menu.selection, menu.path)) onStatusRef.current?.(`Pasted ${menu.path}.`);
    else onStatusRef.current?.("Could not paste the selected object path here.");
    setMenu(null);
  };

  const portalTarget = document.querySelector(".underscores-shell") || document.body;
  return createPortal(
    <div
      ref={menuRef}
      className="custom-floating-context-menu object-path-context-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onPointerDown={event => event.stopPropagation()}
    >
      <button type="button" className="custom-floating-context-menu-btn" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); pastePath(); }}>
        <span aria-hidden="true" style={{ width: 14, marginRight: 8 }}>↧</span>
        Paste selected object path
      </button>
      <button type="button" className="custom-floating-context-menu-btn" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); void copyPath(); }}>
        <span aria-hidden="true" style={{ width: 14, marginRight: 8 }}>⧉</span>
        Copy object path
      </button>
    </div>,
    portalTarget,
  );
}
