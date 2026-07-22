import test from "node:test";
import assert from "node:assert/strict";
import { evaluateScoreFrame, getElementCenter, normalizeIannixData } from "./iannixEngine.js";
import {
  createExpressiveSynthDemoScore,
  EXPRESSIVE_SYNTH_DEMO_DURATION,
  EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT,
} from "./expressiveSynthDemo.js";

test("expressive demo creates one timeline cursor and six continuous trigger voices", () => {
  const demo = createExpressiveSynthDemoScore({ center: [100, 200], idPrefix: "test" });
  assert.equal(demo.curves.length, 1);
  assert.equal(demo.cursors.length, 1);
  assert.equal(demo.triggers.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT);
  assert.equal(demo.elements.length, EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT + 2);
  assert.equal(new Set(demo.elements.map(element => element.id)).size, demo.elements.length);

  const cursorData = normalizeIannixData(demo.cursor.customData?.iannix);
  assert.equal(cursorData.role, "cursor");
  assert.equal(cursorData.cursor.curveId, demo.timelineCurve.id);
  assert.equal(cursorData.time.duration, EXPRESSIVE_SYNTH_DEMO_DURATION);
  assert.equal(cursorData.time.loopMode, "loop");
  assert.equal(demo.cursor.opacity, 0);
  assert.equal(demo.cursor.strokeColor, "transparent");
  assert.deepEqual(getElementCenter(demo.cursor), [demo.timelineCurve.x, demo.timelineCurve.y]);

  demo.triggers.forEach((trigger, index) => {
    const data = normalizeIannixData(trigger.customData?.iannix);
    assert.equal(data.role, "trigger");
    assert.equal(data.trigger.behavior, "glissando");
    assert.equal(data.trigger.midiEnabled, true);
    assert.equal(data.trigger.midiChannel, index + 1);
  });
});

test("expressive demo derives active voice gates from timeline geometry", () => {
  const demo = createExpressiveSynthDemoScore({ center: [0, 0], idPrefix: "frame" });
  const start = evaluateScoreFrame(demo.elements, 0);
  const middle = evaluateScoreFrame(demo.elements, demo.duration / 2);
  assert.equal(start.cursors.length, 1);
  assert.equal(middle.cursors.length, 1);
  assert.notDeepEqual(start.cursors[0].transform.position, middle.cursors[0].transform.position);
  assert.ok(middle.collisions.size > 0);
});
