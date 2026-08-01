import { memo, useEffect, useMemo, useRef, useState } from "react";
import { infoProps } from "./uiInfo.js";
import { buildSceneGroupTree, getOutlinerLayerElements } from "./sceneLayers.js";
import { analyzeSvgSource, normalizeSvgObject } from "./svgObject.js";
import { getEditableSvgPathNodes } from "./svgPathGeometry.js";
import { getLivecodeKindDefinition, isLivecodeNodeElement, normalizeLivecodeNode } from "./livecodeNode.js";
import { isMediaStreamElement, normalizeMediaStreamConfig } from "./mediaStream.js";

const groupLabel = groupId => `Group · ${String(groupId).slice(0, 8)}`;
const scoreLabel = label => `Score · ${label}`;
const iannixGroupLabel = groupId => `IanniX · ${groupId}`;

const OutlinerPanel = memo(function OutlinerPanel({
  elements = [],
  selectedElementIds = {},
  selectedSvgNode = null,
  onSelect,
  onSelectGroup,
  onDelete,
  onVisibilityChange,
  onLockChange,
  onRename,
  onRenameGroup,
  onReorder,
  onMoveToGroup,
  onReparentGroup,
  onGroup,
  onUngroup,
  onSelectSvgNode,
}) {
  const [query, setQuery] = useState("");
  const [nameMode, setNameMode] = useState(() => localStorage.getItem("drawerator_outliner_name_mode") === "ids" ? "ids" : "labels");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [draggingIds, setDraggingIds] = useState([]);
  const [dropTarget, setDropTarget] = useState(null);
  const [expandedSvgIds, setExpandedSvgIds] = useState(() => new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());
  const rowRefs = useRef(new Map());
  const selectionAnchorRef = useRef(null);
  const editingRef = useRef(null);
  const visibleElements = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return getOutlinerLayerElements(elements).filter(element => !needle || `${
      element.type
      } ${element.id} ${element.customData?.iannix?.label || ""} ${element.customData?.iannixImport?.externalId || ""} ${element.customData?.iannixImport?.group || ""} ${isLivecodeNodeElement(element) ? `${normalizeLivecodeNode(element.customData.draweratorLivecode).name} ${normalizeLivecodeNode(element.customData.draweratorLivecode).kind}` : ""} ${isMediaStreamElement(element) ? `${normalizeMediaStreamConfig(element.customData.draweratorMediaStream).name} ${normalizeMediaStreamConfig(element.customData.draweratorMediaStream).kind}` : ""}`.toLowerCase().includes(needle));
  }, [elements, query]);
  const groupTree = useMemo(() => buildSceneGroupTree(visibleElements, { outlinerOrder: true }), [visibleElements]);
  const getElementTypeLabel = element => {
    if (element.customData?.draweratorSvg) return "SVG";
    if (isLivecodeNodeElement(element)) return getLivecodeKindDefinition(normalizeLivecodeNode(element.customData.draweratorLivecode).kind).label;
    return element.type;
  };
  const getElementLabel = element => {
    if (element.customData?.iannix?.label) return element.customData.iannix.label;
    if (element.customData?.draweratorLabel) return element.customData.draweratorLabel;
    if (isLivecodeNodeElement(element)) return normalizeLivecodeNode(element.customData.draweratorLivecode).name;
    if (isMediaStreamElement(element)) return normalizeMediaStreamConfig(element.customData.draweratorMediaStream).name;
    return element.id;
  };

  useEffect(() => {
    const selectedId = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]).at(-1);
    const row = selectedId ? rowRefs.current.get(selectedId) : null;
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedElementIds, visibleElements]);

  // Scores are a primary authoring unit, not an incidental canvas group.
  // Open newly encountered score roots so a run immediately reveals the
  // IanniX setGroup hierarchy it produced; users can still collapse it.
  useEffect(() => {
    const scoreIds = new Set();
    const collect = node => {
      if (node.kind === "score") scoreIds.add(`score:${node.id}`);
      node.children?.forEach(collect);
    };
    collect(groupTree);
    if (!scoreIds.size) return;
    setExpandedGroupIds(current => {
      const next = new Set(current);
      let changed = false;
      for (const id of scoreIds) {
        if (!next.has(id)) { next.add(id); changed = true; }
      }
      return changed ? next : current;
    });
  }, [groupTree]);

  const selectElement = (elementId, event) => {
    const visibleIds = visibleElements.map(element => element.id);
    if (event.shiftKey) {
      const anchorIndex = visibleIds.indexOf(selectionAnchorRef.current);
      const targetIndex = visibleIds.indexOf(elementId);
      const rangeIds = anchorIndex >= 0 && targetIndex >= 0
        ? visibleIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
        : [elementId];
      onSelect(elementId, { mode: "range", rangeIds, additive: event.metaKey || event.ctrlKey });
      if (anchorIndex < 0) selectionAnchorRef.current = elementId;
      return;
    }
    onSelect(elementId, event.metaKey || event.ctrlKey ? { mode: "toggle" } : {});
    selectionAnchorRef.current = elementId;
  };

  const selectedIdsFor = elementId => (
    selectedElementIds[elementId]
      ? Object.keys(selectedElementIds).filter(id => selectedElementIds[id])
      : [elementId]
  );
  const actionIdsFor = (event, fallbackIds) => {
    const selectedIds = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]);
    return event.altKey && selectedIds.length ? selectedIds : fallbackIds;
  };
  const elementIdsForNode = node => {
    if (node.kind === "element") return [node.element.id];
    return (node.children || []).flatMap(elementIdsForNode);
  };
  const beginRename = element => {
    setEditingId(element.id);
    setEditingValue(
      element.customData?.iannix?.label ||
        element.customData?.draweratorLabel ||
        (isLivecodeNodeElement(element)
          ? normalizeLivecodeNode(element.customData.draweratorLivecode).name
          : isMediaStreamElement(element)
            ? normalizeMediaStreamConfig(element.customData.draweratorMediaStream).name
            : element.customData?.draweratorSvg
              ? normalizeSvgObject(element.customData.draweratorSvg).name
              : ""),
    );
    requestAnimationFrame(() => editingRef.current?.focus());
  };
  const finishRename = (element, commit = true) => {
    if (commit) onRename?.(element.id, editingValue.trim());
    setEditingId(null);
  };
  const beginGroupRename = node => {
    setEditingId(`group:${node.id}`);
    setEditingValue(node.label || "");
    requestAnimationFrame(() => editingRef.current?.focus());
  };
  const finishGroupRename = (node, commit = true) => {
    if (commit) onRenameGroup?.(node.id, editingValue.trim());
    setEditingId(null);
  };
  const clearDrag = () => { setDraggingIds([]); setDropTarget(null); };
  const startDrag = (event, elementOrIds) => {
    const ids = Array.isArray(elementOrIds) ? elementOrIds : selectedIdsFor(elementOrIds);
    if (!ids.length || (typeof elementOrIds === "string" && editingId === elementOrIds)) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-drawerator-elements", JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", ids.join(","));
    setDraggingIds(ids);
  };
  const startGroupDrag = (event, node) => {
    const ids = elementIdsForNode(node);
    startDrag(event, ids);
    event.dataTransfer.setData("application/x-drawerator-group", node.id);
  };
  const draggedIds = event => {
    try {
      const parsed = JSON.parse(event.dataTransfer.getData("application/x-drawerator-elements"));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* fall through */ }
    return draggingIds.length ? draggingIds : event.dataTransfer.getData("text/plain").split(",").filter(Boolean);
  };
  const placementFor = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height * 0.28) return "front";
    if (event.clientY > rect.bottom - rect.height * 0.28) return "back";
    return "inside";
  };
  const handleKeyDown = event => {
    if (event.key === "F2") {
      const element = visibleElements.find(item => selectedElementIds[item.id]);
      if (element) { event.preventDefault(); beginRename(element); }
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
    const selectedIds = Object.keys(selectedElementIds).filter(id => selectedElementIds[id]);
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (event.shiftKey) onUngroup?.(selectedIds);
      else onGroup?.(selectedIds);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
      event.preventDefault();
      event.stopPropagation();
      onDelete(selectedIds);
    }
  };

  const renderSvgTree = element => {
    if (!expandedSvgIds.has(element.id)) return null;
    const source = normalizeSvgObject(element.customData.draweratorSvg).source;
    const svgNodes = analyzeSvgSource(source).nodes;
    const svgPaths = new Map(getEditableSvgPathNodes(source).map(path => [path.node.index, path]));
    return <div className="outliner-svg-tree" role="group" aria-label={`${getElementTypeLabel(element)} document nodes`}>
      {svgNodes.map(node => {
        const path = svgPaths.get(node.index);
        const subpaths = path?.subpaths || [];
        const hasSubpathChildren = subpaths.length > 1;
        const nodeSelected = selectedSvgNode?.elementId === element.id && selectedSvgNode?.nodeIndex === node.index
          && (!Number.isInteger(selectedSvgNode?.subpathIndex) || !hasSubpathChildren);
        return <div className="outliner-svg-node-group" key={`${element.id}-${node.index}`}>
          <button type="button" role="treeitem" aria-level={node.depth + 2} aria-expanded={hasSubpathChildren ? true : undefined} aria-selected={nodeSelected} className={`outliner-svg-node ${nodeSelected ? "selected" : ""}`} style={{ "--outliner-svg-depth": node.depth }} onClick={event => {
            event.preventDefault(); event.stopPropagation(); onSelectSvgNode?.(element.id, node.index, subpaths.length === 1 ? 0 : null);
          }} title={node.tag.toLowerCase() === "path" ? `${node.label} · ${hasSubpathChildren ? `${subpaths.length} editable subpaths` : "select and edit path on canvas"}` : `${node.label} · select SVG component`}>
            <span className={`outliner-type type-svg-node tag-${node.tag.toLowerCase()}`}>{node.tag.slice(0, 1).toUpperCase()}</span>
            <span>{node.label}{hasSubpathChildren ? ` · ${subpaths.length}` : ""}</span>
          </button>
          {hasSubpathChildren && <div role="group" aria-label={`${node.label} subpaths`}>
            {subpaths.map(subpath => {
              const selected = selectedSvgNode?.elementId === element.id && selectedSvgNode?.nodeIndex === node.index && selectedSvgNode?.subpathIndex === subpath.index;
              return <button type="button" role="treeitem" aria-level={node.depth + 3} aria-selected={selected} className={`outliner-svg-node outliner-svg-subpath ${selected ? "selected" : ""} ${subpath.valid ? "" : "invalid"}`} style={{ "--outliner-svg-depth": node.depth + 1 }} key={`${element.id}-${node.index}-subpath-${subpath.index}`} onClick={event => {
                event.preventDefault(); event.stopPropagation(); onSelectSvgNode?.(element.id, node.index, subpath.index);
              }} title={subpath.valid ? `Edit ${node.label} subpath ${subpath.index + 1}` : subpath.error}>
                <span className="outliner-svg-subpath-branch">↳</span><span>Subpath {subpath.index + 1}</span>
              </button>;
            })}
          </div>}
        </div>;
      })}
    </div>;
  };

  const renderElement = (element, depth) => {
    const isSvg = Boolean(element.customData?.draweratorSvg);
    const isLivecode = isLivecodeNodeElement(element);
    const dropPlacement = dropTarget?.id === element.id ? dropTarget.placement : null;
    return <div className="outliner-entry" key={element.id}>
      <div role="treeitem" aria-level={depth + 1} aria-expanded={isSvg ? expandedSvgIds.has(element.id) : undefined} aria-selected={Boolean(selectedElementIds[element.id])} className={`outliner-row ${selectedElementIds[element.id] ? "selected" : ""} ${draggingIds.includes(element.id) ? "dragging" : ""} ${dropPlacement ? `drop-${dropPlacement}` : ""}`} ref={node => node ? rowRefs.current.set(element.id, node) : rowRefs.current.delete(element.id)} draggable={editingId !== element.id} onDragStart={event => startDrag(event, element.id)} onDragEnd={clearDrag} onDragOver={event => {
        if (!draggingIds.length || draggingIds.includes(element.id)) return;
        event.preventDefault(); event.dataTransfer.dropEffect = "move";
        setDropTarget({ id: element.id, placement: placementFor(event) });
      }} onDrop={event => {
        event.preventDefault();
        const ids = draggedIds(event).filter(id => id !== element.id);
        const placement = dropTarget?.id === element.id ? dropTarget.placement : "front";
        if (ids.length) {
          if (placement === "inside") onGroup?.([...ids, element.id]);
          else onReorder?.(ids, element.id, placement, { destinationGroupId: element.groupIds?.at(-1) || null });
        }
        clearDrag();
      }}>
        <div role="button" tabIndex={0} className={`outliner-object ${isSvg ? "has-children" : ""}`} style={{ "--outliner-depth": depth }} onClick={event => selectElement(element.id, event)} onKeyDown={event => {
          if (editingId === element.id) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectElement(element.id, event); }
        }} onDoubleClick={event => {
          event.preventDefault();
          if (isSvg) setExpandedSvgIds(current => { const next = new Set(current); if (next.has(element.id)) next.delete(element.id); else next.add(element.id); return next; });
          else beginRename(element);
        }} title={`${getElementTypeLabel(element)} · ${element.id}${isSvg ? " · double-click row to expand; double-click label to rename" : " · double-click to rename"}`}>
          <span className="outliner-disclosure" aria-hidden="true">{isSvg ? (expandedSvgIds.has(element.id) ? "⌄" : "›") : ""}</span>
          <span className={`outliner-type type-${isSvg ? "svg" : isLivecode ? "livecode" : element.type}`}>{isSvg ? "S" : isLivecode ? "L" : element.type.slice(0, 1).toUpperCase()}</span>
          {editingId === element.id ? <input ref={editingRef} className="outliner-label-input" value={editingValue} placeholder={element.id} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onChange={event => setEditingValue(event.target.value)} onBlur={() => finishRename(element)} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); finishRename(element); } if (event.key === "Escape") { event.preventDefault(); finishRename(element, false); } }} aria-label={`Rename ${element.id}`} /> : <span className="outliner-label" onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); beginRename(element); }}>{nameMode === "labels" ? getElementLabel(element) : element.id}</span>}
        </div>
        <button type="button" className={element.customData?.outlinerHidden ? "outliner-toggle inactive" : "outliner-toggle"} onClick={event => onVisibilityChange(actionIdsFor(event, selectedIdsFor(element.id)))} title={element.customData?.outlinerHidden ? "Show object" : "Hide object"} aria-label={element.customData?.outlinerHidden ? `Show ${element.id}` : `Hide ${element.id}`} {...infoProps("Object visibility", "Hide or show the authored object without deleting it or changing its score role. Option-click applies the action to the current selection.")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button>
        <button type="button" className={element.locked ? "outliner-toggle active" : "outliner-toggle"} onClick={event => onLockChange(actionIdsFor(event, selectedIdsFor(element.id)))} title={element.locked ? "Unlock object" : "Lock object"} aria-label={element.locked ? `Unlock ${element.id}` : `Lock ${element.id}`} aria-pressed={element.locked} {...infoProps("Object lock", "Locked objects remain visible and active but cannot be selected or transformed on the canvas. Option-click applies the action to the current selection.")}>{element.locked ? <svg className="outliner-lock-icon locked" viewBox="0 0 24 24" aria-hidden="true"><rect className="outliner-lock-body" x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> : <svg className="outliner-lock-icon unlocked" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M7.5 10V7a4.5 4.5 0 0 1 8.7-2.5"/></svg>}</button>
        <button type="button" className="outliner-toggle outliner-delete" onClick={event => onDelete(actionIdsFor(event, selectedIdsFor(element.id)))} title="Delete object" aria-label={`Delete ${element.id}`} {...infoProps("Delete object", "Delete this object. Option-click applies the action to the current selection.")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
      </div>
      {isSvg && renderSvgTree(element)}
    </div>;
  };

  const renderNode = (node, depth = 0) => {
    if (node.kind === "element") return renderElement(node.element, depth);
    if (["group", "score", "iannix-group"].includes(node.kind)) {
      const key = node.kind === "score" ? `score:${node.id}` : node.kind === "iannix-group" ? `iannix:${node.scoreId}:${node.id}` : node.id;
      const expanded = expandedGroupIds.has(key);
      const label = node.kind === "score"
        ? scoreLabel(node.label)
        : node.kind === "iannix-group"
          ? iannixGroupLabel(node.id)
          : (node.label || groupLabel(node.id));
      const type = node.kind === "score" ? "score" : node.kind === "iannix-group" ? "iannix-group" : "group";
      const glyph = node.kind === "score" ? "I" : node.kind === "iannix-group" ? "i" : "G";
      const memberIds = elementIdsForNode(node);
      const isSelected = memberIds.length > 0 && memberIds.every(id => selectedElementIds[id]);
      const isHidden = memberIds.length > 0 && memberIds.every(id => visibleElements.find(element => element.id === id)?.customData?.outlinerHidden);
      const isLocked = memberIds.length > 0 && memberIds.every(id => visibleElements.find(element => element.id === id)?.locked);
      return <div className={`outliner-group outliner-${type}`} key={`${node.kind}-${key}`}>
        <div role="treeitem" aria-level={depth + 1} aria-expanded={expanded} aria-selected={isSelected} className={`outliner-group-row ${isSelected ? "selected" : ""} ${draggingIds.some(id => memberIds.includes(id)) ? "dragging" : ""} ${dropTarget?.groupKey === key ? "drop-inside" : ""}`} style={{ "--outliner-depth": depth }} draggable={node.kind === "group"} onDragStart={event => node.kind === "group" && startGroupDrag(event, node)} onDragEnd={clearDrag} onDragOver={event => {
          const draggedGroupId = event.dataTransfer.getData("application/x-drawerator-group");
          const ids = draggedIds(event);
          if (node.kind !== "group" || (draggedGroupId === node.id) || (!draggedGroupId && !ids.length)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = "move";
          setDropTarget({ groupKey: key, placement: "inside" });
        }} onDrop={event => {
          const draggedGroupId = event.dataTransfer.getData("application/x-drawerator-group");
          if (node.kind === "group" && draggedGroupId && draggedGroupId !== node.id) {
            event.preventDefault(); onReparentGroup?.(draggedGroupId, node.id);
          } else if (node.kind === "group") {
            const ids = draggedIds(event).filter(id => !memberIds.includes(id));
            if (ids.length) { event.preventDefault(); onMoveToGroup?.(ids, node.id); }
          }
          clearDrag();
        }}>
          <button type="button" className="outliner-group-disclosure" onClick={() => setExpandedGroupIds(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}><span className="outliner-disclosure" aria-hidden="true">{expanded ? "⌄" : "›"}</span></button>
          <div role="button" tabIndex={0} className="outliner-object outliner-group-object" onClick={() => onSelectGroup?.(memberIds)} onKeyDown={event => {
            if (editingId === `group:${node.id}`) return;
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectGroup?.(memberIds); }
          }} onDoubleClick={event => {
            if (node.kind !== "group") return;
            event.preventDefault();
            event.stopPropagation();
            beginGroupRename(node);
          }} title={`${label}. Click to select its ${memberIds.length} object${memberIds.length === 1 ? "" : "s"}; double-click to rename.`}>
            <span className={`outliner-type type-${type}`}>{glyph}</span>
            {editingId === `group:${node.id}`
              ? <input ref={editingRef} className="outliner-label-input" value={editingValue} placeholder={groupLabel(node.id)} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onChange={event => setEditingValue(event.target.value)} onBlur={() => finishGroupRename(node)} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); finishGroupRename(node); } if (event.key === "Escape") { event.preventDefault(); finishGroupRename(node, false); } }} aria-label={`Rename ${groupLabel(node.id)}`} />
              : <span className="outliner-label">{label}</span>}
            <span className="outliner-group-count">{memberIds.length}</span>
          </div>
          <button type="button" className={isHidden ? "outliner-toggle inactive" : "outliner-toggle"} onClick={event => onVisibilityChange(actionIdsFor(event, memberIds))} title={`${isHidden ? "Show" : "Hide"} group`} aria-label={`${isHidden ? "Show" : "Hide"} ${label}`} {...infoProps("Group visibility", "Hide or show every object in this group. Option-click applies the action to the current selection.")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg></button>
          <button type="button" className={isLocked ? "outliner-toggle active" : "outliner-toggle"} onClick={event => onLockChange(actionIdsFor(event, memberIds))} title={`${isLocked ? "Unlock" : "Lock"} group`} aria-label={`${isLocked ? "Unlock" : "Lock"} ${label}`} {...infoProps("Group lock", "Lock or unlock every object in this group. Option-click applies the action to the current selection.")}><svg className="outliner-lock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></button>
          <button type="button" className="outliner-toggle outliner-delete" onClick={event => onDelete(actionIdsFor(event, memberIds))} title="Delete group" aria-label={`Delete ${label}`} {...infoProps("Delete group", "Delete every object in this group. Option-click applies the action to the current selection.")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
        </div>
        {expanded && <div className="outliner-group-children">{node.children.map(child => renderNode(child, depth + 1))}</div>}
      </div>;
    }
    return node.children.map(child => renderNode(child, depth));
  };

  return <div className="outliner-panel">
    <div className="outliner-toolbar">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter scene" aria-label="Filter scene objects" {...infoProps("Filter scene", "Filter Outliner rows by object type, ID, score label, IanniX external ID, or IanniX group.")} />
      <button type="button" className="outliner-name-mode" onClick={() => setNameMode(current => { const next = current === "labels" ? "ids" : "labels"; localStorage.setItem("drawerator_outliner_name_mode", next); return next; })} title={`Showing ${nameMode}. Click to show ${nameMode === "labels" ? "IDs" : "labels"}.`}>{nameMode === "labels" ? "Labels" : "IDs"}</button>
      <span>{visibleElements.length}</span>
    </div>
    <div className="outliner-list" role="tree" tabIndex={0} aria-label="Scene objects" onKeyDown={handleKeyDown}>
      {visibleElements.length ? groupTree.children.map(node => renderNode(node)) : <div className="scene-panel-empty compact">No scene objects.</div>}
    </div>
  </div>;
});

export default OutlinerPanel;
