import { normalizeGlobalGrid } from "./gridSystem.js";
import { normalizeExpressiveSynthConfig } from "./expressiveSynth.js";
import { normalizeMixer } from "./mixerSystem.js";
import { normalizeP5Scripts } from "./p5Frame.js";
import { normalizeStreamGraph } from "./streamGraph.js";
import { normalizeBrushChannels } from "./brushChannelRuntime.js";
import { normalizeMediaSources } from "./mediaStream.js";
import { normalizeRelationshipGraph, serializeRelationshipGraphForScene } from "./relationshipGraph.js";

const DRAWERATOR_EXCHANGE_VERSION = 9;

const scoreData = customData => customData?.score || customData?.iannix || null;
const withScoreAliases = element => {
  const source = scoreData(element?.customData);
  if (!source) return element;
  const score = structuredClone(source);
  return {
    ...element,
    customData: {
      ...(element.customData || {}),
      score,
      iannix: structuredClone(score),
    },
  };
};

export const attachDraweratorExchangeMetadata = (serializedScene, kind, score = {}, grid = null, expressiveSynth = null, mixer = null, p5Scripts = [], streamGraph = null, brushChannels = null, authoredState = {}, relationshipGraph = null) => {
  const normalizedAuthoredState = authoredState && typeof authoredState === "object" ? authoredState : {};
  const payload = typeof serializedScene === "string"
    ? JSON.parse(serializedScene)
    : structuredClone(serializedScene);
  payload.elements = (payload.elements || []).map(withScoreAliases);
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
        sampleRate: Number.isFinite(score.sampleRate) && score.sampleRate >= 8000 && score.sampleRate <= 768000 ? score.sampleRate : 48000,
        loop: {
          enabled: !!score.loop?.enabled,
          start: Number.isFinite(score.loop?.start) ? Math.max(0, score.loop.start) : 0,
          end: Number.isFinite(score.loop?.end) ? Math.max(0.1, score.loop.end) : 10,
          ...(score.loop?.startValue ? { startValue: structuredClone(score.loop.startValue) } : {}),
          ...(score.loop?.endValue ? { endValue: structuredClone(score.loop.endValue) } : {}),
        },
      },
      ...(kind === "scene" ? {
        grid: normalizeGlobalGrid(grid),
        expressiveSynth: normalizeExpressiveSynthConfig(expressiveSynth),
        mixer: normalizeMixer(mixer),
        p5Scripts: normalizeP5Scripts(p5Scripts),
        streamGraph: normalizeStreamGraph(streamGraph),
        brushChannels: normalizeBrushChannels(brushChannels),
        authoredState: {
          mediaSources: normalizeMediaSources(normalizedAuthoredState.mediaSources),
          brushPalette: Array.isArray(normalizedAuthoredState.brushPalette) ? structuredClone(normalizedAuthoredState.brushPalette) : [],
          iannixScripts: Array.isArray(normalizedAuthoredState.iannixScripts) ? structuredClone(normalizedAuthoredState.iannixScripts) : [],
          playCoreScripts: Array.isArray(normalizedAuthoredState.playCoreScripts) ? structuredClone(normalizedAuthoredState.playCoreScripts) : [],
          svgScripts: Array.isArray(normalizedAuthoredState.svgScripts) ? structuredClone(normalizedAuthoredState.svgScripts) : [],
        },
      } : {}),
      relationshipGraph: serializeRelationshipGraphForScene(relationshipGraph),
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
    expressiveSynth: kind === "scene" ? normalizeExpressiveSynthConfig(payload.drawerator?.expressiveSynth) : null,
    mixer: kind === "scene" ? normalizeMixer(payload.drawerator?.mixer) : null,
    p5Scripts: kind === "scene" ? normalizeP5Scripts(payload.drawerator?.p5Scripts) : [],
    streamGraph: kind === "scene" ? normalizeStreamGraph(payload.drawerator?.streamGraph) : null,
    brushChannels: kind === "scene" ? normalizeBrushChannels(payload.drawerator?.brushChannels) : [],
    relationshipGraph: normalizeRelationshipGraph(payload.drawerator?.relationshipGraph),
    authoredState: kind === "scene" && payload.drawerator?.authoredState ? {
      mediaSources: normalizeMediaSources(payload.drawerator?.authoredState?.mediaSources),
      brushPalette: Array.isArray(payload.drawerator?.authoredState?.brushPalette) ? structuredClone(payload.drawerator.authoredState.brushPalette) : [],
      iannixScripts: Array.isArray(payload.drawerator?.authoredState?.iannixScripts) ? structuredClone(payload.drawerator.authoredState.iannixScripts) : [],
      playCoreScripts: Array.isArray(payload.drawerator?.authoredState?.playCoreScripts) ? structuredClone(payload.drawerator.authoredState.playCoreScripts) : [],
      svgScripts: Array.isArray(payload.drawerator?.authoredState?.svgScripts) ? structuredClone(payload.drawerator.authoredState.svgScripts) : [],
    } : null,
  };
};

export const getSelectionExchangeElements = (elements, selectedElementIds) => {
  const selectedIds = new Set(Object.keys(selectedElementIds || {}).filter(id => selectedElementIds[id]));
  if (selectedIds.size === 0) return [];
  const liveElements = (elements || []).filter(element => !element.isDeleted);
  const liveIds = new Set(liveElements.map(element => element.id));
  let changed = true;
  while (changed) {
    changed = false;
    liveElements.forEach(element => {
      const parentId = element.customData?.parentId;
      const curveId = scoreData(element.customData)?.cursor?.curveId;
      const shouldInclude =
        (parentId && selectedIds.has(parentId)) ||
        (curveId && selectedIds.has(curveId)) ||
        (selectedIds.has(element.id) && curveId && liveIds.has(curveId));
      if (shouldInclude && !selectedIds.has(element.id)) {
        selectedIds.add(element.id);
        changed = true;
      }
      if (selectedIds.has(element.id) && curveId && liveIds.has(curveId) && !selectedIds.has(curveId)) {
        selectedIds.add(curveId);
        changed = true;
      }
    });
  }
  return liveElements.filter(element => selectedIds.has(element.id));
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
    const linkedCurveId = scoreData(customData)?.cursor?.curveId;
    if (linkedCurveId) {
      const nextCurveId = idMap.get(linkedCurveId) || (existingIds.has(linkedCurveId) ? linkedCurveId : null);
      if (customData.score?.cursor) customData.score.cursor.curveId = nextCurveId;
      if (customData.iannix?.cursor) customData.iannix.cursor.curveId = nextCurveId;
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
      customData: withScoreAliases({ customData }).customData || customData,
      selected: false,
      isDeleted: false,
      version: Math.max(1, (element.version || 0) + 1),
      versionNonce: Math.floor(Math.random() * 0x7fffffff),
      updated: Date.now(),
    };
  });
  return { elements, idMap };
};
