import { useEffect, useRef, useState } from "react";
import BundledP5 from "p5";
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

const loadedCdnRuntimes = new Map();

const publishP5Status = detail => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("drawerator:p5-status", { detail }));
};

const loadP5Runtime = async config => {
  if (config.runtime !== "cdn") return BundledP5;
  const url = config.cdnUrl;
  if (!loadedCdnRuntimes.has(url)) {
    loadedCdnRuntimes.set(url, new Promise((resolve, reject) => {
      const existing = Array.from(document.querySelectorAll("script[data-drawerator-p5-cdn]"))
        .find(candidate => candidate.dataset.draweratorP5Cdn === url);
      if (existing && window.p5) return resolve(window.p5);
      const script = existing || document.createElement("script");
      script.dataset.draweratorP5Cdn = url;
      script.src = url;
      script.async = true;
      script.onload = () => window.p5 ? resolve(window.p5) : reject(new Error("The CDN did not expose window.p5."));
      script.onerror = () => reject(new Error(`Could not load p5 from ${url}.`));
      if (!existing) document.head.appendChild(script);
    }));
  }
  return loadedCdnRuntimes.get(url);
};

export default function P5Frame({ element, config: rawConfig, scriptRuntimeRef }) {
  const hostRef = useRef(null);
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

  useEffect(() => {
    let disposed = false;
    let instance = null;
    let observer = null;
    let serialBridge = null;
    let subscriptions = [];
    let confirmed = false;
    const activeConfig = runningConfig;
    const activeConfigKey = getP5ConfigKey(activeConfig);
    const report = (kind, message) => publishP5Status({
      elementId: element.id,
      scriptId: activeConfig.scriptId,
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
        const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || { theme: "dark", currentColor: "#e8e8e8", currentOpacity: 1, colors: {} };
        const drawerator = {
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
          get currentOpacity() { return appearance().currentOpacity; },
          get colors() { return appearance().colors; },
          get theme() { return appearance().theme; },
          get appearance() { return appearance(); },
          api: window.drawerator,
        };
        const sketch = p => {
          const interactionState = { mouseIsDragged: false };
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
          drawerator.input = interactionState;
          drawerator.serial = serialBridge;
          try {
            // Deliberately trusted: this editor is for the local author and has
            // full page access, mirroring Drawerator's trusted IanniX scripts.
            callbacks = resolveP5SourceMode(activeConfig) === "global"
              ? compileClassicP5Source(p, drawerator, activeConfig.source, interactionState)
              : compileInstanceP5Source(p, drawerator, activeConfig.source);
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
          const authoredSetup = p.setup;
          p.setup = () => {
            try {
              if (typeof authoredSetup === "function") authoredSetup();
              if (!p.canvas) p.createCanvas(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
              p.frameRate(activeConfig.fps);
              if (!activeConfig.autoplay) p.noLoop();
              if (typeof authoredDraw !== "function") confirmRunnable();
            } catch (reason) { reportError(reason); }
          };
          const authoredDraw = p.draw;
          if (typeof authoredDraw === "function") {
            p.draw = () => {
              try {
                const result = authoredDraw();
                confirmRunnable();
                return result;
              } catch (reason) {
                reportError(reason);
                return undefined;
              }
            };
          }
        };
        instance = new P5(sketch, host);
        observer = new ResizeObserver(() => {
          if (!instance?.resizeCanvas) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          if (instance.width !== width || instance.height !== height) instance.resizeCanvas(width, height);
        });
        observer.observe(host);
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
      observer?.disconnect();
      subscriptions.forEach(unsubscribe => unsubscribe?.());
      serialBridge?.dispose?.();
      instance?.remove?.();
    };
  }, [runnerKey]);

  return <div className={`drawerator-p5-frame ${runningConfig.allowInteraction ? "drawerator-p5-interactive" : ""}`}>
    <div
      ref={hostRef}
      className="drawerator-p5-host"
      tabIndex={runningConfig.allowInteraction ? 0 : -1}
      onPointerDown={() => runningConfig.allowInteraction && hostRef.current?.focus?.({ preventScroll: true })}
      style={{ pointerEvents: runningConfig.allowInteraction ? "auto" : "none" }}
    />
  </div>;
}

// p5 is rendered by Drawerator rather than Excalidraw's embeddable renderer.
// That keeps the p5 surface first-class on the canvas without giving it a
// synthetic URL, preview card, or external-link affordance.
export function P5FrameOverlay({ elements, appState, scriptRuntimeRef }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const frames = (elements || []).filter(shouldRenderP5Frame);

  if (!frames.length) return null;

  return (
    <div className="drawerator-p5-overlay">
      {frames.map((element, layerIndex) => {
        const config = normalizeP5Frame(element.customData?.draweratorP5);
        const width = Math.max(1, (Number(element.width) || 1) * zoom);
        const height = Math.max(1, (Number(element.height) || 1) * zoom);
        const left = ((Number(element.x) || 0) + scrollX) * zoom;
        const top = ((Number(element.y) || 0) + scrollY) * zoom;
        return (
          <div
            key={element.id}
            data-drawerator-p5-element-id={element.id}
            className={`drawerator-p5-overlay-frame ${config.allowInteraction ? "drawerator-p5-overlay-interactive" : ""}`}
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
