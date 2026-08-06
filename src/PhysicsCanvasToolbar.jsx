import { useEffect, useRef, useState } from "react";

const Glyph = ({ kind }) => {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "dynamic") return <svg {...common}><circle cx="12" cy="12" r="6" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2" /></svg>;
  if (kind === "kinematic") return <svg {...common}><rect x="5" y="7" width="10" height="10" rx="1" /><path d="m15 12 4-3m-4 3 4 3" /></svg>;
  if (kind === "fixed") return <svg {...common}><path d="M4 15h16M6 15l2-5 2 5 2-5 2 5 2-5 2 5" /><path d="M5 19h14" /></svg>;
  if (kind === "sensor") return <svg {...common}><circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" /><circle cx="12" cy="12" r="1" /></svg>;
  if (kind === "spring") return <svg {...common}><path d="M3 12h3l2-5 3 10 3-10 3 5h3" /></svg>;
  if (kind === "fixate") return <svg {...common}><path d="M6 5v14m12-14v14M3 9h6m6 0h6M3 15h6m6 0h6" /><path d="M9 12h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v6m0 6v6M3 12h6m6 0h6" /></svg>;
};

const PhysicsGlyph = () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3.25" />
  <ellipse cx="12" cy="12" rx="9" ry="4" />
  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
  <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" />
</svg>;

const Tool = ({ kind, label, active, disabled, onClick }) => <button
  type="button"
  className={`physics-canvas-tool${active ? " active" : ""}`}
  aria-label={label}
  title={label}
  disabled={disabled}
  onClick={onClick}
>
  <Glyph kind={kind} />
</button>;

export default function PhysicsCanvasToolbar({ selectedCount = 0, open = true, onOpenChange, onAssignBody, onAssignCollider, onMakeConstraint }) {
  const [minimized, setMinimized] = useState(false);
  const [closed, setClosed] = useState(!open);
  const [contextMenu, setContextMenu] = useState(null);
  const [position, setPosition] = useState({ top: 92, left: 12 });
  const dragRef = useRef(null);
  const didDragRef = useRef(false);
  useEffect(() => {
    setClosed(!open);
  }, [open]);
  useEffect(() => {
    if (!contextMenu) return undefined;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [contextMenu]);
  const startDrag = event => {
    if (event.button !== 0) return;
    didDragRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      top: position.top,
      left: position.left,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerDown = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startDrag(event);
  };
  const handlePointerMove = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) didDragRef.current = true;
    setPosition({
      top: Math.max(4, drag.top + event.clientY - drag.startY),
      left: Math.max(4, drag.left + event.clientX - drag.startX),
    });
  };
  const handlePointerUp = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const handleIconClick = () => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (closed) {
      setClosed(false);
      onOpenChange?.(true);
    }
  };
  const handleIconDoubleClick = event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      setContextMenu(null);
      setClosed(true);
      onOpenChange?.(false);
      return;
    }
    if (event.shiftKey) setMinimized(value => !value);
  };
  const handleIconContextMenu = event => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };
  const closeToolbar = () => {
    setContextMenu(null);
    setClosed(true);
    onOpenChange?.(false);
  };
  const toolbarStyle = { top: `${position.top}px`, left: `${position.left}px` };
  if (closed) return <button
    type="button"
    className="physics-canvas-toolbar-reopen"
    aria-label="Open physics tools"
    title="Physics toolbar: open tools"
    style={toolbarStyle}
    onPointerDown={event => { event.stopPropagation(); startDrag(event); }}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerCancel={handlePointerUp}
    onClick={handleIconClick}
    onDoubleClick={handleIconDoubleClick}
    onContextMenu={handleIconContextMenu}
  >
    <PhysicsGlyph />
  </button>;
  return <>
  <aside
    className={`physics-canvas-toolbar${minimized ? " is-collapsed" : " is-open"}`}
    aria-label="Physics tools"
    style={toolbarStyle}
    onPointerDown={event => event.stopPropagation()}
  >
    <div
      className="physics-canvas-toolbar-header"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Physics toolbar: drag to move"
    >
      <button
        type="button"
        className="physics-canvas-toolbar-toggle"
        aria-label={minimized ? "Open physics tools" : "Physics tools drag handle"}
        aria-expanded={!minimized}
        title="Physics toolbar: drag to move. Shift-double-click to minimize. Option-double-click to close."
        onPointerDown={event => { event.stopPropagation(); startDrag(event); }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleIconClick}
        onDoubleClick={handleIconDoubleClick}
        onContextMenu={handleIconContextMenu}
      >
        <PhysicsGlyph />
      </button>
    </div>
    {!minimized && <div className="physics-canvas-toolbar-body">
      <div className="physics-canvas-tool-group" aria-label="Physics body roles">
        <Tool kind="dynamic" label="Make selected objects dynamic" disabled={!selectedCount} onClick={() => onAssignBody?.({ bodyType: "dynamic" })} />
        <Tool kind="kinematic" label="Make selected objects kinematic bodies" disabled={!selectedCount} onClick={() => onAssignBody?.({ bodyType: "kinematic" })} />
        <Tool kind="fixed" label="Make selected objects static" disabled={!selectedCount} onClick={() => onAssignCollider?.({ sensor: false })} />
        <Tool kind="sensor" label="Make selected objects sensors" disabled={!selectedCount} onClick={() => onAssignCollider?.({ sensor: true })} />
      </div>
      <div className="physics-canvas-tool-separator" />
      <div className="physics-canvas-tool-group" aria-label="Physics constraints">
        <Tool kind="fixate" label="Make selected objects Weld pivots" disabled={!selectedCount} onClick={() => onMakeConstraint?.("fixate")} />
        <Tool kind="axle" label="Make selected objects Axle pivots" disabled={!selectedCount} onClick={() => onMakeConstraint?.("axle")} />
      </div>
    </div>}
  </aside>
  {contextMenu && <div
    className="physics-canvas-toolbar-menu"
    role="menu"
    style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
    onPointerDown={event => event.stopPropagation()}
  >
    <button type="button" role="menuitem" onClick={closeToolbar}>Close physics tools</button>
  </div>}
  </>;
}
