import test from "node:test";
import assert from "node:assert/strict";
import {
  attachDraweratorExchangeMetadata,
  getSelectionExchangeElements,
  parseDraweratorExchange,
  remapSelectionForImport,
} from "./sceneExchange.js";
import { mergeGridPatch, DEFAULT_GLOBAL_GRID } from "./gridSystem.js";
import { DEFAULT_EXPRESSIVE_SYNTH_CONFIG, mergeExpressiveSynthConfig } from "./expressiveSynth.js";

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
    loop: { enabled: true, start: 2, end: 12 },
  });
});

test("scene exchange preserves frame timeline display mode", () => {
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", { displayMode: "frame", fps: 24 });
  assert.equal(payload.drawerator.score.displayMode, "frame");
  assert.equal(payload.drawerator.score.fps, 24);
});

test("scene exchange version 3 preserves global configuration and migrates legacy scenes", () => {
  const grid = mergeGridPatch(DEFAULT_GLOBAL_GRID, {
    appearance: { visible: true },
    spacing: { x: 120, y: 80, subdivisionsX: 6, subdivisionsY: 4 },
    time: { amount: 2, unit: "bar" },
  });
  const synth = mergeExpressiveSynthConfig(DEFAULT_EXPRESSIVE_SYNTH_CONFIG, { preset: "fm", referenceNote: 48 });
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "scene", {}, grid, synth);
  assert.equal(payload.drawerator.version, 3);
  assert.deepEqual(parseDraweratorExchange(payload, "scene").grid, grid);
  assert.deepEqual(parseDraweratorExchange(payload, "scene").expressiveSynth, synth);

  const legacy = { type: "excalidraw", elements: [], drawerator: { version: 1, kind: "scene", score: {} } };
  const migrated = parseDraweratorExchange(legacy, "scene").grid;
  assert.equal(migrated.appearance.visible, false);
  assert.equal(migrated.snap.mode, "off");
  assert.deepEqual(parseDraweratorExchange(legacy, "scene").expressiveSynth, DEFAULT_EXPRESSIVE_SYNTH_CONFIG);
});

test("selection exchange does not carry the scene-global grid", () => {
  const payload = attachDraweratorExchangeMetadata({ type: "excalidraw", elements: [] }, "selection", {}, DEFAULT_GLOBAL_GRID);
  assert.equal(payload.drawerator.grid, undefined);
  assert.equal(parseDraweratorExchange(payload, "selection").grid, null);
  assert.equal(parseDraweratorExchange(payload, "selection").expressiveSynth, null);
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
