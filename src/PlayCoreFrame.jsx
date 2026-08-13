import { useEffect, useRef } from "react";
import { evaluatePlayCoreSource, getPlayCoreGridSize, mapPlayCorePointerToLayout, normalizePlayCoreFrame, shouldRenderPlayCoreFrame } from "./playCoreFrame.js";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptConsole } from "./scriptConsole.js";

const escapeHtml = value => String(value ?? " ").replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
const escapeCss = value => String(value ?? "").replace(/[&"'<>]/g, char => ({ "&": "&amp;", "\"": "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;" }[char]));

const renderCell = cell => {
  const value = cell && typeof cell === "object" ? cell : { char: cell };
  const styles = [
    value.color ? `color:${escapeCss(value.color)}` : "",
    value.backgroundColor ? `background-color:${escapeCss(value.backgroundColor)}` : "",
    value.fontWeight ? `font-weight:${escapeCss(value.fontWeight)}` : "",
  ].filter(Boolean);
  const char = escapeHtml(value.char);
  return styles.length ? `<span style="${styles.join(";")}">${char}</span>` : char;
};

const cssPixels = value => Number.parseFloat(value) || 0;

const measureGridMetrics = host => {
  const style = window.getComputedStyle(host);
  // Canvas text metrics do not necessarily use the same font fallback or transform
  // as the live <pre>. Measure an actual inherited glyph so the generated grid,
  // pointer coordinates, and displayed cells share one coordinate system.
  const probe = host.ownerDocument.createElement("span");
  probe.textContent = "X";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;display:inline-block;pointer-events:none;white-space:pre;font:inherit;line-height:inherit;letter-spacing:inherit;margin:0;padding:0;border:0";
  host.append(probe);
  const glyphRect = probe.getBoundingClientRect();
  probe.remove();
  const hostRect = host.getBoundingClientRect();
  const screenToLayoutX = hostRect.width > 0 ? host.clientWidth / hostRect.width : 1;
  const screenToLayoutY = hostRect.height > 0 ? host.clientHeight / hostRect.height : 1;
  const cellWidth = Math.max(1, glyphRect.width * screenToLayoutX || cssPixels(style.fontSize) * .6);
  const cellHeight = Math.max(1, glyphRect.height * screenToLayoutY || cssPixels(style.lineHeight) || cssPixels(style.fontSize) * 1.2);
  const paddingLeft = cssPixels(style.paddingLeft), paddingTop = cssPixels(style.paddingTop);
  const contentWidth = Math.max(0, host.clientWidth - paddingLeft - cssPixels(style.paddingRight));
  const contentHeight = Math.max(0, host.clientHeight - paddingTop - cssPixels(style.paddingBottom));
  return { cellWidth, cellHeight, contentWidth, contentHeight, paddingLeft, paddingTop };
};

export function PlayCoreFrame({ element, config: rawConfig, scriptRuntimeRef }) {
  const hostRef = useRef(null);
  const config = normalizePlayCoreFrame(rawConfig);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let cancelled = false;
    let raf = 0;
    let last = 0;
    let program;
    let bridge;
    let subscriptions = [];
    const pointer = { x: 0, y: 0, pressed: false, px: 0, py: 0, ppressed: false };
    const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || { theme: "dark", currentColor: "#e8e8e8", currentOpacity: 1, colors: {} };
    try {
      const canvas = createScriptCanvasApi(scriptRuntimeRef, { onSubscription: unsubscribe => subscriptions.push(unsubscribe) });
      const params = resolveScriptParameterValues(parseScriptParameters(config.source, { values: config.parameters }), scriptRuntimeRef, canvas);
      const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
      bridge = {
        element: { id: element.id, width: element.width, height: element.height }, frame: config,
        canvas, objects: canvas, events: canvas.events, transport: canvas.transport, params,
        get object() { return canvas.get(element.id); },
        get time() { return canvas.transport.time; },
        get currentColor() { return appearance().currentColor; },
        get currentOpacity() { return appearance().currentOpacity; },
        get colors() { return appearance().colors; },
        get theme() { return appearance().theme; },
        get appearance() { return appearance(); },
        get streams() { return scriptRuntimeRef?.current?.getStreams?.(element.id) || window.__?.streams; },
        console: scriptConsole,
        log: scriptConsole.log,
        info: scriptConsole.info,
        warn: scriptConsole.warn,
        error: scriptConsole.error,
        get api() { return window.__; },
      };
      program = evaluatePlayCoreSource(config.source, bridge, scriptConsole);
    } catch (error) { host.textContent = `Play Core error: ${error.message || error}`; return undefined; }
    const appearanceSnapshot = appearance();
    const settings = {
      fps: config.fps,
      color: appearanceSnapshot.colors?.foreground?.css || appearanceSnapshot.currentColor || "#e8e8e8",
      backgroundColor: appearanceSnapshot.colors?.canvas?.css || "#101010",
      ...(program.settings || {}),
    };
    Object.assign(host.style, {
      color: settings.color,
      background: settings.backgroundColor,
      fontFamily: settings.fontFamily || "",
      fontSize: settings.fontSize || "",
      fontWeight: settings.fontWeight || "",
      letterSpacing: settings.letterSpacing || "",
      lineHeight: settings.lineHeight || "",
      textAlign: settings.textAlign || "",
    });
    const event = type => e => {
      const point = Number.isFinite(e.offsetX) && Number.isFinite(e.offsetY)
        ? { x: e.offsetX, y: e.offsetY }
        : mapPlayCorePointerToLayout({
          clientX: e.clientX, clientY: e.clientY, rect: host.getBoundingClientRect(),
          layoutWidth: host.clientWidth, layoutHeight: host.clientHeight,
        });
      pointer.x = point.x;
      pointer.y = point.y;
      pointer.pressed = type !== "pointerUp";
    };
    const down = event("pointerDown"), move = event("pointerMove"), up = event("pointerUp");
    host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move); host.addEventListener("pointerup", up);
    const loop = time => {
      if (cancelled) return;
      if (time - last >= 1000 / settings.fps) {
        last = time;
        const rect = host.getBoundingClientRect();
        const { cellWidth, cellHeight, contentWidth, contentHeight, paddingLeft, paddingTop } = measureGridMetrics(host);
        const { cols, rows } = getPlayCoreGridSize({ contentWidth, contentHeight, cellWidth, cellHeight, cols: settings.cols, rows: settings.rows });
        const context = Object.freeze({
          frame: Math.round(time / (1000 / settings.fps)), time, cols, rows,
          width: rect.width, height: rect.height, settings,
          metrics: { cellWidth, cellHeight, aspect: cellWidth / cellHeight },
          runtime: { fps: settings.fps },
        });
        const cursor = {
          x: (pointer.x - paddingLeft) / cellWidth, y: (pointer.y - paddingTop) / cellHeight, pressed: pointer.pressed,
          p: { x: (pointer.px - paddingLeft) / cellWidth, y: (pointer.py - paddingTop) / cellHeight, pressed: pointer.ppressed },
        };
        const buffer = Array.from({ length: cols * rows }, () => ({ char: " " }));
        try {
          program.pre?.(context, cursor, buffer, bridge);
          const pointerCallback = pointer.pressed && !pointer.ppressed ? program.pointerDown
            : !pointer.pressed && pointer.ppressed ? program.pointerUp
              : (pointer.x !== pointer.px || pointer.y !== pointer.py) ? program.pointerMove : null;
          pointerCallback?.(context, cursor, buffer, bridge);
          for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
            const value = program.main?.({ x, y, index: x + y * cols }, context, cursor, buffer, bridge);
            buffer[x + y * cols] = typeof value === "object" ? { ...buffer[x + y * cols], ...value } : { ...buffer[x + y * cols], char: value };
          }
          program.post?.(context, cursor, buffer, bridge);
          host.innerHTML = Array.from({ length: rows }, (_, y) => buffer.slice(y * cols, (y + 1) * cols).map(renderCell).join("")).join("\n");
        } catch (error) { host.textContent = `Play Core error: ${error.message || error}`; }
        pointer.px = pointer.x; pointer.py = pointer.y; pointer.ppressed = pointer.pressed;
      }
      raf = requestAnimationFrame(loop);
    };
    program.boot?.(bridge); raf = requestAnimationFrame(loop);
    return () => { cancelled = true; scriptRuntimeRef.current?.disposeStreamsOwner?.(element.id); cancelAnimationFrame(raf); subscriptions.forEach(unsubscribe => unsubscribe?.()); host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move); host.removeEventListener("pointerup", up); };
  }, [element.id, element.width, element.height, config.source, config.fps, config.reloadNonce, config.parameters, scriptRuntimeRef]);
  return <pre ref={hostRef} className="underscores-play-core-host" tabIndex={config.allowInteraction ? 0 : -1} style={{ pointerEvents: config.allowInteraction ? "auto" : "none" }} />;
}

export function PlayCoreFrameOverlay({ elements, appState, scriptRuntimeRef }) {
  const zoom = Number(appState?.zoom?.value) || 1, scrollX = Number(appState?.scrollX) || 0, scrollY = Number(appState?.scrollY) || 0;
  return <div className="underscores-play-core-overlay">{(elements || []).filter(shouldRenderPlayCoreFrame).map(element => <div key={element.id} className="underscores-play-core-overlay-frame" style={{ left: (element.x + scrollX) * zoom, top: (element.y + scrollY) * zoom, width: element.width * zoom, height: element.height * zoom, transform: `rotate(${element.angle || 0}rad)` }}><PlayCoreFrame element={element} config={element.customData.underscoresPlayCore} scriptRuntimeRef={scriptRuntimeRef} /></div>)}</div>;
}
