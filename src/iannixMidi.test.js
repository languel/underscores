import test from "node:test";
import assert from "node:assert/strict";
import {
  createIannixMidiVoiceTracker,
  getIannixTriggerMidiContext,
  getIannixMidiTemplatePattern,
  parseIannixMidiPattern,
  selectIannixTriggerCursor,
  sendIannixMidiMessage,
} from "./iannixMidi.js";

test("parses IanniX floating note patterns and schedules matching bytes", () => {
  const message = parseIannixMidiPattern(
    "osc://host/trigger 1, midi://midi_out/notef 2 trigger_value_y trigger_value_x trigger_duration",
    { trigger_value_x: 0.5, trigger_value_y: 0.75, trigger_duration: 0.4 },
  );
  assert.equal(message.port, "midi_out");
  assert.equal(message.channel, 2);
  assert.equal(message.note, 95);
  assert.equal(message.velocity, 63);
  assert.deepEqual(message.noteOn, [0x91, 95, 63]);
  assert.deepEqual(message.noteOff, [0x81, 95, 0]);
});

test("integer note patterns clamp to IanniX channel and data ranges", () => {
  const message = parseIannixMidiPattern("midi://device/note 20 200 -4 1", {});
  assert.equal(message.channel, 16);
  assert.equal(message.note, 127);
  assert.equal(message.velocity, 0);
});

test("IanniX ccf patterns scale controller values and emit CC bytes", () => {
  const message = parseIannixMidiPattern("midi://midi_out/ccf 3 7 cursor_value_y", { cursor_value_y: 0.5 });
  assert.equal(message.kind, "cc");
  assert.equal(message.controller, 7);
  assert.equal(message.value, 64);
  assert.deepEqual(message.data, [0xb2, 7, 64]);
  const sent = [];
  sendIannixMidiMessage({ send: (bytes, time) => sent.push({ bytes, time }) }, message, 200);
  assert.deepEqual(sent, [{ bytes: [0xb2, 7, 64], time: 200 }]);
});

test("MIDI send queues note-off after the IanniX duration", () => {
  const sent = [];
  const output = { send: (bytes, time) => sent.push({ bytes, time }) };
  const message = parseIannixMidiPattern("midi://midi_out/note 1 60 100 0.25");
  sendIannixMidiMessage(output, message, 1000);
  assert.deepEqual(sent, [
    { bytes: [0x90, 60, 100], time: 1000 },
    { bytes: [0x80, 60, 0], time: 1250 },
  ]);
});

test("voice tracking does not let an older same-note expiry cut off a retrigger", () => {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const sent = [];
  const output = { send: (bytes, time) => sent.push({ bytes, time: time ?? now }) };
  const tracker = createIannixMidiVoiceTracker({
    now: () => now,
    setTimer: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
  });
  const runTo = target => {
    now = target;
    [...timers.entries()]
      .filter(([, timer]) => timer.due <= target)
      .sort((a, b) => a[1].due - b[1].due)
      .forEach(([id, timer]) => {
        timers.delete(id);
        timer.callback();
      });
  };
  const message = parseIannixMidiPattern("midi://midi_out/note 1 60 100 0.25");
  tracker.send(output, message, 1000);
  now = 1100;
  tracker.send(output, message, 1100);
  runTo(1250);
  assert.equal(sent.filter(event => event.bytes[0] === 0x80).length, 0);
  runTo(1350);
  assert.equal(sent.filter(event => event.bytes[0] === 0x80).length, 1);
  assert.deepEqual(sent.slice(0, 2).map(event => event.bytes), [message.noteOn, message.noteOn]);
});

test("trigger context maps curve bounds to IanniX-style normalized values", () => {
  const context = getIannixTriggerMidiContext({
    curveElement: { type: "line", x: 10, y: 20, width: 100, height: 100, angle: 0, points: [[0, 0], [100, 100]], customData: {} },
    transform: { position: [35, 45] },
  }, { trigger: { duration: 0.8 } }, { x: 85, y: 45, width: 0, height: 0 });
  assert.equal(context.trigger_value_x, 0.75);
  assert.equal(context.trigger_value_y, 0.75);
  assert.equal(context.trigger_duration, 0.8);
});

test("test-message cursor selection follows the curve nearest the trigger", () => {
  const makeCursor = (id, y) => ({
    element: { id },
    curveElement: { type: "line", x: 0, y, points: [[0, 0], [100, 0]] },
  });
  const near = makeCursor("near", 10);
  const far = makeCursor("far", 100);
  assert.equal(selectIannixTriggerCursor([far, near], { x: 50, y: 12, width: 0, height: 0 }).element.id, "near");
  assert.equal(selectIannixTriggerCursor([far, near], { x: 50, y: 12, width: 0, height: 0 }, "far").element.id, "far");
});

test("cursor-relative pitch maps signed cursor hits around its base note", () => {
  const cursor = {
    element: {
      id: "cursor",
      width: 100,
      height: 0,
      customData: { iannix: { role: "cursor", midi: { baseNote: 60, pitchRangeOctaves: 2 } } },
    },
    curveElement: { type: "line", x: 0, y: 0, points: [[0, 0], [100, 0]], customData: { iannix: { role: "curve" } } },
    transform: { position: [50, 50] },
    paths: [[[0, 50], [100, 50]]],
  };
  const triggerData = { trigger: { duration: 0.5, midiBaseSource: "cursor", midiVelocity: 90 } };
  const low = getIannixTriggerMidiContext(cursor, triggerData, { x: 0, y: 50, width: 0, height: 0 });
  const center = getIannixTriggerMidiContext(cursor, triggerData, { x: 50, y: 50, width: 0, height: 0 });
  const high = getIannixTriggerMidiContext(cursor, triggerData, { x: 100, y: 50, width: 0, height: 0 });
  assert.deepEqual([low.trigger_note, center.trigger_note, high.trigger_note], [36, 60, 84]);
  assert.equal(center.trigger_velocity, 90);
  assert.equal(getIannixMidiTemplatePattern("relativePitch", { midiChannel: 2, midiVelocity: 91 }), "midi://midi_out/note 2 trigger_note 91 trigger_duration");
});
