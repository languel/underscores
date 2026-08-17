import { useEffect, useRef, useState } from "react";
import BundledP5V2 from "p5";
import BundledP5V1 from "p5-legacy";
import {
  compileClassicP5Source,
  compileInstanceP5Source,
  getP5ConfigKey,
  getP5RunnerKey,
  normalizeP5Frame,
  P5_GLOBAL_CALLBACK_NAMES,
  resolveP5SourceMode,
  shouldRenderP5Frame,
} from "./p5Frame.js";
import { createP5SerialBridge } from "./p5Serial.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { createScriptConsole } from "./scriptConsole.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";

const loadedCdnRuntimes = new Map();

const publishP5Status = detail => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("underscores:p5-status", { detail }));
};

// Both embedded p5 runtimes normally route point() through per-point renderer
// work. When a sketch is drawing ordinary one-pixel points on an untransformed
// 2D canvas, use the equivalent fillRect path and restore p5's fill state at
// the end of the draw. Anything outside that narrow case keeps p5's original
// implementation.
const installFastP5PointPath = p => {
  const originalPoint = p.point;
  const originalStroke = p.stroke;
  const originalNoStroke = p.noStroke;
  const originalStrokeWeight = p.strokeWeight;
  if (typeof originalPoint !== "function") return () => {};
  const state = { fillStyle: null, strokeStyle: null, changed: false, canFast: null, fastPoint: null };
  if (typeof originalStroke === "function") {
    p.stroke = function trackedStroke(...args) {
      const result = originalStroke.apply(p, args);
      state.strokeStyle = p.drawingContext?.strokeStyle || null;
      state.fastPoint = null;
      return result;
    };
  }
  if (typeof originalNoStroke === "function") {
    p.noStroke = function trackedNoStroke(...args) {
      state.fastPoint = null;
      return originalNoStroke.apply(p, args);
    };
  }
  if (typeof originalStrokeWeight === "function") {
    p.strokeWeight = function trackedStrokeWeight(...args) {
      state.fastPoint = null;
      return originalStrokeWeight.apply(p, args);
    };
  }
  p.point = function fastPoint(x, y, ...rest) {
    const optimizedPoint = state.fastPoint;
    if (optimizedPoint && rest.length === 0) return optimizedPoint(x, y);
    const renderer = p._renderer;
    const context = p.drawingContext;
    if (!context || !renderer || renderer._clipping || renderer._doStroke === false || rest.length > 0) {
      return originalPoint.call(p, x, y, ...rest);
    }
    if (state.canFast === null) {
      const transform = context.getTransform?.();
      state.canFast = Boolean(
        context.lineWidth === 1
        && (!transform || (transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1 && transform.e === 0 && transform.f === 0))
      );
    }
    if (!state.canFast || context.lineWidth !== 1) return originalPoint.call(p, x, y, ...rest);
    if (!state.changed) {
      state.fillStyle = context.fillStyle;
      state.changed = true;
    }
    state.strokeStyle = context.strokeStyle;
    context.fillStyle = state.strokeStyle;
    state.fastPoint = (pointX, pointY) => {
      context.fillRect(pointX - 0.5, pointY - 0.5, 1, 1);
      return p;
    };
    return state.fastPoint(x, y);
  };
  return () => {
    if (state.changed && p.drawingContext) p.drawingContext.fillStyle = state.fillStyle;
    state.fillStyle = null;
    state.strokeStyle = null;
    state.changed = false;
    state.canFast = null;
    state.fastPoint = null;
  };
};

const loadP5Runtime = async config => {
  if (config.runtime !== "cdn") return config.p5Version === "1" ? BundledP5V1 : BundledP5V2;
  const url = config.cdnUrl;
  if (!loadedCdnRuntimes.has(url)) {
    loadedCdnRuntimes.set(url, new Promise((resolve, reject) => {
      const existing = Array.from(document.querySelectorAll("script[data-underscores-p5-cdn]"))
        .find(candidate => candidate.dataset.underscoresP5Cdn === url);
      if (existing && window.p5) return resolve(window.p5);
      const script = existing || document.createElement("script");
      script.dataset.underscoresP5Cdn = url;
      script.src = url;
      script.async = true;
      script.onload = () => window.p5 ? resolve(window.p5) : reject(new Error("The CDN did not expose window.p5."));
      script.onerror = () => reject(new Error(`Could not load p5 from ${url}.`));
      if (!existing) document.head.appendChild(script);
    }));
  }
  return loadedCdnRuntimes.get(url);
};

export default function P5Frame({ element, config: rawConfig, scriptRuntimeRef, transport, transportMode = "free" }) {
  const hostRef = useRef(null);
  const instanceRef = useRef(null);
  const loopStateRef = useRef({ userLooping: true, transportSyncing: false, setTransportLoop: null });
  const transportRef = useRef(transport);
  const transportModeRef = useRef(transportMode);
  const config = normalizeP5Frame(rawConfig);
  const [runningConfig, setRunningConfig] = useState(config);
  const runningConfigRef = useRef(config);
  const lastWorkingConfigRef = useRef(config);
  const configKey = getP5ConfigKey(config);

  // Editing updates the authored configuration immediately, but the overlay
  // only commits a replacement once p5 has completed a working setup/draw.
  useEffect(() => {
    if (getP5ConfigKey(runningConfigRef.current) === configKey) return;
    runningConfigRef.current = config;
    setRunningConfig(config);
  }, [config, configKey]);

  const runnerKey = getP5RunnerKey(runningConfig, element);
  const transportPlaying = Boolean(transport?.playing);

  transportRef.current = transport;
  transportModeRef.current = transportMode;

  // Linked livecode keeps its p5 instance mounted, but the timeline owns the
  // render loop. Free-mode frames retain their historical local autoplay
  // behavior and are intentionally unaffected by the score transport.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !runningConfig.autoplay) return;
    const loopState = loopStateRef.current;
    if (document.visibilityState === "hidden" || !isLivecodeTransportPlaying(transportMode, { playing: transportPlaying })) {
      loopState.setTransportLoop?.(false);
    } else if (loopState.userLooping) {
      loopState.setTransportLoop?.(true);
    }
  }, [runningConfig.autoplay, transportMode, transportPlaying]);

  useEffect(() => {
    let disposed = false;
    let instance = null;
    let serialBridge = null;
    let subscriptions = [];
    let confirmed = false;
    const loopState = loopStateRef.current;
    loopState.userLooping = true;
    loopState.transportSyncing = false;
    loopState.setTransportLoop = null;
    const shouldPlay = () => activeConfig.autoplay
      && isLivecodeTransportPlaying(transportModeRef.current, transportRef.current);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" || !shouldPlay()) loopState.setTransportLoop?.(false);
      else if (loopState.userLooping) loopState.setTransportLoop?.(true);
    };
    const activeConfig = runningConfig;
    const activeConfigKey = getP5ConfigKey(activeConfig);
    const report = (kind, message) => publishP5Status({
      elementId: element.id,
      scriptId: activeConfig.scriptId,
      livecode: Boolean(element.customData?.underscoresLivecode),
      kind,
      message,
    });
    const confirmRunnable = () => {
      if (confirmed || disposed) return;
      confirmed = true;
      lastWorkingConfigRef.current = activeConfig;
      report("success", "Compiled successfully.");
    };
    const restoreLastWorking = () => {
      const previous = lastWorkingConfigRef.current;
      if (getP5ConfigKey(previous) === activeConfigKey) return;
      runningConfigRef.current = previous;
      setRunningConfig(previous);
    };

    const start = async () => {
      try {
        const P5 = await loadP5Runtime(activeConfig);
        if (disposed || !hostRef.current) return;
        const host = hostRef.current;
        const canvas = createScriptCanvasApi(scriptRuntimeRef, {
          onSubscription: unsubscribe => subscriptions.push(unsubscribe),
        });
        const parameters = parseScriptParameters(activeConfig.source, {
          values: activeConfig.parameters || {},
        });
        const params = resolveScriptParameterValues(parameters, scriptRuntimeRef, canvas);
        const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {
          theme: "dark",
          currentColor: "#e8e8e8",
          currentRawColor: "#e8e8e8",
          currentOpacity: 100,
          currentBackgroundColor: "transparent",
          currentRawBackgroundColor: "transparent",
          currentStroke: "#e8e8e8",
          currentFill: "transparent",
          currentStrokeWidth: 1,
          colors: {},
          appState: {},
        };
        const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
        const bridge = {
          element: { id: element.id, width: element.width, height: element.height },
          frame: activeConfig,
          canvas,
          objects: canvas,
          events: canvas.events,
          transport: canvas.transport,
          params,
          get object() { return canvas.get(element.id); },
          get time() { return canvas.transport.time; },
          get currentColor() { return appearance().currentColor; },
          get currentRawColor() { return appearance().currentRawColor; },
          get currentOpacity() { return appearance().currentOpacity; },
          get currentBackgroundColor() { return appearance().currentBackgroundColor; },
          get currentRawBackgroundColor() { return appearance().currentRawBackgroundColor; },
          get currentBackgroundOpacity() { return appearance().currentBackgroundOpacity; },
          get currentStroke() { return appearance().currentStroke; },
          get currentFill() { return appearance().currentFill; },
          get currentStrokeWidth() { return appearance().currentStrokeWidth; },
          get currentFillStyle() { return appearance().currentFillStyle; },
          get currentStrokeStyle() { return appearance().currentStrokeStyle; },
          get currentRoughness() { return appearance().currentRoughness; },
          get currentRoundness() { return appearance().currentRoundness; },
          get currentFontFamily() { return appearance().currentFontFamily; },
          get currentFontSize() { return appearance().currentFontSize; },
          get currentFontWeight() { return appearance().currentFontWeight; },
          get currentTextAlign() { return appearance().currentTextAlign; },
          get currentVerticalAlign() { return appearance().currentVerticalAlign; },
          get activeTool() { return appearance().activeTool; },
          get zoom() { return appearance().zoom; },
          get scrollX() { return appearance().scrollX; },
          get scrollY() { return appearance().scrollY; },
          get appState() { return appearance().appState; },
          get colors() { return appearance().colors; },
          get theme() { return appearance().theme; },
          get appearance() { return appearance(); },
          get streams() { return scriptRuntimeRef?.current?.getStreams?.(element.id) || window.__?.streams; },
          console: scriptConsole,
          log: scriptConsole.log,
          info: scriptConsole.info,
          warn: scriptConsole.warn,
          error: scriptConsole.error,
          get art() { return window.__?.art; },
          api: window.__,
        };
        const sketch = p => {
          const interactionState = { mouseIsDragged: false };
          const originalLoop = p.loop;
          const originalNoLoop = p.noLoop;
          loopState.setTransportLoop = shouldLoop => {
            loopState.transportSyncing = true;
            try {
              return (shouldLoop ? originalLoop : originalNoLoop).call(p);
            } finally {
              loopState.transportSyncing = false;
            }
          };
          p.loop = (...args) => {
            if (!loopState.transportSyncing) {
              loopState.userLooping = true;
              if (!isLivecodeTransportPlaying(transportModeRef.current, transportRef.current)) return p;
            }
            return originalLoop.apply(p, args);
          };
          p.noLoop = (...args) => {
            if (!loopState.transportSyncing) loopState.userLooping = false;
            return originalNoLoop.apply(p, args);
          };
          let restoreFastPointPath = () => {};
          let callbacks = {};
          const reportError = reason => {
            const message = reason instanceof Error ? reason.message : String(reason);
            report("error", `p5 error: ${message}`);
            p.noLoop?.();
            if (!confirmed) restoreLastWorking();
          };
          const reportSerialError = reason => {
            const message = reason instanceof Error ? reason.message : String(reason);
            report("error", `Web Serial: ${message}`);
          };
          serialBridge = createP5SerialBridge({
            onEvent: event => {
              const callbackName = {
                connect: "serialConnect",
                disconnect: "serialDisconnect",
                data: "serialData",
                error: "serialError",
              }[event.type];
              const callback = callbackName ? callbacks[callbackName] : null;
              if (typeof callback !== "function") return;
              try {
                if (event.type === "data") callback.call(p, event.data, event);
                else if (event.type === "error") callback.call(p, event.error, event);
                else callback.call(p, event.port, event);
              } catch (reason) {
                reportSerialError(reason);
              }
            },
          });
          bridge.input = interactionState;
          bridge.serial = serialBridge;
          try {
            // p5 defaults the main renderer to window.devicePixelRatio. That
            // is useful for static UI, but it doubles both axes of a livecode
            // canvas on a Retina display and makes point-heavy sketches pay a
            // 4x fill cost. Wrap createCanvas before compiling so both classic
            // and instance-mode sketches get a logical-resolution default;
            // an authored pixelDensity() call remains the final authority.
            const requestedPixelDensity = Number(activeConfig.pixelDensity);
            if (Number.isFinite(requestedPixelDensity) && requestedPixelDensity > 0) {
              const authoredCreateCanvas = p.createCanvas;
              p.createCanvas = (...args) => {
                const result = authoredCreateCanvas.apply(p, args);
                if (typeof p.pixelDensity === "function" && p.pixelDensity() !== requestedPixelDensity) {
                  p.pixelDensity(requestedPixelDensity);
                }
                return result;
              };
            }
            restoreFastPointPath = installFastP5PointPath(p);
            // Deliberately trusted: this editor is for the local author and has
            // full page access, mirroring Underscores's trusted IanniX scripts.
            callbacks = resolveP5SourceMode(activeConfig) === "global"
              ? compileClassicP5Source(p, bridge, activeConfig.source, interactionState, scriptConsole)
              : compileInstanceP5Source(p, bridge, activeConfig.source, scriptConsole);
            P5_GLOBAL_CALLBACK_NAMES.forEach(name => {
              const callback = callbacks[name];
              const tracksDrag = name === "mousePressed"
                || name === "touchStarted"
                || name === "mouseDragged"
                || name === "touchMoved"
                || name === "mouseReleased"
                || name === "touchEnded";
              if (typeof callback !== "function" && !tracksDrag) return;
              p[name] = (...args) => {
                if (name === "mousePressed" || name === "touchStarted") interactionState.mouseIsDragged = false;
                if (name === "mouseDragged" || name === "touchMoved") interactionState.mouseIsDragged = true;
                if (name === "mouseReleased" || name === "touchEnded") interactionState.mouseIsDragged = false;
                if (typeof callback !== "function") return undefined;
                try {
                  return callback.apply(p, args);
                } catch (reason) {
                  reportError(reason);
                  return undefined;
                }
              };
            });
          } catch (reason) {
            reportError(reason);
            return;
          }
          // Capture both authored callbacks before wrapping either one. p5
          // normally invokes setup after this sketch factory returns, but
          // keeping the references initialized first avoids a startup race
          // for setup-only sketches.
          const authoredDraw = p.draw;
          const authoredSetup = p.setup;
          p.setup = () => {
            try {
              if (typeof authoredSetup === "function") authoredSetup();
              if (!p.canvas) {
                p.createCanvas(
                  Math.max(1, Number(element.width) || host.clientWidth || 1),
                  Math.max(1, Number(element.height) || host.clientHeight || 1),
                );
              }
              p.frameRate(activeConfig.fps);
              if (!shouldPlay() || !loopState.userLooping) loopState.setTransportLoop?.(false);
              restoreFastPointPath();
              if (typeof authoredDraw !== "function") confirmRunnable();
            } catch (reason) {
              restoreFastPointPath();
              reportError(reason);
            }
          };
          if (typeof authoredDraw === "function") {
            p.draw = () => {
              try {
                // Explicit shared composition policy. The default remains
                // authored/manual, so existing p5 sketches and their timing
                // are unchanged until an author selects "Clear each frame".
                if (activeConfig.persistence === "clear") p.clear();
                const result = authoredDraw();
                restoreFastPointPath();
                confirmRunnable();
                return result;
              } catch (reason) {
                restoreFastPointPath();
                reportError(reason);
                return undefined;
              }
            };
          }
        };
        instance = new P5(sketch, host);
        instanceRef.current = instance;
        handleVisibility();
        document.addEventListener("visibilitychange", handleVisibility);
        // The host is CSS-scaled with the camera zoom. Resizing the internal
        // p5 buffer to host.clientWidth/Height after setup therefore clears
        // setup-only drawings (and can use the zoomed dimensions). The
        // authored element dimensions are the logical canvas size; runnerKey
        // remounts the frame when those dimensions change, while CSS handles
        // viewport scaling.
      } catch (reason) {
        if (!disposed) {
          const message = reason instanceof Error ? reason.message : String(reason);
          report("error", `p5 error: ${message}`);
          restoreLastWorking();
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      scriptRuntimeRef.current?.disposeStreamsOwner?.(element.id);
      subscriptions.forEach(unsubscribe => unsubscribe?.());
      serialBridge?.dispose?.();
      instance?.remove?.();
      instanceRef.current = null;
      loopState.setTransportLoop = null;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runnerKey]);

  return <div
    className={`underscores-p5-frame ${runningConfig.allowInteraction ? "underscores-p5-interactive" : ""}`}
    data-underscores-p5-element-id={element.id}
  >
    <div
      ref={hostRef}
      className="underscores-p5-host"
      tabIndex={runningConfig.allowInteraction ? 0 : -1}
      onPointerDown={() => runningConfig.allowInteraction && hostRef.current?.focus?.({ preventScroll: true })}
      style={{ pointerEvents: runningConfig.allowInteraction ? "auto" : "none" }}
    />
  </div>;
}

// p5 is rendered by Underscores rather than Excalidraw's embeddable renderer.
// That keeps the p5 surface first-class on the canvas without giving it a
// synthetic URL, preview card, or external-link affordance.
export function P5FrameOverlay({ elements, appState, scriptRuntimeRef }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const frames = (elements || []).filter(shouldRenderP5Frame);

  if (!frames.length) return null;

  return (
    <div className="underscores-p5-overlay">
      {frames.map((element, layerIndex) => {
        const config = normalizeP5Frame(element.customData?.underscoresP5);
        const width = Math.max(1, (Number(element.width) || 1) * zoom);
        const height = Math.max(1, (Number(element.height) || 1) * zoom);
        const left = ((Number(element.x) || 0) + scrollX) * zoom;
        const top = ((Number(element.y) || 0) + scrollY) * zoom;
        return (
          <div
            key={element.id}
            data-underscores-p5-element-id={element.id}
            className={`underscores-p5-overlay-frame ${config.allowInteraction ? "underscores-p5-overlay-interactive" : ""}`}
            style={{
              left,
              top,
              width,
              height,
              zIndex: layerIndex,
              transform: `rotate(${Number(element.angle) || 0}rad)`,
              transformOrigin: "center",
            }}
          >
            <P5Frame element={element} config={config} scriptRuntimeRef={scriptRuntimeRef} />
          </div>
        );
      })}
    </div>
  );
}
