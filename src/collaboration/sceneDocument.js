import { addPrecedingElementMarkers, reconcileCollaborationElements } from "./reconciliation.js";

export const COLLABORATION_SCHEMA_VERSION = 1;

const clone = value => value === undefined ? undefined : structuredClone(value);
const compareStamp = (left, right) => {
  const clockDifference = Number(left?.clock || 0) - Number(right?.clock || 0);
  return clockDifference || String(left?.actorId || "").localeCompare(String(right?.actorId || ""));
};
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const SIMPLE_PATHS = Object.freeze([
  "appState.viewBackgroundColor",
  "underscores.score",
  "underscores.grid",
  "underscores.expressiveSynth",
  "underscores.mixer",
  "underscores.streamGraph",
  "underscores.brushChannels",
  "underscores.relationshipGraph",
  "underscores.authoredState.arrangement",
  "underscores.authoredState.playlist",
]);

const RECORD_PATHS = Object.freeze([
  "underscores.p5Scripts",
  "underscores.authoredState.mediaSources",
  "underscores.authoredState.brushPalette",
  "underscores.authoredState.iannixScripts",
  "underscores.authoredState.playCoreScripts",
  "underscores.authoredState.svgScripts",
]);

const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const setPath = (object, path, value) => {
  const keys = path.split(".");
  let cursor = object;
  keys.slice(0, -1).forEach(key => {
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key];
  });
  if (value === undefined) delete cursor[keys.at(-1)];
  else cursor[keys.at(-1)] = clone(value);
};

const authoredScore = score => {
  const next = clone(score || {});
  delete next.time;
  return next;
};

export const collaborationMetadata = document => ({
  schemaVersion: COLLABORATION_SCHEMA_VERSION,
  clock: Number(document?.underscores?.collaboration?.clock || 0),
  revisions: clone(document?.underscores?.collaboration?.revisions || {}),
});

export const toCollaborationSceneDocument = source => {
  const input = typeof source === "string" ? JSON.parse(source) : source;
  if (!input || input.type !== "excalidraw" || !Array.isArray(input.elements)) throw new Error("Multiplayer requires an Underscores scene document.");
  const document = {
    type: "excalidraw",
    version: Number(input.version || 2),
    source: "https://github.com/languel/underscores",
    elements: clone(input.elements),
    appState: {
      viewBackgroundColor: input.appState?.viewBackgroundColor,
    },
    underscores: clone(input.underscores || {}),
  };
  delete document.files;
  document.underscores.version = 13;
  document.underscores.kind = "scene";
  document.underscores.score = authoredScore(document.underscores.score);
  document.underscores.collaboration = collaborationMetadata(document);
  return document;
};

// Collaboration documents deliberately contain only authored app state. Merge
// that narrow state over the receiving editor's current app state so remote
// scene updates cannot move its camera, change its tool, or clear its selection.
export const mergeCollaborationAppState = (localAppState = {}, authoredAppState = {}) => ({
  ...clone(localAppState || {}),
  ...clone(authoredAppState || {}),
});

const recordId = (path, record, index) => String(
  record?.id
  || record?.scriptId
  || record?.sourceId
  || record?.name
  || `${path}-record-${index}`
);
const recordMap = (value, path = "record") => new Map((Array.isArray(value) ? value : []).filter(Boolean).map((record, index) => [recordId(path, record, index), record]));

export const stampCollaborationDocument = (source, previous, actorId) => {
  const document = toCollaborationSceneDocument(source);
  const prior = previous ? toCollaborationSceneDocument(previous) : null;
  const metadata = collaborationMetadata(prior || document);
  let clock = metadata.clock;
  const revisions = metadata.revisions;
  const stamp = path => {
    clock += 1;
    revisions[path] = { clock, actorId: String(actorId || "anonymous") };
  };

  SIMPLE_PATHS.forEach(path => {
    if (!prior || !equal(getPath(document, path), getPath(prior, path))) stamp(path);
  });
  RECORD_PATHS.forEach(path => {
    const nextRecords = recordMap(getPath(document, path), path);
    const priorRecords = recordMap(getPath(prior, path), path);
    new Set([...nextRecords.keys(), ...priorRecords.keys()]).forEach(id => {
      if (!prior || !equal(nextRecords.get(id), priorRecords.get(id))) stamp(`${path}.${id}`);
    });
  });
  document.underscores.collaboration = { schemaVersion: COLLABORATION_SCHEMA_VERSION, clock, revisions };
  return { document, changed: !prior || clock !== metadata.clock };
};

const mergeSimplePath = (target, local, remote, path) => {
  const localStamp = local.underscores?.collaboration?.revisions?.[path];
  const remoteStamp = remote.underscores?.collaboration?.revisions?.[path];
  if (compareStamp(remoteStamp, localStamp) > 0) setPath(target, path, getPath(remote, path));
};

const mergeRecordPath = (target, local, remote, path) => {
  const localRecords = recordMap(getPath(local, path), path);
  const remoteRecords = recordMap(getPath(remote, path), path);
  const localRevisions = local.underscores?.collaboration?.revisions || {};
  const remoteRevisions = remote.underscores?.collaboration?.revisions || {};
  const ids = new Set([...localRecords.keys(), ...remoteRecords.keys()]);
  const result = [];
  ids.forEach(id => {
    const key = `${path}.${id}`;
    const useRemote = compareStamp(remoteRevisions[key], localRevisions[key]) > 0;
    const record = useRemote ? remoteRecords.get(id) : localRecords.get(id);
    if (record) result.push(clone(record));
  });
  result.sort((left, right) => recordId(path, left, 0).localeCompare(recordId(path, right, 0)));
  setPath(target, path, result);
};

export const mergeCollaborationDocuments = (localSource, remoteSource, appState = {}) => {
  const local = toCollaborationSceneDocument(localSource);
  const remote = toCollaborationSceneDocument(remoteSource);
  const merged = clone(local);
  merged.elements = reconcileCollaborationElements(local.elements, remote.elements, appState);
  SIMPLE_PATHS.forEach(path => mergeSimplePath(merged, local, remote, path));
  RECORD_PATHS.forEach(path => mergeRecordPath(merged, local, remote, path));
  const localMetadata = collaborationMetadata(local);
  const remoteMetadata = collaborationMetadata(remote);
  merged.underscores.collaboration = {
    schemaVersion: COLLABORATION_SCHEMA_VERSION,
    clock: Math.max(localMetadata.clock, remoteMetadata.clock),
    revisions: { ...localMetadata.revisions },
  };
  Object.entries(remoteMetadata.revisions).forEach(([path, stamp]) => {
    if (compareStamp(stamp, merged.underscores.collaboration.revisions[path]) > 0) {
      merged.underscores.collaboration.revisions[path] = clone(stamp);
    }
  });
  return merged;
};

export const prepareDocumentForBroadcast = source => {
  const document = toCollaborationSceneDocument(source);
  document.elements = addPrecedingElementMarkers(document.elements);
  return document;
};

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
};

/**
 * A deterministic, synchronous representation used for duplicate suppression.
 * The encrypted SHA-256 digest remains the wire/cache identifier; this form is
 * deliberately kept local so a hot onChange path never queues another async
 * reconciliation just to discover that nothing changed.
 */
export const collaborationDocumentSignature = source => JSON.stringify(stable(toCollaborationSceneDocument(source)));

export const collaborationAuthoredStateSignature = source => {
  const document = toCollaborationSceneDocument(source);
  return JSON.stringify(stable({
    appState: document.appState,
    underscores: document.underscores,
  }));
};

export const collaborationDocumentDigest = async source => {
  const bytes = new TextEncoder().encode(collaborationDocumentSignature(source));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};
