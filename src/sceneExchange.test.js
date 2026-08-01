import test from "node:test";
import assert from "node:assert/strict";
import {
  attachDraweratorExchangeMetadata,
  getSelectionExchangeElements,
  parseDraweratorExchange,
  remapSelectionForImport,
} from "./sceneExchange.js";
import { mergeGridPatch, DEFAULT_GLOBAL_GRID } from "./gridSystem.js";
import { DEFAULT_EXPRESSIVE_SYNTH_CONFIG, mergeExpressiveSynthConfig, normalizeExpressiveSynthConfig, upsertExpressiveSynthProgram } from "./expressiveSynth.js";
import { MIXER_DESTINATION_INTERNAL, MIXER_INSTRUMENT_EXPRESSIVE, normalizeMixer } from "./mixerSystem.js";

test("scene exchange metadata preserves Drawerator score state", () => {
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {
    time: 4.5,
    rate: 2,
    tempo: 96,
    timeSignature: { numerator: 7, denominator: 8 },
    displayMode: "beats",
    fps: 25,
    loop: { enabled: true, start: 2, end: 12 },
  });
  const parsed = parseDraweratorExchange(JSON.stringify(payload), "scene");
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
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", { displayMode: "frame", fps: 24 });
  assert.equal(payload.drawerator.score.displayMode, "frame");
  assert.equal(payload.drawerator.score.fps, 24);
});

test("scene exchange version 8 preserves streams, brush channels, global configuration, p5 scripts, and migrates legacy scenes", () => {
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
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {}, grid, synth, mixer, p5Scripts, streamGraph, brushChannels);
  assert.equal(payload.drawerator.version, 8);
  assert.deepEqual(parseDraweratorExchange(payload, "scene").grid, grid);
  assert.deepEqual(parseDraweratorExchange(payload, "scene").expressiveSynth, normalizeExpressiveSynthConfig(synth));
  assert.deepEqual(parseDraweratorExchange(payload, "scene").mixer, mixer);
  assert.equal(parseDraweratorExchange(payload, "scene").p5Scripts[0].id, "orbit");
  assert.equal(parseDraweratorExchange(payload, "scene").streamGraph.sources[0].streamId, "serial-space");
  assert.equal(parseDraweratorExchange(payload, "scene").streamGraph.processors[0].outputId, "gate-events");
  assert.equal(parseDraweratorExchange(payload, "scene").brushChannels[0].gateStreamId, "gate-events");

  const legacy = { type: "excalidraw", elements: [], drawerator: { version: 1, kind: "scene", score: {} } };
  const migrated = parseDraweratorExchange(legacy, "scene").grid;
  assert.equal(migrated.appearance.visible, false);
  assert.equal(migrated.snap.mode, "off");
  assert.deepEqual(parseDraweratorExchange(legacy, "scene").expressiveSynth, normalizeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG));
  assert.equal(parseDraweratorExchange(legacy, "scene").mixer.tracks.length, 16);
});

test("scene exchange preserves authored media sources and reusable code definitions", () => {
  const authoredState = {
    mediaSources: [{ id: "camera-main", name: "Main camera", kind: "camera", enabled: true }],
    brushPalette: [{ id: "my-pen", name: "My pen", code: "return points;" }],
    iannixScripts: [{ id: "score-a", name: "Score A", source: 'run("clear");' }],
    playCoreScripts: [{ id: "ascii-a", name: "ASCII A", source: "export function main() {}" }],
    svgScripts: [{ id: "svg-a", name: "SVG A", source: '<svg xmlns="http://www.w3.org/2000/svg" />' }],
  };
  const payload = attachDraweratorExchangeMetadata(
    { type: "excalidraw", elements: [] }, "scene", {}, null, null, null, [], null, null, authoredState,
  );
  const restored = parseDraweratorExchange(payload, "scene").authoredState;
  assert.equal(restored.mediaSources[0].id, "camera-main");
  assert.equal(restored.brushPalette[0].id, "my-pen");
  assert.equal(restored.iannixScripts[0].id, "score-a");
  assert.equal(restored.playCoreScripts[0].id, "ascii-a");
  assert.equal(restored.svgScripts[0].id, "svg-a");
});

test("selection exchange does not carry the scene-global grid", () => {
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "selection", {}, DEFAULT_GLOBAL_GRID);
  assert.equal(payload.drawerator.grid, undefined);
  assert.equal(parseDraweratorExchange(payload, "selection").grid, null);
  assert.equal(parseDraweratorExchange(payload, "selection").expressiveSynth, null);
  assert.equal(parseDraweratorExchange(payload, "selection").mixer, null);
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
