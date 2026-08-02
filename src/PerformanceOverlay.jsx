import React, { useEffect, useState, useSyncExternalStore } from "react";
import { draweratorPerformanceMonitor } from "./performanceMonitor.js";

const rating = fps => fps >= 55 ? "good" : fps >= 40 ? "warn" : "poor";

export default function PerformanceOverlay({ placement = "floating", onPlacementChange, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const snapshot = useSyncExternalStore(
    draweratorPerformanceMonitor.subscribe,
    draweratorPerformanceMonitor.getSnapshot,
    draweratorPerformanceMonitor.getSnapshot,
  );
  useEffect(() => {
    draweratorPerformanceMonitor.setEnabled(true);
    return () => draweratorPerformanceMonitor.setEnabled(false);
  }, []);
  const attached = placement === "console";
  return (
    <aside className={`drawerator-performance-overlay ${attached ? "console" : "floating"} ${expanded ? "expanded" : ""}`} aria-label="Performance monitor">
      <button type="button" className={`performance-fps ${rating(snapshot.fps)}`} onClick={() => setExpanded(value => !value)} title="Browser animation-frame rate. Click for workload details.">
        <strong>{snapshot.fps || "–"}</strong><span>FPS</span>
      </button>
      {expanded && <>
        <span title="Average browser animation-frame duration">{snapshot.frameMs || "–"} ms</span>
        <span title="Frames longer than 34 ms in the last sample">{snapshot.longFrames} long</span>
        <span title="Live Excalidraw scene objects">{snapshot.elements} objects</span>
        <span title="Changed scene elements per second">{snapshot.changedElements}/s changed</span>
        <span title="Scene change callbacks per second">{snapshot.sceneChanges}/s scene</span>
        {(snapshot.svg || snapshot.livecode || snapshot.media || snapshot.images) > 0 && <span title="First-class and baked object counts">{snapshot.images} img · {snapshot.svg} svg · {snapshot.livecode} live · {snapshot.media} media</span>}
        {snapshot.physicsBodies > 0 && <>
          <span title="Physics runtime bodies">{snapshot.physicsBodies} physics</span>
          <span title="Worker solver step and event-route cost">{snapshot.physicsStepMs.toFixed(2)} ms step · {snapshot.physicsRouteMs.toFixed(2)} ms route</span>
          <span title="Physics event rate and dropped events">{snapshot.physicsEvents.toFixed(1)}/s events · {snapshot.physicsDropped} dropped</span>
        </>}
        {snapshot.memoryMb !== null && <span title="Chromium JavaScript heap usage">{snapshot.memoryMb} MB heap</span>}
      </>}
      <button type="button" className="performance-dock" onClick={() => onPlacementChange?.(attached ? "floating" : "console")} title={attached ? "Float performance monitor over the canvas" : "Attach performance monitor to Console"}>{attached ? "↗" : "⌄"}</button>
      <button type="button" className="performance-close" onClick={onClose} title="Close performance monitor">×</button>
    </aside>
  );
}
