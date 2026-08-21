import assert from "node:assert/strict";
import test from "node:test";
import { applyArrangementRuntimeState, ARRANGEMENT_ADAPTER_KINDS, ArrangementAdapterRegistry, getArrangementAdapterKind } from "./arrangementAdapters.js";

test("arrangement adapter kind follows object lifecycle metadata", () => {
  assert.equal(getArrangementAdapterKind({ customData: {} }), ARRANGEMENT_ADAPTER_KINDS.STATIC);
  assert.equal(getArrangementAdapterKind({ customData: { underscoresGesture: {} } }), ARRANGEMENT_ADAPTER_KINDS.GESTURE);
  assert.equal(getArrangementAdapterKind({ customData: { underscoresMediaStream: {} } }), ARRANGEMENT_ADAPTER_KINDS.MEDIA);
  assert.equal(getArrangementAdapterKind({ customData: { underscoresLivecode: {} } }), ARRANGEMENT_ADAPTER_KINDS.LIVECODE);
});

test("adapter runtime activates, seeks, and deactivates without scene writes", () => {
  const events = [];
  const registry = new ArrangementAdapterRegistry({
    gesture: {
      activate: (_element, state) => events.push(["activate", state.state.localTime]),
      seek: (_element, time) => events.push(["seek", time]),
      deactivate: () => events.push(["deactivate"]),
    },
  });
  const element = { id: "gesture", customData: { underscoresGesture: {} } };
  const active = { active: true, state: { localTime: 0.5 } };
  applyArrangementRuntimeState(registry.get("gesture"), element, null, active);
  applyArrangementRuntimeState(registry.get("gesture"), element, active, { active: true, state: { localTime: 0.75 } });
  applyArrangementRuntimeState(registry.get("gesture"), element, active, { active: false, state: null });
  assert.deepEqual(events, [["activate", 0.5], ["seek", 0.5], ["seek", 0.75], ["deactivate"]]);
  assert.deepEqual(element, { id: "gesture", customData: { underscoresGesture: {} } });
});
