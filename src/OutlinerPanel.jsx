import { memo, useEffect, useMemo, useRef, useState } from "react";

const OutlinerPanel = memo(function OutlinerPanel({ elements = [], selectedElementIds = {}, onSelect, onDelete, onVisibilityChange, onLockChange }) {
  const [query, setQuery] = useState("");
  const [nameMode, setNameMode] = useState(() => localStorage.getItem("drawerator_outliner_name_mode") === "ids" ? "ids" : "labels");
  const rowRefs = useRef(new Map());
  const selectionAnchorRef = useRef(null);
  const visibleElements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return elements
      .filter(element => !element.isDeleted)
      .filter(element => !needle || `${element.type} ${element.id} ${element.customData?.iannix?.label || ""}`.toLowerCase().includes(needle));
  }, [elements, query]);

  useEffect(() => {
    const selectedId = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]).at(-1);
    const row = selectedId ? rowRefs.current.get(selectedId) : null;
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedElementIds, visibleElements]);

  const selectElement = (elementId, event) => {
    const visibleIds = visibleElements.map(element => element.id);
    if (event.shiftKey) {
      const anchorId = selectionAnchorRef.current;
      const anchorIndex = visibleIds.indexOf(anchorId);
      const targetIndex = visibleIds.indexOf(elementId);
      const rangeIds = anchorIndex >= 0 && targetIndex >= 0
        ? visibleIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
        : [elementId];
      onSelect(elementId, {
        mode: "range",
        rangeIds,
        additive: event.metaKey || event.ctrlKey,
      });
      if (anchorIndex < 0) selectionAnchorRef.current = elementId;
      return;
    }

    const toggle = event.metaKey || event.ctrlKey;
    onSelect(elementId, { mode: toggle ? "toggle" : "replace" });
    selectionAnchorRef.current = elementId;
  };

  const deleteSelection = elementId => {
    const selectedIds = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]);
    onDelete(selectedElementIds[elementId] ? selectedIds : [elementId]);
  };

  const handleKeyDown = event => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
    const selectedIds = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]);
    if (!selectedIds.length) return;
    event.preventDefault();
    event.stopPropagation();
    onDelete(selectedIds);
  };

  return (
    <div className="outliner-panel">
      <div className="outliner-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter scene" aria-label="Filter scene objects" />
        <button
          type="button"
          className="outliner-name-mode"
          onClick={() => setNameMode(current => {
            const next = current === "labels" ? "ids" : "labels";
            localStorage.setItem("drawerator_outliner_name_mode", next);
            return next;
          })}
          title={`Showing ${nameMode}. Click to show ${nameMode === "labels" ? "IDs" : "labels"}.`}
        >
          {nameMode === "labels" ? "Labels" : "IDs"}
        </button>
        <span>{visibleElements.length}</span>
      </div>
      <div className="outliner-list" role="tree" aria-label="Scene objects" onKeyDown={handleKeyDown}>
        {visibleElements.length ? visibleElements.map(element => (
          <div
            role="treeitem"
            aria-selected={Boolean(selectedElementIds[element.id])}
            className={`outliner-row ${selectedElementIds[element.id] ? "selected" : ""}`}
            key={element.id}
            ref={node => node ? rowRefs.current.set(element.id, node) : rowRefs.current.delete(element.id)}
          >
            <button type="button" className="outliner-object" onClick={event => selectElement(element.id, event)} title={`${element.type} · ${element.id}`}>
              <span className={`outliner-type type-${element.type}`}>{element.type.slice(0, 1).toUpperCase()}</span>
              <span className="outliner-label">{nameMode === "labels" && element.customData?.iannix?.label ? element.customData.iannix.label : element.id}</span>
            </button>
            <button type="button" className={element.customData?.outlinerHidden ? "outliner-toggle inactive" : "outliner-toggle"} onClick={() => onVisibilityChange(element.id)} title={element.customData?.outlinerHidden ? "Show object" : "Hide object"} aria-label={element.customData?.outlinerHidden ? `Show ${element.id}` : `Hide ${element.id}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </button>
            <button type="button" className={element.locked ? "outliner-toggle active" : "outliner-toggle"} onClick={() => onLockChange(element.id)} title={element.locked ? "Unlock object" : "Lock object"} aria-label={element.locked ? `Unlock ${element.id}` : `Lock ${element.id}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            </button>
            <button type="button" className="outliner-toggle outliner-delete" onClick={() => deleteSelection(element.id)} title="Delete object" aria-label={`Delete ${element.id}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        )) : <div className="scene-panel-empty compact">No scene objects.</div>}
      </div>
    </div>
  );
});

export default OutlinerPanel;
