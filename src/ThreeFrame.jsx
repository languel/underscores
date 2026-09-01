import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptConsole } from "./scriptConsole.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";
import { readWebglFrame, registerLivecodeCapture } from "./livecodeCapture.js";
import { cacheThreeFrameConfig, compileThreeSource } from "./threeFrame.js";
import { createThreeCameraControls } from "./threeCameraControls.js";

const publishThreeStatus = (elementId, kind, message = "") => {
  if (typeof window === "undefined") return;
  // Reuse the existing Livecode runtime-status relay and Console plumbing.
  window.dispatchEvent(new CustomEvent("underscores:p5-status", {
    detail: { elementId, kind, message, livecode: true, runtime: "three" },
  }));
};

const disposeSceneResources = scene => {
  scene?.traverse?.(object => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material?.dispose?.());
  });
};

const createBridge = (element, config, scriptRuntimeRef, transportRef) => {
  const canvas = createScriptCanvasApi(scriptRuntimeRef);
  const params = resolveScriptParameterValues(
    parseScriptParameters(config.source, { values: config.parameters || {} }),
    scriptRuntimeRef,
    canvas,
  );
  const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {
    theme: "dark",
    currentColor: "#e8e8e8",
    currentBackgroundColor: "transparent",
    colors: {},
  };
  const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
  return {
    element: Object.freeze({ id: element.id, width: element.width, height: element.height }),
    frame: config,
    canvas,
    objects: canvas,
    events: canvas.events,
    params,
    get streams() { return scriptRuntimeRef?.current?.getStreams?.(element.id) || window.__?.streams; },
    get object() { return canvas.get(element.id); },
    get transport() { return transportRef.current || {}; },
    get time() { return Math.max(0, Number(transportRef.current?.time) || 0); },
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

export default function ThreeFrame({ element, config: rawConfig, scriptRuntimeRef, transport, transportMode = "free" }) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const configCacheRef = useRef(null);
  const transportRef = useRef(transport);
  const modeRef = useRef(transportMode);
  transportRef.current = transport;
  modeRef.current = transportMode;
  const elementSnapshot = useMemo(() => ({
    id: element?.id || "",
    width: Math.max(1, Number(element?.width) || 1),
    height: Math.max(1, Number(element?.height) || 1),
  }), [element?.height, element?.id, element?.width]);
  configCacheRef.current = cacheThreeFrameConfig(configCacheRef.current, rawConfig);
  const config = configCacheRef.current.value;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let scene = null;
    let visible = document.visibilityState !== "hidden";
    let renderer = null;
    let resizeObserver = null;
    let intersectionObserver = null;
    let unregisterCapture = () => {};
    let cameraControls = null;
    let frameRequest = 0;
    let observerVisible = true;
    const disposers = [];
    const tickers = [];
    const captureRuntime = {};
    let frame = 0;
    let lastNow = null;
    let lastTime = null;
    let freeStartedAt = null;

    const report = (kind, message) => publishThreeStatus(elementSnapshot.id, kind, message);
    const start = async () => {
      try {
        renderer = new THREE.WebGLRenderer({ alpha: config.transparent, antialias: true });
        rendererRef.current = renderer;
        renderer.setPixelRatio(Math.min(config.pixelRatio, Math.max(1, Number(window.devicePixelRatio) || 1)));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = "underscores-three-canvas";
        renderer.domElement.setAttribute("aria-label", "Three.js output");
        host.replaceChildren(renderer.domElement);

        scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        camera.position.set(0, 0, 4);
        const bridge = createBridge(elementSnapshot, config, scriptRuntimeRef, transportRef);
        const tick = callback => {
          if (typeof callback !== "function") throw new TypeError("tick(callback) requires a function.");
          tickers.push(callback);
          return () => {
            const index = tickers.indexOf(callback);
            if (index >= 0) tickers.splice(index, 1);
          };
        };
        const onDispose = callback => {
          if (typeof callback !== "function") throw new TypeError("onDispose(callback) requires a function.");
          disposers.push(callback);
        };
        await compileThreeSource(config.source)(THREE, scene, camera, renderer, bridge, tick, onDispose);
        if (disposed) return;

        // Camera interaction is runtime-only. It is installed after authored
        // setup so scripts can still establish their initial camera, then a
        // learner can orbit/pan/zoom the patch without mutating scene state.
        cameraControls = createThreeCameraControls({ canvas: renderer.domElement, camera });

        const resize = () => {
          const rect = host.getBoundingClientRect();
          const width = Math.max(1, Math.round(rect.width || elementSnapshot.width));
          const height = Math.max(1, Math.round(rect.height || elementSnapshot.height));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        intersectionObserver = new IntersectionObserver(entries => {
          observerVisible = entries.some(entry => entry.isIntersecting);
        });
        intersectionObserver.observe(host);
        unregisterCapture = registerLivecodeCapture(elementSnapshot.id, () => (
          readWebglFrame(renderer.domElement, renderer.getContext(), captureRuntime)
        ));
        report("success", "Compiled successfully.");

        const paint = now => {
          if (disposed) return;
          const shouldRun = visible && observerVisible
            && isLivecodeTransportPlaying(modeRef.current, transportRef.current);
          const linked = modeRef.current !== "free";
          const time = linked
            ? Math.max(0, Number(transportRef.current?.time) || 0)
            : ((now - (freeStartedAt ?? now)) / 1000);
          if (freeStartedAt === null) freeStartedAt = now;
          const delta = lastNow === null || !shouldRun
            ? 0
            : linked
              ? Math.max(0, Math.min(0.25, time - (lastTime ?? time)))
              : Math.max(0, Math.min(0.25, (now - lastNow) / 1000));
          if (shouldRun) {
            const context = Object.freeze({
              time,
              delta,
              frame,
              transport: transportRef.current || {},
              scene,
              camera,
              renderer,
              __: bridge,
            });
            tickers.slice().forEach(callback => callback(context));
            frame += 1;
          }
          cameraControls?.update(lastNow === null ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000)));
          renderer.render(scene, camera);
          lastNow = now;
          lastTime = time;
          frameRequest = window.requestAnimationFrame(paint);
        };
        frameRequest = window.requestAnimationFrame(paint);
      } catch (error) {
        if (disposed) return;
        report("error", error instanceof Error ? error.message : String(error));
      }
    };
    const handleVisibility = () => { visible = document.visibilityState !== "hidden"; };
    document.addEventListener("visibilitychange", handleVisibility);
    void start();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameRequest);
      document.removeEventListener("visibilitychange", handleVisibility);
      unregisterCapture();
      cameraControls?.dispose?.();
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      disposers.splice(0).reverse().forEach(dispose => {
        try { dispose(); } catch { /* User cleanup must not block node disposal. */ }
      });
      disposeSceneResources(scene);
      // The scene is reachable only within start(), but Three's renderer and
      // its canvas must always be released even if authored setup threw.
      renderer?.dispose?.();
      renderer?.forceContextLoss?.();
      if (rendererRef.current === renderer) rendererRef.current = null;
      host.replaceChildren();
      report("clear");
    };
  }, [config, elementSnapshot, scriptRuntimeRef]);

  return <div
    className="underscores-three-frame"
    style={{ pointerEvents: config.allowInteraction === false ? "none" : "auto" }}
  ><div ref={hostRef} className="underscores-three-host" /></div>;
}
