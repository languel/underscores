import { useEffect, useRef, useState } from "react";

export const PhysicsWorldIcon = ({ type, width = 12, height = 14 }) => {
  const shapes = {
    play: <><circle cx="30" cy="110" r="20" /><path d="M70 10v200l100-100L70 10Z" /></>,
    pause: <><path d="M10 10h40v200H10zM130 10h40v200h-40z" /><circle cx="90" cy="110" r="20" /></>,
    reset: <><circle cx="30" cy="110" r="20" /><path d="M110 10v200L70 110l40-100ZM170 10v200l-40-100 40-100Z" /></>,
    transport: <><circle cx="30" cy="110" r="20" /><path d="M70 10v200l80-100L70 10ZM110 10v200l60-100-60-100Z" /></>,
  };
  return <svg width={width} height={height} viewBox="0 0 180 220" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[type]}</svg>;
};

const Glyph = ({ kind }) => {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "dynamic") return <svg {...common}><circle cx="12" cy="12" r="6" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2" /></svg>;
  if (kind === "kinematic") return <svg {...common}><rect x="5" y="7" width="10" height="10" rx="1" /><path d="m15 12 4-3m-4 3 4 3" /></svg>;
  if (kind === "fixed") return <svg {...common}><path d="M4 15h16M6 15l2-5 2 5 2-5 2 5 2-5 2 5" /><path d="M5 19h14" /></svg>;
  if (kind === "sensor") return <svg {...common}><circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" /><circle cx="12" cy="12" r="1" /></svg>;
  if (kind === "spring") return <svg {...common}><path d="M1.5 12h2.5l2.5-8 2.5 16 2.5-16 2.5 16 2.5-16 2.5 8h2.5" /></svg>;
  if (kind === "rope") return <svg {...common}><path d="M2 16c3 2 5 4 8 2s2-6-1-8-4 2-1 5 8 2 10-2 3-7 4-9" /></svg>;
  if (kind === "attractor") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="m4 5 3 3m13-3-3 3m3 11-3-3M4 19l3-3" /><path d="m7 8 2 1m6-1-2 1m2 6-2-1m-6 1 2-1" /></svg>;
  if (kind === "thruster") return <svg {...common}><path d="M4 12h10m0 0-4-4m4 4-4 4" /><path d="M17 8c2 1 3 2.3 3 4s-1 3-3 4" /><path d="M17 10c1 .6 1.5 1.3 1.5 2S18 13.4 17 14" /></svg>;
  if (kind === "fixate") return <svg {...common}><path d="M6 5v14m12-14v14M3 9h6m6 0h6M3 15h6m6 0h6" /><path d="M9 12h6" /></svg>;
  if (["play", "pause", "reset", "transport"].includes(kind)) return <PhysicsWorldIcon type={kind} width={14} height={16} />;
  if (kind === "timeline") return <svg {...common}><path d="M4 18h16M12 4v14" /><circle cx="12" cy="5" r="2" /></svg>;
  if (kind === "livePose") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M4 12h4m8 0h4M12 4v4m0 8v4" /><path d="m6.5 6.5 2.5 2.5m6-2.5L15 9m-8.5 8.5L9 15m6 2.5L15 15" /></svg>;
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
  aria-pressed={typeof active === "boolean" ? active : undefined}
  onClick={onClick}
>
  <Glyph kind={kind} />
</button>;

export default function PhysicsCanvasToolbar({
  selectedCount = 0,
  open = true,
  worldPlaying = false,
  transportSynced = false,
  timeScrubEnabled = false,
  livePose = false,
  onOpenChange,
  onAssignBody,
  onAssignCollider,
  onMakeConstraint,
  onPlayPause,
  onResetWorld,
  onToggleTransportSync,
  onToggleLiveTimelinePreview,
  onToggleLivePose,
}) {
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
        <Tool kind="spring" label="Make selected objects Springs" disabled={!selectedCount} onClick={() => onMakeConstraint?.("spring")} />
        <Tool kind="rope" label="Make selected paths into Ropes" disabled={!selectedCount} onClick={() => onMakeConstraint?.("rope")} />
        <Tool kind="attractor" label="Make selected objects Attractors" disabled={!selectedCount} onClick={() => onMakeConstraint?.("attractor")} />
        <Tool kind="thruster" label="Make selected paths into Thrusters" disabled={!selectedCount} onClick={() => onMakeConstraint?.("thruster")} />
      </div>
      <div className="physics-canvas-tool-separator" />
      <div className="physics-canvas-tool-group" aria-label="Physics world controls">
        <Tool kind={worldPlaying ? "pause" : "play"} label={worldPlaying ? "Pause physics world" : "Play physics world"} active={worldPlaying} onClick={onPlayPause} />
        <Tool kind="reset" label="Reset physics world" onClick={onResetWorld} />
        <Tool kind="transport" label={transportSynced ? "Use an independent physics clock" : "Sync physics to music transport"} active={transportSynced} onClick={onToggleTransportSync} />
        <Tool kind="timeline" label={transportSynced ? `Live timeline preview ${timeScrubEnabled ? "on" : "off"}` : "Live timeline preview requires transport sync"} active={timeScrubEnabled} disabled={!transportSynced} onClick={onToggleLiveTimelinePreview} />
        <Tool kind="livePose" label={`Live pose ${livePose ? "on" : "off"} (\\)`} active={livePose} onClick={onToggleLivePose} />
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
