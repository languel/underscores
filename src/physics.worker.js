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
let transportScrubbing = false;
let loadRevision = 0;
// This is supplied by the main thread for every graph load. Message delivery
// is asynchronous, so tag every result with it and let the main thread ignore
// poses/events from a superseded graph.
let graphRevision = 0;
// `play` can arrive immediately after `load`, while Rapier is still resolving.
// Keep intent outside the rebuilt runtime so the request survives initialization.
let playAllRequested = false;
const requestedPlayingSystems = new Set();
// A graph load awaits the Rapier module. Paused posing can be requested in the
// same authoring gesture that rebuilds the graph, so retain the request until
// that graph's runtime exists instead of solving against the previous world.
const pendingRelaxMessages = [];

const post = (type, detail = {}, transfer = []) => self.postMessage({ type, graphRevision, ...detail }, transfer);

const disposeSystems = () => {
  for (const runtime of systems.values()) runtime.dispose();
  systems.clear();
  playing.clear();
  checkpoints.clear();
  bufferPool.clear();
  dirtySystems.clear();
  transportScrubbing = false;
};

const initialize = async (graphValue, requestedGraphRevision = graphRevision + 1) => {
  const revision = ++loadRevision;
  disposeSystems();
  const nextGraph = normalizeRelationshipGraph(graphValue);
  const nextSystems = new Map();
  const nextCheckpoints = new Map();
  for (const system of nextGraph.systems.filter(candidate => candidate.enabled && candidate.adapter === "rapier2d")) {
    const runtime = await RapierPhysicsSystem.create(nextGraph, system.id);
    if (revision !== loadRevision) {
      runtime.dispose();
      return;
    }
    nextSystems.set(system.id, runtime);
    nextCheckpoints.set(system.id, [{ step: 0, snapshot: runtime.snapshot() }]);
  }
  if (revision !== loadRevision) {
    for (const runtime of nextSystems.values()) runtime.dispose();
    return;
  }
  graph = nextGraph;
  graphRevision = requestedGraphRevision;
  for (const [systemId, runtime] of nextSystems) systems.set(systemId, runtime);
  for (const [systemId, values] of nextCheckpoints) checkpoints.set(systemId, values);
  for (const system of graph.systems) {
    if (system.playing || playAllRequested || requestedPlayingSystems.has(system.id)) playing.add(system.id);
  }
  accumulators.clear();
  for (const systemId of systems.keys()) dirtySystems.add(systemId);
  lastTick = performance.now();
  const metadata = {};
  for (const [systemId, runtime] of systems) metadata[systemId] = runtime.poses().metadata;
  post("ready", { systems: graph.systems, metadata });
  const pending = pendingRelaxMessages.splice(0);
  for (const message of pending) {
    if (message.revision !== undefined && message.revision !== graphRevision) continue;
    const runtime = systems.get(message.systemId);
    if (!runtime) continue;
    const poses = runtime.relaxConstraints(message.entityIds, message.iterations);
    dirtySystems.add(message.systemId);
    post("relaxed", { requestId: message.requestId, systemId: message.systemId, poses });
  }
  if (pending.length) publishPoses(performance.now());
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

const advanceTransportSystem = (systemId, runtime, targetTime, { emitEvents = true } = {}) => {
  const simSpeed = Math.max(0, Number(graph.world.simSpeed) || 0);
  const targetStep = Math.max(0, Math.floor(targetTime * simSpeed / runtime.fixedDt + 1e-7));
  if (targetStep < runtime.stepIndex) {
    const candidates = (checkpoints.get(systemId) || []).filter(checkpoint => checkpoint.step <= targetStep);
    const checkpoint = candidates.at(-1);
    if (checkpoint) runtime.restore(checkpoint.snapshot, checkpoint.step);
    else runtime.reset();
  }
  let steps = 0;
  const previewEvents = [];
  while (runtime.stepIndex < targetStep && steps < 600) {
    const result = runtime.step();
    if (emitEvents) {
      emitStepResult(systemId, result);
    } else {
      // A timeline scrub is visual evaluation, not a performance. Keep the
      // deterministic checkpoint history and pose fresh, but never route
      // collision/audio/command events for intermediate scrub positions.
      dirtySystems.add(systemId);
      recordCheckpoint(systemId, runtime);
      if (result.events.length) previewEvents.push(...result.events);
    }
    steps += 1;
  }
  if (runtime.stepIndex < targetStep) post("warning", { systemId, code: "transport-catchup-capped", targetStep, step: runtime.stepIndex });
  // These are deliberately diagnostic only. They let the overlay and event
  // console explain what occurred at the scrubbed pose without replaying a
  // collision into mappings, audio, or commands.
  return previewEvents.slice(-96);
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
      advanceTransportSystem(systemId, runtime, transportTime, { emitEvents: !transportScrubbing });
      continue;
    }
    const simSpeed = Math.max(0, Number(graph.world.simSpeed) || 0);
    if (simSpeed <= 0) continue;
    let accumulator = (accumulators.get(systemId) || 0) + delta;
    const effectiveStep = runtime.fixedDt / Math.max(0.0001, (system.clock.timeScale || 1) * simSpeed);
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
    initialize(message.graph, message.revision).catch(error => post("error", { message: error?.message || String(error), stack: error?.stack || "" }));
    return;
  }
  if (message.type === "dispose") {
    disposeSystems();
    pendingRelaxMessages.length = 0;
    playAllRequested = false;
    requestedPlayingSystems.clear();
    if (timer) clearInterval(timer);
    timer = 0;
    return;
  }
  const runtime = systems.get(message.systemId);
  if (message.type === "play") {
    if (message.systemId) {
      requestedPlayingSystems.add(message.systemId);
      playing.add(message.systemId);
    } else {
      playAllRequested = true;
      for (const id of systems.keys()) playing.add(id);
    }
  } else if (message.type === "pause") {
    if (message.systemId) {
      requestedPlayingSystems.delete(message.systemId);
      playing.delete(message.systemId);
    } else {
      playAllRequested = false;
      requestedPlayingSystems.clear();
      playing.clear();
    }
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
    transportScrubbing = message.scrub === true;
    if (transportScrubbing) {
      // Scrubbing intentionally evaluates even while playback is paused. The
      // opt-in UI gate prevents this fixed-step work during normal timeline
      // drags, and `emitEvents: false` makes it side-effect free.
      for (const [systemId, candidate] of systems) {
        const system = graph.systems.find(item => item.id === systemId);
        if (system?.clock.mode === "transport") {
          const previewEvents = advanceTransportSystem(systemId, candidate, transportTime, { emitEvents: false });
          if (previewEvents.length) {
            // A rewind may replay from a checkpoint. Keep the diagnostic
            // window near the requested transport position instead of showing
            // every historical contact from that replay.
            const earliestTime = Math.max(0, transportTime - 1);
            const nearby = previewEvents.filter(event => Number(event.simTime) >= earliestTime);
            if (nearby.length) post("preview-events", { systemId, events: nearby });
          }
        }
      }
      publishPoses(performance.now());
    }
  } else if (message.type === "impulse") {
    runtime?.applyImpulse(message.entityId, message.impulse);
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "grab") {
    runtime?.grab(message.entityId, message.point, message.stiffness, message.damping, { livePose: message.livePose === true });
    if (runtime) {
      dirtySystems.add(message.systemId);
      if (message.livePose === true) publishPoses(performance.now());
    }
  } else if (message.type === "grab.constraint") {
    runtime?.grabConstraint(message.constraintId, message.point, message.stiffness, message.damping, { livePose: message.livePose === true });
    if (runtime) {
      dirtySystems.add(message.systemId);
      if (message.livePose === true) publishPoses(performance.now());
    }
  } else if (message.type === "grab.move") {
    runtime?.moveGrab(message.point, { livePose: message.livePose === true, iterations: message.iterations });
    if (runtime) {
      dirtySystems.add(message.systemId);
      if (message.livePose === true) publishPoses(performance.now());
    }
  } else if (message.type === "grab.release") {
    runtime?.releaseGrab();
    if (runtime) dirtySystems.add(message.systemId);
  } else if (message.type === "relax") {
    // `load` is ordered before this message but finishes asynchronously. Queue
    // until the matching graph is available so a scrubbed authoring pose does
    // not accidentally solve against an older reset state.
    if (!runtime || (message.revision !== undefined && message.revision !== graphRevision)) {
      pendingRelaxMessages.push(message);
      return;
    }
    const poses = runtime.relaxConstraints(message.entityIds, message.iterations);
    dirtySystems.add(message.systemId);
    post("relaxed", { requestId: message.requestId, systemId: message.systemId, poses });
    publishPoses(performance.now());
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
