import React, { useEffect, useState } from "react";
import PanelPlacementControls from "./PanelPlacementControls.jsx";
import { PANEL_PLACEMENTS } from "./panelLayout.js";
import { getUnderscorePanel, getNaturalPanelPlacement } from "./panelRegistry.js";

export const PanelIcon = ({ id }) => {
  if (id === "chat") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>;
  }
  if (id === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z"/></svg>;
  }
  if (id === "console") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 3 2-3 2M12 15h5"/></svg>;
  }
  if (id === "script") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 6-5 6 5 6M16 6l5 6-5 6M14 3l-4 18"/></svg>;
  }
  if (id === "history") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 7v5l3 2"/></svg>;
  }
  if (id === "properties") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>;
  }
  if (id === "outliner") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M5 8h5M5 16h5M10 8v4h5M10 16h5"/><rect x="15" y="10" width="5" height="4" rx="1"/><circle cx="5" cy="5" r="1.5"/><circle cx="5" cy="19" r="1.5"/></svg>;
  }
  if (id === "physics") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(35 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="1.5"/></svg>;
  }
  if (id === "iannix") {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 5.5h4c4 0 5-2.8 7.5-2.3 2.8.6 3.7 7 7.5 9.3"/>
      <path d="M2.5 11.7c3.5 0 4.7-2.5 7.7-2 3.1.5 5.3 4 11.3 4"/>
      <path d="M2.5 18.5c2.8 0 3.3-5.3 5.2-5.3 2.1 0 2.6 5.6 5.6 5.6 2.9 0 4.5-8.6 8.2-11.6"/>
    </svg>;
  }
  if (id === "media-input") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m5 17 4.5-4 3 2 2.5-3 4 5M8 20l3-4"/></svg>;
  }
  if (id === "inputs") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h4l2.2-6 3.6 12 2.4-8 2 2H21"/><circle cx="4" cy="12" r="1.5"/><circle cx="20" cy="12" r="1.5"/></svg>;
  }
  if (id === "holistic") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="6.5" cy="10" r="1.5"/><circle cx="17.5" cy="10" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/><path d="M12 7v5M8 10l4 2 4-2M12 12l-4 6M12 12l4 6"/></svg>;
  }
  if (id === "mapping") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>;
  }
  if (id === "transport") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/></svg>;
  }
  if (id === "grid") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/></svg>;
  }
  if (id === "synth") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3l2.2-6 3.6 12 2.4-8 2 5H21"/><path d="M3 4v16M21 4v16"/></svg>;
  }
  if (id === "mixer") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16"/><path d="M2.5 9h5M9.5 15h5M16.5 7h5"/></svg>;
  }
  if (id === "info") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5 4.5 4.5M13 6.5l4.5 4.5M4 20l7.5-7.5M14 3l7 7-9.5 9.5-7-7L14 3Z"/></svg>;
};

export default function UnderscorePanel({
  id,
  title,
  placement,
  layout,
  dockTabs = [],
  onSelectDockTab,
  onDockTabPlacementChange,
  onDockTabDragStart,
  onCloseDockTab,
  onPlacementChange,
  onDragStart,
  onClose,
  onResizeStart,
  onExpand,
  allowBottom = false,
  bottomHeight = 144,
  collapsed = false,
  children,
}) {
  const floating = placement === PANEL_PLACEMENTS.FLOATING;
  const panelDefinition = getUnderscorePanel(id);
  const [floatingMinimized, setFloatingMinimized] = useState(() => (
    typeof localStorage !== "undefined" && localStorage.getItem(`underscore_panel_minimized_${id}`) === "true"
  ));
  const grouped = !floating && dockTabs.length > 1;
  const bottom = placement === PANEL_PLACEMENTS.BOTTOM;
  const allowedPlacements = panelDefinition?.placements;
  const minimized = floating && floatingMinimized;

  useEffect(() => {
    if (!floating && floatingMinimized) setFloatingMinimized(false);
  }, [floating, floatingMinimized]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`underscore_panel_minimized_${id}`, String(floatingMinimized));
  }, [floatingMinimized, id]);

  const toggleFloatingMinimized = () => {
    if (floating) setFloatingMinimized(value => !value);
  };

  const dockNaturally = () => {
    setFloatingMinimized(false);
    onPlacementChange(getNaturalPanelPlacement(panelDefinition));
  };

  const dockWidthVariable = placement === PANEL_PLACEMENTS.LEFT
    ? "--underscore-left-dock-width"
    : "--underscore-right-dock-width";
  const style = {
    ...(floating ? {
      width: `${layout?.width ?? 380}px`,
      left: `${layout?.x ?? 24}px`,
      top: `${layout?.y ?? 72}px`,
      height: `${allowBottom ? Math.max(layout?.height ?? 0, bottomHeight + 50) : layout?.height ?? 760}px`,
    } : bottom
      ? { height: collapsed ? "5px" : "var(--horizontal-dock-height, 144px)" }
      : { width: `var(${dockWidthVariable}, 380px)` }),
    ...(minimized ? { width: "42px", height: "42px" } : {}),
  };

  return (
    <section
      className={`underscore-panel-shell underscore-panel-${placement} ${collapsed ? "underscore-panel-collapsed" : ""} ${minimized ? "underscore-panel-floating-minimized" : ""}`}
      data-panel-id={id}
      style={style}
      aria-label={`${title} panel`}
      onDoubleClick={collapsed ? onExpand : undefined}
    >
      {!floating && (
        <div
          className={`underscore-panel-resize-handle underscore-panel-resize-${placement}`}
          onMouseDown={event => onResizeStart(id, event, placement)}
          onDoubleClick={collapsed ? onExpand : undefined}
          title={collapsed ? `Drag or double-click to expand ${title}` : `Drag to resize or collapse ${title}`}
          aria-label={`Resize ${title} panel`}
        />
      )}
      {floating && (
        <div
          className="underscore-floating-resize-handle"
          onMouseDown={event => onResizeStart(id, event, placement)}
          title={`Resize ${title} panel`}
          aria-label={`Resize ${title} panel horizontally and vertically`}
        />
      )}
      {grouped && (
        <div className="underscore-dock-tabs" role="tablist" aria-label={`${placement} dock panels`}>
          {dockTabs.map(panel => {
            const active = panel.id === id;
            return (
            <div
              key={panel.id}
              role="tab"
              aria-selected={active}
              aria-label={panel.label}
              title={panel.label}
              className={`underscore-dock-tab ${active ? "active" : ""}`}
            >
              <PanelPlacementControls
                label={panel.label}
                placement={placement}
                onPlacementChange={target => onDockTabPlacementChange(panel.id, target)}
                onDragStart={event => onDockTabDragStart(panel.id, event)}
                onActivate={active ? undefined : () => onSelectDockTab(panel.id)}
                onClose={() => onCloseDockTab(panel.id)}
                onNaturalDock={() => onDockTabPlacementChange(panel.id, getNaturalPanelPlacement(panel))}
                allowBottom={allowBottom}
                allowedPlacements={panel.placements}
                dragIcon={<PanelIcon id={panel.id} />}
              />
            </div>
            );
          })}
        </div>
      )}
      {!grouped && <header className="underscore-panel-header">
        <div className="underscore-panel-heading">
          <PanelPlacementControls
            label={title}
            placement={placement}
            onPlacementChange={onPlacementChange}
            onDragStart={onDragStart}
            onClose={onClose}
            onMinimizeToggle={toggleFloatingMinimized}
            onNaturalDock={dockNaturally}
            minimized={minimized}
            allowBottom={allowBottom}
            allowedPlacements={allowedPlacements}
            dragIcon={<PanelIcon id={id} />}
          />
          {floating && <span>{title}</span>}
        </div>
      </header>}
      <div className="underscore-panel-body">{children}</div>
    </section>
  );
}
