import { memo, useEffect, useRef, useState } from "react";
import { getOutlinerElementLabel } from "./OutlinerPanel.jsx";
import { playlistItemLabel } from "./playlist.js";
import TimeValueInput from "./TimeValueInput.jsx";

const Icon = ({ type }) => {
  if (type === "play") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /> </svg>;
  if (type === "pause") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" /></svg>;
  if (type === "prev") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 5-9 7 9 7V5ZM7 5H5v14h2V5Z" /></svg>;
  if (type === "next") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 5 9 7-9 7V5Zm11 0h2v14h-2V5Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-7-7h14" /></svg>;
};

const PlaylistPanel = memo(function PlaylistPanel({
  elements = [],
  selectedElementIds = {},
  playlist,
  timeContext,
  playing = false,
  onAddSelected,
  onAddElementIds,
  onRemove,
  onPatchItem,
  onMove,
  onSelect,
  onActivate,
  onRenameElement,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onStep,
  onPatchState,
}) {
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const panelRef = useRef(null);
  const editingRef = useRef(null);
  const selectedIds = Object.keys(selectedElementIds || {}).filter(id => selectedElementIds[id]);
  const items = playlist?.items || [];

  const itemDisplayLabel = item => {
    const targets = (item?.elementIds || []).map(id => elements.find(element => element.id === id)).filter(Boolean);
    if (targets.length === 1) return getOutlinerElementLabel(targets[0]) || targets[0].id;
    if (item?.label) return item.label;
    return playlistItemLabel(item, elements);
  };

  useEffect(() => {
    if (editingItemId) requestAnimationFrame(() => editingRef.current?.focus());
  }, [editingItemId]);

  const beginRename = item => {
    if (!item?.elementIds?.length) return;
    const element = elements.find(candidate => candidate.id === item.elementIds[0]);
    if (!element || item.elementIds.length !== 1) return;
    setEditingItemId(item.id);
    setEditingValue(getOutlinerElementLabel(element));
  };

  const finishRename = (item, commit = true) => {
    if (commit && item?.elementIds?.length === 1) onRenameElement?.(item.elementIds[0], editingValue.trim());
    setEditingItemId(null);
  };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const handleKeyDown = event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onNext?.(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onPrevious?.(); }
      if (event.key === "Enter") { event.preventDefault(); onActivate?.(playlist?.activeIndex ?? 0); }
      if (event.key === " ") {
        event.preventDefault();
        if (playing) onPause?.();
        else onPlay?.();
      }
    };
    panel.addEventListener("keydown", handleKeyDown);
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [onActivate, onNext, onPause, onPlay, onPrevious, playing, playlist?.activeIndex]);

  const handleDrop = event => {
    event.preventDefault();
    try {
      const ids = JSON.parse(event.dataTransfer.getData("application/x-underscores-elements"));
      if (Array.isArray(ids) && ids.length) onAddElementIds?.(ids);
    } catch { /* not a scene object drag */ }
    setDraggingIndex(null);
  };

  return <div className="playlist-panel" ref={panelRef} tabIndex={0} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
    <div className="playlist-toolbar">
      <button type="button" className={playing ? "active" : ""} onClick={playing ? onPause : onPlay} title={playing ? "Pause playlist" : "Play playlist"} aria-label={playing ? "Pause playlist" : "Play playlist"}><Icon type={playing ? "pause" : "play"} /></button>
      <button type="button" onClick={onStep} title="Manual advance" aria-label="Manual advance">⇥</button>
      <button type="button" onClick={onPrevious} title="Previous playlist item" aria-label="Previous playlist item"><Icon type="prev" /></button>
      <button type="button" onClick={onNext} title="Next playlist item" aria-label="Next playlist item"><Icon type="next" /></button>
      <TimeValueInput className="playlist-default-duration" aria-label="Default playlist duration" value={playlist?.defaultDurationValue || `${playlist?.defaultDuration ?? 5} s`} context={timeContext} defaultValue="5 s" minSeconds={0.1} onChange={(next, seconds) => onPatchState?.({ defaultDurationValue: next, defaultDuration: seconds })} title="Default duration for new playlist items" />
      <label className="playlist-loop-toggle" title="Loop playlist"><input type="checkbox" checked={playlist?.loop === true} onChange={event => onPatchState?.({ loop: event.target.checked })} /> <span>Loop</span></label>
      <button type="button" className="playlist-add" onClick={() => onAddSelected?.()} disabled={!selectedIds.length} title="Add selected canvas objects"><Icon type="add" /> Add</button>
    </div>
    <div className="playlist-options">
      <span>{items.length} {items.length === 1 ? "anchor" : "anchors"}</span>
    </div>
    <div className="playlist-list" role="list" aria-label="Playlist anchors">
      {!items.length && <div className="playlist-empty">No anchors</div>}
      {items.map((item, index) => {
        const selected = index === playlist?.activeIndex;
        return <div key={item.id} className={`playlist-row ${selected ? "selected" : ""} ${draggingIndex === index ? "dragging" : ""}`} draggable={editingItemId !== item.id} onDragStart={() => setDraggingIndex(index)} onDragEnd={() => setDraggingIndex(null)} onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); const from = draggingIndex; if (from != null && from !== index) onMove?.(from, index); setDraggingIndex(null); }} onDoubleClick={() => onActivate?.(index)} role="listitem" aria-selected={selected}>
          <div className="playlist-row-main" role="button" tabIndex={0} onClick={() => onSelect?.(index)} title={`${itemDisplayLabel(item)} · double-click to activate`}>
            <span className="playlist-row-index">{index + 1}</span>
            <span className="playlist-row-copy">{editingItemId === item.id
              ? <input ref={editingRef} className="playlist-label-input" value={editingValue} placeholder={itemDisplayLabel(item)} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onChange={event => setEditingValue(event.target.value)} onBlur={() => finishRename(item)} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") { event.preventDefault(); finishRename(item); } if (event.key === "Escape") { event.preventDefault(); finishRename(item, false); } }} aria-label={`Rename ${itemDisplayLabel(item)}`} />
              : <strong onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); beginRename(item); }}>{itemDisplayLabel(item)}</strong>}</span>
          </div>
          <TimeValueInput className="playlist-duration" aria-label={`Duration for ${itemDisplayLabel(item)}`} value={item.durationValue || `${item.duration} s`} context={timeContext} defaultValue={`${playlist?.defaultDuration ?? 5} s`} minSeconds={0.1} onChange={(next, seconds) => onPatchItem?.(item.id, { durationValue: next, duration: seconds })} title="Duration" />
          <select className="playlist-transition" aria-label="Transition" value={item.transition} onChange={event => onPatchItem?.(item.id, { transition: event.target.value })}><option value="cut">Cut</option><option value="fade" disabled>Fade (later)</option></select>
          <label className="playlist-arm" title="Arm cue"><input type="checkbox" checked={item.armed === true} onChange={event => onPatchItem?.(item.id, { armed: event.target.checked })} /></label>
          <button type="button" className="playlist-remove" onClick={() => onRemove?.(item.id)} title="Remove playlist item" aria-label="Remove playlist item">×</button>
        </div>;
      })}
    </div>
  </div>;
});

export default PlaylistPanel;
