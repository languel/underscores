import { normalizeGlobalGrid } from "./gridSystem.js";

const DRAWERATOR_EXCHANGE_VERSION = 2;

export const attachDraweratorExchangeMetadata = (serializedScene, kind, score = {}, grid = null) => {
  const payload = typeof serializedScene === "string"
    ? JSON.parse(serializedScene)
    : structuredClone(serializedScene);
  return {
    ...payload,
    drawerator: {
      version: DRAWERATOR_EXCHANGE_VERSION,
      kind,
      score: {
        time: Number.isFinite(score.time) ? score.time : 0,
        rate: Number.isFinite(score.rate) && score.rate > 0 ? score.rate : 1,
        tempo: Number.isFinite(score.tempo) && score.tempo >= 20 && score.tempo <= 400 ? score.tempo : 120,
        timeSignature: {
          numerator: Number.isFinite(score.timeSignature?.numerator) ? score.timeSignature.numerator : 4,
          denominator: Number.isFinite(score.timeSignature?.denominator) ? score.timeSignature.denominator : 4,
        },
        displayMode: ["frame", "timecode", "beats"].includes(score.displayMode) ? score.displayMode : "timecode",
        fps: [24, 25, 30, 50, 60].includes(score.fps) ? score.fps : 30,
        loop: {
          enabled: !!score.loop?.enabled,
          start: Number.isFinite(score.loop?.start) ? Math.max(0, score.loop.start) : 0,
          end: Number.isFinite(score.loop?.end) ? Math.max(0.1, score.loop.end) : 10,
        },
      },
      ...(kind === "scene" ? { grid: normalizeGlobalGrid(grid) } : {}),
    },
  };
};

export const parseDraweratorExchange = (text, expectedKind = null) => {
  const payload = typeof text === "string" ? JSON.parse(text) : text;
  if (!payload || payload.type !== "excalidraw" || !Array.isArray(payload.elements)) {
    throw new Error("This is not an Excalidraw or Drawerator scene JSON document.");
  }
  const kind = payload.drawerator?.kind || "scene";
  if (expectedKind && kind !== expectedKind) {
    throw new Error(`Expected Drawerator ${expectedKind} JSON, received ${kind} JSON.`);
  }
  return {
    payload,
    kind,
    score: payload.drawerator?.score || null,
    grid: kind === "scene" ? normalizeGlobalGrid(payload.drawerator?.grid) : null,
  };
};

export const getSelectionExchangeElements = (elements, selectedElementIds) => {
  const selectedIds = new Set(Object.keys(selectedElementIds || {}).filter(id => selectedElementIds[id]));
  if (selectedIds.size === 0) return [];
  return (elements || []).filter(element =>
    !element.isDeleted && (
      selectedIds.has(element.id) ||
      (element.customData?.parentId && selectedIds.has(element.customData.parentId))
    )
  );
};

const remapBinding = (binding, idMap, existingIds) => {
  if (!binding?.elementId) return binding;
  const elementId = idMap.get(binding.elementId) || (existingIds.has(binding.elementId) ? binding.elementId : null);
  return elementId ? { ...binding, elementId } : null;
};

export const remapSelectionForImport = (
  importedElements,
  existingElements,
  createId = () => crypto.randomUUID(),
  offset = { x: 24, y: 24 },
) => {
  const source = (importedElements || []).filter(element => !element.isDeleted);
  const existingIds = new Set((existingElements || []).map(element => element.id));
  const idMap = new Map(source.map(element => [element.id, createId()]));
  const groupIds = new Map();
  source.forEach(element => (element.groupIds || []).forEach(groupId => {
    if (!groupIds.has(groupId)) groupIds.set(groupId, createId());
  }));

  const elements = source.map(element => {
    const customData = structuredClone(element.customData || {});
    if (customData.parentId) {
      customData.parentId = idMap.get(customData.parentId) || null;
    }
    const linkedCurveId = customData.iannix?.cursor?.curveId;
    if (linkedCurveId) {
      customData.iannix.cursor.curveId = idMap.get(linkedCurveId) ||
        (existingIds.has(linkedCurveId) ? linkedCurveId : null);
    }
    const boundElements = (element.boundElements || [])
      .map(bound => ({ ...bound, id: idMap.get(bound.id) || (existingIds.has(bound.id) ? bound.id : null) }))
      .filter(bound => bound.id);
    return {
      ...structuredClone(element),
      id: idMap.get(element.id),
      x: element.x + (offset.x || 0),
      y: element.y + (offset.y || 0),
      groupIds: (element.groupIds || []).map(groupId => groupIds.get(groupId)),
      frameId: idMap.get(element.frameId) || null,
      containerId: idMap.get(element.containerId) || (existingIds.has(element.containerId) ? element.containerId : null),
      boundElements: boundElements.length > 0 ? boundElements : null,
      startBinding: remapBinding(element.startBinding, idMap, existingIds),
      endBinding: remapBinding(element.endBinding, idMap, existingIds),
      customData,
      selected: false,
      isDeleted: false,
      version: Math.max(1, (element.version || 0) + 1),
      versionNonce: Math.floor(Math.random() * 0x7fffffff),
      updated: Date.now(),
    };
  });
  return { elements, idMap };
};
