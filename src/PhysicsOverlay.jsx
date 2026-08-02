import { memo, useEffect, useRef } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import { normalizeRelationshipGraph, normalizePhysicsEndpoint } from "./relationshipGraph.js";
import { resolvePhysicsEndpoint } from "./physicsGeometry.js";

const selectedEndpoint = (endpointValue, selectedIds) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  return endpoint && !["world", "stream"].includes(endpoint.kind) && selectedIds.has(endpoint.objectRef.elementId);
};

const PhysicsOverlay = memo(function PhysicsOverlay({ runtime, graph: graphValue, appState, elements = [], selectedElementIds = {}, showAllRelationships = false, onRenderMetric = null }) {
  const canvasRef = useRef(null);
  const propsRef = useRef({ runtime, graphValue, appState, elements, selectedElementIds, showAllRelationships, onRenderMetric });
  propsRef.current = { runtime, graphValue, appState, elements, selectedElementIds, showAllRelationships, onRenderMetric };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container || !runtime) return undefined;
    let frame = 0;
    let stopped = false;
    let width = 1;
    let height = 1;
    let ratio = 1;
    let lastMetricAt = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const targetWidth = Math.round(width * ratio);
      const targetHeight = Math.round(height * ratio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    };

    const drawBody = (context, metadata, x, y, angle, toViewport, zoom) => {
      if (metadata.tracking !== "runtime-lite") return;
      const point = toViewport([x, y]);
      const collider = metadata.collider || {};
      context.save();
      context.translate(point[0], point[1]);
      context.rotate(angle);
      context.globalAlpha = Math.max(0, Math.min(1, Number(metadata.render?.opacity) || 1));
      context.fillStyle = metadata.render?.fill || "#4f8cff";
      context.strokeStyle = metadata.render?.stroke || "transparent";
      context.lineWidth = Math.max(0.5, Number(metadata.render?.strokeWidth) || 0) * zoom;
      context.beginPath();
      if (collider.kind === "circle") {
        context.arc(0, 0, Math.max(0.5, collider.radius * zoom), 0, Math.PI * 2);
      } else if (collider.kind === "convex" && collider.points?.length) {
        collider.points.forEach((value, index) => {
          const px = value[0] * zoom;
          const py = value[1] * zoom;
          if (index) context.lineTo(px, py); else context.moveTo(px, py);
        });
        context.closePath();
      } else {
        context.rect(-(collider.width || 12) * zoom / 2, -(collider.height || 12) * zoom / 2, (collider.width || 12) * zoom, (collider.height || 12) * zoom);
      }
      context.fill();
      if (metadata.render?.stroke && metadata.render.stroke !== "transparent") context.stroke();
      context.restore();
    };

    const drawRelationships = (context, graph, currentElements, selectedIds, showAll, toViewport) => {
      const selected = new Set(Object.keys(selectedIds || {}).filter(key => selectedIds[key]));
      context.save();
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      for (const constraint of graph.constraints) {
        if (!constraint.enabled || (!showAll && !selectedEndpoint(constraint.a, selected) && !selectedEndpoint(constraint.b, selected))) continue;
        const a = resolvePhysicsEndpoint(constraint.a, { elements: currentElements });
        const b = resolvePhysicsEndpoint(constraint.b, { elements: currentElements });
        if (!a.ok || !b.ok) continue;
        const start = toViewport(a.point);
        const end = toViewport(b.point);
        context.beginPath();
        context.moveTo(start[0], start[1]);
        context.lineTo(end[0], end[1]);
        context.strokeStyle = constraint.kind === "attractor" ? "#d66fca" : "#647ce5";
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = context.strokeStyle;
        context.fillRect(start[0] - 3, start[1] - 3, 6, 6);
        context.fillRect(end[0] - 3, end[1] - 3, 6, 6);
        context.setLineDash([5, 4]);
      }
      context.restore();
    };

    const draw = () => {
      if (stopped) return;
      const started = performance.now();
      resize();
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const { appState: currentAppState, graphValue: currentGraph, elements: currentElements, selectedElementIds: selectedIds, showAllRelationships: showAll } = propsRef.current;
      if (currentAppState) {
        const rect = container.getBoundingClientRect();
        const zoom = Number(currentAppState.zoom?.value) || 1;
        const toViewport = point => {
          const value = sceneCoordsToViewportCoords({ sceneX: point[0], sceneY: point[1] }, currentAppState);
          return [value.x - rect.left, value.y - rect.top];
        };
        for (const snapshot of runtime.getLatestPoses()) {
          const values = snapshot.values;
          for (let index = 0; index < snapshot.metadata.length; index += 1) {
            drawBody(context, snapshot.metadata[index], values[index * 4], values[index * 4 + 1], values[index * 4 + 2], toViewport, zoom);
          }
        }
        drawRelationships(context, normalizeRelationshipGraph(currentGraph), currentElements, selectedIds, showAll, toViewport);
      }
      if (started - lastMetricAt >= 200) {
        propsRef.current.onRenderMetric?.(performance.now() - started);
        lastMetricAt = started;
      }
      frame = requestAnimationFrame(draw);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(container);
    frame = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [runtime]);

  return <canvas ref={canvasRef} className="drawerator-physics-overlay" aria-hidden="true" />;
});

export default PhysicsOverlay;
