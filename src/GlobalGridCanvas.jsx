import { memo, useEffect, useRef } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import { createVisibleGridLines, normalizeGlobalGrid } from "./gridSystem.js";

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const grid = normalizeGlobalGrid(gridValue);
    if (!canvas || !container || !appState || !grid.appearance.visible) {
      const context = canvas?.getContext("2d");
      context?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
      return undefined;
    }

    let frame = 0;
    const draw = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const topLeft = viewportCoordsToSceneCoords({ clientX: rect.left, clientY: rect.top }, appState);
      const bottomRight = viewportCoordsToSceneCoords({ clientX: rect.right, clientY: rect.bottom }, appState);
      const lines = createVisibleGridLines(grid, {
        minX: Math.min(topLeft.x, bottomRight.x),
        minY: Math.min(topLeft.y, bottomRight.y),
        maxX: Math.max(topLeft.x, bottomRight.x),
        maxY: Math.max(topLeft.y, bottomRight.y),
      }, { zoom: appState.zoom?.value || 1, maxLines: 240 });

      const snapping = grid.snap.mode !== "off";
      context.setLineDash(snapping ? [] : [1, 4]);
      context.lineCap = snapping ? "square" : "round";
      for (const line of lines) {
        const start = sceneCoordsToViewportCoords({ sceneX: line.start[0], sceneY: line.start[1] }, appState);
        const end = sceneCoordsToViewportCoords({ sceneX: line.end[0], sceneY: line.end[1] }, appState);
        context.beginPath();
        context.moveTo(start.x - rect.left, start.y - rect.top);
        context.lineTo(end.x - rect.left, end.y - rect.top);
        context.strokeStyle = lineColor(color, theme, line.type, grid.appearance.opacity);
        context.lineWidth = line.type === "axis" ? 1.35 : line.type === "major" ? 1 : 0.7;
        context.stroke();
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(container);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [appState, color, gridValue, renderNonce, theme]);

  return <canvas ref={canvasRef} className="underscores-global-grid-canvas" aria-hidden="true" />;
});

export default GlobalGridCanvas;
