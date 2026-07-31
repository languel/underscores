import test from "node:test";
import assert from "node:assert/strict";
import { mapAdapterRecordToSample, parseMidiMessage, parseSerialRecord, parseWebSocketJson } from "./streamAdapters.js";

test("MIDI parser preserves raw bytes and detects standard messages", () => {
  const note = parseMidiMessage([0x92, 60, 100], 12);
  assert.equal(note.kind, "noteon");
  assert.equal(note.channel, 3);
  assert.deepEqual(note.bytes, [0x92, 60, 100]);
  assert.equal(parseMidiMessage([0xf8], 1).kind, "clock");
});

test("serial and websocket adapters parse JSON and delimited records", () => {
  assert.deepEqual(parseSerialRecord('{"x":2,"y":3}'), { x: 2, y: 3 });
  assert.deepEqual(parseSerialRecord("2, yes", { mode: "delimited", delimiter: "," }), { field0: 2, field1: "yes" });
  assert.deepEqual(parseWebSocketJson('{"address":"/hand/right","args":[1]}', { osc: true }), { address: "/hand/right", args: [1] });
  assert.throws(() => parseWebSocketJson('{"args":[]}', { osc: true }), /address/);
});

test("mapped records become ordinary typed stream samples", () => {
  const sample = mapAdapterRecordToSample({ vector: { x: 8, y: 4 }, pressure: 0.6 }, {
    type: "websocket", kind: "space", fields: [{ name: "x", path: "vector.x" }, { name: "y", path: "vector.y" }, { name: "pressure", path: "pressure" }],
  });
  assert.equal(sample.kind, "space");
  assert.equal(sample.x, 8);
  assert.equal(sample.y, 4);
});
