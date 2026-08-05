import { memo, useEffect, useRef } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import { normalizeRelationshipGraph, normalizePhysicsEndpoint } from "./relationshipGraph.js";
import { getPhysicsElementCenter, resolvePhysicsEndpoint } from "./physicsGeometry.js";

const selectedEndpoint = (endpointValue, selectedIds) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  return endpoint && !["world", "stream"].includes(endpoint.kind) && selectedIds.has(endpoint.objectRef.elementId);
};

const PhysicsOverlay = memo(function PhysicsOverlay({ runtime, graph: graphValue, appState, elements = [], getLiveScene = null, selectedElementIds = {}, showAllRelationships = false, debug = null, onRenderMetric = null }) {
  const canvasRef = useRef(null);
  const debugEventsRef = useRef([]);
  const propsRef = useRef({ runtime, graphValue, appState, elements, getLiveScene, selectedElementIds, showAllRelationships, debug, onRenderMetric });
  propsRef.current = { runtime, graphValue, appState, elements, getLiveScene, selectedElementIds, showAllRelationships, debug, onRenderMetric };

  useEffect(() => {
    if (!runtime || !debug?.enabled || (!debug.contacts && !debug.collisions && !debug.forces)) {
      debugEventsRef.current = [];
      return undefined;
    }
    const captureEvents = events => {
      const now = performance.now();
      const next = [...debugEventsRef.current, ...(events || []).map(event => ({ ...event, receivedAt: now }))]
        .filter(event => now - event.receivedAt < 900)
        .slice(-96);
      debugEventsRef.current = next;
    };
    const stopEvents = runtime.subscribe("events", captureEvents);
    const stopPreviewEvents = runtime.subscribe("preview.events", captureEvents);
    return () => {
      stopEvents();
      stopPreviewEvents();
    };
  }, [runtime, debug?.enabled, debug?.contacts, debug?.collisions, debug?.forces]);

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

    const traceCollider = (context, collider, zoom) => {
      const skin = Math.max(0, Number(collider.contactSkin) || 0);
      if (collider.kind === "circle") {
        context.arc(0, 0, Math.max(0.5, (collider.radius + skin) * zoom), 0, Math.PI * 2);
      } else if (collider.kind === "ellipse") {
        context.ellipse(
          0,
          0,
          Math.max(0.5, ((collider.width || 1) / 2 + skin) * zoom),
          Math.max(0.5, ((collider.height || 1) / 2 + skin) * zoom),
          0,
          0,
          Math.PI * 2,
        );
      } else if (["convex", "polyline", "chain"].includes(collider.kind) && collider.points?.length) {
        if (["polyline", "chain"].includes(collider.kind)) {
          context.lineWidth = Math.max(1, ((collider.thickness || 2) + skin * 2) * zoom);
          context.lineCap = "round";
          context.lineJoin = "round";
        }
        collider.points.forEach((value, index) => {
          const px = value[0] * zoom;
          const py = value[1] * zoom;
          if (index) context.lineTo(px, py); else context.moveTo(px, py);
        });
        if (collider.kind === "convex") context.closePath();
      } else {
        context.rect(
          -((collider.width || 12) / 2 + skin) * zoom,
          -((collider.height || 12) / 2 + skin) * zoom,
          ((collider.width || 12) + skin * 2) * zoom,
          ((collider.height || 12) + skin * 2) * zoom,
        );
      }
    };

    const drawDebugBodies = (context, snapshots, currentElements, graph, toViewport, zoom, settings) => {
      if (!settings.bodies && !settings.colliders && !settings.labels) return;
      const elementById = new Map(currentElements.filter(element => element && !element.isDeleted).map(element => [element.id, element]));
      context.save();
      context.lineWidth = 1;
      for (const snapshot of snapshots) {
        const { metadata = [], values } = snapshot;
        const useAuthoredPose = graph.world.pausedEditMode === "author" && !runtime.isPlaying(snapshot.systemId);
        for (let index = 0; index < metadata.length; index += 1) {
          const metadataEntry = metadata[index];
          const element = metadataEntry.objectRef?.kind === "element" ? elementById.get(metadataEntry.objectRef.elementId) : null;
          const pose = useAuthoredPose && element
            ? [...getPhysicsElementCenter(element), Number(element.angle) || 0]
            : [values[index * 4], values[index * 4 + 1], values[index * 4 + 2]];
          const point = toViewport(pose);
          const collider = metadataEntry.collider || {};
          context.save();
          context.translate(point[0], point[1]);
          context.rotate(pose[2]);
          if (settings.bodies) {
            context.strokeStyle = metadataEntry.bodyType === "fixed" ? "rgba(149, 157, 173, 0.9)" : "rgba(81, 142, 255, 0.9)";
            context.setLineDash([4, 3]);
            context.strokeRect(-4, -4, 8, 8);
            context.setLineDash([]);
          }
          if (settings.colliders) {
            context.beginPath();
            traceCollider(context, collider, zoom);
            context.strokeStyle = metadataEntry.sensor ? "rgba(211, 112, 194, 0.95)" : "rgba(97, 213, 177, 0.95)";
            context.stroke();
          }
          context.restore();
          if (settings.labels) {
            context.fillStyle = "rgba(109, 183, 255, 0.96)";
            context.font = "10px monospace";
            context.fillText(metadataEntry.instanceId || metadataEntry.bodyId || metadataEntry.id, point[0] + 6, point[1] - 6);
          }
        }
      }
      context.restore();
    };

    const drawDebugConstraints = (context, graph, currentElements, toViewport, settings) => {
      if (!settings.constraints) return;
      context.save();
      context.lineWidth = 1;
      for (const constraint of graph.constraints) {
        if (!constraint.enabled) continue;
        const a = resolvePhysicsEndpoint(constraint.a, { elements: currentElements });
        const b = resolvePhysicsEndpoint(constraint.b, { elements: currentElements });
        if (!a.ok || !b.ok) continue;
        const start = toViewport(a.point);
        const end = toViewport(b.point);
        context.strokeStyle = constraint.kind === "attractor" ? "rgba(224, 111, 202, 0.95)" : "rgba(255, 190, 80, 0.95)";
        context.setLineDash(constraint.kind === "spring" ? [2, 3] : [6, 3]);
        context.beginPath();
        context.moveTo(start[0], start[1]);
        context.lineTo(end[0], end[1]);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = context.strokeStyle;
        context.fillRect(start[0] - 2, start[1] - 2, 4, 4);
        context.fillRect(end[0] - 2, end[1] - 2, 4, 4);
      }
      context.restore();
    };

    const drawDebugEvents = (context, toViewport, settings) => {
      if (!settings.contacts && !settings.collisions && !settings.forces) return;
      const now = performance.now();
      const events = debugEventsRef.current.filter(event => now - event.receivedAt < 900);
      debugEventsRef.current = events;
      context.save();
      for (const event of events) {
        if (!event.point) continue;
        const age = (now - event.receivedAt) / 900;
        const point = toViewport(event.point);
        const alpha = Math.max(0, 1 - age);
        const isImpact = event.phase === "hit" || event.phase === "begin";
        if (settings.contacts) {
          context.fillStyle = isImpact ? `rgba(97, 213, 177, ${alpha})` : `rgba(151, 214, 255, ${alpha})`;
          context.beginPath();
          context.arc(point[0], point[1], 3, 0, Math.PI * 2);
          context.fill();
        }
        if (settings.collisions && isImpact) {
          context.strokeStyle = `rgba(255, 120, 103, ${alpha})`;
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(point[0], point[1], 4 + age * 18, 0, Math.PI * 2);
          context.stroke();
        }
        if (settings.forces && event.normal) {
          const length = Math.min(72, Math.max(10, Number(event.impulse || 0) * 10));
          context.strokeStyle = `rgba(255, 208, 94, ${alpha})`;
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(point[0], point[1]);
          context.lineTo(point[0] + event.normal[0] * length, point[1] + event.normal[1] * length);
          context.stroke();
        }
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
      const { appState: currentAppState, graphValue: currentGraph, elements: currentElements, getLiveScene, selectedElementIds: selectedIds, showAllRelationships: showAll, debug: debugSettings } = propsRef.current;
      // The p5 overlay snapshot intentionally updates at a lower cadence. That
      // is ideal for regular runtime rendering, but a diagnostic must track a
      // dragged object and camera exactly. When debug is on, read the current
      // Excalidraw scene directly for the authoritative transform/geometry.
      const liveScene = debugSettings?.enabled ? getLiveScene?.() : null;
      const diagnosticAppState = liveScene?.appState || currentAppState;
      const diagnosticElements = Array.isArray(liveScene?.elements) ? liveScene.elements : currentElements;
      if (diagnosticAppState) {
        const rect = container.getBoundingClientRect();
        const zoom = Number(diagnosticAppState.zoom?.value) || 1;
        const toViewport = point => {
          const value = sceneCoordsToViewportCoords({ sceneX: point[0], sceneY: point[1] }, diagnosticAppState);
          return [value.x - rect.left, value.y - rect.top];
        };
        const snapshots = runtime.getLatestPoses();
        for (const snapshot of snapshots) {
          const values = snapshot.values;
          for (let index = 0; index < snapshot.metadata.length; index += 1) {
            drawBody(context, snapshot.metadata[index], values[index * 4], values[index * 4 + 1], values[index * 4 + 2], toViewport, zoom);
          }
        }
        drawRelationships(context, normalizeRelationshipGraph(currentGraph), diagnosticElements, selectedIds, showAll, toViewport);
        if (debugSettings?.enabled) {
          const graph = normalizeRelationshipGraph(currentGraph);
          drawDebugBodies(context, snapshots, diagnosticElements, graph, toViewport, zoom, debugSettings);
          drawDebugConstraints(context, graph, diagnosticElements, toViewport, debugSettings);
          drawDebugEvents(context, toViewport, debugSettings);
        }
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
