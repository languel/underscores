import { normalizeUnderscoresObjectRef, underscoresObjectRefKey } from "./underscoresObjectRef.js";

export const RELATIONSHIP_GRAPH_VERSION = 4;
export const PHYSICS_FIXED_HZ = 60;

export const TRACKING_CLASSES = Object.freeze(["runtime-lite", "authored-rigid", "authored-deformable"]);
export const BODY_TYPES = Object.freeze(["dynamic", "kinematic", "fixed"]);
export const COLLIDER_KINDS = Object.freeze(["circle", "ellipse", "box", "convex", "polyline", "chain"]);
// Bodies have one solver role, while constraints are independent authored
// relationships. Keep the older Rapier-oriented names for compatibility and
// expose the canvas-first vocabulary alongside them: Fixate is a weld and
// Axle is a revolute joint.
export const CONSTRAINT_KINDS = Object.freeze(["pin", "distance", "spring", "rope", "revolute", "weld", "fixate", "axle", "attractor", "thruster", "tracer"]);
export const ROUTE_ACTION_KINDS = Object.freeze(["event", "stream", "synth", "midi", "command"]);
export const MAPPING_SOURCE_KINDS = Object.freeze(["physics-collision"]);
export const MAPPING_TARGET_KINDS = Object.freeze(["midi-note", "midi-cc", "midi-bend", "expressive-voice", "legacy-action"]);
export const PHYSICS_COLLISION_FIELDS = Object.freeze(["impulse", "relativeSpeed", "contactX", "contactY", "normalX", "normalY"]);
export const PHYSICS_PIXELS_PER_METER = 100;
// Rapier exposes 16 collision bits. The high bit is reserved at runtime for
// articulated rope links so they can collide with authored bodies without
// self-colliding, leaving fifteen explicit author-facing layers.
export const MAX_PHYSICS_COLLISION_LAYERS = 15;
export const DEFAULT_PHYSICS_COLLISION_LAYERS = Object.freeze([
  Object.freeze({ id: "default", name: "Default" }),
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, finite(value, minimum)));
const id = (value, prefix = "physics") => String(value || `${prefix}-${crypto.randomUUID()}`);
const clone = value => value === undefined ? undefined : structuredClone(value);
const list = value => Array.isArray(value) ? value : [];
const uniqueStrings = value => [...new Set(list(value).map(item => String(item || "").trim()).filter(Boolean))];
const collisionLayerPairKey = (a, b) => [String(a || ""), String(b || "")].sort().join("|");
export { collisionLayerPairKey };

const normalizeCollisionLayerId = (value, index) => {
  const candidate = String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-");
  return candidate || `layer-${index + 1}`;
};

export const normalizePhysicsCollisionLayers = value => {
  const source = value && typeof value === "object" ? value : {};
  const seen = new Set();
  const layers = list(source.layers)
    .map((layer, index) => {
      const id = normalizeCollisionLayerId(layer?.id, index);
      if (seen.has(id)) return null;
      seen.add(id);
      return { id, name: String(layer?.name || id) };
    })
    .filter(Boolean)
    .slice(0, MAX_PHYSICS_COLLISION_LAYERS);
  if (!layers.length) layers.push(...DEFAULT_PHYSICS_COLLISION_LAYERS.map(layer => ({ ...layer })));
  const sourceMatrix = source.matrix && typeof source.matrix === "object" ? source.matrix : {};
  const matrix = {};
  for (let a = 0; a < layers.length; a += 1) {
    for (let b = a; b < layers.length; b += 1) {
      const key = collisionLayerPairKey(layers[a].id, layers[b].id);
      // A fresh layer stack preserves the historical "everything collides"
      // behavior. Authors opt out by clearing a matrix cell.
      matrix[key] = sourceMatrix[key] !== false;
    }
  }
  return { layers, matrix };
};

export const setPhysicsCollisionLayerPair = (value, firstId, secondId, enabled) => {
  const layers = normalizePhysicsCollisionLayers(value);
  const key = collisionLayerPairKey(firstId, secondId);
  if (!layers.layers.some(layer => layer.id === firstId) || !layers.layers.some(layer => layer.id === secondId)) return layers;
  return { ...layers, matrix: { ...layers.matrix, [key]: enabled !== false } };
};

export const resolvePhysicsCollisionGroups = (worldValue, bodyValue) => {
  const world = normalizePhysicsWorld(worldValue);
  const body = normalizePhysicsBody(bodyValue);
  // A missing membership is intentionally a legacy marker. Existing scene
  // JSON keeps its explicit Rapier group/mask semantics until an author edits
  // the body into the named layer stack.
  if (!Array.isArray(body.collisionLayers)) {
    return { group: body.collisionGroup, mask: body.collisionMask, legacy: true };
  }
  const layers = world.collisionLayers.layers;
  const byId = new Map(layers.map((layer, index) => [layer.id, index]));
  const membership = body.collisionLayers.filter(id => byId.has(id));
  // An explicit empty membership is useful: it turns a body into a
  // non-colliding participant while keeping it available to joints, queries,
  // and the rest of the physics system. Only `null` means a legacy raw mask.
  const activeMembership = membership;
  let group = 0;
  let mask = 0;
  for (const layerId of activeMembership) group |= 1 << byId.get(layerId);
  for (const target of layers) {
    if (activeMembership.some(sourceId => world.collisionLayers.matrix[collisionLayerPairKey(sourceId, target.id)] !== false)) {
      mask |= 1 << byId.get(target.id);
    }
  }
  return { group, mask, legacy: false };
};
const normalizeMappingValues = value => {
  const values = value && typeof value === "object" ? value : {};
  const normalized = {};
  for (const [key, rawValue] of Object.entries(values)) {
    // Mapping formula identifiers cannot contain dots, spaces, or punctuation.
    // Keep authored body values aligned with that safe expression language.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) normalized[key] = numeric;
  }
  // Every authored body has a musical base value by default. This makes
  // collision formulas such as `pentatonic((noteA + noteB) / 2, degree)`
  // immediately useful while remaining a normal body property.
  if (!Object.hasOwn(normalized, "note")) normalized.note = 60;
  return normalized;
};

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
  // Authoring is the normal canvas-first workflow: a paused transform edit
  // becomes the next Reset pose. Preview keeps the authored pose locked so a
  // user can stage an experiment and return to it with Reset.
  pausedEditMode: value?.pausedEditMode === "preview" ? "preview" : "author",
  // Live pose is an IK-like manipulation mode. It does not advance transport
  // time; releasing a live pose at transport zero promotes that solved pose
  // to the authored reset baseline in App, while other times stay runtime-only.
  livePose: value?.livePose === true,
  // Kept only so old scene data remains readable. The old implementation
  // rewrote reset poses after solving and is intentionally no longer used.
  pausedConstraintSolve: value?.pausedConstraintSolve === true,
  collisionLayers: normalizePhysicsCollisionLayers(value?.collisionLayers),
});

// Solver vectors are [x, y]. The public API speaks {x, y} everywhere else, so
// both spellings are accepted wherever a script hands one in.
export const normalizePhysicsVector = value => {
  if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[1]) || 0];
  if (value && typeof value === "object") return [Number(value.x) || 0, Number(value.y) || 0];
  return [0, 0];
};

export const normalizePhysicsEndpoint = value => {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "none") return { kind: "none" };
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
  const objectRef = normalizeUnderscoresObjectRef(value.objectRef || value.elementId);
  if (!objectRef) return null;
  if (value.kind === "bezier-anchor") {
    const anchorId = String(value.anchorId || "");
    return anchorId ? { kind: "bezier-anchor", objectRef, anchorId } : null;
  }
  if (value.kind === "curve-progress") {
    return { kind: "curve-progress", objectRef, progress: clamp(value.progress, 0, 1) };
  }
  if (value.kind === "rope") {
    const constraintId = String(value.constraintId || "");
    const point = Array.isArray(value.point)
      && Number.isFinite(Number(value.point[0]))
      && Number.isFinite(Number(value.point[1]))
      ? [Number(value.point[0]), Number(value.point[1])]
      : null;
    const linkIndex = Number.isInteger(Number(value.linkIndex)) && Number(value.linkIndex) >= 0
      ? Math.floor(Number(value.linkIndex))
      : null;
    const ropeProgress = Number.isFinite(Number(value.ropeProgress))
      ? clamp(Number(value.ropeProgress), 0, 1)
      : null;
    return constraintId && point ? {
      kind: "rope",
      objectRef,
      constraintId,
      point,
      ...(linkIndex !== null ? { linkIndex } : {}),
      ...(ropeProgress !== null ? { ropeProgress } : {}),
    } : null;
  }
  const localAnchor = Array.isArray(value.localAnchor)
    && Number.isFinite(Number(value.localAnchor[0]))
    && Number.isFinite(Number(value.localAnchor[1]))
    ? [Number(value.localAnchor[0]), Number(value.localAnchor[1])]
    : null;
  return {
    kind: "object",
    objectRef,
    anchor: value.anchor === "center" ? "center" : "local",
    localPoint: [finite(value.localPoint?.[0], 0.5), finite(value.localPoint?.[1], 0.5)],
    // `localPoint` is an authoring coordinate in an Excalidraw frame. Complex
    // paths can have a collider origin that differs from that frame centre.
    // Hydration resolves this scene-pixel offset for the solver so a visual
    // axle remains at the exact authored pivot rather than snapping on play.
    ...(localAnchor ? { localAnchor } : {}),
  };
};

export const physicsEndpointKey = value => {
  const endpoint = normalizePhysicsEndpoint(value);
  if (!endpoint) return "";
  if (endpoint.kind === "none") return "none";
  if (endpoint.kind === "world") return `world:${endpoint.point.join(":")}`;
  if (endpoint.kind === "stream") return `stream:${endpoint.streamId}:${endpoint.featureId || ""}:${endpoint.path}`;
  const objectKey = underscoresObjectRefKey(endpoint.objectRef);
  if (endpoint.kind === "bezier-anchor") return `${objectKey}:anchor:${endpoint.anchorId}`;
  if (endpoint.kind === "curve-progress") return `${objectKey}:progress:${endpoint.progress}`;
  if (endpoint.kind === "rope") return `${objectKey}:rope:${endpoint.constraintId}:${endpoint.ropeProgress ?? endpoint.linkIndex ?? endpoint.point.join(":")}`;
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
    thickness: Math.max(0.1, finite(value?.thickness, 2)),
    // Contact skin is an authored, invisible collider margin in scene pixels.
    // Rapier applies the two colliders' skins before their visible geometry
    // touches, which makes small/fast bodies more stable around fine paths.
    contactSkin: clamp(value?.contactSkin, 0, 64),
    points: list(value?.points).map(point => [finite(point?.[0]), finite(point?.[1])]),
    // Point-defined colliders need a stable coordinate-space marker so a
    // scene written before a local-origin migration is repaired exactly once.
    localOriginVersion: Math.max(0, Math.round(finite(value?.localOriginVersion, 0))),
  };
};

export const normalizeMaterial = value => ({
  density: Math.max(0.0001, finite(value?.density, 1)),
  friction: clamp(value?.friction ?? 0.2, 0, 10),
  restitution: clamp(value?.restitution ?? 0.8, 0, 2),
  linearDamping: clamp(value?.linearDamping ?? 0.01, 0, 100),
  angularDamping: clamp(value?.angularDamping ?? 0.01, 0, 100),
});

export const normalizePhysicsTrail = value => ({
  enabled: value?.enabled === true,
  color: String(value?.color || "#4f8cff"),
  duration: clamp(value?.duration ?? 4, 0.1, 120),
  opacity: clamp(value?.opacity ?? 0.75, 0, 1),
});

export const normalizePhysicsBody = value => {
  const objectRef = normalizeUnderscoresObjectRef(value?.objectRef);
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
    mappingValues: normalizeMappingValues(value?.mappingValues),
    collisionGroup: Math.max(0, Math.round(finite(value?.collisionGroup, 1))),
    collisionMask: Math.max(0, Math.round(finite(value?.collisionMask, 0xffff))),
    // `null` is deliberate: it means this is a pre-layer-stack body and its
    // raw collisionGroup/collisionMask values must remain authoritative.
    collisionLayers: Array.isArray(value?.collisionLayers)
      ? uniqueStrings(value.collisionLayers).slice(0, MAX_PHYSICS_COLLISION_LAYERS)
      : null,
    initial: {
      x: finite(value?.initial?.x),
      y: finite(value?.initial?.y),
      angle: finite(value?.initial?.angle),
      velocityX: finite(value?.initial?.velocityX),
      velocityY: finite(value?.initial?.velocityY),
      angularVelocity: finite(value?.initial?.angularVelocity),
    },
    initialGeometry: value?.initialGeometry && typeof value.initialGeometry === "object" ? clone(value.initialGeometry) : null,
    trail: normalizePhysicsTrail(value?.trail),
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
    mappingValues: clone(body.mappingValues),
    collisionGroup: body.collisionGroup,
    collisionMask: body.collisionMask,
    ...(Array.isArray(body.collisionLayers) ? { collisionLayers: [...body.collisionLayers] } : {}),
    collider: clone(body.collider),
    material: clone(body.material),
    initial: clone(body.initial),
    initialGeometry: clone(body.initialGeometry),
    trail: clone(body.trail),
    render: clone(body.render),
  };
};

const isConstraintPhysicsRole = role => CONSTRAINT_KINDS.includes(role);

// A constraint object's customData is deliberately inspectable and portable,
// but the solver also needs a precise anchor measured from the *actual*
// collider origin.  Freehand paths can have a rendered origin different from
// their Excalidraw frame centre, so do not throw that resolved local anchor
// away merely because older customData only contains `localPoint`.
//
// If an author deliberately changes the endpoint's normalized localPoint (or
// supplies an explicit localAnchor), let hydration recompute/use that change.
const mergeConstraintEndpointFromObjectData = (graphEndpoint, objectEndpoint) => {
  if (!objectEndpoint) return graphEndpoint;
  if (!graphEndpoint || graphEndpoint.kind !== "object" || objectEndpoint.kind !== "object") return objectEndpoint;
  const sameObject = graphEndpoint.objectRef?.kind === objectEndpoint.objectRef?.kind
    && graphEndpoint.objectRef?.elementId === objectEndpoint.objectRef?.elementId;
  const sameLocalPoint = JSON.stringify(graphEndpoint.localPoint || null) === JSON.stringify(objectEndpoint.localPoint || null);
  if (!sameObject || !sameLocalPoint || Array.isArray(objectEndpoint.localAnchor) || !Array.isArray(graphEndpoint.localAnchor)) {
    return objectEndpoint;
  }
  return { ...objectEndpoint, localAnchor: clone(graphEndpoint.localAnchor) };
};

// Constraint objects use the same authored home as bodies. Unlike a body they
// have no Rapier handle of their own: the canvas object marks the joint centre
// and owns the persistent relationship configuration.
export const serializePhysicsConstraintCustomData = value => {
  const constraint = normalizePhysicsConstraint(value);
  return {
    version: 1,
    role: constraint.kind,
    id: constraint.id,
    systemId: constraint.systemId,
    enabled: constraint.enabled,
    name: constraint.name,
    constraintKind: constraint.kind,
    objectRef: clone(constraint.objectRef),
    a: clone(constraint.a),
    b: clone(constraint.b),
    restLength: constraint.restLength,
    pathPoints: clone(constraint.pathPoints),
    segmentLength: constraint.segmentLength,
    thickness: constraint.thickness,
    stiffness: constraint.stiffness,
    damping: constraint.damping,
    ...(Array.isArray(constraint.collisionLayers) ? { collisionLayers: [...constraint.collisionLayers] } : {}),
    ...(constraint.kind === "rope" ? { selfCollisions: constraint.selfCollisions === true } : {}),
    motorEnabled: constraint.motorEnabled,
    motorSpeed: constraint.motorSpeed,
    motorTorque: constraint.motorTorque,
    attractionStrength: constraint.attractionStrength,
    attractionRadius: constraint.attractionRadius,
    attractionFalloff: constraint.attractionFalloff,
    attractionMode: constraint.attractionMode,
    targetTags: clone(constraint.targetTags),
    thrusterForce: constraint.thrusterForce,
    trail: clone(constraint.trail),
    limitsEnabled: constraint.limitsEnabled,
    lowerLimit: constraint.lowerLimit,
    upperLimit: constraint.upperLimit,
    breakForce: constraint.breakForce,
    collideConnected: constraint.collideConnected,
  };
};

// Physics metadata lives on the authored object as `customData.physics`.
// `underscoresPhysics` was the name used by the first canvas-first slice; read
// it as a compatibility alias, but never make it the canonical write path.
export const getPhysicsCustomData = value => {
  const customData = value?.customData && typeof value.customData === "object"
    ? value.customData
    : value;
  return customData?.physics || customData?.underscoresPhysics || null;
};

export const withPhysicsCustomData = (customData, value) => {
  const next = { ...(customData || {}), physics: value?.kind && isConstraintPhysicsRole(value.kind)
    ? serializePhysicsConstraintCustomData(value)
    : serializePhysicsBodyCustomData(value) };
  delete next.underscoresPhysics;
  return next;
};

export const hydrateRelationshipGraphFromElements = (graphValue, elements = [], {
  // During an authored canvas transform the live graph already contains the
  // newly inferred body poses and anchors, while element customData still
  // contains the pre-transform snapshot. Keep the graph authoritative for
  // bindings it already owns, but continue discovering missing bindings from
  // element metadata below.
  preferGraphPhysics = false,
} = {}) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const liveElements = (elements || []).filter(element => element && !element.isDeleted);
  const elementById = new Map(liveElements.map(element => [element.id, element]));
  const boundElementIds = new Set(graph.bodies
    .filter(body => body.objectRef?.kind === "element")
    .map(body => body.objectRef.elementId));
  const usedBodyIds = new Set(graph.bodies.map(body => body.id));
  const boundConstraintElementIds = new Set(graph.constraints
    .filter(constraint => constraint.objectRef?.kind === "element")
    .map(constraint => constraint.objectRef.elementId));
  const usedConstraintIds = new Set(graph.constraints.map(constraint => constraint.id));
  let systems = graph.systems;
  const bodies = [
    ...graph.bodies.map(body => {
      if (body.objectRef?.kind !== "element") return body;
      if (preferGraphPhysics) return body;
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
  const constraints = [
    ...graph.constraints.map(constraint => {
      if (constraint.objectRef?.kind !== "element") return constraint;
      if (preferGraphPhysics) return constraint;
      const physics = getPhysicsCustomData(elementById.get(constraint.objectRef.elementId));
      if (!physics || !isConstraintPhysicsRole(physics.role || physics.constraintKind)) return constraint;
      return normalizePhysicsConstraint({
        ...constraint,
        ...physics,
        // The canvas object is the source of truth for its explicit role.
        // Without promoting it back to `kind`, converting a Weld into a Rope
        // retained the old graph kind even though customData.physics said Rope.
        kind: physics.constraintKind || physics.role || constraint.kind,
        a: mergeConstraintEndpointFromObjectData(constraint.a, physics.a),
        b: mergeConstraintEndpointFromObjectData(constraint.b, physics.b),
        id: constraint.id,
        systemId: constraint.systemId || physics.systemId,
        objectRef: constraint.objectRef,
      });
    }),
    ...liveElements.flatMap(element => {
      if (boundConstraintElementIds.has(element.id)) return [];
      const physics = getPhysicsCustomData(element);
      const kind = physics?.constraintKind || physics?.role;
      if (!physics || !isConstraintPhysicsRole(kind)) return [];
      let systemId = String(physics.systemId || systems[0]?.id || "");
      if (!systems.some(system => system.id === systemId)) {
        const system = createDefaultPhysicsSystem({ ...(systemId ? { id: systemId } : {}), name: "World" });
        systems = [...systems, system];
        systemId = system.id;
      }
      const preferredId = String(physics.id || `physics-${kind}-${element.id}`);
      const constraintId = usedConstraintIds.has(preferredId) ? `physics-${kind}-${element.id}` : preferredId;
      usedConstraintIds.add(constraintId);
      return [normalizePhysicsConstraint({
        ...physics,
        id: constraintId,
        kind,
        systemId,
        objectRef: { kind: "element", elementId: element.id },
      })];
    }),
  ];
  return normalizeRelationshipGraph({
    ...graph,
    systems,
    bodies,
    constraints,
  });
};

export const serializeRelationshipGraphForScene = graphValue => {
  const graph = normalizeRelationshipGraph(graphValue);
  const { routes: _legacyRoutes, ...sceneGraph } = graph;
  return {
    ...sceneGraph,
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

export const normalizePhysicsConstraint = value => {
  const kind = CONSTRAINT_KINDS.includes(value?.kind) ? value.kind : "spring";
  const optionalFinite = candidate => candidate === null || candidate === undefined || candidate === ""
    ? null
    : (Number.isFinite(Number(candidate)) ? Number(candidate) : null);
  const lowerLimit = optionalFinite(value?.lowerLimit);
  const upperLimit = optionalFinite(value?.upperLimit);
  const isHinge = ["axle", "pin", "revolute"].includes(kind);
  // Before limits were explicit, the inspector serialized 0/0 for an untouched
  // axle. That is a locked hinge, not the expected default full rotation.
  // Treat that historic pair as unlimited; an author can now opt into a real
  // 0/0 angular lock with `limitsEnabled`.
  const legacyDefaultLock = isHinge && lowerLimit === 0 && upperLimit === 0 && value?.limitsEnabled !== true;
  const hasLimits = isHinge && !legacyDefaultLock && (value?.limitsEnabled === true || (lowerLimit !== null && upperLimit !== null));
  const pathPoints = list(value?.pathPoints)
    .filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map(point => [Number(point[0]), Number(point[1])]);
  return {
    id: id(value?.id, "physics-constraint"),
    systemId: String(value?.systemId || ""),
    name: String(value?.name || "Constraint"),
    enabled: value?.enabled !== false,
    kind,
    objectRef: normalizeUnderscoresObjectRef(value?.objectRef),
    // Ropes are freestanding chains. Axles and welds attach individual runtime
    // links through their own rope endpoints; a rope itself never owns two
    // hidden start/end connections.
    a: kind === "rope" ? { kind: "none" } : normalizePhysicsEndpoint(value?.a),
    b: ["rope", "tracer"].includes(kind) ? { kind: "none" } : normalizePhysicsEndpoint(value?.b),
    restLength: Math.max(0, finite(value?.restLength, 100)),
    // Rope links are generated only at runtime. Persist the authored curve's
    // world-space points and lightweight generation settings, never Rapier
    // handles or the generated link bodies themselves.
    pathPoints,
    segmentLength: Math.max(2, finite(value?.segmentLength, 24)),
    thickness: Math.max(0.5, finite(value?.thickness, 4)),
    // Rope links are runtime bodies, so they participate in the same named
    // collision stack as authored bodies. Older ropes gain Default rather than
    // silently keeping their previous collide-with-everything behavior.
    collisionLayers: kind === "rope"
      ? (Array.isArray(value?.collisionLayers)
        ? uniqueStrings(value.collisionLayers).slice(0, MAX_PHYSICS_COLLISION_LAYERS)
        : ["default"])
      : null,
    // Rope links are deformable runtime bodies. Keep their expensive
    // link-to-link contact path opt-in; authored bodies and walls still use
    // the named collision-layer matrix independently of this switch.
    selfCollisions: kind === "rope" ? value?.selfCollisions === true : null,
    stiffness: Math.max(0, finite(value?.stiffness, 40)),
    damping: Math.max(0, finite(value?.damping, 4)),
    // Axle motors are authored in the friendly canvas unit of degrees per
    // second. The Rapier adapter converts that value to radians per second.
    motorEnabled: isHinge && value?.motorEnabled === true,
    motorSpeed: finite(value?.motorSpeed, 0),
    motorTorque: Math.max(0, finite(value?.motorTorque, 10)),
    // Attractors and thrusters are authored as visible canvas objects. Their
    // force settings stay solver-independent in the relationship graph.
    attractionStrength: Math.max(0, finite(value?.attractionStrength, 20)),
    attractionRadius: Math.max(0, finite(value?.attractionRadius, 300)),
    attractionFalloff: Math.max(0, finite(value?.attractionFalloff, 1)),
    attractionMode: value?.attractionMode === "repel" ? "repel" : "attract",
    targetTags: uniqueStrings(value?.targetTags),
    thrusterForce: finite(value?.thrusterForce, 20),
    trail: normalizePhysicsTrail({
      ...(kind === "tracer" ? { enabled: true } : {}),
      ...(value?.trail || {}),
    }),
    limitsEnabled: hasLimits,
    lowerLimit: hasLimits ? lowerLimit : null,
    upperLimit: hasLimits ? upperLimit : null,
    breakForce: Number.isFinite(Number(value?.breakForce)) ? Math.max(0, Number(value.breakForce)) : null,
    collideConnected: value?.collideConnected === true,
  };
};

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

// `Number(null)` is zero, but an omitted mapping threshold must remain
// unbounded rather than turning into a silent zero maximum.
const nullableFinite = value => value === null || value === undefined || value === ""
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);
const midiChannel = value => Math.round(clamp(value, 1, 16));
const midiByte = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(clamp(value, 0, 127)) : fallback;

export const normalizeMappingSource = value => {
  const source = value && typeof value === "object" ? value : {};
  const kind = MAPPING_SOURCE_KINDS.includes(source.kind) ? source.kind : "physics-collision";
  return {
    kind,
    systemId: String(source.systemId || ""),
    phases: uniqueStrings(source.phases?.length ? source.phases : ["hit"]),
    classes: uniqueStrings(source.classes),
    tagsA: uniqueStrings(source.tagsA),
    tagsB: uniqueStrings(source.tagsB),
    field: PHYSICS_COLLISION_FIELDS.includes(source.field) ? source.field : "impulse",
    range: {
      min: finite(source.range?.min, 0),
      max: finite(source.range?.max, 10),
    },
  };
};

export const normalizeMappingFilter = value => ({
  min: nullableFinite(value?.min),
  max: nullableFinite(value?.max),
  expression: String(value?.expression || "").trim(),
});

export const normalizeMappingTransform = value => ({
  outputMin: finite(value?.outputMin, 1),
  outputMax: finite(value?.outputMax, 127),
  scale: finite(value?.scale, 1),
  offset: finite(value?.offset),
  clamp: value?.clamp !== false,
  expression: String(value?.expression || "").trim(),
});

export const normalizeMappingTarget = value => {
  const target = value && typeof value === "object" ? value : {};
  const kind = MAPPING_TARGET_KINDS.includes(target.kind) ? target.kind : "midi-note";
  const mode = target.mode === "gate" ? "gate" : "hit";
  if (kind === "midi-cc") return {
    kind, channel: midiChannel(target.channel ?? 1), controller: midiByte(target.controller, 1), valueExpression: String(target.valueExpression || "value").trim(),
  };
  if (kind === "midi-bend") return {
    kind, channel: midiChannel(target.channel ?? 1), valueExpression: String(target.valueExpression || "value").trim(),
  };
  if (kind === "expressive-voice") return {
    kind, mode, program: String(target.program || "bowed"),
    noteExpression: String(target.noteExpression || "60").trim(),
    gainExpression: String(target.gainExpression || "clamp(value / 127, 0, 1)").trim(),
    pressureExpression: String(target.pressureExpression || "clamp(norm, 0, 1)").trim(),
    brightnessExpression: String(target.brightnessExpression || "clamp(norm, 0, 1)").trim(),
    panExpression: String(target.panExpression || "clamp((x / 500) - 1, -1, 1)").trim(),
    duration: Math.max(0.01, finite(target.duration, 0.2)),
    minimumHold: Math.max(0, finite(target.minimumHold, 0.02)),
  };
  if (kind === "legacy-action") return { kind, action: ROUTE_ACTION_KINDS.includes(target.action?.kind) ? { ...clone(target.action), kind: target.action.kind } : { kind: "event", name: "physics.mapping" } };
  const note = midiByte(target.note, 60);
  // Older records stored the literal note number as the expression. Preserve
  // the audible result while making the Note field an actual base-note control.
  const authoredExpression = String(target.noteExpression || "").trim();
  const noteExpression = !authoredExpression || authoredExpression === String(note)
    ? "baseNote"
    : authoredExpression;
  return {
    kind: "midi-note", mode, channel: midiChannel(target.channel ?? 1),
    note,
    noteExpression,
    velocityExpression: String(target.velocityExpression || "value").trim(),
    duration: Math.max(0.01, finite(target.duration, 0.16)),
    minimumHold: Math.max(0, finite(target.minimumHold, 0.02)),
  };
};

export const normalizeRelationshipMapping = value => {
  const source = normalizeMappingSource(value?.source || { systemId: value?.systemId });
  const target = normalizeMappingTarget(value?.target);
  if (target.mode === "gate") {
    const sensorPair = source.phases.includes("enter") || source.phases.includes("exit");
    source.phases = uniqueStrings([
      ...source.phases.filter(phase => phase === "stay"),
      ...(sensorPair ? ["enter", "exit"] : ["begin", "end"]),
    ]);
  }
  return {
    id: id(value?.id, "mapping"),
    name: String(value?.name || "Collision mapping"),
    enabled: value?.enabled !== false,
    source,
    filter: normalizeMappingFilter(value?.filter),
    transform: normalizeMappingTransform(value?.transform),
    target,
    cooldownMs: Math.max(0, finite(value?.cooldownMs, 60)),
    perPair: value?.perPair !== false,
  };
};

const legacyRouteMappings = routeValue => {
  const route = normalizePhysicsRoute(routeValue);
  const expression = [
    route.filter.minImpulse > 0 ? `impulse >= ${route.filter.minImpulse}` : "",
    route.filter.minRelativeSpeed > 0 ? `speed >= ${route.filter.minRelativeSpeed}` : "",
  ].filter(Boolean).join(" && ");
  return route.actions.map((action, index) => normalizeRelationshipMapping({
    id: route.actions.length === 1 ? route.id : `${route.id}:${index + 1}`,
    name: route.actions.length === 1 ? route.name : `${route.name} ${index + 1}`,
    enabled: route.enabled,
    source: {
      kind: "physics-collision", systemId: route.systemId, phases: route.filter.phases,
      classes: route.filter.classes, tagsA: route.filter.tagsA, tagsB: route.filter.tagsB,
      field: "impulse", range: { min: 0, max: 10 },
    },
    filter: { expression },
    cooldownMs: route.cooldownMs,
    perPair: route.perPair,
    target: { kind: "legacy-action", action },
  }));
};

export const migratePhysicsRoutesToMappings = routes => list(routes).flatMap(legacyRouteMappings);

export const normalizeRelationshipGraph = value => {
  const graph = value && typeof value === "object" ? value : {};
  const world = normalizePhysicsWorld(graph.world);
  const systems = list(graph.systems).map(normalizePhysicsSystem);
  const systemIds = new Set(systems.map(system => system.id));
  const keepSystem = item => !item.systemId || systemIds.has(item.systemId);
  const validLayerIds = new Set(world.collisionLayers.layers.map(layer => layer.id));
  const bodies = list(graph.bodies).map(normalizePhysicsBody).map(body => {
    if (!Array.isArray(body.collisionLayers)) return body;
    const collisionLayers = body.collisionLayers.filter(layerId => validLayerIds.has(layerId));
    return { ...body, collisionLayers };
  }).filter(keepSystem);
  const constraints = list(graph.constraints).map(normalizePhysicsConstraint).map(constraint => {
    if (constraint.kind !== "rope" || !Array.isArray(constraint.collisionLayers)) return constraint;
    return { ...constraint, collisionLayers: constraint.collisionLayers.filter(layerId => validLayerIds.has(layerId)) };
  }).filter(keepSystem);
  const legacyRoutes = list(graph.routes).map(normalizePhysicsRoute).filter(keepSystem);
  const mappings = list(graph.mappings).length
    ? list(graph.mappings).map(normalizeRelationshipMapping)
    : legacyRoutes.flatMap(legacyRouteMappings);
  return {
    version: RELATIONSHIP_GRAPH_VERSION,
    world,
    systems,
    bodies,
    populations: list(graph.populations).map(normalizePhysicsPopulation).filter(keepSystem),
    constraints,
    // Routes were the first narrow collision-action experiment. They migrate
    // into mappings on read and are intentionally absent from new scene JSON.
    mappings: mappings.filter(mapping => !mapping.source.systemId || systemIds.has(mapping.source.systemId)),
    // Retained only as an in-memory/script compatibility view. Serialization
    // deliberately strips it; canonical scene data is `mappings`.
    routes: legacyRoutes,
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
    mappings: normalizeRelationshipMapping,
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
    mappings: normalizeRelationshipMapping,
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
    next.mappings = next.mappings.filter(item => item.source.systemId !== itemId);
  }
  return normalizeRelationshipGraph(next);
};

// Native Excalidraw deletion is tombstone based: a deleted element remains in
// the scene array with `isDeleted: true`. Physics must treat that transition
// exactly like removal so its solver body and diagnostics cannot outlive the
// visible canvas object. Constraints that point at a deleted object are
// removed too; keeping them as disabled orphans would leave stale debug
// handles behind after an ordinary canvas delete.
export const removeRelationshipBindingsForElements = (graphValue, elementIds) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const ids = new Set(list(elementIds).map(String).filter(Boolean));
  if (!ids.size) return graph;
  const referencesDeletedElement = objectRef => {
    const reference = normalizeUnderscoresObjectRef(objectRef);
    return reference?.kind === "element" && ids.has(reference.elementId);
  };
  const endpointReferencesDeletedElement = endpointValue => {
    const endpoint = normalizePhysicsEndpoint(endpointValue);
    return Boolean(endpoint && !["none", "world", "stream"].includes(endpoint.kind)
      && referencesDeletedElement(endpoint.objectRef));
  };
  const bodies = graph.bodies.filter(body => !referencesDeletedElement(body.objectRef));
  const constraints = graph.constraints.filter(constraint => (
    !referencesDeletedElement(constraint.objectRef)
    &&
    !endpointReferencesDeletedElement(constraint.a)
    && !endpointReferencesDeletedElement(constraint.b)
  ));
  if (bodies.length === graph.bodies.length && constraints.length === graph.constraints.length) return graph;
  return normalizeRelationshipGraph({ ...graph, bodies, constraints });
};

export const remapRelationshipGraph = (graphValue, idMap, existingIds = new Set()) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const remapRef = objectRef => {
    const ref = normalizeUnderscoresObjectRef(objectRef);
    if (!ref) return null;
    const elementId = idMap.get(ref.elementId) || (existingIds.has(ref.elementId) ? ref.elementId : null);
    return elementId ? { ...ref, elementId } : null;
  };
  const remapEndpoint = endpointValue => {
    const endpoint = normalizePhysicsEndpoint(endpointValue);
    if (!endpoint || ["none", "world", "stream"].includes(endpoint.kind)) return endpoint;
    const objectRef = remapRef(endpoint.objectRef);
    return objectRef ? { ...endpoint, objectRef } : null;
  };
  return normalizeRelationshipGraph({
    ...graph,
    bodies: graph.bodies.map(body => ({ ...body, objectRef: remapRef(body.objectRef) })).filter(body => body.tracking === "runtime-lite" || body.objectRef),
    constraints: graph.constraints.flatMap(constraint => {
      const objectRef = remapRef(constraint.objectRef);
      // Older graph-only constraints intentionally have no authored pivot.
      // A pivot-bearing constraint, however, must not survive an import whose
      // pivot object was omitted.
      if (constraint.objectRef && !objectRef) return [];
      return [{ ...constraint, objectRef, a: remapEndpoint(constraint.a), b: remapEndpoint(constraint.b) }];
    }),
  });
};

export const relationshipGraphForSelection = (graphValue, selectedElementIds) => {
  const graph = normalizeRelationshipGraph(graphValue);
  const selected = new Set(selectedElementIds || []);
  const bodies = graph.bodies.filter(body => body.objectRef && selected.has(body.objectRef.elementId));
  const bodyIds = new Set(bodies.map(body => body.id));
  const endpointSelected = endpoint => {
    const normalized = normalizePhysicsEndpoint(endpoint);
    return !normalized || ["none", "world", "stream"].includes(normalized.kind) || selected.has(normalized.objectRef.elementId);
  };
  const constraints = graph.constraints.filter(constraint => (
    (!constraint.objectRef || selected.has(constraint.objectRef.elementId))
    && endpointSelected(constraint.a)
    && endpointSelected(constraint.b)
  ));
  const systemIds = new Set([...bodies.map(body => body.systemId), ...constraints.map(item => item.systemId)]);
  return normalizeRelationshipGraph({
    systems: graph.systems.filter(system => systemIds.has(system.id)),
    bodies,
    constraints,
    mappings: graph.mappings.filter(mapping => systemIds.has(mapping.source.systemId)),
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
    if (!endpoint || ["none", "world", "stream"].includes(endpoint.kind)) return false;
    const element = liveElements.get(endpoint.objectRef.elementId);
    if (!element) return true;
    if (endpoint.kind !== "bezier-anchor") return false;
    const anchors = element.customData?.underscoresGeometry?.anchors;
    return !Array.isArray(anchors) || !anchors.some(anchor => anchor?.id === endpoint.anchorId);
  };
  const orphans = [];
  graph.bodies.forEach(body => {
    if (body.objectRef && !liveElements.has(body.objectRef.elementId)) orphans.push({ kind: "body", id: body.id, endpoint: "objectRef" });
  });
  graph.constraints.forEach(constraint => {
    if (constraint.objectRef && !liveElements.has(constraint.objectRef.elementId)) {
      orphans.push({ kind: "constraint", id: constraint.id, endpoint: "objectRef" });
    }
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
    const key = `${underscoresObjectRefKey(objectRef)}:${channel}`;
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
