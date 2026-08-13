import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseUnderscoreExchange } from "./sceneExchange.js";
import { evaluateScoreFrame, getElementCenter, normalizeIannixData, reconcileRuntimeCursorHosts } from "./iannixEngine.js";

const readExample = name => readFileSync(fileURLToPath(new URL(`../notes/examples/${name}`, import.meta.url)), "utf8");

test("glissandi example is a portable six-track continuous-trigger scene", () => {
  const { payload, score, grid, expressiveSynth, mixer } = parseUnderscoreExchange(readExample("glissandi.json"), "scene");
  const roles = payload.elements.map(element => normalizeIannixData(element.customData?.iannix));
  const curves = roles.filter(data => data.role === "curve");
  const cursors = roles.filter(data => data.role === "cursor");
  const triggers = roles.filter(data => data.role === "trigger");
  assert.equal(payload.elements.length, 8);
  assert.equal(curves.length, 1);
  assert.equal(cursors.length, 1);
  assert.equal(triggers.length, 6);
  assert.equal(cursors[0].cursor.curveId, payload.elements.find(element => normalizeIannixData(element.customData?.iannix).role === "curve").id);
  assert.ok(triggers.every(data => data.trigger.behavior === "glissando" && data.trigger.midiEnabled));
  assert.deepEqual(triggers.map(data => data.trigger.midiChannel), [1, 2, 3, 4, 5, 6]);
  assert.equal(score.loop.end, 12);
  assert.equal(grid.id, "global");
  assert.equal(expressiveSynth.preset, "bowed");
  assert.equal(expressiveSynth.pixelsPerOctave, 180);
  assert.equal(mixer.tracks.length, 6);
  assert.deepEqual(mixer.tracks.map(track => track.midiChannel), [1, 2, 3, 4, 5, 6]);
  assert.ok(mixer.tracks.every(track => track.destination === "internal" && track.instrument === "expressive" && track.program === "bowed"));

  const reconciled = reconcileRuntimeCursorHosts(payload.elements);
  const frame = evaluateScoreFrame(reconciled, 6);
  assert.equal(frame.cursors.length, 1);
  assert.ok(frame.collisions.size > 0);
  reconciled.filter(element => normalizeIannixData(element.customData?.iannix).role === "cursor").forEach(cursor => {
    assert.equal(cursor.opacity, 0);
    assert.equal(cursor.strokeColor, "transparent");
    const curve = reconciled.find(element => element.id === normalizeIannixData(cursor.customData?.iannix).cursor.curveId);
    assert.deepEqual(getElementCenter(cursor), [curve.x + curve.points[0][0], curve.y + curve.points[0][1]]);
  });
});
