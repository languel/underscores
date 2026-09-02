import { memo, useEffect, useRef } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import { createVisibleGridIntersections, createVisibleGridLines, normalizeGlobalGrid } from "./gridSystem.js";

const lineColor = (color, theme, type, opacity) => {
  const normalized = String(color || "").replace("#", "");
  const channels = /^[0-9a-f]{6}$/i.test(normalized)
    ? [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16)).join(", ")
    : theme === "dark" ? "238, 240, 244" : "42, 46, 52";
  const weight = type === "axis" ? 0.72 : type === "major" ? 0.42 : 0.2;
  return `rgba(${channels}, ${Math.min(0.82, opacity * weight)})`;
};

const GlobalGridCanvas = memo(function GlobalGridCanvas({ grid: gridValue, appState, theme, color, renderNonce }) {
  const canvasRef = useRef(null);
  const latestRef = useRef(null);
  const scheduleRef = useRef(null);
  latestRef.current = { appState, color, gridValue, theme };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return undefined;

    let frame = 0;
    const draw = () => {
      frame = 0;
      const current = latestRef.current || {};
      const currentAppState = current.appState;
      const grid = normalizeGlobalGrid(current.gridValue);
      const context = canvas.getContext("2d");
      if (!currentAppState || !grid.appearance.visible) {
        context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        return;
      }
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const backingWidth = Math.round(width * ratio);
      const backingHeight = Math.round(height * ratio);
      // Assigning either canvas dimension clears and reallocates the entire
      // backing store, even when the value is unchanged. Camera navigation can
      // redraw the grid every frame, so guard these writes carefully.
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      if (canvas.style.width !== `${width}px`) canvas.style.width = `${width}px`;
      if (canvas.style.height !== `${height}px`) canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const topLeft = viewportCoordsToSceneCoords({ clientX: rect.left, clientY: rect.top }, currentAppState);
      const bottomRight = viewportCoordsToSceneCoords({ clientX: rect.right, clientY: rect.bottom }, currentAppState);
      const viewport = {
        minX: Math.min(topLeft.x, bottomRight.x),
        minY: Math.min(topLeft.y, bottomRight.y),
        maxX: Math.max(topLeft.x, bottomRight.x),
        maxY: Math.max(topLeft.y, bottomRight.y),
      };

      const snapping = grid.snap.mode !== "off";
      const useUnsnappedDots = !snapping && grid.appearance.unsnappedDots;
      if (useUnsnappedDots) {
        const intersections = createVisibleGridIntersections(grid, viewport, { zoom: currentAppState.zoom?.value || 1, maxLines: 240 });
        const groups = { minor: [], major: [], axis: [] };
        intersections.forEach(intersection => groups[intersection.type]?.push(intersection));
        for (const type of ["minor", "major", "axis"]) {
          if (!groups[type].length) continue;
          context.beginPath();
          for (const intersection of groups[type]) {
            const point = sceneCoordsToViewportCoords({ sceneX: intersection.point[0], sceneY: intersection.point[1] }, currentAppState);
            const radius = type === "axis" ? 1.7 : type === "major" ? 1.35 : 1;
            const x = point.x - rect.left;
            const y = point.y - rect.top;
            context.moveTo(x + radius, y);
            context.arc(x, y, radius, 0, Math.PI * 2);
          }
          context.fillStyle = lineColor(current.color, current.theme, type, grid.appearance.opacity);
          context.fill();
        }
        return;
      }
      const lines = createVisibleGridLines(grid, viewport, { zoom: currentAppState.zoom?.value || 1, maxLines: 240 });
      context.setLineDash(snapping ? [] : [1, 4]);
      context.lineCap = snapping ? "square" : "round";
      const groups = { minor: [], major: [], axis: [] };
      lines.forEach(line => groups[line.type]?.push(line));
      for (const type of ["minor", "major", "axis"]) {
        if (!groups[type].length) continue;
        context.beginPath();
        for (const line of groups[type]) {
          const start = sceneCoordsToViewportCoords({ sceneX: line.start[0], sceneY: line.start[1] }, currentAppState);
          const end = sceneCoordsToViewportCoords({ sceneX: line.end[0], sceneY: line.end[1] }, currentAppState);
          context.moveTo(start.x - rect.left, start.y - rect.top);
          context.lineTo(end.x - rect.left, end.y - rect.top);
        }
        context.strokeStyle = lineColor(current.color, current.theme, type, grid.appearance.opacity);
        context.lineWidth = type === "axis" ? 1.35 : type === "major" ? 1 : 0.7;
        context.stroke();
      }
    };
    const schedule = () => {
      if (frame) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    scheduleRef.current = schedule;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(container);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    scheduleRef.current?.();
  }, [appState, color, gridValue, renderNonce, theme]);

  return <canvas ref={canvasRef} className="underscores-global-grid-canvas" aria-hidden="true" />;
});

export default GlobalGridCanvas;
