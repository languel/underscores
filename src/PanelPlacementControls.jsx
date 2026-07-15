import React, { useEffect, useRef, useState } from "react";
import { PANEL_PLACEMENTS } from "./panelLayout.js";

const DotsIcon = () => (
  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/>
    <circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/>
    <circle cx="3" cy="15" r="1"/><circle cx="9" cy="15" r="1"/>
  </svg>
);

const DockIcon = ({ side }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="1.75" y="2" width="12.5" height="12" rx="1.5"/>
    {side === PANEL_PLACEMENTS.LEFT && <path d="M5.5 2v12"/>}
    {side === PANEL_PLACEMENTS.RIGHT && <path d="M10.5 2v12"/>}
    {side === PANEL_PLACEMENTS.BOTTOM && <path d="M1.75 10h12.5"/>}
    {side === PANEL_PLACEMENTS.FLOATING && <rect x="4.5" y="4.5" width="7" height="6" rx="1"/>}
  </svg>
);

export default function PanelPlacementControls({ label, placement, onPlacementChange, onDragStart, onActivate, onClose, allowBottom = false, dragIcon = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const controlsRef = useRef(null);
  const placements = allowBottom
    ? [PANEL_PLACEMENTS.FLOATING, PANEL_PLACEMENTS.BOTTOM]
    : [PANEL_PLACEMENTS.LEFT, PANEL_PLACEMENTS.FLOATING, PANEL_PLACEMENTS.RIGHT];

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsidePress = event => {
      if (!controlsRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("contextmenu", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("contextmenu", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const openMenu = event => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(true);
  };

  const placementLabel = target => {
    if (target === PANEL_PLACEMENTS.FLOATING) return "Float";
    if (target === PANEL_PLACEMENTS.BOTTOM) return "Dock bottom";
    return target === PANEL_PLACEMENTS.LEFT ? "Dock left" : "Dock right";
  };

  return (
    <div ref={controlsRef} className="panel-placement-controls" role="group" aria-label={`${label} panel placement`}>
      <button
        type="button"
        className="panel-drag-handle"
        onMouseDown={onDragStart}
        onClick={onActivate}
        onContextMenu={openMenu}
        onKeyDown={event => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openMenu(event);
        }}
        title={`Drag ${label} to move · right-click for placement`}
        aria-label={`Move ${label} panel`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {dragIcon || <DotsIcon />}
      </button>
      {menuOpen && (
        <div className={`panel-placement-menu ${placement === PANEL_PLACEMENTS.BOTTOM ? "menu-up" : ""}`} role="menu" aria-label={`${label} placement options`}>
          {placements.map(target => (
            <button
              type="button"
              key={target}
              className={placement === target ? "active" : ""}
              role="menuitemradio"
              aria-checked={placement === target}
              onClick={() => {
                setMenuOpen(false);
                onPlacementChange(target);
              }}
            >
              <DockIcon side={target} />
              <span>{placementLabel(target)}</span>
            </button>
          ))}
          {onClose && (
            <button type="button" className="panel-placement-menu-close" role="menuitem" onClick={() => { setMenuOpen(false); onClose(); }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13"/></svg>
              <span>Close</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
