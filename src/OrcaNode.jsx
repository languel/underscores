import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeOrcaSelection,
  ORCA_OPERATOR_REFERENCE,
  parseOrcaGrid,
  patchOrcaCell,
  patchOrcaSelection,
  serializeOrcaGrid,
} from "./orcaEngine.js";
import { getOrcaRuntimeManager } from "./orcaRuntime.js";

const selectionBounds = selection => ({
  minX: Math.min(selection.x, selection.x + selection.width),
  maxX: Math.max(selection.x, selection.x + selection.width),
  minY: Math.min(selection.y, selection.y + selection.height),
  maxY: Math.max(selection.y, selection.y + selection.height),
});

const containsCell = (selection, x, y) => {
  const bounds = selectionBounds(selection);
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
};

const moveSelection = (selection, grid, dx, dy, extend) => {
  if (extend) return normalizeOrcaSelection({ ...selection, width: selection.width + dx, height: selection.height + dy }, grid);
  return normalizeOrcaSelection({ x: selection.x + dx, y: selection.y + dy, width: 0, height: 0 }, grid);
};

const cleanGlyph = value => String(value || ".").slice(0, 1).replace(/[\r\n\t]/g, "") || ".";

export default function OrcaNode({
  nodeId,
  source,
  revision = 0,
  running = false,
  transportMode = "linked",
  transport,
  onPatch,
  onMidiEvents,
  onBlur,
  ariaLabel = "Orca grid",
}) {
  const manager = useMemo(() => getOrcaRuntimeManager(), []);
  const [runtime, setRuntime] = useState(() => ({ source: serializeOrcaGrid(parseOrcaGrid(source)), frame: 0, width: 32, height: 4 }));
  const [selection, setSelection] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [dragFrom, setDragFrom] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    manager.upsert({ nodeId, source, revision, running, transportMode, transport, onMidiEvents });
  }, [manager, nodeId, onMidiEvents, revision, running, source, transport?.bpm, transport?.playing, transportMode]);
  useEffect(() => manager.subscribe(nodeId, next => {
    setRuntime(next);
    setSelection(current => normalizeOrcaSelection(current, parseOrcaGrid(next.source)));
  }), [manager, nodeId]);

  const grid = useMemo(() => parseOrcaGrid(runtime.source), [runtime.source]);
  const normalizedSelection = useMemo(() => normalizeOrcaSelection(selection, grid), [selection, grid]);

  const commitSource = nextSource => {
    const normalized = serializeOrcaGrid(parseOrcaGrid(nextSource, { width: grid.width, height: grid.height }));
    manager.patchSource(nodeId, normalized);
    onPatch?.({ source: normalized });
  };

  const tick = () => manager.tick(nodeId);

  const shouldTick = running && (transportMode === "free" || transport?.playing);

  const writeGlyph = glyph => {
    const value = cleanGlyph(glyph);
    const nextSource = patchOrcaSelection(runtime.source, normalizedSelection, value, { width: grid.width, height: grid.height });
    commitSource(nextSource);
    if (normalizedSelection.width === 0 && normalizedSelection.height === 0 && value !== ".") {
      setSelection(current => moveSelection(current, grid, 1, 0, false));
    }
  };

  const handleKeyDown = event => {
    // Orca owns its focus completely: none of these key presses may reach
    // Excalidraw's shortcut, selection, nudge, or text-entry handlers.
    event.stopPropagation();
    const command = event.metaKey || event.ctrlKey;
    const key = event.key;
    if (command && key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection({ x: 0, y: 0, width: grid.width - 1, height: grid.height - 1 });
      return;
    }
    if (command && key.toLowerCase() === "c") {
      event.preventDefault();
      const bounds = selectionBounds(normalizedSelection);
      const copied = grid.cells.slice(bounds.minY, bounds.maxY + 1).map(row => row.slice(bounds.minX, bounds.maxX + 1).join("")).join("\n");
      void navigator.clipboard?.writeText?.(copied);
      return;
    }
    if (command && key.toLowerCase() === "v") {
      event.preventDefault();
      void navigator.clipboard?.readText?.().then(text => {
        if (!text) return;
        const lines = text.replace(/\r/g, "").split("\n");
        let nextSource = runtime.source;
        lines.forEach((line, row) => Array.from(line).forEach((glyph, column) => {
          nextSource = patchOrcaCell(nextSource, normalizedSelection.x + column, normalizedSelection.y + row, glyph, { width: grid.width, height: grid.height });
        }));
        commitSource(nextSource);
      });
      return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (direction) {
      event.preventDefault();
      setSelection(current => moveSelection(current, grid, direction[0], direction[1], event.shiftKey));
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      writeGlyph(".");
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      rootRef.current?.blur();
      return;
    }
    if ((key === "Enter" || key === " ") && (command || event.altKey)) {
      event.preventDefault();
      tick();
      return;
    }
    if (key.length === 1 && !command && !event.altKey) {
      event.preventDefault();
      writeGlyph(key);
    }
  };

  const selectCell = (x, y, extend = false) => {
    setSelection(current => extend
      ? normalizeOrcaSelection({ ...current, width: x - current.x, height: y - current.y }, grid)
      : { x, y, width: 0, height: 0 });
  };

  return <div
    className="orca-node"
    ref={rootRef}
    tabIndex={0}
    role="application"
    aria-label={ariaLabel}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) onBlur?.(event);
    }}
    onKeyDown={handleKeyDown}
    onPointerDown={event => event.stopPropagation()}
  >
    <header className="orca-node-header" onPointerDown={event => event.stopPropagation()}>
      <span>ORCΛ</span>
      <span>{runtime.frame}f</span>
      <span>{shouldTick ? "running" : running ? "paused" : "stopped"}</span>
      <button type="button" onClick={event => { event.stopPropagation(); tick(); }} title="Run one Orca frame">Step</button>
    </header>
    <div className="orca-node-grid" style={{ gridTemplateColumns: `repeat(${grid.width}, minmax(0, 1fr))` }} onPointerUp={() => setDragFrom(null)} onPointerLeave={() => setDragFrom(null)}>
      {grid.cells.flatMap((row, y) => row.map((glyph, x) => <button
        type="button"
        key={`${x}:${y}`}
        className={`orca-node-cell${containsCell(normalizedSelection, x, y) ? " selected" : ""}${glyph === "*" ? " bang" : ""}`}
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          rootRef.current?.focus();
          setDragFrom({ x, y });
          selectCell(x, y, event.shiftKey);
        }}
        onPointerEnter={event => {
          if (!dragFrom || event.buttons !== 1) return;
          event.preventDefault();
          setSelection(normalizeOrcaSelection({ x: dragFrom.x, y: dragFrom.y, width: x - dragFrom.x, height: y - dragFrom.y }, grid));
        }}
        aria-label={`Orca cell ${x + 1}, ${y + 1}: ${glyph === "." ? "empty" : glyph}`}
      >{glyph === "." ? "·" : glyph}</button>))}
    </div>
    <footer className="orca-node-footer">{ORCA_OPERATOR_REFERENCE.map(([glyph, name]) => <span key={glyph}><b>{glyph}</b> {name}</span>)}</footer>
  </div>;
}
