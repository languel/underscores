import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createThreeCameraControls } from "./threeCameraControls.js";
import { getMediaSessionFileUrl, registerMediaRuntimeSource, subscribeMediaStreamRuntime } from "./mediaStreamRuntime.js";
import { fitThreeModelRootToFrame, inferThreeModelFormat, loadThreeModel, normalizeThreeModelSettings } from "./threeModel.js";

const publishStatus = (elementId, kind, message) => {
  if (typeof window === "undefined" || !elementId) return;
  window.dispatchEvent(new CustomEvent("underscores:media-stream-status", {
    detail: { elementId, kind, message, runtime: "three-model" },
  }));
};

const useSessionFileUrl = sourceFileId => {
  const [url, setUrl] = useState(() => getMediaSessionFileUrl(sourceFileId));
  useEffect(() => subscribeMediaStreamRuntime(detail => {
    if (detail.type === "file" && detail.elementId === sourceFileId) setUrl(getMediaSessionFileUrl(sourceFileId));
  }), [sourceFileId]);
  return url;
};

const disposeObject = object => {
  object?.traverse?.(entry => {
    entry.geometry?.dispose?.();
    const materials = Array.isArray(entry.material) ? entry.material : [entry.material];
    materials.forEach(material => {
      material?.map?.dispose?.();
      material?.normalMap?.dispose?.();
      material?.roughnessMap?.dispose?.();
      material?.metalnessMap?.dispose?.();
      material?.dispose?.();
    });
  });
};

const collectMorphTargets = root => {
  const targets = [];
  let meshIndex = 0;
  const meshNameCounts = new Map();
  root?.traverse?.(entry => {
    if (!entry.morphTargetDictionary || !entry.morphTargetInfluences) return;
    meshIndex += 1;
    const baseMeshName = String(entry.name || `mesh-${meshIndex}`);
    const meshNameCount = (meshNameCounts.get(baseMeshName) || 0) + 1;
    meshNameCounts.set(baseMeshName, meshNameCount);
    const meshName = meshNameCount > 1 ? `${baseMeshName} #${meshNameCount}` : baseMeshName;
    Object.keys(entry.morphTargetDictionary).forEach(name => {
      // Mesh UUIDs are regenerated on every load, so use the authored name
      // when available and a deterministic traversal index otherwise. This
      // keeps persisted blendshape values attached to the same target after
      // reloads while still disambiguating duplicate names.
      targets.push({
        id: `${meshName}:${name}`,
        name,
        meshName,
        mesh: entry,
        index: entry.morphTargetDictionary[name],
      });
    });
  });
  return targets;
};

const applyMorphTargets = (morphTargets, settings) => {
  const values = settings?.morphTargets || {};
  morphTargets.forEach(target => {
    const value = Object.hasOwn(values, target.id) ? values[target.id] : values[target.name];
    if (value === undefined) return;
    target.mesh.morphTargetInfluences[target.index] = Math.max(0, Math.min(1, Number(value) || 0));
  });
};

const modelAnimationName = (settings, animations) => {
  if (!animations.length) return "";
  const requested = String(settings?.animation || "");
  return animations.some(clip => clip.name === requested) ? requested : animations[0].name;
};

/**
 * A small Three.js model host used by Media sources and their canvas previews.
 * It owns only runtime resources; the source's URL, animation choice, and
 * morph values remain ordinary normalized media configuration.
 */
export default function ThreeModelPreview({ source, sourceFileId = source?.id, runtimeId = source?.id, className = "", interactive = true, transportTime = 0, transportPlaying = false, onModelInfo }) {
  const hostRef = useRef(null);
  const runtimeRef = useRef(null);
  const sourceRef = useRef(source);
  const transportRef = useRef({ time: 0, playing: false });
  const sessionUrl = useSessionFileUrl(sourceFileId);
  const url = sessionUrl || String(source?.media?.url || "").trim();
  const format = inferThreeModelFormat(source?.media?.fileName || url, source?.media?.modelFormat);
  const sourceKey = `${sourceFileId || ""}\u0000${url}\u0000${format}`;
  const settingsKey = JSON.stringify(normalizeThreeModelSettings(source?.model));
  sourceRef.current = source;
  transportRef.current = { time: Number(transportTime) || 0, playing: transportPlaying === true };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) return undefined;
    let disposed = false;
    let renderer = null;
    let scene = null;
    let camera = null;
    let root = null;
    let mixer = null;
    let action = null;
    let controls = null;
    let frameRequest = 0;
    let lastNow = null;
    let visible = true;
    let hasRendered = false;
    let lastPaintedSettingsKey = "";
    let observer = null;
    const morphTargets = [];
    const animations = [];

    const resize = () => {
      if (!renderer || !camera) return;
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || 480));
      const height = Math.max(1, Math.round(rect.height || 320));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const syncAnimation = () => {
      if (!mixer) return;
      const settings = normalizeThreeModelSettings(sourceRef.current?.model);
      const selectedName = modelAnimationName(settings, animations);
      if (!action || action.getClip().name !== selectedName) {
        action?.stop?.();
        const clip = animations.find(candidate => candidate.name === selectedName);
        action = clip ? mixer.clipAction(clip) : null;
        if (action) {
          action.setLoop(settings.loop ? THREE.LoopRepeat : THREE.LoopOnce, settings.loop ? Infinity : 1);
          action.clampWhenFinished = !settings.loop;
        }
      }
      mixer.timeScale = settings.playbackRate;
      if (action) {
        if (settings.playing && (!action.isRunning() || action.paused)) {
          action.paused = false;
          action.play();
        }
        if (!settings.playing) action.paused = true;
      }
      applyMorphTargets(morphTargets, settings);
    };
    const release = () => {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(frameRequest);
      observer?.disconnect?.();
      controls?.dispose?.();
      resizeObserver?.disconnect?.();
      unregister?.();
      if (runtimeRef.current?.runtimeId === runtimeId) runtimeRef.current = null;
      disposeObject(root);
      renderer?.dispose?.();
      renderer?.forceContextLoss?.();
      if (host) host.replaceChildren();
    };
    let resizeObserver = null;
    let unregister = null;

    const start = async () => {
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1)));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = "underscores-three-model-canvas";
        renderer.domElement.setAttribute("aria-label", "3D model preview");
        renderer.domElement.style.cursor = interactive ? "grab" : "default";
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
        camera.position.set(0, 0, 4);
        scene.add(new THREE.HemisphereLight(0x8bd5ff, 0x101522, 1.8));
        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(3, 4, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xff7aa2, 0.8);
        fill.position.set(-3, 1, 2);
        scene.add(fill);
        const loaded = await loadThreeModel(url, { format });
        if (disposed) { disposeObject(loaded.root); return; }
        root = loaded.root;
        fitThreeModelRootToFrame(root);
        scene.add(root);
        animations.push(...loaded.animations);
        morphTargets.push(...collectMorphTargets(root));
        if (animations.length) mixer = new THREE.AnimationMixer(root);
        resize();
        if (interactive) controls = createThreeCameraControls({ canvas: renderer.domElement, camera });
        unregister = registerMediaRuntimeSource(runtimeId, {
          element: renderer.domElement,
          kind: "model",
          isPlaying: () => normalizeThreeModelSettings(sourceRef.current?.model).playing,
          stream: () => typeof renderer.domElement.captureStream === "function"
            ? renderer.domElement.captureStream(30)
            : null,
        });
        runtimeRef.current = { runtimeId, renderer, scene, camera, root, mixer, animations, morphTargets };
        onModelInfo?.({ format: loaded.format, sourceFormat: loaded.sourceFormat, archiveEntry: loaded.archiveEntry, animations: animations.map(clip => ({ name: clip.name, duration: clip.duration })), morphTargets: morphTargets.map(target => ({ id: target.id, name: target.name, meshName: target.meshName })) });
        publishStatus(sourceFileId, "success", loaded.sourceFormat === "zip"
          ? `OBJ model loaded from ZIP (${loaded.archiveEntry || "archive entry"}).`
          : `${loaded.format.toUpperCase()} model loaded.`);
        host.replaceChildren(renderer.domElement);
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); });
        observer.observe(host);
        const paint = now => {
          if (disposed) return;
          const delta = lastNow === null ? 0 : Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
          lastNow = now;
          syncAnimation();
          const settings = normalizeThreeModelSettings(sourceRef.current?.model);
          const currentSettingsKey = JSON.stringify(settings);
          const shouldAnimate = visible && settings.playing && Boolean(mixer && action);
          if (shouldAnimate) mixer.update(delta);
          const controlsChanged = visible && controls?.update(delta) === true;
          // Static models still need one paint. Animated models and camera
          // interaction continue to repaint; skipping idle renders keeps a
          // catalog full of paused models inexpensive.
          if (visible && (!hasRendered || shouldAnimate || controlsChanged || lastPaintedSettingsKey !== currentSettingsKey)) {
            renderer.render(scene, camera);
            hasRendered = true;
            lastPaintedSettingsKey = currentSettingsKey;
          }
          frameRequest = window.requestAnimationFrame(paint);
        };
        frameRequest = window.requestAnimationFrame(paint);
      } catch (error) {
        if (!disposed) {
          publishStatus(sourceFileId, "error", error?.message || "3D model could not be loaded.");
        }
      }
    };
    void start();
    return release;
  // `sourceKey` intentionally excludes animation/morph settings. Those are
  // applied by the existing render loop without rebuilding the WebGL context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, runtimeId, sourceFileId, interactive, onModelInfo]);

  // Keep refs current and make a paused/seeked linked preview repaint without
  // rebuilding the loaded model. AnimationMixer is intentionally local-time
  // based; the transport controls only gate playback in this first release.
  useEffect(() => {
    sourceRef.current = source;
    transportRef.current = { time: Number(transportTime) || 0, playing: transportPlaying === true };
  }, [settingsKey, source, transportPlaying, transportTime]);

  return <div className={`underscores-three-model-preview ${className}`.trim()}><div ref={hostRef} className="underscores-three-model-host" /></div>;
}
