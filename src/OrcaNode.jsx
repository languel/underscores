import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeOrcaSelection,
  normalizeOrcaGridSize,
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

const OrcaActionIcon = ({ type }) => {
  const paths = {
    play: <path d="m9 6 9 6-9 6V6Z" />,
    pause: <><rect x="7" y="6" width="3" height="12" rx="1" /><rect x="14" y="6" width="3" height="12" rx="1" /></>,
    step: <><path d="m7 6 8 6-8 6V6Z" /><path d="M18 6v12" /></>,
  };
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
};

const OrcaStatusIcon = ({ type }) => {
  const paths = {
    linked: <><path d="M9 7h6a4 4 0 0 1 0 8h-2" /><path d="M15 17H9a4 4 0 0 1 0-8h2" /><path d="m8 12 8 0" /></>,
    free: <><circle cx="12" cy="12" r="8" /><path d="m12 8 2.5 4-2.5 4-2.5-4L12 8Z" /></>,
    waiting: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    paused: <><rect x="7" y="6" width="3" height="12" rx="1" /><rect x="14" y="6" width="3" height="12" rx="1" /></>,
    stopped: <rect x="7" y="7" width="10" height="10" rx="1" />,
  };
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
};

export default function OrcaNode({
  nodeId,
  source,
  revision = 0,
  running = false,
  transportMode = "linked",
  transport,
  settings = {},
  onPatch,
  onMidiEvents,
  onToggleRun,
  onBlur,
  focusRequest = 0,
  ariaLabel = "Orca grid",
}) {
  const manager = useMemo(() => getOrcaRuntimeManager(), []);
  const gridSize = useMemo(() => normalizeOrcaGridSize({ width: settings.orcaGridWidth, height: settings.orcaGridHeight }), [settings.orcaGridHeight, settings.orcaGridWidth]);
  const [runtime, setRuntime] = useState(() => ({
    source: serializeOrcaGrid(parseOrcaGrid(source, gridSize)),
    frame: 0,
    width: gridSize.width,
    height: gridSize.height,
  }));
  const [selection, setSelection] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [dragFrom, setDragFrom] = useState(null);
  const rootRef = useRef(null);
  const gridRef = useRef(null);
  const [gridBounds, setGridBounds] = useState({ width: 0, height: 0 });
  const onMidiEventsRef = useRef(onMidiEvents);
  useEffect(() => {
    onMidiEventsRef.current = onMidiEvents;
  }, [onMidiEvents]);
  // The canvas overlay creates a small callback wrapper for each node. Keep
  // that changing wrapper out of the runtime effect dependencies: score-time
  // renders must not tear down and restart the Orca interval before it can
  // produce its next linked frame.
  const onMidiEventsProxy = useCallback((events, metadata) => {
    onMidiEventsRef.current?.(events, metadata);
  }, []);
  const transportSnapshot = useMemo(() => ({
    playing: Boolean(transport?.playing),
    bpm: Number(transport?.bpm) || 120,
  }), [transport?.bpm, transport?.playing]);

  useEffect(() => {
    manager.upsert({ nodeId, source, revision, running, transportMode, transport: transportSnapshot, loopFrames: settings.orcaLoopFrames, gridWidth: gridSize.width, gridHeight: gridSize.height, onMidiEvents: onMidiEventsProxy });
  }, [gridSize.height, gridSize.width, manager, nodeId, onMidiEventsProxy, revision, running, settings.orcaLoopFrames, source, transportMode, transportSnapshot]);
  useEffect(() => manager.subscribe(nodeId, next => {
    setRuntime(next);
    setSelection(current => normalizeOrcaSelection(current, parseOrcaGrid(next.source, { width: next.width, height: next.height })));
  }), [manager, nodeId]);
  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.requestAnimationFrame(() => rootRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);
  useEffect(() => {
    const gridElement = gridRef.current;
    if (!gridElement) return undefined;
    const measure = () => setGridBounds({ width: gridElement.clientWidth, height: gridElement.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(gridElement);
    return () => observer.disconnect();
  }, []);

  const grid = useMemo(() => parseOrcaGrid(runtime.source, { width: runtime.width, height: runtime.height }), [runtime.height, runtime.source, runtime.width]);
  const normalizedSelection = useMemo(() => normalizeOrcaSelection(selection, grid), [selection, grid]);
  const shouldTick = running && (transportMode === "free" || transport?.playing);
  const density = settings.orcaDensity === "spacious" ? "spacious" : "compact";
  const fitFrame = settings.orcaGridFit !== false;
  const showGridGuide = settings.orcaGridGuide === true;
  const fittedCellSize = fitFrame && gridBounds.width > 0 && gridBounds.height > 0
    ? Math.max(8, Math.min((gridBounds.width - 8) / Math.max(1, grid.width), (gridBounds.height - 8) / Math.max(1, grid.height)))
    : null;
  const playColumn = shouldTick ? runtime.frame % Math.max(1, grid.width) : -1;
  const clockStatus = shouldTick
    ? (transportMode === "linked" ? "linked" : "free")
    : running
      ? (transportMode === "linked" ? "waiting" : "paused")
      : "stopped";
  const clockStatusLabel = {
    linked: "Linked clock",
    free: "Free clock",
    waiting: "Waiting for transport",
    paused: "Paused",
    stopped: "Stopped",
  }[clockStatus];

  const commitSource = nextSource => {
    const normalized = serializeOrcaGrid(parseOrcaGrid(nextSource, { width: grid.width, height: grid.height }));
    manager.patchSource(nodeId, normalized);
    onPatch?.({ source: normalized });
  };

  const tick = () => manager.tick(nodeId);

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
    className={`orca-node orca-density-${density}${fitFrame ? " orca-grid-fit" : ""}`}
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
      <span className="orca-node-frame" title="Current Orca frame">{runtime.frame}f</span>
      <span className={`orca-node-status orca-status-${clockStatus}`} role="status" aria-live="polite" aria-label={clockStatusLabel} title={clockStatusLabel}><OrcaStatusIcon type={clockStatus} /></span>
      <div className="orca-node-actions">
        <button type="button" onClick={event => { event.stopPropagation(); onToggleRun?.(); }} title={running ? "Stop Orca" : "Run Orca"} aria-label={running ? "Stop Orca" : "Run Orca"}><OrcaActionIcon type={running ? "pause" : "play"} /></button>
        <button type="button" onClick={event => { event.stopPropagation(); tick(); }} title="Run one Orca frame" aria-label="Run one Orca frame"><OrcaActionIcon type="step" /></button>
      </div>
    </header>
    <div
      className={`orca-node-grid${showGridGuide ? " orca-grid-guide" : ""}`}
      ref={gridRef}
      style={{
        "--orca-cell-size": fittedCellSize ? `${fittedCellSize}px` : undefined,
        gridTemplateColumns: fitFrame || density === "compact" ? `repeat(${grid.width}, var(--orca-cell-size))` : `repeat(${grid.width}, minmax(1.1em, 1fr))`,
        gridTemplateRows: fitFrame || density === "compact" ? `repeat(${grid.height}, var(--orca-cell-size))` : `repeat(${grid.height}, minmax(1.1em, 1fr))`,
      }}
      onPointerUp={() => setDragFrom(null)}
      onPointerLeave={() => setDragFrom(null)}
    >
      {grid.cells.flatMap((row, y) => row.map((glyph, x) => <button
        type="button"
        key={`${x}:${y}`}
        className={`orca-node-cell${containsCell(normalizedSelection, x, y) ? " selected" : ""}${glyph === "*" ? " bang" : ""}${x === playColumn ? " playhead" : ""}`}
        tabIndex={-1}
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          rootRef.current?.focus();
          setDragFrom({ x, y });
          selectCell(x, y, event.shiftKey);
        }}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          rootRef.current?.focus();
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
  </div>;
}
