import { RapierPhysicsSystem } from "./rapierPhysicsCore.js";
import { normalizeRelationshipGraph } from "./relationshipGraph.js";

const systems = new Map();
const playing = new Set();
const checkpoints = new Map();
const bufferPool = new Map();
let graph = normalizeRelationshipGraph(null);
let lastTick = performance.now();
let lastPoseAt = 0;
let lastTelemetryAt = 0;
const accumulators = new Map();
const dirtySystems = new Set();
let timer = 0;
let transportTime = 0;

const post = (type, detail = {}, transfer = []) => self.postMessage({ type, ...detail }, transfer);

const disposeSystems = () => {
  for (const runtime of systems.values()) runtime.dispose();
  systems.clear();
  playing.clear();
  checkpoints.clear();
  bufferPool.clear();
  dirtySystems.clear();
};

const initialize = async graphValue => {
  disposeSystems();
  graph = normalizeRelationshipGraph(graphValue);
  for (const system of graph.systems.filter(candidate => candidate.enabled && candidate.adapter === "rapier2d")) {
    const runtime = await RapierPhysicsSystem.create(graph, system.id);
    systems.set(system.id, runtime);
    checkpoints.set(system.id, [{ step: 0, snapshot: runtime.snapshot() }]);
    if (system.playing) playing.add(system.id);
  }
  accumulators.clear();
  for (const systemId of systems.keys()) dirtySystems.add(systemId);
  lastTick = performance.now();
  const metadata = {};
  for (const [systemId, runtime] of systems) metadata[systemId] = runtime.poses().metadata;
  post("ready", { systems: graph.systems, metadata });
};

const recordCheckpoint = (systemId, runtime) => {
  if (runtime.stepIndex === 0 || runtime.stepIndex % 120 !== 0) return;
  const values = checkpoints.get(systemId) || [];
  if (values.at(-1)?.step === runtime.stepIndex) return;
  values.push({ step: runtime.stepIndex, snapshot: runtime.snapshot() });
  if (values.length > 12) values.splice(1, values.length - 12);
  checkpoints.set(systemId, values);
};

const emitStepResult = (systemId, result) => {
  dirtySystems.add(systemId);
  if (result.events.length) post("events", { systemId, events: result.events, droppedEvents: result.droppedEvents });
  recordCheckpoint(systemId, systems.get(systemId));
};

const advanceTransportSystem = (systemId, runtime, targetTime) => {
  const targetStep = Math.max(0, Math.floor(targetTime / runtime.fixedDt + 1e-7));
  if (targetStep < runtime.stepIndex) {
    const candidates = (checkpoints.get(systemId) || []).filter(checkpoint => checkpoint.step <= targetStep);
    const checkpoint = candidates.at(-1);
    if (checkpoint) runtime.restore(checkpoint.snapshot, checkpoint.step);
    else runtime.reset();
  }
  let steps = 0;
  while (runtime.stepIndex < targetStep && steps < 600) {
    emitStepResult(systemId, runtime.step());
    steps += 1;
  }
  if (runtime.stepIndex < targetStep) post("warning", { systemId, code: "transport-catchup-capped", targetStep, step: runtime.stepIndex });
};

const publishPoses = timestamp => {
  for (const [systemId, runtime] of systems) {
    if (!dirtySystems.has(systemId)) continue;
    const pooled = bufferPool.get(systemId);
    const values = pooled ? new Float32Array(pooled) : null;
    bufferPool.delete(systemId);
    const poses = runtime.poses(values);
    post("poses", { systemId, step: runtime.stepIndex, time: runtime.time, sentAt: timestamp, values: poses.values }, [poses.values.buffer]);
    dirtySystems.delete(systemId);
  }
  lastPoseAt = timestamp;
};

const tick = () => {
  const timestamp = performance.now();
  const delta = Math.min(0.1, Math.max(0, (timestamp - lastTick) / 1000));
  lastTick = timestamp;
  let totalStepMs = 0;
  let totalSteps = 0;
  for (const [systemId, runtime] of systems) {
    const system = graph.systems.find(candidate => candidate.id === systemId);
    if (!system || !playing.has(systemId)) continue;
    if (system.clock.mode === "transport") {
      advanceTransportSystem(systemId, runtime, transportTime);
      continue;
    }
    let accumulator = (accumulators.get(systemId) || 0) + delta;
    const effectiveStep = runtime.fixedDt / Math.max(0.0001, system.clock.timeScale || 1);
    let catchup = 0;
    while (accumulator >= effectiveStep && catchup < 4) {
      const result = runtime.step();
      emitStepResult(systemId, result);
      totalStepMs += result.stepMs;
      totalSteps += 1;
      accumulator -= effectiveStep;
      catchup += 1;
    }
    accumulators.set(systemId, accumulator);
  }
  if (timestamp - lastPoseAt >= 20) publishPoses(timestamp);
  if (timestamp - lastTelemetryAt >= 200) {
    post("telemetry", {
      systems: [...systems].map(([systemId, runtime]) => ({
        systemId,
        step: runtime.stepIndex,
        simTime: runtime.time,
        bodyCount: runtime.bodyById.size,
        droppedEvents: runtime.droppedEvents,
      })),
      stepMs: totalSteps ? totalStepMs / totalSteps : 0,
      sampledAt: timestamp,
    });
    lastTelemetryAt = timestamp;
  }
};

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === "load") {
    initialize(message.graph).catch(error => post("error", { message: error?.message || String(error), stack: error?.stack || "" }));
    return;
  }
  if (message.type === "dispose") {
    disposeSystems();
    if (timer) clearInterval(timer);
    timer = 0;
    return;
  }
  const runtime = systems.get(message.systemId);
  if (message.type === "play") {
    if (runtime) playing.add(message.systemId);
    else for (const id of systems.keys()) playing.add(id);
  } else if (message.type === "pause") {
    if (runtime) playing.delete(message.systemId);
    else playing.clear();
  } else if (message.type === "reset") {
    if (runtime) {
      runtime.reset();
      dirtySystems.add(message.systemId);
    } else for (const [systemId, candidate] of systems) {
      candidate.reset();
      dirtySystems.add(systemId);
    }
    publishPoses(performance.now());
  } else if (message.type === "transport") {
    transportTime = Math.max(0, Number(message.time) || 0);
  } else if (message.type === "impulse") {
    runtime?.applyImpulse(message.entityId, message.impulse);
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "grab") {
    runtime?.grab(message.entityId, message.point, message.stiffness, message.damping);
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "grab.move") {
    runtime?.moveGrab(message.point);
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "grab.release") {
    runtime?.releaseGrab();
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "buffer.return" && message.buffer instanceof ArrayBuffer) {
    bufferPool.set(message.systemId, message.buffer);
  } else if (message.type === "snapshot") {
    const snapshot = runtime?.snapshot();
    if (snapshot) post("snapshot", { requestId: message.requestId, systemId: message.systemId, snapshot }, [snapshot.buffer]);
  } else if (message.type === "query.point") {
    post("query", { requestId: message.requestId, systemId: message.systemId, result: runtime?.queryPoint(message.point) || [] });
  } else if (message.type === "query.ray") {
    post("query", { requestId: message.requestId, systemId: message.systemId, result: runtime?.castRay(message.origin, message.direction, message.maxDistance) || null });
  }
};

timer = setInterval(tick, 8);
