import { useEffect, useRef } from "react";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptConsole } from "./scriptConsole.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";
import { compileTixySource, evaluateTixyValue, resolveTixyGrid, TIXY_CELL_GAP, TIXY_CELL_SIZE } from "./tixyRuntime.js";
import { registerLivecodeCapture } from "./livecodeCapture.js";

const publishTixyStatus = (elementId, kind, message = "") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("underscores:tixy-status", { detail: { elementId, kind, message, livecode: true, runtime: "tixy" } }));
};

const parseCssColor = value => {
  const source = String(value || "").trim();
  const hex = /^#([\da-f]{3,8})$/i.exec(source);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      return [0, 1, 2].map(index => Number.parseInt(`${digits[index]}${digits[index]}`, 16));
    }
    if (digits.length === 6 || digits.length === 8) {
      return [0, 1, 2].map(index => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16));
    }
  }
  const rgb = /^rgba?\(\s*([^)]*)\)$/i.exec(source);
  if (rgb) {
    const channels = rgb[1].replace(/\//g, ",").split(/[\s,]+/).filter(Boolean).slice(0, 3).map(channel => {
      const numeric = Number.parseFloat(channel);
      return channel.endsWith("%") ? Math.round(numeric * 2.55) : Math.round(numeric);
    });
    if (channels.length === 3 && channels.every(Number.isFinite)) return channels.map(channel => Math.max(0, Math.min(255, channel)));
  }
  return [232, 232, 232];
};

const colorForValue = (value, one, zero) => {
  const amount = Math.min(1, Math.abs(value));
  const color = value < 0 ? zero : one;
  return `rgb(${color[0]} ${color[1]} ${color[2]} / ${0.25 + amount * 0.75})`;
};

const firstParameter = (parameters, names, fallback) => {
  for (const name of names) {
    const value = parameters?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
};

export default function TixyFrame({ element, config, scriptRuntimeRef, transport, transportMode = "free" }) {
  const canvasRef = useRef(null);
  // Keep the free-run clock outside the render effect.  The effect is also
  // responsible for wiring subscriptions and can be restarted by an ordinary
  // parent rerender (for example, selecting the node with the mouse).  A
  // local `startedAt` would make that interaction jump the animation back to
  // t=0 even though the Tixy program never reads pointer state.
  const clockRef = useRef({ startedAt: null, frame: 0 });
  const transportRef = useRef(transport);
  const modeRef = useRef(transportMode);
  transportRef.current = transport;
  modeRef.current = transportMode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let compiled;
    try {
      compiled = compileTixySource(config.source);
      publishTixyStatus(element.id, "success", "Compiled successfully.");
    } catch (error) {
      publishTixyStatus(element.id, "error", error instanceof Error ? error.message : String(error));
      return undefined;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      publishTixyStatus(element.id, "error", "Canvas 2D is unavailable in this browser.");
      return undefined;
    }
    const pointer = { x: 0.5, y: 0.5, down: false };
    if (!Number.isFinite(clockRef.current.startedAt)) clockRef.current.startedAt = performance.now();
    const subscriptions = [];
    let raf = 0;
    let active = true;
    let pageVisible = document.visibilityState !== "hidden";
    let lastPaint = 0;
    let displayWidth = Math.max(1, Number(element.width) || 1);
    let displayHeight = Math.max(1, Number(element.height) || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      displayWidth = Math.max(1, rect.width || Number(element.width) || 1);
      displayHeight = Math.max(1, rect.height || Number(element.height) || 1);
      const scale = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
      const width = Math.max(1, Math.round(displayWidth * scale));
      const height = Math.max(1, Math.round(displayHeight * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    const updatePointer = event => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      pointer.y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    };
    const handlePointerDown = event => { updatePointer(event); pointer.down = true; };
    const handlePointerUp = () => { pointer.down = false; };
    const handleVisibility = () => { pageVisible = document.visibilityState !== "hidden"; };
    const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {};
    const canvasApi = createScriptCanvasApi(scriptRuntimeRef, { onSubscription: unsubscribe => subscriptions.push(unsubscribe) });
    let appearanceSnapshot = appearance();
    const params = resolveScriptParameterValues(
      parseScriptParameters(config.source, { values: config.parameters || {} }),
      scriptRuntimeRef,
      canvasApi,
      { getAppearance: () => appearanceSnapshot },
    );
    const grid = resolveTixyGrid(params);
    const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
    const bridge = {
      element: Object.freeze({ id: element.id, width: element.width, height: element.height }),
      frame: config,
      canvas: canvasApi,
      objects: canvasApi,
      events: canvasApi.events,
      transport: canvasApi.transport,
      params,
      pointer,
      input: pointer,
      tixy: Object.freeze({
        gridSize: grid.width === grid.height ? grid.width : null,
        gridWidth: grid.width,
        gridHeight: grid.height,
        cellSize: TIXY_CELL_SIZE,
        cellGap: TIXY_CELL_GAP,
      }),
      get object() { return canvasApi.get(element.id); },
      get time() { return canvasApi.transport.time; },
      get currentColor() { return appearance().currentColor || "#e8e8e8"; },
      get colors() { return appearance().colors || {}; },
      get theme() { return appearance().theme || "dark"; },
      get appearance() { return appearance(); },
      console: scriptConsole,
      log: scriptConsole.log,
      info: scriptConsole.info,
      warn: scriptConsole.warn,
      error: scriptConsole.error,
      get api() { return window.__; },
    };
    const fps = Math.max(1, Math.min(240, Number(config.fps) || 60));
    const render = now => {
      if (!active) return;
      if (pageVisible && isLivecodeTransportPlaying(modeRef.current, transportRef.current) && now - lastPaint >= 1000 / fps) {
        const linked = modeRef.current !== "free";
        const scoreTime = Math.max(0, Number(transportRef.current?.time) || 0);
        const time = linked ? scoreTime : (now - clockRef.current.startedAt) / 1000;
        const width = displayWidth;
        const height = displayHeight;
        const cell = Math.min(width / grid.width, height / grid.height);
        const offsetX = (width - grid.width * cell) / 2;
        const offsetY = (height - grid.height * cell) / 2;
        appearanceSnapshot = appearance();
        const one = parseCssColor(firstParameter(params, ["color1", "oneColor", "positiveColor"], appearanceSnapshot.currentColor || "#e8e8e8"));
        const zero = parseCssColor(firstParameter(params, ["color0", "zeroColor", "negativeColor"], appearanceSnapshot.colors?.accent?.css || "#ff547d"));
        const background = firstParameter(params, ["backgroundColor", "background", "bgColor"], "transparent");
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        context.clearRect(0, 0, width, height);
        if (background && background !== "transparent") {
          context.fillStyle = background;
          context.fillRect(0, 0, width, height);
        }
        // One frame bridge is shared by every dot. Object spread would invoke
        // all live getters on the base bridge for every cell (appearance,
        // object timing, palette conversion, and transport), turning a 16x16
        // grid into hundreds of full application snapshots per frame.
        const pointerSnapshot = Object.freeze({ ...pointer });
        const frameBridge = Object.create(bridge);
        Object.defineProperties(frameBridge, {
          time: { enumerable: true, value: time },
          frame: { enumerable: true, value: clockRef.current.frame },
          pointer: { enumerable: true, value: pointerSnapshot },
          input: { enumerable: true, value: pointerSnapshot },
          transport: { enumerable: true, value: transportRef.current },
        });
        for (let y = 0; y < grid.height; y += 1) for (let x = 0; x < grid.width; x += 1) {
          const index = x + y * grid.width;
          const value = evaluateTixyValue(compiled, {
            time, index, x, y,
            bridge: frameBridge,
          });
          const radius = Math.min(cell * 0.48, Math.abs(value) * cell * 0.48);
          if (radius <= 0.05) continue;
          context.beginPath();
          context.fillStyle = colorForValue(value, one, zero);
          context.arc(offsetX + (x + 0.5) * cell, offsetY + (y + 0.5) * cell, radius, 0, Math.PI * 2);
          context.fill();
        }
        clockRef.current.frame += 1;
        lastPaint = now;
      }
      raf = window.requestAnimationFrame(render);
    };
    const observer = new IntersectionObserver(entries => { active = entries.some(entry => entry.isIntersecting); });
    const resizeObserver = new ResizeObserver(resize);
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    canvas.addEventListener("pointermove", updatePointer);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("visibilitychange", handleVisibility);
    resize();
    raf = window.requestAnimationFrame(render);
    const unregisterCapture = registerLivecodeCapture(element.id, () => canvas);
    return () => {
      active = false;
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver.disconnect();
      unregisterCapture();
      subscriptions.forEach(unsubscribe => unsubscribe?.());
      canvas.removeEventListener("pointermove", updatePointer);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("visibilitychange", handleVisibility);
      publishTixyStatus(element.id, "clear");
    };
  }, [config, element.height, element.id, element.width, scriptRuntimeRef]);

  return <div className="underscores-tixy-frame" style={{ pointerEvents: config.allowInteraction === false ? "none" : "auto" }}>
    <canvas ref={canvasRef} className="underscores-tixy-canvas" aria-label="Tixy output" />
  </div>;
}
