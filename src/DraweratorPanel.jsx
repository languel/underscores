import React from "react";
import PanelPlacementControls from "./PanelPlacementControls.jsx";
import { PANEL_PLACEMENTS } from "./panelLayout.js";

const PanelIcon = ({ id }) => {
  if (id === "chat") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg>;
  }
  if (id === "settings") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z"/></svg>;
  }
  if (id === "console") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m7 10 3 2-3 2M12 15h5"/></svg>;
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
  if (id === "iannix") {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 5.5h4c4 0 5-2.8 7.5-2.3 2.8.6 3.7 7 7.5 9.3"/>
      <path d="M2.5 11.7c3.5 0 4.7-2.5 7.7-2 3.1.5 5.3 4 11.3 4"/>
      <path d="M2.5 18.5c2.8 0 3.3-5.3 5.2-5.3 2.1 0 2.6 5.6 5.6 5.6 2.9 0 4.5-8.6 8.2-11.6"/>
    </svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5 4.5 4.5M13 6.5l4.5 4.5M4 20l7.5-7.5M14 3l7 7-9.5 9.5-7-7L14 3Z"/></svg>;
};

export default function DraweratorPanel({
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
  collapsed = false,
  children,
}) {
  const floating = placement === PANEL_PLACEMENTS.FLOATING;
  const grouped = !floating && dockTabs.length > 1;
  const style = {
    width: `${layout?.width ?? 380}px`,
    ...(floating ? {
      left: `${layout?.x ?? 24}px`,
      top: `${layout?.y ?? 72}px`,
      height: `${layout?.height ?? 760}px`,
    } : {}),
  };

  return (
    <section
      className={`drawerator-panel-shell drawerator-panel-${placement} ${collapsed ? "drawerator-panel-collapsed" : ""}`}
      data-panel-id={id}
      style={style}
      aria-label={`${title} panel`}
      onDoubleClick={collapsed ? onExpand : undefined}
    >
      {!floating && (
        <div
          className={`drawerator-panel-resize-handle drawerator-panel-resize-${placement}`}
          onMouseDown={event => onResizeStart(id, event, placement)}
          title="Drag to resize panel"
          aria-label={`Resize ${title} panel`}
        />
      )}
      {floating && (
        <div
          className="drawerator-floating-resize-handle"
          onMouseDown={event => onResizeStart(id, event, placement)}
          title={`Resize ${title} panel`}
          aria-label={`Resize ${title} panel horizontally and vertically`}
        />
      )}
      {grouped && (
        <div className="drawerator-dock-tabs" role="tablist" aria-label={`${placement} dock panels`}>
          {dockTabs.map(panel => {
            const active = panel.id === id;
            return (
            <div
              key={panel.id}
              role="tab"
              aria-selected={active}
              aria-label={panel.label}
              title={panel.label}
              className={`drawerator-dock-tab ${active ? "active" : ""}`}
            >
              <PanelPlacementControls
                label={panel.label}
                placement={placement}
                onPlacementChange={target => onDockTabPlacementChange(panel.id, target)}
                onDragStart={event => onDockTabDragStart(panel.id, event)}
                onActivate={active ? undefined : () => onSelectDockTab(panel.id)}
                onClose={() => onCloseDockTab(panel.id)}
                dragIcon={<PanelIcon id={panel.id} />}
              />
              {active && <span>{panel.label}</span>}
            </div>
            );
          })}
        </div>
      )}
      {!grouped && <header className="drawerator-panel-header">
        <div className="drawerator-panel-heading">
          <PanelPlacementControls
            label={title}
            placement={placement}
            onPlacementChange={onPlacementChange}
            onDragStart={onDragStart}
            onClose={onClose}
            dragIcon={<PanelIcon id={id} />}
          />
          <span>{title}</span>
        </div>
      </header>}
      <div className="drawerator-panel-body">{children}</div>
    </section>
  );
}
