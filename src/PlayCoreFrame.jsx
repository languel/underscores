import { useEffect, useRef } from "react";
import { evaluatePlayCoreSource, normalizePlayCoreFrame, shouldRenderPlayCoreFrame } from "./playCoreFrame.js";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";

const escapeHtml = value => String(value ?? " ").replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));

function PlayCoreFrame({ element, config: rawConfig, scriptRuntimeRef }) {
  const hostRef = useRef(null);
  const config = normalizePlayCoreFrame(rawConfig);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let raf = 0;
    let last = 0;
    let program;
    let drawerator;
    let subscriptions = [];
    const pointer = { x: 0, y: 0, pressed: false, px: 0, py: 0, ppressed: false };
    try {
      const canvas = createScriptCanvasApi(scriptRuntimeRef, { onSubscription: unsubscribe => subscriptions.push(unsubscribe) });
      const params = resolveScriptParameterValues(parseScriptParameters(config.source, { values: config.parameters }), scriptRuntimeRef, canvas);
      drawerator = { element: { id: element.id, width: element.width, height: element.height }, frame: config, canvas, objects: canvas, events: canvas.events, transport: canvas.transport, params, get time() { return canvas.transport.time; } };
      program = evaluatePlayCoreSource(config.source, drawerator);
    } catch (error) { host.textContent = `Play Core error: ${error.message || error}`; return undefined; }
    const settings = { fps: config.fps, color: "#e8e8e8", backgroundColor: "#101010", ...(program.settings || {}) };
    Object.assign(host.style, { color: settings.color, background: settings.backgroundColor });
    const event = type => e => {
      const rect = host.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.pressed = type !== "pointerUp";
    };
    const down = event("pointerDown"), move = event("pointerMove"), up = event("pointerUp");
    host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move); host.addEventListener("pointerup", up);
    const loop = time => {
      if (cancelled) return;
      if (time - last >= 1000 / settings.fps) {
        last = time;
        const rect = host.getBoundingClientRect(); const cols = settings.cols || Math.max(1, Math.floor(rect.width / 8)); const rows = settings.rows || Math.max(1, Math.floor(rect.height / 16));
        const context = Object.freeze({ frame: Math.round(time / (1000 / settings.fps)), time, cols, rows, width: rect.width, height: rect.height, settings, runtime: {} });
        const cursor = { x: pointer.x / 8, y: pointer.y / 16, pressed: pointer.pressed, p: { x: pointer.px / 8, y: pointer.py / 16, pressed: pointer.ppressed } };
        const buffer = Array.from({ length: cols * rows }, () => ({ char: " " }));
        try {
          program.pre?.(context, cursor, buffer, drawerator);
          const pointerCallback = pointer.pressed && !pointer.ppressed ? program.pointerDown
            : !pointer.pressed && pointer.ppressed ? program.pointerUp
              : (pointer.x !== pointer.px || pointer.y !== pointer.py) ? program.pointerMove : null;
          pointerCallback?.(context, cursor, buffer, drawerator);
          for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
            const value = program.main?.({ x, y, index: x + y * cols }, context, cursor, buffer, drawerator);
            buffer[x + y * cols] = typeof value === "object" ? { ...buffer[x + y * cols], ...value } : { ...buffer[x + y * cols], char: value };
          }
          program.post?.(context, cursor, buffer, drawerator);
          host.innerHTML = Array.from({ length: rows }, (_, y) => buffer.slice(y * cols, (y + 1) * cols).map(cell => escapeHtml(cell.char)).join("")).join("\n");
        } catch (error) { host.textContent = `Play Core error: ${error.message || error}`; }
        pointer.px = pointer.x; pointer.py = pointer.y; pointer.ppressed = pointer.pressed;
      }
      raf = requestAnimationFrame(loop);
    };
    program.boot?.(drawerator); raf = requestAnimationFrame(loop);
    return () => { cancelled = true; cancelAnimationFrame(raf); subscriptions.forEach(unsubscribe => unsubscribe?.()); host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move); host.removeEventListener("pointerup", up); };
  }, [element.id, element.width, element.height, config.source, config.fps, config.reloadNonce, config.parameters, scriptRuntimeRef]);
  return <pre ref={hostRef} className="drawerator-play-core-host" tabIndex={config.allowInteraction ? 0 : -1} style={{ pointerEvents: config.allowInteraction ? "auto" : "none" }} />;
}

export function PlayCoreFrameOverlay({ elements, appState, scriptRuntimeRef }) {
  const zoom = Number(appState?.zoom?.value) || 1, scrollX = Number(appState?.scrollX) || 0, scrollY = Number(appState?.scrollY) || 0;
  return <div className="drawerator-play-core-overlay">{(elements || []).filter(shouldRenderPlayCoreFrame).map(element => <div key={element.id} className="drawerator-play-core-overlay-frame" style={{ left: (element.x + scrollX) * zoom, top: (element.y + scrollY) * zoom, width: element.width * zoom, height: element.height * zoom, transform: `rotate(${element.angle || 0}rad)` }}><PlayCoreFrame element={element} config={element.customData.draweratorPlayCore} scriptRuntimeRef={scriptRuntimeRef} /></div>)}</div>;
}
