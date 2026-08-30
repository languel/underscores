import test from "node:test";
import assert from "node:assert/strict";
import {
  attachUnderscoresExchangeMetadata,
  createObsidianExcalidrawMarkdown,
  getSelectionExchangeElements,
  isObsidianSceneExportFilename,
  normalizeObsidianSceneExportFilename,
  normalizePatchExportFilename,
  normalizeSceneExportFilename,
  parseUnderscoresExchange,
  preserveDeletedSceneElements,
  remapSelectionForImport,
} from "./sceneExchange.js";
import { mergeGridPatch, DEFAULT_GLOBAL_GRID } from "./gridSystem.js";
import { DEFAULT_EXPRESSIVE_SYNTH_CONFIG, mergeExpressiveSynthConfig, normalizeExpressiveSynthConfig, upsertExpressiveSynthProgram } from "./expressiveSynth.js";
import { MIXER_DESTINATION_INTERNAL, MIXER_INSTRUMENT_EXPRESSIVE, normalizeMixer } from "./mixerSystem.js";

test("scene export filenames accept optional names and remain safe", () => {
  const date = new Date("2026-08-16T12:34:56.000Z");
  assert.equal(normalizeSceneExportFilename("bioblip_melody", date), "bioblip_melody.excalidraw");
  assert.equal(normalizeSceneExportFilename("bioblip_melody.excalidraw", date), "bioblip_melody.excalidraw");
  assert.equal(normalizeSceneExportFilename("folder/bioblip", date), "folder_bioblip.excalidraw");
  assert.equal(normalizeSceneExportFilename("", date), "underscores-scene-2026-08-16.excalidraw");
});

test("patch export filenames use the .__.json convention", () => {
  const date = new Date("2026-08-16T12:34:56.000Z");
  assert.equal(normalizePatchExportFilename("lesson", date), "lesson.__.json");
  assert.equal(normalizePatchExportFilename("lesson.__.json", date), "lesson.__.json");
  assert.equal(normalizePatchExportFilename("lesson.excalidraw", date), "lesson.__.json");
  assert.equal(normalizePatchExportFilename("", date), "underscores-patch-2026-08-16.__.json");
});

test("project, fragment, and help patch metadata round-trip without changing exchange kinds", () => {
  const project = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {}, null, null, null, [], null, null, {}, null, null, {
    kind: "project", id: "project-a", title: "Project A", tags: ["class"],
  });
  const fragment = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "selection", {}, null, null, null, [], null, null, {}, null, null, {
    kind: "fragment", id: "fragment-a", title: "Node A",
  });
  const help = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {}, null, null, null, [], null, null, {}, null, null, {
    kind: "help", id: "help-a", title: "Help A", summary: "A reusable lesson patch.",
  });
  assert.deepEqual(parseUnderscoresExchange(project, "scene").patch, project.underscores.patch);
  assert.equal(parseUnderscoresExchange(fragment, "selection").patch.kind, "fragment");
  assert.equal(parseUnderscoresExchange(fragment, "selection").kind, "selection");
  assert.equal(parseUnderscoresExchange(help, "scene").patch.kind, "help");
  assert.equal(parseUnderscoresExchange(help, "scene").kind, "scene");
});

test("scene export detects and normalizes Obsidian Markdown names", () => {
  const date = new Date("2026-08-16T12:34:56.000Z");
  assert.equal(isObsidianSceneExportFilename("lecture01.md"), true);
  assert.equal(isObsidianSceneExportFilename("lecture01.excalidraw"), false);
  assert.equal(normalizeObsidianSceneExportFilename("lecture01.md", date), "lecture01.md");
  assert.equal(normalizeObsidianSceneExportFilename("lecture01.excalidraw.md", date), "lecture01.excalidraw.md");
  assert.equal(normalizeObsidianSceneExportFilename("", date), "underscores-scene-2026-08-16.md");
});

test("Obsidian Excalidraw Markdown wraps the scene in the plugin's drawing section", () => {
  const sceneJson = JSON.stringify({ type: "excalidraw", elements: [], files: {} }, null, 2);
  const markdown = createObsidianExcalidrawMarkdown(sceneJson);
  assert.match(markdown, /^---\nexcalidraw-plugin: parsed\n/);
  assert.match(markdown, /# Excalidraw Data\n\n## Text Elements\n%%\n## Drawing\n```json\n/);
  assert.match(markdown, /\n```\n%%\n$/);
  assert.match(markdown, new RegExp(sceneJson.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("scene exchange metadata preserves Underscores score state", () => {
  const payload = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {
    time: 4.5,
    rate: 2,
    tempo: 96,
    timeSignature: { numerator: 7, denominator: 8 },
    displayMode: "beats",
    fps: 25,
    loop: { enabled: true, start: 2, end: 12 },
  });
  const parsed = parseUnderscoresExchange(JSON.stringify(payload), "scene");
  assert.deepEqual(parsed.score, {
    time: 4.5,
    rate: 2,
    tempo: 96,
    timeSignature: { numerator: 7, denominator: 8 },
    displayMode: "beats",
    fps: 25,
    sampleRate: 48000,
    loop: { enabled: true, start: 2, end: 12 },
  });
});

test("scene exchange preserves frame timeline display mode", () => {
  const payload = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", { displayMode: "frame", fps: 24 });
  assert.equal(payload.underscores.score.displayMode, "frame");
  assert.equal(payload.underscores.score.fps, 24);
});

test("scene exchange version 14 preserves streams, brush channels, global configuration, p5 scripts, relationships, and migrates legacy scenes", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    appearance: { visible: true },
    spacing: { x: 120, y: 80, subdivisionsX: 6, subdivisionsY: 4 },
    time: { amount: 2, unit: "bar" },
  });
  const synth = upsertExpressiveSynthProgram(
    mergeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, { preset: "fm", referenceNote: 48 }),
    { id: "user-glass", label: "Glass", preset: "fm", brightness: 0.9 },
  );
  const mixer = normalizeMixer({ tracks: [{ id: "fm", midiChannel: 3, destination: MIXER_DESTINATION_INTERNAL, instrument: MIXER_INSTRUMENT_EXPRESSIVE, program: "user-glass" }] });
  const p5Scripts = [{ id: "orbit", name: "Orbit", source: "p.setup = () => {};", mode: "instance" }];
  const streamGraph = {
    sources: [{ id: "serial", name: "Serial", type: "serial", streamId: "serial-space", kind: "space", serial: { mode: "delimited", delimiter: ",", baudRate: 115200 } }],
    processors: [{ id: "gate", type: "threshold", sourceId: "serial-space", outputId: "gate-events", threshold: { rising: 0.8, falling: 0.2 } }],
  };
  const brushChannels = [{ id: "serial-brush", spatialStreamId: "serial-space", gateStreamId: "gate-events", destination: { kind: "viewport" } }];
  const relationshipGraph = {
    systems: [{ id: "gas", name: "Gas" }], bodies: [], populations: [], constraints: [], routes: [],
    mappings: [{
      id: "gas-note",
      source: { kind: "physics-collision", systemId: "gas", phases: ["hit"], classes: ["body-wall"], field: "impulse", range: { min: 0, max: 10 } },
      filter: { min: 0.2, expression: "speed > 0" },
      transform: { outputMin: 1, outputMax: 127, expression: "round(value)" },
      target: { kind: "midi-note", channel: 2, note: 67, velocityExpression: "value" },
    }],
  };
  const payload = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {}, grid, synth, mixer, p5Scripts, streamGraph, brushChannels, null, relationshipGraph);
  assert.equal(payload.underscores.version, 14);
  assert.deepEqual(parseUnderscoresExchange(payload, "scene").grid, grid);
  assert.deepEqual(parseUnderscoresExchange(payload, "scene").expressiveSynth, normalizeExpressiveSynthConfig(synth));
  assert.deepEqual(parseUnderscoresExchange(payload, "scene").mixer, mixer);
  assert.equal(parseUnderscoresExchange(payload, "scene").p5Scripts[0].id, "orbit");
  assert.equal(parseUnderscoresExchange(payload, "scene").streamGraph.sources[0].streamId, "serial-space");
  assert.equal(parseUnderscoresExchange(payload, "scene").streamGraph.processors[0].outputId, "gate-events");
  assert.equal(parseUnderscoresExchange(payload, "scene").brushChannels[0].gateStreamId, "gate-events");
  assert.equal(parseUnderscoresExchange(payload, "scene").relationshipGraph.systems[0].id, "gas");
  assert.equal(parseUnderscoresExchange(payload, "scene").relationshipGraph.mappings[0].target.note, 67);
  assert.equal(Object.hasOwn(payload.underscores.relationshipGraph, "routes"), false);

  const legacy = { type: "excalidraw", elements: [], underscores: { version: 1, kind: "scene", score: {} } };
  const migrated = parseUnderscoresExchange(legacy, "scene").grid;
  assert.equal(migrated.appearance.visible, false);
  assert.equal(migrated.snap.mode, "off");
  assert.deepEqual(parseUnderscoresExchange(legacy, "scene").expressiveSynth, normalizeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG));
  assert.equal(parseUnderscoresExchange(legacy, "scene").mixer.tracks.length, 16);
  assert.deepEqual(parseUnderscoresExchange(legacy, "scene").relationshipGraph.systems, []);
});

test("scene exchange version 14 carries collaboration revisions only for full scenes", () => {
  const collaboration = {
    schemaVersion: 1,
    clock: 4,
    revisions: { "underscores.p5Scripts.orbit": { clock: 4, actorId: "student-a" } },
  };
  const scene = attachUnderscoresExchangeMetadata(
    { type: "excalidraw", elements: [] },
    "scene",
    {}, null, null, null, [], null, null, {}, null,
    collaboration,
  );
  const selection = attachUnderscoresExchangeMetadata(
    { type: "excalidraw", elements: [] },
    "selection",
    {}, null, null, null, [], null, null, {}, null,
    collaboration,
  );
  assert.deepEqual(parseUnderscoresExchange(scene, "scene").collaboration, collaboration);
  assert.equal(parseUnderscoresExchange(selection, "selection").collaboration, null);
  assert.equal(selection.underscores.collaboration, undefined);
});

test("collaboration payloads retain Excalidraw deletion tombstones", () => {
  const live = { id: "live", type: "rectangle", version: 2, versionNonce: 4, isDeleted: false };
  const deleted = { id: "deleted", type: "rectangle", version: 3, versionNonce: 5, isDeleted: true };
  const payload = preserveDeletedSceneElements({ type: "excalidraw", elements: [live] }, [live, deleted]);
  assert.deepEqual(payload.elements.map(element => [element.id, element.isDeleted]), [["live", false], ["deleted", true]]);
  assert.notEqual(payload.elements[1], deleted);
});

test("scene exchange version 14 keeps authored background but drops local camera and tool state", () => {
  const payload = attachUnderscoresExchangeMetadata({
    type: "excalidraw",
    elements: [],
    appState: {
      viewBackgroundColor: "#f8f9fa",
      scrollX: 120,
      scrollY: -40,
      zoom: { value: 2 },
      activeTool: { type: "rectangle" },
      selectedElementIds: { selected: true },
      theme: "light",
    },
  }, "scene");
  assert.deepEqual(payload.appState, { viewBackgroundColor: "#f8f9fa" });
});

test("scene exchange preserves authored media sources and reusable code definitions", () => {
  const authoredState = {
    mediaSources: [{ id: "camera-main", name: "Main camera", kind: "camera", enabled: true }],
    brushPalette: [{ id: "my-pen", name: "My pen", code: "return points;" }],
    iannixScripts: [{ id: "score-a", name: "Score A", source: 'run("clear");' }],
    playCoreScripts: [{ id: "ascii-a", name: "ASCII A", source: "export function main() {}" }],
    svgScripts: [{ id: "svg-a", name: "SVG A", source: '<svg xmlns="http://www.w3.org/2000/svg" />' }],
    arrangement: { takes: [{ id: "take-a", name: "Take A", solo: true }], recording: { mode: "step", stepValue: "1 f", stepDurationMode: "hold" } },
    walkthroughs: [{ type: "underscores-walkthrough", version: 1, id: "tour", revision: 1, title: "Tour", steps: [] }],
  };
  const payload = attachUnderscoresExchangeMetadata(
    { type: "excalidraw", elements: [] }, "scene", {}, null, null, null, [], null, null, authoredState,
  );
  const restored = parseUnderscoresExchange(payload, "scene").authoredState;
  assert.equal(restored.mediaSources[0].id, "camera-main");
  assert.equal(restored.brushPalette[0].id, "my-pen");
  assert.equal(restored.iannixScripts[0].id, "score-a");
  assert.equal(restored.playCoreScripts[0].id, "ascii-a");
  assert.equal(restored.svgScripts[0].id, "svg-a");
  assert.equal(restored.arrangement.takes[0].id, "take-a");
  assert.equal(restored.arrangement.recording.mode, "step");
  assert.equal(restored.walkthroughs[0].id, "tour");
  assert.equal(payload.underscores.patch.kind, "project");
});

test("selection exchange does not carry the scene-global grid", () => {
  const payload = attachUnderscoresExchangeMetadata({ type: "excalidraw", elements: [] }, "selection", {}, DEFAULT_GLOBAL_GRID);
  assert.equal(payload.underscores.grid, undefined);
  assert.equal(parseUnderscoresExchange(payload, "selection").grid, null);
  assert.equal(parseUnderscoresExchange(payload, "selection").expressiveSynth, null);
  assert.equal(parseUnderscoresExchange(payload, "selection").mixer, null);
});

test("selection exchange includes generated children and all custom metadata", () => {
  const parent = { id: "parent", customData: { iannix: { role: "trigger" } } };
  const child = { id: "child", customData: { parentId: "parent", bakedTrack: true } };
  const ignored = { id: "ignored" };
  const selected = getSelectionExchangeElements([parent, child, ignored], { parent: true });
  assert.deepEqual(selected.map(element => element.id), ["parent", "child"]);
  assert.equal(selected[0].customData.iannix.role, "trigger");
});

test("selection exchange preserves linked cursor and curve components", () => {
  const curve = { id: "curve", customData: { iannix: { role: "curve" } } };
  const cursor = { id: "cursor", customData: { iannix: { role: "cursor", cursor: { curveId: "curve" } } } };
  const child = { id: "child", customData: { parentId: "cursor" } };
  const unrelated = { id: "unrelated" };

  assert.deepEqual(
    getSelectionExchangeElements([curve, cursor, child, unrelated], { curve: true }).map(element => element.id),
    ["curve", "cursor", "child"],
  );
  assert.deepEqual(
    getSelectionExchangeElements([curve, cursor, child, unrelated], { cursor: true }).map(element => element.id),
    ["curve", "cursor", "child"],
  );
});

test("selection import remaps element, parent, and IanniX curve links", () => {
  let id = 0;
  const createId = () => `new-${++id}`;
  const imported = [
    { id: "curve", x: 0, y: 0, groupIds: [], customData: { iannix: { role: "curve" } } },
    { id: "cursor", x: 10, y: 10, groupIds: [], customData: { iannix: { role: "cursor", cursor: { curveId: "curve" } } } },
    { id: "child", x: 4, y: 4, groupIds: [], customData: { parentId: "cursor" } },
  ];
  const result = remapSelectionForImport(imported, [], createId, { x: 20, y: 30 });
  assert.equal(result.elements[1].customData.iannix.cursor.curveId, result.elements[0].id);
  assert.equal(result.elements[2].customData.parentId, result.elements[1].id);
  assert.deepEqual([result.elements[0].x, result.elements[0].y], [20, 30]);
});

test("selection import gives arranged clips fresh ids", () => {
  let id = 0;
  const result = remapSelectionForImport([{
    id: "arranged",
    x: 0,
    y: 0,
    groupIds: [],
    customData: { underscoresArrangement: { version: 1, mode: "clips", clips: [{
      id: "clip-a",
      timing: { start: 0, duration: 1 },
      recording: { recordingId: "recording-a" },
    }] } },
  }], [], () => `new-${++id}`);
  const importedClip = result.elements[0].customData.underscoresArrangement.clips[0];
  assert.notEqual(importedClip.id, "clip-a");
  assert.notEqual(importedClip.recording.recordingId, "recording-a");
});
