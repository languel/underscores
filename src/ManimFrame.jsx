import { useEffect, useMemo, useRef, useState } from "react";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptConsole } from "./scriptConsole.js";
import { registerLivecodeCapture } from "./livecodeCapture.js";
import { registerManimRuntime } from "./manimRuntimeRegistry.js";
import {
  cacheManimFrameConfig,
  compileManimSource,
  createManimCueController,
  getManimSceneOptions,
  createManimTransportGate,
} from "./manimFrame.js";

const runtimePromises = new Map();

const publishManimStatus = detail => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("underscores:manim-status", { detail }));
};

const loadManimRuntime = url => {
  if (!runtimePromises.has(url)) {
    runtimePromises.set(url, import(/* @vite-ignore */ url));
  }
  return runtimePromises.get(url);
};

const disposeScene = scene => {
  try { scene?.stop?.(); } catch { /* best effort */ }
  try {
    if (typeof scene?.dispose === "function") scene.dispose();
    else scene?.renderer?.dispose?.();
  } catch { /* best effort */ }
};

const createBridge = (element, config, scriptRuntimeRef, transportGate) => {
  const canvas = createScriptCanvasApi(scriptRuntimeRef);
  const parameters = parseScriptParameters(config.source, { values: config.parameters || {} });
  const params = resolveScriptParameterValues(parameters, scriptRuntimeRef, canvas);
  const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
  const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {
    theme: "dark",
    currentColor: "#e8e8e8",
    currentBackgroundColor: "transparent",
    colors: {},
    appState: {},
  };
  return {
    element: Object.freeze({ id: element.id, width: element.width, height: element.height }),
    frame: config,
    canvas,
    objects: canvas,
    events: canvas.events,
    params,
    get object() { return canvas.get(element.id); },
    get transport() { return transportGate.transport; },
    get time() { return Number(transportGate.transport?.time) || 0; },
    get currentColor() { return appearance().currentColor; },
    get currentBackgroundColor() { return appearance().currentBackgroundColor; },
    get colors() { return appearance().colors; },
    get theme() { return appearance().theme; },
    get appearance() { return appearance(); },
    console: scriptConsole,
    log: scriptConsole.log,
    info: scriptConsole.info,
    warn: scriptConsole.warn,
    error: scriptConsole.error,
    get api() { return window.__; },
  };
};

export default function ManimFrame({ element, config: rawConfig, scriptRuntimeRef, transport, transportMode = "free" }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const gateRef = useRef(null);
  const cueRef = useRef(null);
  const generationRef = useRef(0);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const elementSnapshot = useMemo(() => ({
    id: element?.id || "",
    width: Math.max(1, Number(element?.width) || 1),
    height: Math.max(1, Number(element?.height) || 1),
  }), [element?.id, element?.width, element?.height]);
  const configCacheRef = useRef(null);
  configCacheRef.current = cacheManimFrameConfig(configCacheRef.current, {
    ...rawConfig,
    width: elementSnapshot.width,
    height: elementSnapshot.height,
  });
  // Parent scene normalization may produce a fresh config object while its
  // authored content is unchanged. Keep one stable value for that content so
  // unrelated app renders cannot dispose and restart an in-flight animation.
  const config = configCacheRef.current.value;
  const [status, setStatus] = useState("Loading Manim…");
  const [pendingCue, setPendingCue] = useState(null);

  useEffect(() => {
    gateRef.current?.setMode(transportMode);
    gateRef.current?.update(transport);
    const scene = sceneRef.current;
    if (!scene) return;
    if (transportMode === "linked" && !transport?.playing) {
      try { scene.pause?.(); } catch { /* optional upstream API */ }
    } else {
      try { scene.resume?.(); } catch { /* optional upstream API */ }
    }
  }, [transport, transportMode]);

  useEffect(() => {
    let disposed = false;
    const generation = ++generationRef.current;
    const host = hostRef.current;
    if (!host) return undefined;
    host.replaceChildren();

    const gate = createManimTransportGate({ mode: transportMode, transport: transportRef.current });
    gateRef.current = gate;
    const cueController = createManimCueController({
      mode: config.progressionMode,
      onCue: cue => {
        publishManimStatus({ elementId: elementSnapshot.id, kind: "cue", cue });
        setStatus(`Cue ${cue.index + 1}: ${cue.label}`);
        setPendingCue(cueController.mode === "cue" && cue.options?.auto !== true ? cue : null);
      },
    });
    cueRef.current = cueController;
    const unregisterRuntime = registerManimRuntime(elementSnapshot.id, {
      getPendingCue: () => cueController.pendingCue,
    });
    setPendingCue(null);

    const report = (kind, message) => {
      publishManimStatus({ elementId: elementSnapshot.id, kind, message });
      setStatus(message);
    };

    const applyControl = detail => {
      const action = detail?.action || detail?.type || "";
      if (detail?.elementId && detail.elementId !== elementSnapshot.id) return { handled: false };
      if (action === "next") {
        const advanced = cueController.next();
        publishManimStatus({ elementId: elementSnapshot.id, kind: "control", action, advanced });
        return { handled: true, advanced };
      }
      if (action === "auto" || (action === "mode" && detail?.mode === "auto")) {
        cueController.setMode("auto");
        setPendingCue(null);
        publishManimStatus({ elementId: elementSnapshot.id, kind: "control", action: "auto" });
        return { handled: true };
      }
      if (action === "cue" || (action === "mode" && detail?.mode === "cue")) {
        cueController.setMode("cue");
        publishManimStatus({ elementId: elementSnapshot.id, kind: "control", action: "cue" });
        return { handled: true };
      }
      return { handled: false };
    };

    const handleControl = event => {
      const detail = event?.detail || {};
      applyControl(detail);
    };
    const handleBusEvent = event => {
      const detail = event?.detail || {};
      const action = detail.action || String(event?.name || "").split(".").at(-1);
      applyControl({ ...detail, action });
    };
    const unsubscribeBus = scriptRuntimeRef.current?.eventBus?.subscribe?.("manim.cue.*", handleBusEvent) || (() => {});
    window.addEventListener("underscores:manim-control", handleControl);

    const start = async () => {
      try {
        const MANIM = await loadManimRuntime(config.runtimeUrl);
        if (disposed || generation !== generationRef.current || !hostRef.current) return;
        report("loading", "Starting Manim…");
        const scene = new MANIM.Scene(hostRef.current, getManimSceneOptions(config));
        sceneRef.current = scene;

        const originalPlay = typeof scene.play === "function" ? scene.play.bind(scene) : null;
        if (originalPlay) {
          scene.play = async (...args) => {
            const allowed = await gate.wait();
            if (!allowed || disposed || generation !== generationRef.current) return undefined;
            return originalPlay(...args);
          };
        }

        const bridge = createBridge(elementSnapshot, config, scriptRuntimeRef, gate);
        const run = compileManimSource(config.source, MANIM);
        const allowed = await gate.wait();
        if (!allowed || disposed || generation !== generationRef.current) return;
        report("running", config.progressionMode === "cue" ? "Running · cue mode" : "Running");
        await run({
          scene,
          bridge,
          cue: async (label, options) => {
            try {
              return await cueController.cue(label, options);
            } finally {
              if (!disposed && generation === generationRef.current) setPendingCue(null);
            }
          },
        });
        if (!disposed && generation === generationRef.current) report("success", "Complete");
      } catch (error) {
        if (disposed || generation !== generationRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        report("error", `Manim error: ${message}`);
      }
    };

    void start();
    return () => {
      disposed = true;
      generationRef.current += 1;
      unregisterRuntime();
      unsubscribeBus();
      window.removeEventListener("underscores:manim-control", handleControl);
      cueController.dispose();
      gate.dispose();
      if (cueRef.current === cueController) cueRef.current = null;
      if (gateRef.current === gate) gateRef.current = null;
      const scene = sceneRef.current;
      if (sceneRef.current === scene) sceneRef.current = null;
      disposeScene(scene);
      host.replaceChildren();
    };
  }, [config, elementSnapshot, scriptRuntimeRef, transportMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const unregister = registerLivecodeCapture(elementSnapshot.id, () => host.querySelector("canvas"));
    return unregister;
  }, [elementSnapshot.id]);

  const requestNextCue = event => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("underscores:manim-control", {
      detail: { elementId: elementSnapshot.id, action: "next", source: "button" },
    }));
  };

  return <div
    className={`manim-livecode-frame ${config.allowInteraction ? "interactive" : ""}`}
    style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
  >
    <div ref={hostRef} className="manim-livecode-host" style={{ width: "100%", height: "100%" }} />
    {config.progressionMode === "cue" && <button
      type="button"
      className="manim-cue-next"
      aria-label="Advance Manim cue"
      aria-keyshortcuts="Alt+Shift+ArrowRight"
      title="Advance Manim cue"
      disabled={!pendingCue}
      onPointerDown={event => event.stopPropagation()}
      onClick={requestNextCue}
      style={{ position: "absolute", right: 8, bottom: 8, zIndex: 2 }}
    >&gt;</button>}
    <span className="sr-only" role="status" aria-live="polite">{status}</span>
  </div>;
}
