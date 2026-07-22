import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_MIDI_SYNTH_ID,
  MIDI_PORT_ALL,
  MIDI_PORT_NONE,
  resolveMidiOutputRoute,
} from "./midiOutputRouting.js";
import { EXPRESSIVE_SYNTH_ID } from "./expressiveSynth.js";

const internal = { id: INTERNAL_MIDI_SYNTH_ID, send() {} };
const expressive = { id: EXPRESSIVE_SYNTH_ID, send() {} };
const connected = { id: "connected", state: "connected", send() {} };
const disconnected = { id: "gone", state: "disconnected", send() {} };
const access = { outputs: new Map([[connected.id, connected], [disconnected.id, disconnected]]) };

test("resolves explicit internal, connected external, None, and All routes", () => {
  assert.deepEqual(resolveMidiOutputRoute({ selectedOutputId: INTERNAL_MIDI_SYNTH_ID, internalOutput: internal }).outputs, [internal]);
  assert.deepEqual(resolveMidiOutputRoute({ midiAccess: access, selectedOutputId: connected.id, internalOutput: internal }).outputs, [connected]);
  assert.deepEqual(resolveMidiOutputRoute({ midiAccess: access, selectedOutputId: MIDI_PORT_NONE, fallbackEnabled: true, internalOutput: internal }).outputs, []);
  const all = resolveMidiOutputRoute({ midiAccess: access, selectedOutputId: MIDI_PORT_ALL, internalOutput: internal });
  assert.deepEqual(all.outputs, [connected]);
  assert.equal(all.outputs.includes(internal), false);
});

test("disconnected external output follows the fallback policy without losing identity", () => {
  const fallback = resolveMidiOutputRoute({ midiAccess: access, selectedOutputId: disconnected.id, fallbackEnabled: true, internalOutput: internal });
  assert.deepEqual(fallback.outputs, [internal]);
  assert.equal(fallback.fallback, true);
  assert.equal(resolveMidiOutputRoute({ midiAccess: access, selectedOutputId: disconnected.id, fallbackEnabled: false, internalOutput: internal }).outputs.length, 0);
});

test("no Web MIDI support and internal initialization failure remain silent and classified", () => {
  const unavailable = resolveMidiOutputRoute({ midiAccess: null, selectedOutputId: "remembered-device", fallbackEnabled: true, internalOutput: null });
  assert.equal(unavailable.kind, "internal-unavailable");
  assert.deepEqual(unavailable.outputs, []);
});

test("resolves the expressive synth independently from GM fallback", () => {
  const route = resolveMidiOutputRoute({ selectedOutputId: EXPRESSIVE_SYNTH_ID, expressiveOutput: expressive });
  assert.deepEqual(route, { outputs: [expressive], kind: "expressive", fallback: false });
  assert.equal(resolveMidiOutputRoute({ selectedOutputId: EXPRESSIVE_SYNTH_ID }).kind, "expressive-unavailable");
});
