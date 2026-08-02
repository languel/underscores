import { normalizeDraweratorObjectRef, draweratorObjectRefKey } from "./draweratorObjectRef.js";

export const RELATIONSHIP_GRAPH_VERSION = 1;
export const PHYSICS_FIXED_HZ = 60;

export const TRACKING_CLASSES = Object.freeze(["runtime-lite", "authored-rigid", "authored-deformable"]);
export const BODY_TYPES = Object.freeze(["dynamic", "kinematic", "fixed"]);
export const COLLIDER_KINDS = Object.freeze(["circle", "box", "convex", "polyline"]);
export const CONSTRAINT_KINDS = Object.freeze(["pin", "distance", "spring", "revolute", "weld", "attractor"]);
export const ROUTE_ACTION_KINDS = Object.freeze(["event", "stream", "synth", "midi", "command"]);
export const PHYSICS_PIXELS_PER_METER = 100;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, finite(value, minimum)));
const id = (value, prefix = "physics") => String(value || `${prefix}-${crypto.randomUUID()}`);
const clone = value => value === undefined ? undefined : structuredClone(value);
const list = value => Array.isArray(value) ? value : [];
const uniqueStrings = value => [...new Set(list(value).map(item => String(item || "").trim()).filter(Boolean))];

export const createDefaultPhysicsSystem = overrides => {
  const value = overrides && typeof overrides === "object" ? overrides : {};
  const hasCustomGravity = Object.hasOwn(value, "gravity") && value.gravity != null;
  return normalizePhysicsSystem({
    id: `physics-system-${crypto.randomUUID()}`,
    name: "Physics",
    enabled: true,
    playing: false,
    adapter: "rapier2d",
    clock: { mode: "realtime", fixedHz: PHYSICS_FIXED_HZ, timeScale: 1 },
    gravityMode: hasCustomGravity ? "custom" : "world",
    ...value,
  });
};

export const normalizePhysicsSystem = value => ({
  id: id(value?.id, "physics-system"),
  name: String(value?.name || "Physics"),
  enabled: value?.enabled !== false,
  playing: value?.playing === true,
  adapter: value?.adapter === "geometry" ? "geometry" : "rapier2d",
  clock: {
    mode: value?.clock?.mode === "transport" ? "transport" : "realtime",
    fixedHz: clamp(value?.clock?.fixedHz, 15, 240) || PHYSICS_FIXED_HZ,
    timeScale: clamp(value?.clock?.timeScale ?? 1, 0, 8),
  },
  gravityMode: value?.gravityMode === "world" || (value?.gravityMode !== "custom" && !value?.gravity)
    ? "world"
    : "custom",
  gravity: { x: finite(value?.gravity?.x), y: finite(value?.gravity?.y, 900) },
  seed: Math.max(0, Math.round(finite(value?.seed, 1))),
  emitStayEvents: value?.emitStayEvents === true,
});

export const normalizePhysicsWorld = value => ({
  gravity: {
    x: finite(value?.gravity?.x),
    y: finite(value?.gravity?.y, -9.8),
  },
  viscosity: clamp(value?.viscosity, 0, 100),
  simSpeed: clamp(value?.simSpeed ?? 1, 0, 8),
  pixelsPerMeter: clamp(value?.pixelsPerMeter ?? PHYSICS_PIXELS_PER_METER, 1, 1000),
});

export const normalizePhysicsEndpoint = value => {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "world") {
    return { kind: "world", point: [finite(value.point?.[0]), finite(value.point?.[1])] };
  }
  if (value.kind === "stream") {
    const streamId = String(value.streamId || "");
    if (!streamId) return null;
    return {
      kind: "stream",
      streamId,
      path: String(value.path || "value"),
      featureId: value.featureId ? String(value.featureId) : null,
    };
  }
  const objectRef = normalizeDraweratorObjectRef(value.objectRef || value.elementId);
  if (!objectRef) return null;
  if (value.kind === "bezier-anchor") {
    const anchorId = String(value.anchorId || "");
    return anchorId ? { kind: "bezier-anchor", objectRef, anchorId } : null;
  }
  if (value.kind === "curve-progress") {
    return { kind: "curve-progress", objectRef, progress: clamp(value.progress, 0, 1) };
  }
  return {
    kind: "object",
    objectRef,
    anchor: value.anchor === "center" ? "center" : "local",
    localPoint: [finite(value.localPoint?.[0], 0.5), finite(value.localPoint?.[1], 0.5)],
  };
};

export const physicsEndpointKey = value => {
  const endpoint = normalizePhysicsEndpoint(value);
  if (!endpoint) return "";
  if (endpoint.kind === "world") return `world:${endpoint.point.join(":")}`;
  if (endpoint.kind === "stream") return `stream:${endpoint.streamId}:${endpoint.featureId || ""}:${endpoint.path}`;
  const objectKey = draweratorObjectRefKey(endpoint.objectRef);
  if (endpoint.kind === "bezier-anchor") return `${objectKey}:anchor:${endpoint.anchorId}`;
  if (endpoint.kind === "curve-progress") return `${objectKey}:progress:${endpoint.progress}`;
  return `${objectKey}:object:${endpoint.anchor}:${endpoint.localPoint.join(":")}`;
};

export const normalizeCollider = value => {
  const kind = COLLIDER_KINDS.includes(value?.kind) ? value.kind : "box";
  return {
    kind,
    sensor: value?.sensor === true,
    radius: Math.max(0.1, finite(value?.radius, 12)),
    width: Math.max(0.1, finite(value?.width, 24)),
    height: Math.max(0.1, finite(value?.height, 24)),
    points: list(value?.points).map(point => [finite(point?.[0]), finite(point?.[1])]),
  };
};

export const normalizeMaterial = value => ({
  density: Math.max(0.0001, finite(value?.density, 1)),
  friction: clamp(value?.friction ?? 0.2, 0, 10),
  restitution: clamp(value?.restitution ?? 0.8, 0, 2),
  linearDamping: clamp(value?.linearDamping ?? 0.01, 0, 100),
  angularDamping: clamp(value?.angularDamping ?? 0.01, 0, 100),
});

export const normalizePhysicsBody = value => {
  const objectRef = normalizeDraweratorObjectRef(value?.objectRef);
  const tracking = TRACKING_CLASSES.includes(value?.tracking)
    ? value.tracking
    : (objectRef ? "authored-rigid" : "runtime-lite");
  return {
    id: id(value?.id, "physics-body"),
    systemId: String(value?.systemId || ""),
    name: String(value?.name || "Body"),
    enabled: value?.enabled !== false,
    tracking,
    bodyType: BODY_TYPES.includes(value?.bodyType) ? value.bodyType : "dynamic",
    objectRef,
    collider: normalizeCollider(value?.collider),
    material: normalizeMaterial(value?.material),
    collisionTags: uniqueStrings(value?.collisionTags),
    collisionGroup: Math.max(0, Math.round(finite(value?.collisionGroup, 1))),
    collisionMask: Math.max(0, Math.round(finite(value?.collisionMask, 0xffff))),
    initial: {
      x: finite(value?.initial?.x),
      y: finite(value?.initial?.y),
      angle: finite(value?.initial?.angle),
      velocityX: finite(value?.initial?.velocityX),
      velocityY: finite(value?.initial?.velocityY),
      angularVelocity: finite(value?.initial?.angularVelocity),
    },
    initialGeometry: value?.initialGeometry && typeof value.initialGeometry === "object" ? clone(value.initialGeometry) : null,
    render: {
      fill: String(value?.render?.fill || "#4f8cff"),
      stroke: String(value?.render?.stroke || "transparent"),
      strokeWidth: Math.max(0, finite(value?.render?.strokeWidth, 0)),
      opacity: clamp(value?.render?.opacity ?? 1, 0, 1),
    },
  };
};

// Authored body settings live on the native Excalidraw object. The graph keeps
// the stable binding needed by constraints and systems; Rapier receives a
// derived, normalized body definition at runtime.
export const serializePhysicsBodyCustomData = value => {
  const body = normalizePhysicsBody(value);
  return {
    version: 1,
    role: "body",
    id: body.id,
    systemId: body.systemId,
    tracking: body.tracking,
    enabled: body.enabled,
    bodyType: body.bodyType,
    name: body.name,
    collisionTags: [...body.collisionTags],
    collisionGroup: body.collisionGroup,
    collisionMask: body.collisionMask,
    collider: clone(body.collider),
    material: clone(body.material),
    initial: clone(body.initial),
    initialGeometry: clone(body.initialGeometry),
    render: clone(body.render),
  };
};

// Physics metadata lives on the authored object as `customData.physics`.
// `draweratorPhysics` was the name used by the first canvas-first slice; read
// it as a compatibility alias, but never make it the canonical write path.
export const getPhysicsCustomData = value => {
  const customData = value?.customData && typeof value.customData === "object"
    ? value.customData
    : value;
  return customData?.physics || customData?.draweratorPhysics || null;
};

export const withPhysicsCustomData = (customData, value) => {
  const next = { ...(customData || {}), physics: serializePhysicsBodyCustomData(value) };
  delete next.draweratorPhysics;
  return next;
};

export const hydrateRelationshipGraphFromElements = (graphValue, elements = []) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const liveElements = (elements || []).filter(element => element && !element.isDeleted);
  const elementById = new Map(liveElements.map(element => [element.id, element]));
  const boundElementIds = new Set(graph.bodies
    .filter(body => body.objectRef?.kind === "element")
    .map(body => body.objectRef.elementId));
  const usedBodyIds = new Set(graph.bodies.map(body => body.id));
  let systems = graph.systems;
  const bodies = [
    ...graph.bodies.map(body => {
      if (body.objectRef?.kind !== "element") return body;
      const physics = getPhysicsCustomData(elementById.get(body.objectRef.elementId));
      if (!physics || physics.role !== "body") return body;
      return {
        ...body,
        ...physics,
        // A graph body id is a relationship identity referenced by imported
        // constraints. Preserve it through copy/remap; object data owns the
        // actual body configuration.
        id: body.id,
        systemId: body.systemId || physics.systemId,
        tracking: body.tracking || physics.tracking,
        objectRef: body.objectRef,
      };
    }),
    // A native object is sufficient authored evidence of a body. This also
    // repairs partial/legacy Excalidraw imports whose graph binding was not
    // saved alongside `customData.physics`.
    ...liveElements.flatMap(element => {
      if (boundElementIds.has(element.id)) return [];
      const physics = getPhysicsCustomData(element);
      if (!physics || physics.role !== "body") return [];
      let systemId = String(physics.systemId || systems[0]?.id || "");
      if (!systems.some(system => system.id === systemId)) {
        const system = createDefaultPhysicsSystem({
          ...(systemId ? { id: systemId } : {}),
          name: "World",
        });
        systems = [...systems, system];
        systemId = system.id;
      }
      const preferredId = String(physics.id || `physics-body-${element.id}`);
      const bodyId = usedBodyIds.has(preferredId) ? `physics-body-${element.id}` : preferredId;
      usedBodyIds.add(bodyId);
      return [normalizePhysicsBody({
        ...physics,
        id: bodyId,
        systemId,
        objectRef: { kind: "element", elementId: element.id },
      })];
    }),
  ];
  return normalizeRelationshipGraph({
    ...graph,
    systems,
    bodies,
  });
};

export const serializeRelationshipGraphForScene = graphValue => {
  const graph = normalizeRelationshipGraph(graphValue);
  return {
    ...graph,
    // Authored body configuration already lives at object.customData.physics.
    // Keep only its identity and system binding in the relationship graph.
    bodies: graph.bodies.map(body => body.objectRef?.kind === "element"
      ? {
          id: body.id,
          systemId: body.systemId,
          tracking: body.tracking,
          objectRef: clone(body.objectRef),
        }
      : body),
  };
};

export const normalizePhysicsPopulation = value => ({
  id: id(value?.id, "physics-population"),
  systemId: String(value?.systemId || ""),
  name: String(value?.name || "Population"),
  enabled: value?.enabled !== false,
  count: Math.max(0, Math.min(5000, Math.round(finite(value?.count, 100)))),
  seed: Math.max(0, Math.round(finite(value?.seed, 1))),
  excludedInstanceIds: uniqueStrings(value?.excludedInstanceIds),
  bounds: {
    x: finite(value?.bounds?.x),
    y: finite(value?.bounds?.y),
    width: Math.max(1, finite(value?.bounds?.width, 600)),
    height: Math.max(1, finite(value?.bounds?.height, 400)),
  },
  prototype: normalizePhysicsBody({
    ...value?.prototype,
    id: value?.prototype?.id || `${value?.id || "population"}-prototype`,
    systemId: value?.systemId,
    tracking: "runtime-lite",
    objectRef: null,
  }),
  spawn: {
    speedMin: Math.max(0, finite(value?.spawn?.speedMin, 40)),
    speedMax: Math.max(0, finite(value?.spawn?.speedMax, 180)),
    angularSpeed: Math.max(0, finite(value?.spawn?.angularSpeed, 2)),
  },
});

export const normalizePhysicsConstraint = value => ({
  id: id(value?.id, "physics-constraint"),
  systemId: String(value?.systemId || ""),
  name: String(value?.name || "Constraint"),
  enabled: value?.enabled !== false,
  kind: CONSTRAINT_KINDS.includes(value?.kind) ? value.kind : "spring",
  a: normalizePhysicsEndpoint(value?.a),
  b: normalizePhysicsEndpoint(value?.b),
  restLength: Math.max(0, finite(value?.restLength, 100)),
  stiffness: Math.max(0, finite(value?.stiffness, 40)),
  damping: Math.max(0, finite(value?.damping, 4)),
  lowerLimit: Number.isFinite(Number(value?.lowerLimit)) ? Number(value.lowerLimit) : null,
  upperLimit: Number.isFinite(Number(value?.upperLimit)) ? Number(value.upperLimit) : null,
  breakForce: Number.isFinite(Number(value?.breakForce)) ? Math.max(0, Number(value.breakForce)) : null,
  collideConnected: value?.collideConnected === true,
});

export const normalizePhysicsRoute = value => ({
  id: id(value?.id, "physics-route"),
  systemId: String(value?.systemId || ""),
  name: String(value?.name || "Collision route"),
  enabled: value?.enabled !== false,
  filter: {
    phases: uniqueStrings(value?.filter?.phases?.length ? value.filter.phases : ["hit"]),
    classes: uniqueStrings(value?.filter?.classes),
    tagsA: uniqueStrings(value?.filter?.tagsA),
    tagsB: uniqueStrings(value?.filter?.tagsB),
    minImpulse: Math.max(0, finite(value?.filter?.minImpulse)),
    minRelativeSpeed: Math.max(0, finite(value?.filter?.minRelativeSpeed)),
  },
  cooldownMs: Math.max(0, finite(value?.cooldownMs, 60)),
  perPair: value?.perPair !== false,
  actions: list(value?.actions).filter(action => ROUTE_ACTION_KINDS.includes(action?.kind)).map(action => ({
    ...clone(action),
    kind: action.kind,
  })),
});

export const normalizeRelationshipGraph = value => {
  const graph = value && typeof value === "object" ? value : {};
  const systems = list(graph.systems).map(normalizePhysicsSystem);
  const systemIds = new Set(systems.map(system => system.id));
  const keepSystem = item => !item.systemId || systemIds.has(item.systemId);
  return {
    version: RELATIONSHIP_GRAPH_VERSION,
    world: normalizePhysicsWorld(graph.world),
    systems,
    bodies: list(graph.bodies).map(normalizePhysicsBody).filter(keepSystem),
    populations: list(graph.populations).map(normalizePhysicsPopulation).filter(keepSystem),
    constraints: list(graph.constraints).map(normalizePhysicsConstraint).filter(keepSystem),
    routes: list(graph.routes).map(normalizePhysicsRoute).filter(keepSystem),
  };
};

export const createEmptyRelationshipGraph = () => normalizeRelationshipGraph(null);

export const updateRelationshipItem = (graphValue, collection, itemId, updater) => {
  const graph = normalizeRelationshipGraph(graphValue);
  if (!Object.hasOwn(graph, collection)) throw new Error(`Unknown relationship collection: ${collection}`);
  const normalizers = {
    systems: normalizePhysicsSystem,
    bodies: normalizePhysicsBody,
    populations: normalizePhysicsPopulation,
    constraints: normalizePhysicsConstraint,
    routes: normalizePhysicsRoute,
  };
  const normalize = normalizers[collection];
  return normalizeRelationshipGraph({
    ...graph,
    [collection]: graph[collection].map(item => item.id === itemId ? normalize(updater(clone(item))) : item),
  });
};

export const addRelationshipItem = (graphValue, collection, itemValue) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const normalizers = {
    systems: normalizePhysicsSystem,
    bodies: normalizePhysicsBody,
    populations: normalizePhysicsPopulation,
    constraints: normalizePhysicsConstraint,
    routes: normalizePhysicsRoute,
  };
  const normalize = normalizers[collection];
  if (!normalize) throw new Error(`Unknown relationship collection: ${collection}`);
  return normalizeRelationshipGraph({ ...graph, [collection]: [...graph[collection], normalize(itemValue)] });
};

export const removeRelationshipItem = (graphValue, collection, itemId) => {
  const graph = normalizeRelationshipGraph(graphValue);
  if (!Object.hasOwn(graph, collection)) throw new Error(`Unknown relationship collection: ${collection}`);
  const next = { ...graph, [collection]: graph[collection].filter(item => item.id !== itemId) };
  if (collection === "systems") {
    for (const key of ["bodies", "populations", "constraints", "routes"]) {
      next[key] = next[key].filter(item => item.systemId !== itemId);
    }
  }
  return normalizeRelationshipGraph(next);
};

export const remapRelationshipGraph = (graphValue, idMap, existingIds = new Set()) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const remapRef = objectRef => {
    const ref = normalizeDraweratorObjectRef(objectRef);
    if (!ref) return null;
    const elementId = idMap.get(ref.elementId) || (existingIds.has(ref.elementId) ? ref.elementId : null);
    return elementId ? { ...ref, elementId } : null;
  };
  const remapEndpoint = endpointValue => {
    const endpoint = normalizePhysicsEndpoint(endpointValue);
    if (!endpoint || ["world", "stream"].includes(endpoint.kind)) return endpoint;
    const objectRef = remapRef(endpoint.objectRef);
    return objectRef ? { ...endpoint, objectRef } : null;
  };
  return normalizeRelationshipGraph({
    ...graph,
    bodies: graph.bodies.map(body => ({ ...body, objectRef: remapRef(body.objectRef) })).filter(body => body.tracking === "runtime-lite" || body.objectRef),
    constraints: graph.constraints.map(constraint => ({ ...constraint, a: remapEndpoint(constraint.a), b: remapEndpoint(constraint.b) })),
  });
};

export const relationshipGraphForSelection = (graphValue, selectedElementIds) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const selected = new Set(selectedElementIds || []);
  const bodies = graph.bodies.filter(body => body.objectRef && selected.has(body.objectRef.elementId));
  const bodyIds = new Set(bodies.map(body => body.id));
  const endpointSelected = endpoint => {
    const normalized = normalizePhysicsEndpoint(endpoint);
    return !normalized || ["world", "stream"].includes(normalized.kind) || selected.has(normalized.objectRef.elementId);
  };
  const constraints = graph.constraints.filter(constraint => endpointSelected(constraint.a) && endpointSelected(constraint.b));
  const systemIds = new Set([...bodies.map(body => body.systemId), ...constraints.map(item => item.systemId)]);
  return normalizeRelationshipGraph({
    systems: graph.systems.filter(system => systemIds.has(system.id)),
    bodies,
    constraints,
    routes: graph.routes.filter(route => systemIds.has(route.systemId)),
    populations: graph.populations.filter(population => systemIds.has(population.systemId) && bodyIds.has(population.prototype.id)),
  });
};

const tagsMatch = (required, actual) => required.length === 0 || required.some(tag => actual.includes(tag));

export const physicsRouteMatches = (routeValue, event) => {
  const route = normalizePhysicsRoute(routeValue);
  const phase = String(event?.phase || "");
  const collisionClass = String(event?.collisionClass || "");
  if (!route.enabled || (route.systemId && route.systemId !== event?.systemId)) return false;
  if (route.filter.phases.length && !route.filter.phases.includes(phase)) return false;
  if (route.filter.classes.length && !route.filter.classes.includes(collisionClass)) return false;
  if (!tagsMatch(route.filter.tagsA, uniqueStrings(event?.a?.tags))) return false;
  if (!tagsMatch(route.filter.tagsB, uniqueStrings(event?.b?.tags))) return false;
  if (finite(event?.impulse) < route.filter.minImpulse) return false;
  return finite(event?.relativeSpeed) >= route.filter.minRelativeSpeed;
};

export class PhysicsRouteRuntime {
  constructor({ now = () => performance.now(), maxDepth = 4 } = {}) {
    this.now = now;
    this.maxDepth = maxDepth;
    this.lastFired = new Map();
    this.depth = 0;
  }

  route(graphValue, event) {
    if (this.depth >= this.maxDepth) return [];
    const graph = normalizeRelationshipGraph(graphValue);
    const now = this.now();
    const pair = [event?.a?.id, event?.b?.id].filter(Boolean).sort().join(":");
    const matched = [];
    for (const route of graph.routes) {
      if (!physicsRouteMatches(route, event)) continue;
      const cooldownKey = route.perPair ? `${route.id}:${pair}` : route.id;
      if (now - (this.lastFired.get(cooldownKey) ?? -Infinity) < route.cooldownMs) continue;
      this.lastFired.set(cooldownKey, now);
      matched.push({ route, actions: route.actions.map(clone), event: clone(event) });
    }
    return matched;
  }

  dispatch(match, callback) {
    if (this.depth >= this.maxDepth) return false;
    this.depth += 1;
    try {
      callback(match);
      return true;
    } finally {
      this.depth -= 1;
    }
  }
}

export const findRelationshipOrphans = (graphValue, elements = []) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const liveElements = new Map(elements
    .filter(element => !element.isDeleted)
    .map(element => [element.id, element]));
  const endpointIsOrphaned = endpointValue => {
    const endpoint = normalizePhysicsEndpoint(endpointValue);
    if (!endpoint || ["world", "stream"].includes(endpoint.kind)) return false;
    const element = liveElements.get(endpoint.objectRef.elementId);
    if (!element) return true;
    if (endpoint.kind !== "bezier-anchor") return false;
    const anchors = element.customData?.draweratorGeometry?.anchors;
    return !Array.isArray(anchors) || !anchors.some(anchor => anchor?.id === endpoint.anchorId);
  };
  const orphans = [];
  graph.bodies.forEach(body => {
    if (body.objectRef && !liveElements.has(body.objectRef.elementId)) orphans.push({ kind: "body", id: body.id, endpoint: "objectRef" });
  });
  graph.constraints.forEach(constraint => {
    for (const key of ["a", "b"]) {
      if (endpointIsOrphaned(constraint[key])) {
        orphans.push({ kind: "constraint", id: constraint.id, endpoint: key });
      }
    }
  });
  return orphans;
};

export class RelationshipWriterRegistry {
  constructor() { this.claims = new Map(); }
  claim(ownerId, objectRef, channel) {
    const key = `${draweratorObjectRefKey(objectRef)}:${channel}`;
    const current = this.claims.get(key);
    if (current && current !== ownerId) return { ok: false, ownerId: current, key };
    this.claims.set(key, ownerId);
    return { ok: true, ownerId, key };
  }
  release(ownerId) {
    for (const [key, current] of this.claims) if (current === ownerId) this.claims.delete(key);
  }
  clear() { this.claims.clear(); }
}
