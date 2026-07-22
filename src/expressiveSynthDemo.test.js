import test from "node:test";
import assert from "node:assert/strict";
import { evaluateScoreFrame, getElementCenter, normalizeIannixData } from "./iannixEngine.js";
import {
  createExpressiveSynthDemoScore,
  EXPRESSIVE_SYNTH_DEMO_DURATION,
  EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT,
} from "./expressiveSynthDemo.js";

test("expressive demo creates one durable cursor voice for every glissando", () => {
  const demo = createExpressiveSynthDemoScore({ center: [100, 200], idPrefix: "test" });
  assert.equal(demo.curves.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT);
  assert.equal(demo.cursors.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT);
  assert.equal(demo.elements.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT * 2);
  assert.equal(new Set(demo.elements.map(element => element.id)).size, demo.elements.length);

  demo.cursors.forEach((cursor, index) => {
    const cursorData = normalizeIannixData(cursor.customData?.iannix);
    assert.equal(cursorData.role, "cursor");
    assert.equal(cursorData.cursor.curveId, demo.curves[index].id);
    assert.equal(cursorData.time.duration, EXPRESSIVE_SYNTH_DEMO_DURATION);
    assert.equal(cursorData.time.loopMode, "pingPong");
    assert.equal(cursor.opacity, 0);
    assert.equal(cursor.strokeColor, "transparent");
    assert.deepEqual(getElementCenter(cursor), demo.curves[index].points[0].map((value, axis) => value + (axis === 0 ? demo.curves[index].x : demo.curves[index].y)));
  });
});

test("expressive demo evaluates as six independent moving voices", () => {
  const demo = createExpressiveSynthDemoScore({ center: [0, 0], idPrefix: "frame" });
  const start = evaluateScoreFrame(demo.elements, 0, undefined, { detectCollisions: false });
  const middle = evaluateScoreFrame(demo.elements, demo.duration / 2, undefined, { detectCollisions: false });
  assert.equal(start.cursors.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT);
  assert.equal(middle.cursors.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT);
  start.cursors.forEach((cursor, index) => {
    assert.equal(cursor.element.id, demo.cursors[index].id);
    assert.notDeepEqual(cursor.transform.position, middle.cursors[index].transform.position);
  });
});
