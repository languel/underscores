import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import { createScriptConsole } from "./scriptConsole.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";
import { readWebglFrame, registerLivecodeCapture } from "./livecodeCapture.js";
import { cacheThreeFrameConfig, compileThreeSource } from "./threeFrame.js";
import { createThreeCameraControls, THREE_CAMERA_CONTROLS_HINT } from "./threeCameraControls.js";

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

export default function ThreeFrame({ element, config: rawConfig, scriptRuntimeRef, transport, transportMode = "free", showCanvasHoverTips = true }) {
  const hostRef = useRef(null);
  const rendererRef = useRef(null);
  const activeRuntimeRef = useRef(null);
  const generationRef = useRef(0);
  const showCanvasHoverTipsRef = useRef(showCanvasHoverTips);
  const configCacheRef = useRef(null);
  const transportRef = useRef(transport);
  const modeRef = useRef(transportMode);
  transportRef.current = transport;
  modeRef.current = transportMode;
  showCanvasHoverTipsRef.current = showCanvasHoverTips;
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
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let cancelled = false;
    let activated = false;
    let released = false;
    let scene = null;
    let camera = null;
    let bridge = null;
    let visible = document.visibilityState !== "hidden";
    let renderer = null;
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
    const release = ({ clearHost = false, reportClear = false } = {}) => {
      if (released) return;
      released = true;
      window.cancelAnimationFrame(frameRequest);
      document.removeEventListener("visibilitychange", handleVisibility);
      unregisterCapture();
      cameraControls?.dispose?.();
      intersectionObserver?.disconnect();
      disposers.splice(0).reverse().forEach(dispose => {
        try { dispose(); } catch { /* User cleanup must not block node disposal. */ }
      });
      disposeSceneResources(scene);
      renderer?.dispose?.();
      renderer?.forceContextLoss?.();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (activeRuntimeRef.current?.generation === generation) activeRuntimeRef.current = null;
      if (clearHost) host.replaceChildren();
      if (reportClear) report("clear");
    };
    const handleVisibility = () => { visible = document.visibilityState !== "hidden"; };
    const paint = now => {
      if (released) return;
      const surfaceVisible = visible && observerVisible;
      const shouldRun = surfaceVisible
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
      const controlsChanged = surfaceVisible
        && cameraControls?.update(lastNow === null ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000))) === true;
      if (shouldRun || controlsChanged) renderer.render(scene, camera);
      lastNow = now;
      lastTime = time;
      frameRequest = window.requestAnimationFrame(paint);
    };
    const start = async () => {
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: config.transparent,
          antialias: true,
          // The shared stop path reads the default framebuffer once to retain
          // the last visible frame. Without this flag, WebGL is allowed to
          // discard the back buffer after presenting and the resulting PNG can
          // be fully transparent even though the live canvas was rendered.
          preserveDrawingBuffer: config.keepLastFrame,
        });
        renderer.setPixelRatio(Math.min(config.pixelRatio, Math.max(1, Number(window.devicePixelRatio) || 1)));
        // The outer Livecode node already scales with the board camera. Keep
        // the WebGL drawing buffer at the node's authored size so a zoom
        // gesture remains a compositor operation instead of reallocating every
        // Three.js framebuffer on every animation step.
        renderer.setSize(elementSnapshot.width, elementSnapshot.height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = "underscores-three-canvas";
        renderer.domElement.setAttribute("aria-label", "Three.js output");

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, elementSnapshot.width / elementSnapshot.height, 0.01, 1000);
        camera.position.set(0, 0, 4);
        bridge = createBridge(elementSnapshot, config, scriptRuntimeRef, transportRef);
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
        if (cancelled) {
          release();
          return;
        }

        // Camera interaction is runtime-only. It is installed after authored
        // setup so scripts can still establish their initial camera, then a
        // learner can orbit/pan/zoom the patch without mutating scene state.
        cameraControls = createThreeCameraControls({ canvas: renderer.domElement, camera });
        renderer.domElement.title = showCanvasHoverTipsRef.current ? THREE_CAMERA_CONTROLS_HINT : "";
        // Paint the candidate while it is still detached. The current runtime
        // stays visible until this succeeds, so valid source edits swap one
        // ready frame for another instead of exposing a cleared canvas.
        renderer.render(scene, camera);
        if (cancelled) {
          release();
          return;
        }

        intersectionObserver = new IntersectionObserver(entries => {
          observerVisible = entries.some(entry => entry.isIntersecting);
        });
        intersectionObserver.observe(host);
        unregisterCapture = registerLivecodeCapture(elementSnapshot.id, () => (
          readWebglFrame(renderer.domElement, renderer.getContext(), captureRuntime)
        ));
        document.addEventListener("visibilitychange", handleVisibility);
        const previousRuntime = activeRuntimeRef.current;
        activeRuntimeRef.current = { generation, release };
        rendererRef.current = renderer;
        activated = true;
        host.replaceChildren(renderer.domElement);
        previousRuntime?.release?.();
        report("success", "Compiled successfully.");
        frameRequest = window.requestAnimationFrame(paint);
      } catch (error) {
        release();
        if (cancelled) return;
        report("error", error instanceof Error ? error.message : String(error));
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (!activated) release();
      // React runs the next dependency effect after this cleanup in the same
      // commit. Deferring the unmount decision lets a replacement runtime keep
      // the current canvas alive, while a genuine component unmount still
      // releases whichever generation is active.
      queueMicrotask(() => {
        if (generationRef.current !== generation) return;
        activeRuntimeRef.current?.release?.({ clearHost: true, reportClear: true });
      });
    };
  }, [config, elementSnapshot, scriptRuntimeRef]);

  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (canvas) canvas.title = showCanvasHoverTips ? THREE_CAMERA_CONTROLS_HINT : "";
  }, [showCanvasHoverTips]);

  return <div
    className="underscores-three-frame"
    style={{ pointerEvents: config.allowInteraction === false ? "none" : "auto" }}
  ><div ref={hostRef} className="underscores-three-host" /></div>;
}
