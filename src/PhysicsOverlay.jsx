import { memo, useEffect, useRef } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import { normalizeRelationshipGraph, normalizePhysicsEndpoint } from "./relationshipGraph.js";
import { getPhysicsElementCenter, resolvePhysicsEndpointAtPose } from "./physicsGeometry.js";
import { getScoreData } from "./iannixEngine.js";

// Keep debug labels aligned with the Outliner naming order. Physics IDs are
// useful as a last resort, but authored names should make the overlay readable
// without requiring users to cross-reference solver metadata.
const debugObjectLabel = (element, metadata = {}) => {
  if (element) {
    const scoreLabel = getScoreData(element)?.label;
    if (scoreLabel) return scoreLabel;
    const customLabel = element.customData?.underscoresLabel;
    if (customLabel) return customLabel;
    const livecodeName = element.customData?.underscoresLivecode?.name;
    if (livecodeName) return livecodeName;
    const mediaName = element.customData?.underscoresMediaStream?.name;
    if (mediaName) return mediaName;
    return element.id;
  }
  return metadata.label || metadata.name || metadata.instanceId || metadata.bodyId || metadata.id || "Physics body";
};

const parseCanvasColor = (candidate, colorContext) => {
  const source = String(candidate || "").trim();
  if (!source) return null;
  const hex = source.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    return {
      red: Number.parseInt(hex[1].slice(0, 2), 16),
      green: Number.parseInt(hex[1].slice(2, 4), 16),
      blue: Number.parseInt(hex[1].slice(4, 6), 16),
      alpha: hex[1].length === 8 ? Number.parseInt(hex[1].slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = source.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return {
      red: Number(rgb[1]),
      green: Number(rgb[2]),
      blue: Number(rgb[3]),
      alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  if (!colorContext) return null;
  const sentinel = "#010203";
  const previous = colorContext.fillStyle;
  colorContext.fillStyle = sentinel;
  colorContext.fillStyle = source;
  const resolved = String(colorContext.fillStyle || "");
  colorContext.fillStyle = previous;
  if (!resolved || resolved.toLowerCase() === sentinel) return null;
  return parseCanvasColor(resolved, null);
};

const themedObjectColor = (objectColor, theme, colorContext) => {
  const parsed = parseCanvasColor(objectColor, colorContext);
  if (!parsed) return null;
  if (theme !== "dark") return parsed;
  // Excalidraw applies a dark-mode filter to its authored canvas. Apply the
  // same transform to object-derived diagnostics so the overlay stays aligned
  // with the visible stroke instead of disappearing as black on dark canvas.
  const desired = [parsed.red, parsed.green, parsed.blue].map(channel => channel / 255);
  const invertAmount = 0.93;
  const invertScale = 1 - 2 * invertAmount;
  const beforeHue = desired.map(channel => (channel - invertAmount) / invertScale);
  const hue180 = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856],
  ];
  const transformed = hue180.map(row => row.reduce((sum, coefficient, index) => sum + coefficient * beforeHue[index], 0));
  return {
    red: Math.min(255, Math.max(0, transformed[0] * 255)),
    green: Math.min(255, Math.max(0, transformed[1] * 255)),
    blue: Math.min(255, Math.max(0, transformed[2] * 255)),
    alpha: parsed.alpha,
  };
};

const debugColor = (settings, key, fallback, alphaMultiplier = 1, objectColor = null, theme = "light", colorContext = null) => {
  const configured = String(settings?.colors?.[key] || fallback).trim();
  const objectMode = configured.toLowerCase() === "object";
  const parsed = objectMode
    ? themedObjectColor(String(objectColor || fallback).trim(), theme, colorContext)
    : parseCanvasColor(configured, colorContext);
  if (!parsed) return fallback;
  const { red, green, blue, alpha } = parsed;
  return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${Math.max(0, Math.min(1, alpha * alphaMultiplier))})`;
};

const selectedEndpoint = (endpointValue, selectedIds) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  return Boolean(
    endpoint
    && endpoint.objectRef?.kind === "element"
    && !["world", "stream"].includes(endpoint.kind)
    && selectedIds.has(endpoint.objectRef.elementId),
  );
};

const PhysicsOverlay = memo(function PhysicsOverlay({ runtime, graph: graphValue, appState, elements = [], getLiveScene = null, selectedElementIds = {}, showAllRelationships = false, debug = null, onRenderMetric = null, onDebugGeometry = null }) {
  const canvasRef = useRef(null);
  const debugEventsRef = useRef([]);
  const trailHistoryRef = useRef(new Map());
  const propsRef = useRef({ runtime, graphValue, appState, elements, getLiveScene, selectedElementIds, showAllRelationships, debug, onRenderMetric, onDebugGeometry });
  propsRef.current = { runtime, graphValue, appState, elements, getLiveScene, selectedElementIds, showAllRelationships, debug, onRenderMetric, onDebugGeometry };

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

    const drawRelationships = (context, graph, currentElements, selectedIds, showAll, toViewport, poseByBodyId) => {
      const selected = new Set(Object.keys(selectedIds || {}).filter(key => selectedIds[key]));
      context.save();
      context.lineWidth = 1;
      context.setLineDash([5, 4]);
      for (const constraint of graph.constraints) {
        if (!constraint.enabled || (!showAll && !selectedEndpoint(constraint.a, selected) && !selectedEndpoint(constraint.b, selected))) continue;
        const a = resolvePhysicsEndpointAtPose(constraint.a, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
        const b = resolvePhysicsEndpointAtPose(constraint.b, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
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

    const drawDebugBodies = (context, snapshots, currentElements, graph, toViewport, zoom, settings, theme) => {
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
          if (metadataEntry.objectRef?.kind === "element" && !element) continue;
          const pose = useAuthoredPose && element
            ? [...getPhysicsElementCenter(element), Number(element.angle) || 0]
            : [values[index * 4], values[index * 4 + 1], values[index * 4 + 2]];
          const point = toViewport(pose);
          const collider = metadataEntry.collider || {};
          context.save();
          context.translate(point[0], point[1]);
          context.rotate(pose[2]);
          if (settings.bodies) {
            context.strokeStyle = debugColor(settings, "bodies", "#518effe6", 1, element?.strokeColor, theme, context);
            context.setLineDash([4, 3]);
            context.strokeRect(-4, -4, 8, 8);
            context.setLineDash([]);
          }
          if (settings.colliders) {
            context.beginPath();
            traceCollider(context, collider, zoom);
            context.strokeStyle = debugColor(settings, "colliders", "#61d5b1f2", 1, element?.strokeColor, theme, context);
            context.stroke();
          }
          context.restore();
          if (settings.labels) {
            context.fillStyle = debugColor(settings, "labels", "#6db7ffff", 1, element?.strokeColor, theme, context);
            context.font = "10px monospace";
            context.fillText(debugObjectLabel(element, metadataEntry), point[0] + 6, point[1] - 6);
          }
        }
      }
      context.restore();
    };

    const drawDebugConstraints = (context, graph, currentElements, toViewport, settings, poseByBodyId, theme) => {
      if (!settings.constraints && !settings.labels) return;
      const elementById = new Map(currentElements.filter(element => element && !element.isDeleted).map(element => [element.id, element]));
      context.save();
      context.lineWidth = 1;
      for (const constraint of graph.constraints) {
        if (!constraint.enabled) continue;
        const pivot = constraint.objectRef?.kind === "element"
          ? elementById.get(constraint.objectRef.elementId)
          : null;
        if (constraint.objectRef?.kind === "element" && !pivot) continue;
        const a = resolvePhysicsEndpointAtPose(constraint.a, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
        const b = resolvePhysicsEndpointAtPose(constraint.b, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
        // A weld/axle may intentionally have one endpoint set to None when it
        // is being used as a visual attachment (for example a skin on a
        // dynamic skeleton). Draw the resolved endpoint as a marker instead
        // of dropping the whole constraint from the diagnostic overlay.
        const oneSided = !a.ok || !b.ok;
        if (oneSided && ![constraint.a?.kind, constraint.b?.kind].includes("none")) continue;
        if (!a.ok && !b.ok) continue;
        const anchor = a.ok ? a.point : b.point;
        const start = toViewport(a.ok ? a.point : anchor);
        const end = toViewport(b.ok ? b.point : anchor);
        if (settings.constraints) {
          const endpointElement = a.endpoint?.kind === "object"
            ? elementById.get(a.endpoint.objectRef?.elementId)
            : b.endpoint?.kind === "object" ? elementById.get(b.endpoint.objectRef?.elementId) : null;
          context.strokeStyle = debugColor(settings, "constraints", "#ffbe50f2", 1, endpointElement?.strokeColor, theme, context);
          if (oneSided) {
            context.setLineDash([]);
            context.beginPath();
            context.arc(start[0], start[1], 5, 0, Math.PI * 2);
            context.stroke();
          } else {
            context.setLineDash(constraint.kind === "spring" ? [2, 3] : [6, 3]);
            context.beginPath();
            context.moveTo(start[0], start[1]);
            context.lineTo(end[0], end[1]);
            context.stroke();
            context.setLineDash([]);
          }
          context.fillStyle = context.strokeStyle;
          context.fillRect(start[0] - 2, start[1] - 2, 4, 4);
          if (!oneSided) context.fillRect(end[0] - 2, end[1] - 2, 4, 4);
        }
        if (settings.labels) {
          const label = debugObjectLabel(pivot, {
            label: constraint.name || `${constraint.kind || "constraint"} constraint`,
            id: constraint.id,
          });
          context.fillStyle = debugColor(settings, "labels", "#6db7ffff", 1, pivot?.strokeColor, theme, context);
          context.font = "10px monospace";
          context.fillText(label, (start[0] + end[0]) / 2 + 6, (start[1] + end[1]) / 2 - 6);
        }
      }
      context.restore();
    };

    const drawDebugEvents = (context, toViewport, settings, currentElements, theme) => {
      if (!settings.contacts && !settings.collisions && !settings.forces) return;
      const now = performance.now();
      const events = debugEventsRef.current.filter(event => now - event.receivedAt < 900);
      debugEventsRef.current = events;
      const elementById = new Map(currentElements.filter(element => element && !element.isDeleted).map(element => [element.id, element]));
      context.save();
      for (const event of events) {
        if (!event.point) continue;
        const age = (now - event.receivedAt) / 900;
        const point = toViewport(event.point);
        const alpha = Math.max(0, 1 - age);
        const isImpact = event.phase === "hit" || event.phase === "begin";
        const eventElement = elementById.get(event.a?.objectRef?.elementId)
          || elementById.get(event.b?.objectRef?.elementId);
        const eventObjectColor = eventElement?.strokeColor;
        if (settings.contacts) {
          context.fillStyle = debugColor(settings, "contacts", "#61d5b1ff", alpha, eventObjectColor, theme, context);
          context.beginPath();
          context.arc(point[0], point[1], 3, 0, Math.PI * 2);
          context.fill();
        }
        if (settings.collisions && isImpact) {
          context.strokeStyle = debugColor(settings, "collisions", "#ff7867ff", alpha, eventObjectColor, theme, context);
          context.lineWidth = 1.5;
          context.beginPath();
          context.arc(point[0], point[1], 4 + age * 18, 0, Math.PI * 2);
          context.stroke();
        }
        if (settings.forces && event.normal) {
          const length = Math.min(72, Math.max(10, Number(event.impulse || 0) * 10));
          context.strokeStyle = debugColor(settings, "forces", "#ffd05eff", alpha, eventObjectColor, theme, context);
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(point[0], point[1]);
          context.lineTo(point[0] + event.normal[0] * length, point[1] + event.normal[1] * length);
          context.stroke();
        }
      }
      context.restore();
    };

    const drawTrails = (context, graph, snapshots, currentElements, poseByBodyId, toViewport) => {
      const now = performance.now() / 1000;
      const snapshotBySystemId = new Map(snapshots.map(snapshot => [snapshot.systemId, snapshot]));
      const active = new Map();
      for (const body of graph.bodies) {
        if (!body.enabled || body.trail?.enabled !== true) continue;
        const pose = poseByBodyId.get(body.id);
        if (!pose) continue;
        active.set(`body:${body.id}`, {
          point: [pose.x, pose.y],
          trail: body.trail,
          step: snapshotBySystemId.get(body.systemId)?.step ?? 0,
        });
      }
      for (const constraint of graph.constraints) {
        const supportsTrail = constraint.kind === "tracer"
          || ["axle", "pin", "revolute", "weld", "fixate"].includes(constraint.kind);
        if (!constraint.enabled || !supportsTrail || constraint.trail?.enabled !== true) continue;
        const endpoints = [["a", constraint.a], ["b", constraint.b]]
          .map(([side, endpoint]) => ({ side, resolved: resolvePhysicsEndpointAtPose(endpoint, {
            elements: currentElements,
            bodies: graph.bodies,
            poseByBodyId,
          }) }))
          .filter(endpoint => endpoint.resolved.ok);
        if (!endpoints.length) continue;
        for (const endpoint of endpoints) {
          active.set(`constraint:${constraint.id}:${endpoint.side}`, {
            point: endpoint.resolved.point,
            trail: constraint.trail,
            step: snapshotBySystemId.get(constraint.systemId)?.step ?? 0,
          });
        }
      }

      for (const [key, entry] of [...trailHistoryRef.current]) {
        if (!active.has(key)) trailHistoryRef.current.delete(key);
        else if (active.get(key).step < entry.lastStep) trailHistoryRef.current.delete(key);
      }

      for (const [key, source] of active) {
        const duration = Math.max(0.1, Number(source.trail.duration) || 4);
        const previous = trailHistoryRef.current.get(key) || { samples: [], lastStep: source.step };
        const last = previous.samples.at(-1);
        const moved = !last || Math.hypot(source.point[0] - last.x, source.point[1] - last.y) >= 0.15;
        const elapsed = !last || now - last.time >= 1 / 60;
        const samples = previous.samples.filter(sample => now - sample.time <= duration);
        if (moved && elapsed) samples.push({ x: source.point[0], y: source.point[1], time: now });
        trailHistoryRef.current.set(key, { samples: samples.slice(-7200), lastStep: source.step });
      }

      context.save();
      context.lineWidth = 1.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      const emitterSegments = [];
      for (const [key, source] of active) {
        const samples = trailHistoryRef.current.get(key)?.samples || [];
        const duration = Math.max(0.1, Number(source.trail.duration) || 4);
        const opacity = Math.max(0, Math.min(1, Number(source.trail.opacity) || 0));
        for (let index = 1; index < samples.length; index += 1) {
          emitterSegments.push([samples[index - 1].x, samples[index - 1].y, samples[index].x, samples[index].y]);
          const start = toViewport([samples[index - 1].x, samples[index - 1].y]);
          const end = toViewport([samples[index].x, samples[index].y]);
          const alpha = opacity * Math.max(0, Math.min(1, 1 - (now - samples[index].time) / duration));
          context.strokeStyle = debugColor({ colors: { trail: source.trail.color } }, "trail", "#4f8cff", alpha, null, "light", context);
          context.beginPath();
          context.moveTo(start[0], start[1]);
          context.lineTo(end[0], end[1]);
          context.stroke();
        }
        const head = toViewport(source.point);
        context.fillStyle = debugColor({ colors: { trail: source.trail.color } }, "trail", "#4f8cff", opacity, null, "light", context);
        context.beginPath();
        context.arc(head[0], head[1], key.startsWith("constraint:") ? 2.75 : 2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      return emitterSegments;
    };

    const collectDebugEmitterSegments = ({ settings, snapshots, graph, currentElements, poseByBodyId, zoom }) => {
      if (!settings?.enabled) return [];
      const segments = [];
      const appendLine = (start, end) => {
        if (segments.length >= 2048 || !start?.every(Number.isFinite) || !end?.every(Number.isFinite)) return;
        segments.push([start[0], start[1], end[0], end[1]]);
      };
      const appendPolyline = (points, closed = false) => {
        for (let index = 1; index < points.length; index += 1) appendLine(points[index - 1], points[index]);
        if (closed && points.length > 2) appendLine(points.at(-1), points[0]);
      };
      const appendCircle = (center, radius, count = 16) => {
        const points = Array.from({ length: count }, (_, index) => {
          const angle = index / count * Math.PI * 2;
          return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        });
        appendPolyline(points, true);
      };
      const transformLocal = (value, pose) => {
        const cosine = Math.cos(pose[2] || 0);
        const sine = Math.sin(pose[2] || 0);
        return [pose[0] + value[0] * cosine - value[1] * sine, pose[1] + value[0] * sine + value[1] * cosine];
      };

      if (settings.bodies || settings.colliders) {
        for (const snapshot of snapshots) {
          for (let index = 0; index < snapshot.metadata.length; index += 1) {
            const metadata = snapshot.metadata[index];
            const pose = [snapshot.values[index * 4], snapshot.values[index * 4 + 1], snapshot.values[index * 4 + 2]];
            if (settings.bodies) {
              const size = 4 / Math.max(zoom, 0.001);
              appendPolyline([[pose[0] - size, pose[1] - size], [pose[0] + size, pose[1] - size], [pose[0] + size, pose[1] + size], [pose[0] - size, pose[1] + size]], true);
            }
            if (!settings.colliders) continue;
            const collider = metadata.collider || {};
            const skin = Math.max(0, Number(collider.contactSkin) || 0);
            if (collider.kind === "circle") {
              appendCircle(pose, Math.max(0.5, (Number(collider.radius) || 0) + skin), 20);
            } else if (collider.kind === "ellipse") {
              const width = Math.max(1, Number(collider.width) || 1) / 2 + skin;
              const height = Math.max(1, Number(collider.height) || 1) / 2 + skin;
              appendPolyline(Array.from({ length: 20 }, (_, pointIndex) => {
                const angle = pointIndex / 20 * Math.PI * 2;
                return transformLocal([Math.cos(angle) * width, Math.sin(angle) * height], pose);
              }), true);
            } else if (["convex", "polyline", "chain"].includes(collider.kind) && collider.points?.length) {
              appendPolyline(collider.points.map(value => transformLocal(value, pose)), collider.kind === "convex");
            } else {
              const width = (Number(collider.width) || 12) / 2 + skin;
              const height = (Number(collider.height) || 12) / 2 + skin;
              appendPolyline([[-width, -height], [width, -height], [width, height], [-width, height]].map(value => transformLocal(value, pose)), true);
            }
          }
        }
      }

      if (settings.constraints) {
        for (const constraint of graph.constraints) {
          if (!constraint.enabled) continue;
          const a = resolvePhysicsEndpointAtPose(constraint.a, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
          const b = resolvePhysicsEndpointAtPose(constraint.b, { elements: currentElements, bodies: graph.bodies, poseByBodyId });
          if (a.ok && b.ok) appendLine(a.point, b.point);
          else if (a.ok || b.ok) appendCircle((a.ok ? a : b).point, 5 / Math.max(zoom, 0.001), 12);
        }
      }

      const now = performance.now();
      for (const event of debugEventsRef.current) {
        if (!event.point || now - event.receivedAt >= 900) continue;
        const age = (now - event.receivedAt) / 900;
        if (settings.contacts) appendCircle(event.point, 3 / Math.max(zoom, 0.001), 10);
        if (settings.collisions && (event.phase === "hit" || event.phase === "begin")) {
          appendCircle(event.point, (4 + age * 18) / Math.max(zoom, 0.001), 16);
        }
        if (settings.forces && event.normal) {
          const length = Math.min(72, Math.max(10, Number(event.impulse || 0) * 10)) / Math.max(zoom, 0.001);
          appendLine(event.point, [event.point[0] + event.normal[0] * length, event.point[1] + event.normal[1] * length]);
        }
      }
      return segments;
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
      const diagnosticElements = (Array.isArray(liveScene?.elements) ? liveScene.elements : currentElements)
        .filter(element => !element?.customData?.presentationMaskActive);
      if (diagnosticAppState) {
        const rect = container.getBoundingClientRect();
        const zoom = Number(diagnosticAppState.zoom?.value) || 1;
        const toViewport = point => {
          const value = sceneCoordsToViewportCoords({ sceneX: point[0], sceneY: point[1] }, diagnosticAppState);
          return [value.x - rect.left, value.y - rect.top];
        };
        const snapshots = runtime.getLatestPoses();
        const poseByBodyId = new Map();
        const graph = normalizeRelationshipGraph(currentGraph);
        for (const snapshot of snapshots) {
          for (let index = 0; index < snapshot.metadata.length; index += 1) {
            const metadata = snapshot.metadata[index];
            if (!metadata?.bodyId) continue;
            poseByBodyId.set(metadata.bodyId, {
              x: snapshot.values[index * 4],
              y: snapshot.values[index * 4 + 1],
              angle: snapshot.values[index * 4 + 2],
            });
          }
        }
        let trailEmitterSegments = [];
        if (debugSettings?.enabled && debugSettings.trails) {
          trailEmitterSegments = drawTrails(context, graph, snapshots, diagnosticElements, poseByBodyId, toViewport);
        } else if (!debugSettings?.trails) {
          trailHistoryRef.current.clear();
        }
        const visibleElementIds = new Set(diagnosticElements.map(element => element.id));
        for (const snapshot of snapshots) {
          const values = snapshot.values;
          for (let index = 0; index < snapshot.metadata.length; index += 1) {
            const objectRef = snapshot.metadata[index]?.objectRef;
            if (objectRef?.kind === "element" && !visibleElementIds.has(objectRef.elementId)) continue;
            drawBody(context, snapshot.metadata[index], values[index * 4], values[index * 4 + 1], values[index * 4 + 2], toViewport, zoom);
          }
        }
        drawRelationships(context, normalizeRelationshipGraph(currentGraph), diagnosticElements, selectedIds, showAll, toViewport, poseByBodyId);
        if (debugSettings?.enabled) {
          const theme = diagnosticAppState.theme || "light";
          drawDebugBodies(context, snapshots, diagnosticElements, graph, toViewport, zoom, debugSettings, theme);
          drawDebugConstraints(context, graph, diagnosticElements, toViewport, debugSettings, poseByBodyId, theme);
          drawDebugEvents(context, toViewport, debugSettings, diagnosticElements, theme);
        }
        propsRef.current.onDebugGeometry?.([
          ...trailEmitterSegments,
          ...collectDebugEmitterSegments({
            settings: debugSettings,
            snapshots,
            graph,
            currentElements: diagnosticElements,
            poseByBodyId,
            zoom,
          }),
        ].slice(0, 2048));
      } else {
        propsRef.current.onDebugGeometry?.([]);
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
      propsRef.current.onDebugGeometry?.([]);
    };
  }, [runtime]);

  return <canvas ref={canvasRef} className="underscores-physics-overlay" aria-hidden="true" />;
});

export default PhysicsOverlay;
