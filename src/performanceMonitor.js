const SAMPLE_WINDOW_MS = 750;
const LONG_FRAME_MS = 34;

const emptySnapshot = () => ({
  fps: 0,
  frameMs: 0,
  longFrames: 0,
  sceneChanges: 0,
  changedElements: 0,
  elements: 0,
  selected: 0,
  images: 0,
  svg: 0,
  livecode: 0,
  media: 0,
  physicsBodies: 0,
  physicsStepMs: 0,
  physicsTransferMs: 0,
  physicsRenderMs: 0,
  physicsEvents: 0,
  physicsDropped: 0,
  physicsRouteMs: 0,
  memoryMb: null,
  sampledAt: 0,
});

export const countPerformanceScene = (elements = [], selectedElementIds = {}) => {
  const active = elements.filter(element => element && !element.isDeleted);
  return active.reduce((stats, element) => {
    stats.elements += 1;
    if (selectedElementIds[element.id]) stats.selected += 1;
    if (element.type === "image") stats.images += 1;
    if (element.customData?.draweratorSvg) stats.svg += 1;
    if (element.customData?.draweratorLivecode) stats.livecode += 1;
    if (element.customData?.draweratorMediaStream) stats.media += 1;
    return stats;
  }, { elements: 0, selected: 0, images: 0, svg: 0, livecode: 0, media: 0 });
};

export const createPerformanceMonitor = ({ now = () => performance.now(), memory = () => performance.memory?.usedJSHeapSize } = {}) => {
  let snapshot = emptySnapshot();
  let enabled = false;
  let raf = 0;
  let sampleStarted = 0;
  let lastFrame = 0;
  let frames = 0;
  let frameTime = 0;
  let longFrames = 0;
  let sceneChanges = 0;
  let changedElements = 0;
  let sceneStats = countPerformanceScene();
  let sceneVersions = new Map();
  let physicsStats = {};
  const listeners = new Set();

  const notify = () => listeners.forEach(listener => listener());
  const publish = timestamp => {
    const elapsed = Math.max(1, timestamp - sampleStarted);
    const heap = Number(memory?.());
    snapshot = {
      ...sceneStats,
      ...physicsStats,
      fps: Math.round(frames * 1000 / elapsed),
      frameMs: frames ? Number((frameTime / frames).toFixed(1)) : 0,
      longFrames,
      sceneChanges: Number((sceneChanges * 1000 / elapsed).toFixed(1)),
      changedElements: Number((changedElements * 1000 / elapsed).toFixed(1)),
      memoryMb: Number.isFinite(heap) ? Math.round(heap / 1048576) : null,
      sampledAt: timestamp,
    };
    frames = 0;
    frameTime = 0;
    longFrames = 0;
    sceneChanges = 0;
    changedElements = 0;
    sampleStarted = timestamp;
    notify();
  };
  const loop = timestamp => {
    if (!enabled) return;
    if (!sampleStarted) sampleStarted = timestamp;
    if (lastFrame) {
      const duration = timestamp - lastFrame;
      frames += 1;
      frameTime += duration;
      if (duration >= LONG_FRAME_MS) longFrames += 1;
    }
    lastFrame = timestamp;
    if (timestamp - sampleStarted >= SAMPLE_WINDOW_MS) publish(timestamp);
    raf = requestAnimationFrame(loop);
  };

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return snapshot; },
    setEnabled(next) {
      enabled = Boolean(next);
      if (enabled && !raf) {
        sampleStarted = now();
        lastFrame = 0;
        raf = requestAnimationFrame(loop);
      } else if (!enabled && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        lastFrame = 0;
      }
    },
    recordScene(elements, appState, changedCount = null) {
      if (!enabled) return;
      sceneStats = countPerformanceScene(elements, appState?.selectedElementIds || {});
      if (changedCount === null) {
        const nextVersions = new Map((elements || []).map(element => [element.id, `${element.version || 0}:${element.isDeleted ? 1 : 0}`]));
        changedCount = 0;
        nextVersions.forEach((version, id) => { if (sceneVersions.get(id) !== version) changedCount += 1; });
        sceneVersions.forEach((_version, id) => { if (!nextVersions.has(id)) changedCount += 1; });
        sceneVersions = nextVersions;
      }
      sceneChanges += 1;
      changedElements += Math.max(0, Number(changedCount) || 0);
    },
    recordPhysics(stats = {}) {
      const metric = (key, previousKey) => stats[key] === undefined
        ? physicsStats[previousKey]
        : Math.max(0, Number(stats[key]) || 0);
      physicsStats = {
        physicsBodies: metric("bodies", "physicsBodies"),
        physicsStepMs: metric("stepMs", "physicsStepMs"),
        physicsTransferMs: metric("transferMs", "physicsTransferMs"),
        physicsRenderMs: metric("renderMs", "physicsRenderMs"),
        physicsEvents: metric("eventRate", "physicsEvents"),
        physicsDropped: metric("droppedEvents", "physicsDropped"),
        physicsRouteMs: metric("routeMs", "physicsRouteMs"),
      };
    },
  };
};

export const draweratorPerformanceMonitor = createPerformanceMonitor();
