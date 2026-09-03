import {
  RelationshipWriterRegistry,
  addRelationshipItem,
  createDefaultPhysicsSystem,
  migratePhysicsRoutesToMappings,
  normalizePhysicsRoute,
  normalizePhysicsEndpoint,
  normalizePhysicsWorld,
  normalizeRelationshipGraph,
  removeRelationshipItem,
  updateRelationshipItem,
  normalizePhysicsVector,
} from "./relationshipGraph.js";
import { PhysicsMappingRuntime } from "./mappingRuntime.js";
import { createPhysicsWorker } from "@underscores/physics-worker-factory";

const clone = value => value === undefined ? undefined : structuredClone(value);

export class PhysicsRuntimeController {
  constructor({
    eventBus,
    streamRegistry = null,
    commandRegistry = null,
    audioRouter = null,
    mappingTargetRouter = null,
    workerFactory = null,
  } = {}) {
    this.eventBus = eventBus;
    this.streamRegistry = streamRegistry;
    this.commandRegistry = commandRegistry;
    this.audioRouter = audioRouter;
    this.mappingTargetRouter = mappingTargetRouter;
    this.workerFactory = workerFactory;
    this.worker = null;
    this.workerPromise = null;
    this.graph = normalizeRelationshipGraph(null);
    this.listeners = new Map();
    this.latestPoses = new Map();
    this.metadata = new Map();
    // A graph rebuild is asynchronous: the worker may still have a pose
    // buffer in flight for the previous graph when a canvas object is made
    // dynamic or changes role.  Treat those messages as stale rather than
    // briefly applying an old solver pose to the newly-authored object.
    this.graphRevision = 0;
    this.telemetry = { systems: [], stepMs: 0, sampledAt: 0, transferMs: 0, eventRate: 0, routeMs: 0, mappingRate: 0 };
    this.mappingRuntime = new PhysicsMappingRuntime({
      onError: detail => {
        this.eventBus?.emit("physics.mapping.error", detail, { source: "physics-mapping" });
        this.#notify("mapping.error", detail);
      },
    });
    this.writerRegistry = new RelationshipWriterRegistry();
    this.snapshotRequests = new Map();
    this.queryRequests = new Map();
    this.relaxRequests = new Map();
    this.grabCommitRequests = new Map();
    this.lastEventSample = performance.now();
    this.eventsSinceSample = 0;
    this.mappingsSinceSample = 0;
    this.ready = false;
    this.playingSystems = new Set();
    this.adapters = new Map([["rapier2d", Object.freeze({ id: "rapier2d", kind: "rigid-body", worker: true })], ["geometry", Object.freeze({ id: "geometry", kind: "geometry", worker: false })]]);
  }

  subscribe(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(type);
    };
  }

  #notify(type, detail) {
    for (const listener of this.listeners.get(type) || []) listener(detail);
    for (const listener of this.listeners.get("*") || []) listener({ type, detail });
  }

  async #ensureWorker() {
    if (this.worker) return this.worker;
    if (this.workerPromise) return this.workerPromise;
    this.workerPromise = (async () => {
      const worker = this.workerFactory
        ? await this.workerFactory()
        : createPhysicsWorker();
      worker.onmessage = event => this.#handleMessage(event.data || {});
      worker.onerror = error => {
        const detail = { message: error?.message || "Physics worker failed." };
        this.eventBus?.emit("physics.error", detail, { source: "physics" });
        this.#notify("error", detail);
      };
      this.worker = worker;
      this.workerPromise = null;
      return worker;
    })();
    return this.workerPromise;
  }

  #post(message, transfer = []) {
    return this.#ensureWorker().then(worker => {
      worker.postMessage(message, transfer);
      return worker;
    });
  }

  setGraph(value) {
    const revision = ++this.graphRevision;
    // A paused pose solve belongs to one authored graph. Do not let an older
    // solver reply overwrite a newer edit after a graph rebuild.
    for (const request of this.relaxRequests.values()) request.reject(new Error("Physics graph changed while posing."));
    this.relaxRequests.clear();
    this.graph = normalizeRelationshipGraph(value);
    this.mappingRuntime.setGraph(this.graph, descriptor => this.#executeMappingTarget(descriptor));
    this.writerRegistry.clear();
    for (const body of this.graph.bodies.filter(candidate => candidate.enabled && candidate.objectRef)) {
      const channel = body.tracking === "authored-deformable" ? "geometry" : "transform";
      const claim = this.writerRegistry.claim(`physics:${body.systemId}:${body.id}`, body.objectRef, channel);
      if (!claim.ok) {
        const detail = { bodyId: body.id, systemId: body.systemId, channel, objectRef: body.objectRef, ownerId: claim.ownerId };
        this.eventBus?.emit("physics.writer.conflict", detail, { source: "physics" });
        this.#notify("conflict", detail);
      }
    }
    for (const system of this.graph.systems) {
      const streamId = `physics:${system.id}:collision`;
      if (this.streamRegistry && !this.streamRegistry.get(streamId)) this.streamRegistry.register({
        id: streamId,
        name: `${system.name} collisions`,
        kind: "event",
        roles: ["output"],
        ownerId: `physics:${system.id}`,
      });
    }
    this.ready = false;
    // Do not leave the previous graph's snapshot available while its worker
    // replacement is being built. Besides avoiding a one-frame visual jump,
    // this makes Apply/Bake unable to accidentally consume a stale pose.
    for (const snapshot of this.latestPoses.values()) {
      if (snapshot?.values?.buffer && this.worker) {
        this.worker.postMessage({ type: "buffer.return", systemId: snapshot.systemId, buffer: snapshot.values.buffer }, [snapshot.values.buffer]);
      }
    }
    this.latestPoses.clear();
    this.metadata.clear();
    if (this.graph.systems.some(system => system.enabled && system.adapter === "rapier2d")) {
      this.#post({ type: "load", graph: this.graph, revision });
    } else if (this.worker || this.workerPromise) {
      (this.worker ? Promise.resolve(this.worker) : this.workerPromise).then(worker => {
        worker.postMessage({ type: "dispose" });
        worker.terminate();
      });
      this.worker = null;
      this.workerPromise = null;
      this.latestPoses.clear();
      this.metadata.clear();
    }
    this.#notify("graph", this.graph);
    return this.graph;
  }

  getGraph() { return clone(this.graph); }

  registerAdapter(adapter) {
    if (!adapter?.id) throw new Error("Relationship adapters need a stable id.");
    this.adapters.set(String(adapter.id), adapter);
    return () => this.adapters.delete(String(adapter.id));
  }

  listAdapters() { return [...this.adapters.values()]; }

  #handleMessage(message) {
    // A worker build can overlap the next one when a tool changes an object's
    // physics role. Ignore all outputs from a prior graph revision; applying
    // one of those poses is what makes a newly dynamic drawing appear to
    // teleport before the first simulation step.
    if (Number.isInteger(message.graphRevision) && message.graphRevision !== this.graphRevision) {
      if (message.type === "poses" && message.values?.buffer && this.worker) {
        this.worker.postMessage({ type: "buffer.return", systemId: message.systemId, buffer: message.values.buffer }, [message.values.buffer]);
      }
      return;
    }
    if (message.type === "ready") {
      this.ready = true;
      Object.entries(message.metadata || {}).forEach(([systemId, metadata]) => this.metadata.set(systemId, metadata));
      this.eventBus?.emit("physics.ready", { systems: message.systems || [] }, { source: "physics" });
      this.#notify("ready", message);
      return;
    }
    if (message.type === "poses") {
      const receivedAt = performance.now();
      const previous = this.latestPoses.get(message.systemId);
      if (previous?.values?.buffer && this.worker) {
        this.worker.postMessage({ type: "buffer.return", systemId: message.systemId, buffer: previous.values.buffer }, [previous.values.buffer]);
      }
      this.latestPoses.set(message.systemId, {
        systemId: message.systemId,
        step: message.step,
        time: message.time,
        values: message.values,
        ropePaths: Array.isArray(message.ropePaths) ? message.ropePaths : [],
        constraintAnchors: Array.isArray(message.constraintAnchors) ? message.constraintAnchors : [],
        thrusterPaths: Array.isArray(message.thrusterPaths) ? message.thrusterPaths : [],
        metadata: this.metadata.get(message.systemId) || [],
        receivedAt,
      });
      this.telemetry.transferMs = Math.max(0, receivedAt - (message.sentAt || receivedAt));
      this.#notify("poses", this.latestPoses.get(message.systemId));
      return;
    }
    if (message.type === "events") {
      this.#routeEvents(message.events || []);
      return;
    }
    if (message.type === "preview-events") {
      this.#routePreviewEvents(message.events || []);
      return;
    }
    if (message.type === "telemetry") {
      const now = performance.now();
      const elapsed = Math.max(1, now - this.lastEventSample);
      this.telemetry = {
        ...this.telemetry,
        systems: message.systems || [],
        stepMs: Number(message.stepMs) || 0,
        sampledAt: message.sampledAt || now,
        eventRate: this.eventsSinceSample * 1000 / elapsed,
        mappingRate: this.mappingsSinceSample * 1000 / elapsed,
      };
      this.eventsSinceSample = 0;
      this.mappingsSinceSample = 0;
      this.lastEventSample = now;
      this.#notify("telemetry", clone(this.telemetry));
      return;
    }
    if (message.type === "snapshot") {
      const request = this.snapshotRequests.get(message.requestId);
      if (request) {
        this.snapshotRequests.delete(message.requestId);
        request.resolve(message.snapshot);
      }
      return;
    }
    if (message.type === "query") {
      const request = this.queryRequests.get(message.requestId);
      if (request) {
        this.queryRequests.delete(message.requestId);
        request.resolve(message.result);
      }
      return;
    }
    if (message.type === "relaxed") {
      const request = this.relaxRequests.get(message.requestId);
      if (request) {
        this.relaxRequests.delete(message.requestId);
        request.resolve(message.poses || []);
      }
      return;
    }
    if (message.type === "grab.committed") {
      const request = this.grabCommitRequests.get(message.requestId);
      if (!request) return;
      this.grabCommitRequests.delete(message.requestId);
      const snapshot = message.values ? {
        systemId: message.systemId,
        step: message.step,
        time: message.time,
        values: message.values,
        ropePaths: Array.isArray(message.ropePaths) ? message.ropePaths : [],
        constraintAnchors: Array.isArray(message.constraintAnchors) ? message.constraintAnchors : [],
        thrusterPaths: Array.isArray(message.thrusterPaths) ? message.thrusterPaths : [],
        metadata: this.metadata.get(message.systemId) || [],
        receivedAt: performance.now(),
      } : null;
      if (snapshot) this.latestPoses.set(message.systemId, snapshot);
      request.resolve(snapshot);
      return;
    }
    if (["warning", "error"].includes(message.type)) {
      this.eventBus?.emit(`physics.${message.type}`, message, { source: "physics" });
      this.#notify(message.type, message);
    }
  }

  #routeEvents(events) {
    const started = performance.now();
    this.eventsSinceSample += events.length;
    if (events.length) this.#notify("events", clone(events));
    for (const event of events) {
      // EventBus time is wall-clock monotonic time, used by the console to find
      // events emitted since its last poll. Simulation time remains in the event
      // payload for transport/physics consumers; using it as the bus timestamp
      // made every collision look older than the console's performance.now cutoff.
      this.eventBus?.emit(`physics.${event.collisionClass}.${event.phase}`, event, { source: "physics" });
      this.streamRegistry?.publish?.(`physics:${event.systemId}:collision`, {
        kind: "event",
        value: event,
        data: event,
        time: event.simTime * 1000,
      }, { internal: true });
      this.mappingsSinceSample += this.mappingRuntime.route(event, descriptor => this.#executeMappingTarget(descriptor));
    }
    this.telemetry.routeMs = performance.now() - started;
  }

  #routePreviewEvents(events) {
    if (!events.length) return;
    const previewEvents = events.map(event => ({ ...event, preview: true }));
    this.#notify("preview.events", clone(previewEvents));
    for (const event of previewEvents) {
      // Preview hits are observability only: no mapping, stream, command, or
      // audio target is evaluated while the timeline is being scrubbed.
      this.eventBus?.emit(`physics.preview.${event.collisionClass}.${event.phase}`, event, { source: "physics-preview" });
    }
  }

  #executeRouteAction(action, event, route) {
    if (action.kind === "event") {
      this.eventBus?.emit(action.name || "physics.route", { routeId: route.id, event }, { source: "physics-route" });
    } else if (action.kind === "stream") {
      const streamId = action.streamId || `physics:${event.systemId}:route:${route.id}`;
      if (this.streamRegistry && !this.streamRegistry.get(streamId)) this.streamRegistry.register({ id: streamId, name: route.name, kind: "event", roles: ["output"], ownerId: `physics:${event.systemId}` });
      this.streamRegistry?.publish?.(streamId, { kind: "event", value: event, data: event, time: event.simTime * 1000 }, { internal: true });
    } else if (action.kind === "command" && action.commandId) {
      queueMicrotask(() => this.commandRegistry?.execute(action.commandId, { ...(action.args || {}), physicsEvent: event }, { source: "physics-route" })
        .catch(error => this.eventBus?.emit("physics.route.error", { routeId: route.id, message: error?.message || String(error) }, { source: "physics-route" })));
    } else if (["synth", "midi"].includes(action.kind)) {
      this.audioRouter?.(action, event, route);
    }
  }

  #executeMappingTarget(descriptor) {
    const { mapping, target, event, operation } = descriptor;
    if (target.kind === "legacy-action") {
      this.#executeRouteAction(target.action, event, mapping);
      return;
    }
    if (["midi-note", "midi-cc", "midi-bend"].includes(target.kind)) {
      this.eventBus?.emit("midi.mapping.dispatch", {
        mappingId: mapping.id,
        target: target.kind,
        operation,
        channel: target.channel,
        systemId: event.systemId,
        collisionClass: event.collisionClass,
        phase: event.phase,
        a: event.a,
        b: event.b,
      }, { source: "physics-mapping" });
    }
    this.mappingTargetRouter?.(descriptor);
  }

  #releaseMappings(systemId = null) {
    this.mappingRuntime.releaseAll(
      descriptor => this.#executeMappingTarget(descriptor),
      record => !systemId || record.mapping.source.systemId === systemId,
    );
    this.mappingTargetRouter?.({ operation: "clear", systemId });
  }

  #hasRapierTarget(systemId = null) {
    return this.graph.systems.some(system => (
      system.enabled && system.adapter === "rapier2d" && (!systemId || system.id === systemId)
    ));
  }

  play(systemId = null) {
    if (systemId) this.playingSystems.add(systemId);
    else this.graph.systems.forEach(system => this.playingSystems.add(system.id));
    if (this.#hasRapierTarget(systemId)) this.#post({ type: "play", systemId });
    this.#notify("transport", { playing: true, systemId });
  }
  pause(systemId = null) {
    if (systemId) this.playingSystems.delete(systemId);
    else this.playingSystems.clear();
    if (this.worker || this.workerPromise) this.#post({ type: "pause", systemId });
    this.#releaseMappings(systemId);
    this.#notify("transport", { playing: false, systemId });
  }
  isPlaying(systemId) { return systemId ? this.playingSystems.has(systemId) : this.playingSystems.size > 0; }
  reset(systemId = null) {
    this.#releaseMappings(systemId);
    return this.#hasRapierTarget(systemId) ? this.#post({ type: "reset", systemId }) : Promise.resolve();
  }
  transport(time, { scrub = false } = {}) {
    if (this.worker || this.workerPromise) return this.#post({ type: "transport", time, scrub: scrub === true });
  }
  impulse(systemId, entityId, impulse) { return this.#post({ type: "impulse", systemId, entityId, impulse }); }
  grab(systemId, entityId, point, options = {}) { return this.#post({ type: "grab", systemId, entityId, point, ...options }); }
  grabConstraint(systemId, constraintId, point, options = {}) { return this.#post({ type: "grab.constraint", systemId, constraintId, point, ...options }); }
  moveGrab(systemId, point, options = {}) { return this.#post({ type: "grab.move", systemId, point, ...options }); }
  releaseGrab(systemId) { return this.#post({ type: "grab.release", systemId }); }

  async commitGrab(systemId, point, { livePose = false, iterations = 96 } = {}) {
    const worker = await this.#ensureWorker();
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.grabCommitRequests.delete(requestId);
        reject(new Error("Physics grab commit timed out."));
      }, 5000);
      this.grabCommitRequests.set(requestId, {
        resolve: value => { window.clearTimeout(timeout); resolve(value); },
        reject: error => { window.clearTimeout(timeout); reject(error); },
      });
      worker.postMessage({
        type: "grab.commit",
        requestId,
        systemId,
        point,
        livePose: livePose === true,
        iterations: Math.max(1, Math.min(96, Math.round(Number(iterations) || 96))),
      });
    });
  }

  async relax(systemId, entityIds = [], { iterations = 18 } = {}) {
    if (!systemId || !this.#hasRapierTarget(systemId)) return [];
    const worker = await this.#ensureWorker();
    const requestId = crypto.randomUUID();
    const revision = this.graphRevision;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.relaxRequests.delete(requestId);
        reject(new Error("Physics pose solve timed out."));
      }, 5000);
      this.relaxRequests.set(requestId, {
        resolve: value => { window.clearTimeout(timeout); resolve(value); },
        reject: error => { window.clearTimeout(timeout); reject(error); },
      });
      worker.postMessage({
        type: "relax",
        requestId,
        systemId,
        entityIds: Array.isArray(entityIds) ? entityIds : [entityIds],
        iterations: Math.max(1, Math.min(96, Math.round(Number(iterations) || 18))),
        revision,
      });
    });
  }

  async snapshot(systemId) {
    if (!this.worker && !this.workerPromise) return null;
    const worker = await this.#ensureWorker();
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.snapshotRequests.delete(requestId);
        reject(new Error("Physics snapshot timed out."));
      }, 5000);
      this.snapshotRequests.set(requestId, { resolve: value => { window.clearTimeout(timeout); resolve(value); }, reject });
      worker.postMessage({ type: "snapshot", requestId, systemId });
    });
  }

  async query(systemId, kind, detail = {}) {
    if (!this.worker && !this.workerPromise) return kind === "point" ? [] : null;
    const worker = await this.#ensureWorker();
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.queryRequests.delete(requestId);
        reject(new Error("Physics query timed out."));
      }, 5000);
      this.queryRequests.set(requestId, { resolve: value => { window.clearTimeout(timeout); resolve(value); }, reject });
      worker.postMessage({ type: `query.${kind}`, requestId, systemId, ...detail });
    });
  }

  getLatestPoses(systemId = null) {
    if (systemId) return this.latestPoses.get(systemId) || null;
    return [...this.latestPoses.values()];
  }

  getTelemetry() { return clone(this.telemetry); }

  dispose() {
    this.#releaseMappings();
    this.worker?.postMessage({ type: "dispose" });
    this.worker?.terminate();
    this.worker = null;
    this.workerPromise?.then(worker => worker.terminate());
    this.workerPromise = null;
    this.ready = false;
    this.latestPoses.clear();
    this.metadata.clear();
    this.writerRegistry.clear();
    this.playingSystems.clear();
    for (const request of this.snapshotRequests.values()) request.reject(new Error("Physics runtime disposed."));
    this.snapshotRequests.clear();
    for (const request of this.queryRequests.values()) request.reject(new Error("Physics runtime disposed."));
    this.queryRequests.clear();
    for (const request of this.relaxRequests.values()) request.reject(new Error("Physics runtime disposed."));
    this.relaxRequests.clear();
    for (const request of this.grabCommitRequests.values()) request.reject(new Error("Physics runtime disposed."));
    this.grabCommitRequests.clear();
  }
}

export const createRelationshipApi = ({ runtime, getGraph, setGraph }) => ({
  get: () => getGraph(),
  set: graph => setGraph(normalizeRelationshipGraph(graph)),
  add: (collection, item) => setGraph(addRelationshipItem(getGraph(), collection, item)),
  update: (collection, itemId, patch) => setGraph(updateRelationshipItem(getGraph(), collection, itemId, item => ({ ...item, ...clone(patch) }))),
  remove: (collection, itemId) => setGraph(removeRelationshipItem(getGraph(), collection, itemId)),
  endpoints: Object.freeze({ normalize: normalizePhysicsEndpoint }),
  adapters: Object.freeze({
    list: () => runtime?.listAdapters?.() || [],
    register: adapter => runtime?.registerAdapter?.(adapter),
  }),
  streams: Object.freeze({ get: id => runtime?.streamRegistry?.get?.(id) || null }),
  events: Object.freeze({ subscribe: listener => runtime?.subscribe?.("events", listener) || (() => {}) }),
  mappings: collectionApi("mappings", getGraph, setGraph),
});

export const createPhysicsApi = ({ runtime, getGraph, setGraph, applyPose, reset, materialize }) => ({
  world: {
    get: () => getGraph().world,
    update: patch => {
      const graph = getGraph();
      return setGraph({ ...graph, world: normalizePhysicsWorld({ ...graph.world, ...clone(patch) }) });
    },
  },
  systems: {
    list: () => getGraph().systems,
    create: overrides => {
      const system = createDefaultPhysicsSystem(overrides);
      setGraph(addRelationshipItem(getGraph(), "systems", system));
      return system;
    },
    update: (id, patch) => setGraph(updateRelationshipItem(getGraph(), "systems", id, item => ({ ...item, ...clone(patch) }))),
    remove: id => setGraph(removeRelationshipItem(getGraph(), "systems", id)),
  },
  bodies: collectionApi("bodies", getGraph, setGraph),
  populations: collectionApi("populations", getGraph, setGraph),
  constraints: collectionApi("constraints", getGraph, setGraph),
  // Legacy scripts keep a routes collection. New work should use
  // `__.relations.mappings`; route adds are migrated by graph normalization.
  routes: legacyRoutesApi(getGraph, setGraph),
  mappings: collectionApi("mappings", getGraph, setGraph),
  play: systemId => runtime.play(systemId),
  pause: systemId => runtime.pause(systemId),
  reset: systemId => reset?.(systemId) ?? runtime.reset(systemId),
  apply: systemId => applyPose?.(systemId),
  materialize: options => materialize?.(options),
  // The solver reads vectors as [x, y]. The rest of the public API speaks
  // {x, y}, and passing that here used to be a silent no-op rather than an
  // error, so accept both spellings at the boundary.
  impulse: (systemId, entityId, impulse) => runtime.impulse(systemId, entityId, normalizePhysicsVector(impulse)),
  grab: (systemId, entityId, point, options) => runtime.grab(systemId, entityId, point, options),
  grabConstraint: (systemId, constraintId, point, options) => runtime.grabConstraint(systemId, constraintId, point, options),
  moveGrab: (systemId, point, options) => runtime.moveGrab(systemId, point, options),
  releaseGrab: systemId => runtime.releaseGrab(systemId),
  poses: systemId => runtime.getLatestPoses(systemId),
  telemetry: () => runtime.getTelemetry(),
  snapshot: systemId => runtime.snapshot(systemId),
  queries: Object.freeze({
    point: (systemId, point) => runtime.query(systemId, "point", { point }),
    ray: (systemId, origin, direction, maxDistance) => runtime.query(systemId, "ray", { origin, direction, maxDistance }),
  }),
});

function collectionApi(collection, getGraph, setGraph) {
  const add = item => setGraph(addRelationshipItem(getGraph(), collection, item));
  return Object.freeze({
    list: systemId => getGraph()[collection].filter(item => !systemId || item.systemId === systemId),
    add,
    // `create` is the public, graph-oriented spelling. Keep `add` as a
    // compact compatibility alias used by the pre-mapping collections.
    create: add,
    update: (id, patch) => setGraph(updateRelationshipItem(getGraph(), collection, id, item => ({ ...item, ...clone(patch) }))),
    remove: id => setGraph(removeRelationshipItem(getGraph(), collection, id)),
  });
}

function legacyRoutesApi(getGraph, setGraph) {
  return Object.freeze({
    list: systemId => getGraph().routes.filter(item => !systemId || item.systemId === systemId),
    add: item => {
      const route = normalizePhysicsRoute(item);
      const graph = getGraph();
      setGraph({ ...graph, routes: [...graph.routes, route], mappings: [...graph.mappings, ...migratePhysicsRoutesToMappings([route])] });
      return route;
    },
    update: (id, patch) => {
      const graph = getGraph();
      const route = graph.routes.find(item => item.id === id);
      if (!route) return graph;
      const updated = normalizePhysicsRoute({ ...route, ...clone(patch) });
      const prefix = `${id}:`;
      setGraph({
        ...graph,
        routes: graph.routes.map(item => item.id === id ? updated : item),
        mappings: [...graph.mappings.filter(mapping => mapping.id !== id && !mapping.id.startsWith(prefix)), ...migratePhysicsRoutesToMappings([updated])],
      });
      return updated;
    },
    remove: id => {
      const graph = getGraph();
      const prefix = `${id}:`;
      return setGraph({
        ...graph,
        routes: graph.routes.filter(item => item.id !== id),
        mappings: graph.mappings.filter(mapping => mapping.id !== id && !mapping.id.startsWith(prefix)),
      });
    },
  });
}
