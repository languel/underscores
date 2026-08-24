import { normalizeGlobalGrid } from "./gridSystem.js";
import { normalizeExpressiveSynthConfig } from "./expressiveSynth.js";
import { normalizeMixer } from "./mixerSystem.js";
import { normalizeP5Scripts } from "./p5Frame.js";
import { normalizeStreamGraph } from "./streamGraph.js";
import { normalizeBrushChannels } from "./brushChannelRuntime.js";
import { normalizeMediaSources } from "./mediaStream.js";
import { normalizeRelationshipGraph, serializeRelationshipGraphForScene } from "./relationshipGraph.js";
import { createArrangementState, remapArrangementForDuplicate } from "./arrangementClips.js";
import { createPlaylistState } from "./playlist.js";

const UNDERSCORES_EXCHANGE_VERSION = 12;

export const normalizeSceneExportFilename = (requestedName = "", date = new Date()) => {
  const fallback = `underscores-scene-${date.toISOString().slice(0, 10)}`;
  const raw = String(requestedName ?? "").trim();
  const sanitized = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const basename = sanitized.replace(/\.excalidraw$/i, "").trim();
  return `${basename || fallback}.excalidraw`;
};

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

export const attachUnderscoresExchangeMetadata = (serializedScene, kind, score = {}, grid = null, expressiveSynth = null, mixer = null, p5Scripts = [], streamGraph = null, brushChannels = null, authoredState = {}, relationshipGraph = null) => {
  const normalizedAuthoredState = authoredState && typeof authoredState === "object" ? authoredState : {};
  const payload = typeof serializedScene === "string"
    ? JSON.parse(serializedScene)
    : structuredClone(serializedScene);
  payload.elements = (payload.elements || []).map(withScoreAliases);
  return {
    ...payload,
    underscores: {
      version: UNDERSCORES_EXCHANGE_VERSION,
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
          arrangement: createArrangementState(normalizedAuthoredState.arrangement),
          playlist: createPlaylistState(normalizedAuthoredState.playlist),
        },
      } : {
        arrangement: createArrangementState(normalizedAuthoredState.arrangement),
        playlist: createPlaylistState(normalizedAuthoredState.playlist),
      }),
      relationshipGraph: serializeRelationshipGraphForScene(relationshipGraph),
    },
  };
};

export const parseUnderscoresExchange = (text, expectedKind = null) => {
  const payload = typeof text === "string" ? JSON.parse(text) : text;
  if (!payload || payload.type !== "excalidraw" || !Array.isArray(payload.elements)) {
    throw new Error("This is not an Excalidraw or Underscores scene JSON document.");
  }
  const kind = payload.underscores?.kind || "scene";
  if (expectedKind && kind !== expectedKind) {
    throw new Error(`Expected Underscores ${expectedKind} JSON, received ${kind} JSON.`);
  }
  return {
    payload,
    kind,
    score: payload.underscores?.score || null,
    grid: kind === "scene" ? normalizeGlobalGrid(payload.underscores?.grid) : null,
    expressiveSynth: kind === "scene" ? normalizeExpressiveSynthConfig(payload.underscores?.expressiveSynth) : null,
    mixer: kind === "scene" ? normalizeMixer(payload.underscores?.mixer) : null,
    p5Scripts: kind === "scene" ? normalizeP5Scripts(payload.underscores?.p5Scripts) : [],
    streamGraph: kind === "scene" ? normalizeStreamGraph(payload.underscores?.streamGraph) : null,
    brushChannels: kind === "scene" ? normalizeBrushChannels(payload.underscores?.brushChannels) : [],
    relationshipGraph: normalizeRelationshipGraph(payload.underscores?.relationshipGraph),
    authoredState: kind === "scene" && payload.underscores?.authoredState ? {
      mediaSources: normalizeMediaSources(payload.underscores?.authoredState?.mediaSources),
      brushPalette: Array.isArray(payload.underscores?.authoredState?.brushPalette) ? structuredClone(payload.underscores.authoredState.brushPalette) : [],
      iannixScripts: Array.isArray(payload.underscores?.authoredState?.iannixScripts) ? structuredClone(payload.underscores.authoredState.iannixScripts) : [],
      playCoreScripts: Array.isArray(payload.underscores?.authoredState?.playCoreScripts) ? structuredClone(payload.underscores.authoredState.playCoreScripts) : [],
      svgScripts: Array.isArray(payload.underscores?.authoredState?.svgScripts) ? structuredClone(payload.underscores.authoredState.svgScripts) : [],
      arrangement: createArrangementState(payload.underscores?.authoredState?.arrangement),
      playlist: createPlaylistState(payload.underscores?.authoredState?.playlist),
    } : null,
    arrangement: kind === "selection" ? createArrangementState(payload.underscores?.arrangement) : null,
    playlist: kind === "selection" ? createPlaylistState(payload.underscores?.playlist) : null,
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
    let customData = structuredClone(element.customData || {});
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
    customData = remapArrangementForDuplicate({ customData }).customData || customData;
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
