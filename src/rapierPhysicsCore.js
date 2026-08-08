import RAPIER from "@dimforge/rapier2d-deterministic-compat";
import { normalizeRelationshipGraph, normalizePhysicsEndpoint, resolvePhysicsCollisionGroups } from "./relationshipGraph.js";

// Drawerator authors geometry in pixels while Rapier works in metres.  The
// default of 100 px/m remains compatible with older scenes, but each system
// now derives its conversion from the authored pixels-per-metre setting.
export const PHYSICS_WORLD_SCALE = 0.01;
const MAX_EVENTS_PER_STEP = 512;
const MAX_ROPE_LINKS = 96;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
// Geometry is authored in canvas pixels, while all solver values are SI-ish
// metres. Keep this conversion on the world instead of baking the historical
// 100 px/m default into individual features.
const worldScaleFor = graph => 1 / Math.max(1, finite(graph?.world?.pixelsPerMeter, 100));

const resolveSystemGravity = (graph, system, worldScale = PHYSICS_WORLD_SCALE) => system.gravityMode === "world"
  ? {
      x: graph.world.gravity.x,
      // Canvas Y grows downwards; the authored world convention follows the
      // usual physics sign where negative Y is up.
      y: -graph.world.gravity.y,
    }
  // Older custom systems stored canvas acceleration rather than metres/s².
  // Preserve those scenes while world gravity follows real-world units.
  : { x: finite(system.gravity?.x) * worldScale, y: finite(system.gravity?.y) * worldScale };

let rapierReady = null;
export const initializeRapier = () => {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
};

const randomGenerator = seedValue => {
  let state = (Math.round(finite(seedValue, 1)) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

const bodyDescription = (body, viscosity = 0, worldScale = PHYSICS_WORLD_SCALE) => {
  const desc = body.bodyType === "fixed"
    ? RAPIER.RigidBodyDesc.fixed()
    : body.bodyType === "kinematic"
      ? RAPIER.RigidBodyDesc.kinematicPositionBased()
      : RAPIER.RigidBodyDesc.dynamic();
  return desc
    .setTranslation(body.initial.x * worldScale, body.initial.y * worldScale)
    .setRotation(body.initial.angle)
    .setLinvel(body.initial.velocityX * worldScale, body.initial.velocityY * worldScale)
    .setAngvel(body.initial.angularVelocity)
    .setLinearDamping(body.material.linearDamping + viscosity)
    .setAngularDamping(body.material.angularDamping)
    .setCcdEnabled(body.bodyType === "dynamic");
};

const colliderDescriptions = (body, world, worldScale = PHYSICS_WORLD_SCALE) => {
  const collider = body.collider;
  const collisionGroups = resolvePhysicsCollisionGroups(world, body);
  const configureCollider = candidate => candidate
    .setSensor(collider.sensor)
    .setDensity(body.material.density)
    .setFriction(body.material.friction)
    .setRestitution(body.material.restitution)
    .setContactSkin(collider.contactSkin * worldScale)
    .setCollisionGroups(((collisionGroups.group & 0xffff) << 16) | (collisionGroups.mask & 0xffff))
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(0);
  let desc;
  if (collider.kind === "circle") desc = RAPIER.ColliderDesc.ball(collider.radius * worldScale);
  else if (collider.kind === "ellipse") {
    const vertices = new Float32Array(Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2;
      return [
        Math.cos(angle) * collider.width * worldScale / 2,
        Math.sin(angle) * collider.height * worldScale / 2,
      ];
    }).flat());
    desc = RAPIER.ColliderDesc.convexHull(vertices);
  }
  else if (collider.kind === "convex") {
    desc = RAPIER.ColliderDesc.convexHull(new Float32Array(collider.points.flatMap(point => [point[0] * worldScale, point[1] * worldScale])));
  } else desc = RAPIER.ColliderDesc.cuboid(collider.width * worldScale / 2, collider.height * worldScale / 2);
  if (collider.kind === "chain" || collider.kind === "polyline") {
    const segments = [];
    for (let index = 1; index < collider.points.length; index += 1) {
      const [ax, ay] = collider.points[index - 1];
      const [bx, by] = collider.points[index];
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) continue;
      const halfLength = length * worldScale / 2;
      const halfThickness = collider.thickness * worldScale / 2;
      // Capsules overlap at consecutive endpoints. That keeps collision
      // geometry watertight around sharp turns instead of leaving tiny square
      // gaps a small body can fall through.
      segments.push(RAPIER.ColliderDesc
        .roundCuboid(halfLength, halfThickness, Math.min(halfLength, halfThickness))
        .setTranslation((ax + bx) * worldScale / 2, (ay + by) * worldScale / 2)
        .setRotation(Math.atan2(dy, dx)));
    }
    desc = segments.length ? null : RAPIER.ColliderDesc.cuboid(0.12, 0.12);
    const descriptions = segments.length ? segments : [desc];
    return descriptions.map(configureCollider);
  }
  if (!desc) desc = RAPIER.ColliderDesc.cuboid(0.12, 0.12);
  return [configureCollider(desc)];
};

const localAnchorForBody = (body, endpoint, worldScale = PHYSICS_WORLD_SCALE) => {
  if (!endpoint || endpoint.kind !== "object" || endpoint.anchor === "center") return { x: 0, y: 0 };
  // First-class visual constraints hydrate their precise body-local offset
  // from the axle/fixate object's centre. This must win over the normalized
  // Excalidraw-frame coordinate below: a freehand collider can be rebased to
  // its rendered path centre, which is often nowhere near the frame centre.
  if (Array.isArray(endpoint.localAnchor)) return {
    x: endpoint.localAnchor[0] * worldScale,
    y: endpoint.localAnchor[1] * worldScale,
  };
  const width = body.collider.kind === "circle" ? body.collider.radius * 2 : body.collider.width;
  const height = body.collider.kind === "circle" ? body.collider.radius * 2 : body.collider.height;
  return {
    x: (endpoint.localPoint[0] - 0.5) * width * worldScale,
    y: (endpoint.localPoint[1] - 0.5) * height * worldScale,
  };
};

const polylineLength = points => points.slice(1).reduce((length, point, index) => (
  length + Math.hypot(point[0] - points[index][0], point[1] - points[index][1])
), 0);

const resamplePolyline = (points, maximumSegmentLength) => {
  const clean = points
    .filter(point => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map(point => [Number(point[0]), Number(point[1])]);
  if (clean.length < 2) return [];
  const totalLength = polylineLength(clean);
  if (totalLength < 1e-4) return [];
  const requestedSpacing = Math.max(2, finite(maximumSegmentLength, 24));
  // Pointer input can be sampled at a much higher rate than visual detail
  // warrants. Convert it to a fixed, arc-length simulation path rather than
  // creating a rigid link for every raw freehand point.
  const linkCount = Math.min(MAX_ROPE_LINKS, Math.max(1, Math.ceil(totalLength / requestedSpacing)));
  const sampled = [clean[0]];
  let segmentIndex = 1;
  let lengthBeforeSegment = 0;
  for (let sampleIndex = 1; sampleIndex < linkCount; sampleIndex += 1) {
    const targetDistance = totalLength * sampleIndex / linkCount;
    while (segmentIndex < clean.length) {
      const start = clean[segmentIndex - 1];
      const end = clean[segmentIndex];
      const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (segmentLength < 1e-4) {
        segmentIndex += 1;
        continue;
      }
      if (targetDistance <= lengthBeforeSegment + segmentLength || segmentIndex === clean.length - 1) {
        const ratio = Math.max(0, Math.min(1, (targetDistance - lengthBeforeSegment) / segmentLength));
        sampled.push([
          start[0] + (end[0] - start[0]) * ratio,
          start[1] + (end[1] - start[1]) * ratio,
        ]);
        break;
      }
      lengthBeforeSegment += segmentLength;
      segmentIndex += 1;
    }
  }
  sampled.push(clean.at(-1));
  return sampled;
};

const collisionClassFor = (a, b) => {
  if (a.sensor || b.sensor) return "sensor";
  const aWall = a.bodyType === "fixed" || a.tags.includes("wall");
  const bWall = b.bodyType === "fixed" || b.tags.includes("wall");
  return aWall || bWall ? "body-wall" : "body-body";
};

const entityPayload = entity => ({
  id: entity.id,
  bodyId: entity.bodyId,
  populationId: entity.populationId || null,
  instanceId: entity.instanceId || null,
  objectRef: entity.objectRef || null,
  tracking: entity.tracking,
  bodyType: entity.bodyType,
  tags: entity.tags,
});

// Collision routing is allowed to be richer than display-pose metadata. The
// latter crosses the worker boundary every paint frame, so keeping velocity and
// material data out of it protects runtime population performance.
const collisionEntityPayload = (entity, inverseWorldScale = 1 / PHYSICS_WORLD_SCALE) => {
  const position = entity.rigidBody.translation();
  const velocity = entity.rigidBody.linvel();
  return {
    ...entityPayload(entity),
    mappingValues: { ...entity.mappingValues },
    position: [position.x * inverseWorldScale, position.y * inverseWorldScale],
    velocity: [velocity.x * inverseWorldScale, velocity.y * inverseWorldScale],
    angle: entity.rigidBody.rotation(),
    angularVelocity: entity.rigidBody.angvel(),
    mass: entity.rigidBody.mass(),
    friction: finite(entity.material?.friction),
    bounce: finite(entity.material?.restitution),
    density: finite(entity.material?.density),
  };
};

export class RapierPhysicsSystem {
  static async create(graphValue, systemId) {
    await initializeRapier();
    return new RapierPhysicsSystem(graphValue, systemId);
  }

  constructor(graphValue, systemId) {
    this.graph = normalizeRelationshipGraph(graphValue);
    this.system = this.graph.systems.find(candidate => candidate.id === systemId) || this.graph.systems[0];
    if (!this.system) throw new Error("Physics runtime requires a system.");
    this.fixedDt = 1 / this.system.clock.fixedHz;
    this.worldScale = worldScaleFor(this.graph);
    this.inverseWorldScale = 1 / this.worldScale;
    const gravity = resolveSystemGravity(this.graph, this.system, this.worldScale);
    this.world = new RAPIER.World(gravity);
    this.world.timestep = this.fixedDt;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.bodyById = new Map();
    this.entityByCollider = new Map();
    this.entityByRigidBody = new Map();
    this.bodyIdByObjectId = new Map();
    this.constraints = new Map();
    this.activePairs = new Map();
    this.anchorBodies = [];
    this.stepIndex = 0;
    this.time = 0;
    this.droppedEvents = 0;
    this.initialSnapshot = null;
    this.#build();
    this.initialSnapshot = this.world.takeSnapshot();
  }

  #build() {
    this.graph.bodies.filter(body => body.enabled && body.systemId === this.system.id).forEach(body => this.#addBody(body));
    this.graph.populations.filter(population => population.enabled && population.systemId === this.system.id).forEach(population => this.#addPopulation(population));
    const constraints = this.graph.constraints.filter(constraint => constraint.enabled && constraint.systemId === this.system.id);
    // Rope control-point endpoints resolve to generated rope links, so create
    // every rope before the axle/weld constraints that may reference one.
    [...constraints.filter(constraint => constraint.kind === "rope"), ...constraints.filter(constraint => constraint.kind !== "rope")]
      .forEach(constraint => this.#addConstraint(constraint));
  }

  #addBody(body, runtime = {}) {
    const rigidBody = this.world.createRigidBody(bodyDescription(
      { ...body, initial: { ...body.initial, ...runtime.initial } },
      this.graph.world.viscosity,
      this.worldScale,
    ));
    const colliders = colliderDescriptions(body, this.graph.world, this.worldScale)
      .map(description => this.world.createCollider(description, rigidBody));
    const entity = {
      id: runtime.id || body.id,
      bodyId: body.id,
      populationId: runtime.populationId || null,
      instanceId: runtime.instanceId || null,
      objectRef: body.objectRef || null,
      tracking: runtime.tracking || body.tracking,
      bodyType: body.bodyType,
      tags: [...body.collisionTags],
      mappingValues: { ...body.mappingValues },
      sensor: body.collider.sensor,
      material: { ...body.material },
      render: { ...body.render },
      collider: { ...body.collider },
      rigidBody,
      colliderHandle: colliders[0].handle,
      colliderHandles: colliders.map(collider => collider.handle),
    };
    this.bodyById.set(entity.id, entity);
    colliders.forEach(collider => this.entityByCollider.set(collider.handle, entity));
    this.entityByRigidBody.set(rigidBody.handle, entity);
    if (body.objectRef?.kind === "element") this.bodyIdByObjectId.set(body.objectRef.elementId, entity.id);
    return entity;
  }

  #addPopulation(population) {
    const random = randomGenerator(population.seed);
    const excluded = new Set(population.excludedInstanceIds || []);
    const minimum = Math.min(population.spawn.speedMin, population.spawn.speedMax);
    const maximum = Math.max(population.spawn.speedMin, population.spawn.speedMax);
    const padding = population.prototype.collider.kind === "circle" ? population.prototype.collider.radius : 8;
    for (let index = 0; index < population.count; index += 1) {
      const angle = random() * Math.PI * 2;
      const speed = minimum + (maximum - minimum) * random();
      const instanceId = `${population.id}:${index}`;
      const initial = {
        x: population.bounds.x + padding + random() * Math.max(1, population.bounds.width - padding * 2),
        y: population.bounds.y + padding + random() * Math.max(1, population.bounds.height - padding * 2),
        angle: random() * Math.PI * 2,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        angularVelocity: (random() * 2 - 1) * population.spawn.angularSpeed,
      };
      if (excluded.has(instanceId)) continue;
      this.#addBody(population.prototype, {
        id: instanceId,
        populationId: population.id,
        instanceId,
        tracking: "runtime-lite",
        initial,
      });
    }
  }

  #resolveBodyEndpoint(endpointValue) {
    const endpoint = normalizePhysicsEndpoint(endpointValue);
    if (!endpoint || ["none", "world", "stream", "bezier-anchor", "curve-progress"].includes(endpoint.kind)) return { endpoint, entity: null };
    if (endpoint.kind === "rope") {
      const rope = this.constraints.get(endpoint.constraintId);
      const links = rope?.links || [];
      let linkIndex = -1;
      if (links.length && Number.isFinite(Number(endpoint.ropeProgress))) {
        linkIndex = Math.round(Math.max(0, Math.min(1, Number(endpoint.ropeProgress))) * Math.max(0, links.length - 1));
      } else if (links.length && Number.isInteger(Number(endpoint.linkIndex))) {
        linkIndex = Math.max(0, Math.min(links.length - 1, Number(endpoint.linkIndex)));
      } else if (links.length) {
        linkIndex = links.reduce((closestIndex, candidate, candidateIndex) => {
          const translation = candidate.rigidBody.translation();
          const distance = Math.hypot(translation.x * this.inverseWorldScale - endpoint.point[0], translation.y * this.inverseWorldScale - endpoint.point[1]);
          if (closestIndex < 0) return candidateIndex;
          const closestTranslation = links[closestIndex].rigidBody.translation();
          const closestDistance = Math.hypot(closestTranslation.x * this.inverseWorldScale - endpoint.point[0], closestTranslation.y * this.inverseWorldScale - endpoint.point[1]);
          return distance < closestDistance ? candidateIndex : closestIndex;
        }, -1);
      }
      const link = linkIndex >= 0 ? links[linkIndex] : null;
      return {
        endpoint,
        entity: link?.entity || null,
        ropeLinkIndex: linkIndex,
        ropeLinkCount: links.length,
        ropeProgress: Number.isFinite(Number(endpoint.ropeProgress))
          ? Math.max(0, Math.min(1, Number(endpoint.ropeProgress)))
          : (links.length > 1 && linkIndex >= 0 ? linkIndex / (links.length - 1) : 0),
      };
    }
    const entityId = this.bodyIdByObjectId.get(endpoint.objectRef.elementId);
    return { endpoint, entity: this.bodyById.get(entityId) || null };
  }

  #fixedAnchor(point) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(
      point[0] * this.worldScale,
      point[1] * this.worldScale,
    ));
    this.anchorBodies.push(body);
    return body;
  }

  #addConstraint(constraint) {
    if (constraint.kind === "rope") {
      this.#addRope(constraint);
      return;
    }
    if (constraint.kind === "attractor") {
      this.#addAttractor(constraint);
      return;
    }
    if (constraint.kind === "thruster") {
      this.#addThruster(constraint);
      return;
    }
    const a = this.#resolveBodyEndpoint(constraint.a);
    const b = this.#resolveBodyEndpoint(constraint.b);
    let entityA = a.entity;
    let entityB = b.entity;
    let bodyA = entityA?.rigidBody;
    let bodyB = entityB?.rigidBody;
    const ropeAnchor = (entity, endpoint) => {
      if (endpoint?.kind !== "rope") return null;
      const translation = entity.rigidBody.translation();
      const angle = entity.rigidBody.rotation();
      const dx = endpoint.point[0] * this.worldScale - translation.x;
      const dy = endpoint.point[1] * this.worldScale - translation.y;
      return { x: Math.cos(angle) * dx + Math.sin(angle) * dy, y: -Math.sin(angle) * dx + Math.cos(angle) * dy };
    };
    const anchorA = entityA ? (ropeAnchor(entityA, a.endpoint) || localAnchorForBody(this.graph.bodies.find(body => body.id === entityA.bodyId), a.endpoint, this.worldScale)) : { x: 0, y: 0 };
    const anchorB = entityB ? (ropeAnchor(entityB, b.endpoint) || localAnchorForBody(this.graph.bodies.find(body => body.id === entityB.bodyId), b.endpoint, this.worldScale)) : { x: 0, y: 0 };
    const worldAnchorA = !bodyA && a.endpoint?.kind === "world" ? this.#fixedAnchor(a.endpoint.point) : null;
    const worldAnchorB = !bodyB && b.endpoint?.kind === "world" ? this.#fixedAnchor(b.endpoint.point) : null;
    bodyA = bodyA || worldAnchorA;
    bodyB = bodyB || worldAnchorB;
    // A free axle is a motor mounted on one authored body.  It intentionally
    // has no second Rapier body: forcing a fixed anchor here would turn a
    // rolling wheel into a world-pinned wheel.  The force path below drives
    // angular velocity by bounded torque, allowing floor contact to convert
    // spin into translation.
    if (["revolute", "pin", "axle"].includes(constraint.kind)
      && a.endpoint?.kind === "object"
      && b.endpoint?.kind === "none"
      && entityA?.rigidBody) {
      this.constraints.set(constraint.id, {
        definition: constraint,
        directMotor: true,
        joint: null,
        bodyA: entityA.rigidBody,
        bodyB: null,
        entityA,
        entityB: null,
        worldAnchorA: null,
        worldAnchorB: null,
        anchorA,
        anchorB,
      });
      return;
    }
    if (!bodyA || !bodyB) return;
    let data;
    if (["revolute", "pin", "axle"].includes(constraint.kind)) data = RAPIER.JointData.revolute(anchorA, anchorB);
    else if (["weld", "fixate"].includes(constraint.kind)) data = RAPIER.JointData.fixed(anchorA, 0, anchorB, 0);
    else data = RAPIER.JointData.spring(constraint.restLength * this.worldScale, constraint.stiffness, constraint.damping, anchorA, anchorB);
    const joint = this.world.createImpulseJoint(data, bodyA, bodyB, true);
    joint.setContactsEnabled(constraint.collideConnected);
    if (constraint.limitsEnabled && typeof joint.setLimits === "function" && constraint.lowerLimit !== null && constraint.upperLimit !== null) {
      joint.setLimits(constraint.lowerLimit, constraint.upperLimit);
    }
    if (["revolute", "pin", "axle"].includes(constraint.kind) && constraint.motorEnabled === true && typeof joint.configureMotorVelocity === "function") {
      // Authoring uses degrees/second while Rapier stores angular velocity in
      // radians/second. `motorTorque` is deliberately a visible, bounded
      // strength rather than a hidden joint default.
      joint.configureMotorVelocity(constraint.motorSpeed * Math.PI / 180, Math.max(0, constraint.motorTorque));
    }
    this.constraints.set(constraint.id, {
      definition: constraint,
      joint,
      bodyA,
      bodyB,
      entityA,
      entityB,
      worldAnchorA,
      worldAnchorB,
      anchorA,
      anchorB,
      ropeLinkIndexA: a.ropeLinkIndex,
      ropeLinkIndexB: b.ropeLinkIndex,
      ropeLinkCountA: a.ropeLinkCount,
      ropeLinkCountB: b.ropeLinkCount,
      ropeProgressA: a.ropeProgress,
      ropeProgressB: b.ropeProgress,
    });
  }

  #addAttractor(constraint) {
    const endpoint = normalizePhysicsEndpoint(constraint.a);
    if (endpoint?.kind !== "world" || !Array.isArray(endpoint.point)) return;
    this.constraints.set(constraint.id, {
      definition: constraint,
      attractor: true,
      point: [finite(endpoint.point[0]), finite(endpoint.point[1])],
    });
  }

  #worldPointForAnchor(rigidBody, anchor = { x: 0, y: 0 }) {
    const translation = rigidBody.translation();
    const angle = rigidBody.rotation();
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      x: translation.x + cosine * finite(anchor.x) - sine * finite(anchor.y),
      y: translation.y + sine * finite(anchor.x) + cosine * finite(anchor.y),
    };
  }

  #addThruster(constraint) {
    const attachment = this.#resolveBodyEndpoint(constraint.a);
    const entity = attachment.entity;
    const directionEndpoint = normalizePhysicsEndpoint(constraint.b);
    if (!entity?.rigidBody || entity.bodyType !== "dynamic" || directionEndpoint?.kind !== "world" || !Array.isArray(directionEndpoint.point)) return;
    const body = this.graph.bodies.find(candidate => candidate.id === entity.bodyId);
    const anchor = localAnchorForBody(body, attachment.endpoint, this.worldScale);
    const start = this.#worldPointForAnchor(entity.rigidBody, anchor);
    const end = {
      x: finite(directionEndpoint.point[0]) * this.worldScale,
      y: finite(directionEndpoint.point[1]) * this.worldScale,
    };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    const angle = entity.rigidBody.rotation();
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    // Store direction in the body's local space so the visual and force turn
    // with its host rather than remaining pinned to an old world direction.
    const localDirection = {
      x: (cosine * dx + sine * dy) / length,
      y: (-sine * dx + cosine * dy) / length,
    };
    this.constraints.set(constraint.id, {
      definition: constraint,
      thruster: true,
      entity,
      anchor,
      localDirection,
      length,
    });
  }

  #applyAuthoredForces() {
    for (const state of this.constraints.values()) {
      if (state.attractor) {
        const radius = Math.max(0, finite(state.definition.attractionRadius)) * this.worldScale;
        if (radius <= 0) continue;
        const target = { x: state.point[0] * this.worldScale, y: state.point[1] * this.worldScale };
        const tags = Array.isArray(state.definition.targetTags) ? state.definition.targetTags : [];
        const direction = state.definition.attractionMode === "repel" ? -1 : 1;
        const strength = Math.max(0, finite(state.definition.attractionStrength));
        const falloff = Math.max(0, finite(state.definition.attractionFalloff, 1));
        for (const entity of this.bodyById.values()) {
          if (entity.ropeLink || entity.bodyType !== "dynamic") continue;
          if (tags.length && !tags.some(tag => entity.tags?.includes(tag))) continue;
          const position = entity.rigidBody.translation();
          const dx = target.x - position.x;
          const dy = target.y - position.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 1e-6 || distance > radius) continue;
          const attenuation = Math.pow(Math.max(0, 1 - distance / radius), falloff);
          entity.rigidBody.addForce({
            x: direction * dx / distance * strength * attenuation,
            y: direction * dy / distance * strength * attenuation,
          }, true);
        }
      } else if (state.thruster && state.entity?.bodyType === "dynamic") {
        const angle = state.entity.rigidBody.rotation();
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const direction = {
          x: cosine * state.localDirection.x - sine * state.localDirection.y,
          y: sine * state.localDirection.x + cosine * state.localDirection.y,
        };
        const force = finite(state.definition.thrusterForce);
        state.entity.rigidBody.addForceAtPoint(
          { x: direction.x * force, y: direction.y * force },
          this.#worldPointForAnchor(state.entity.rigidBody, state.anchor),
          true,
        );
      } else if (state.definition.motorEnabled === true
        && ["revolute", "pin", "axle"].includes(state.definition.kind)) {
        // Rapier puts a sufficiently still island to sleep. A motor targeting
        // a low angular velocity can therefore stop after its initial motion
        // unless we keep the bodies participating in that active drive awake.
        if (state.entityA?.bodyType === "dynamic") state.entityA.rigidBody.wakeUp();
        if (state.entityB?.bodyType === "dynamic") state.entityB.rigidBody.wakeUp();
        if (!state.directMotor || state.entityA?.bodyType !== "dynamic") continue;
        // Keep this a torque-controlled drive rather than assigning angular
        // velocity directly. Contact can then slow the wheel, and friction can
        // turn its rotation into a physically meaningful rolling motion.
        const targetSpeed = finite(state.definition.motorSpeed) * Math.PI / 180;
        const torqueLimit = Math.max(0, finite(state.definition.motorTorque));
        if (torqueLimit <= 0) continue;
        const speedError = targetSpeed - finite(state.entityA.rigidBody.angvel());
        const torque = Math.max(-torqueLimit, Math.min(torqueLimit, speedError * torqueLimit));
        state.entityA.rigidBody.applyTorqueImpulse(torque * this.fixedDt, true);
      }
    }
  }

  #addRope(constraint) {
    const points = resamplePolyline(constraint.pathPoints || [], constraint.segmentLength);
    if (points.length < 2) return;
    const attachmentA = this.#resolveBodyEndpoint(constraint.a);
    const attachmentB = this.#resolveBodyEndpoint(constraint.b);
    const entityA = attachmentA.entity;
    const entityB = attachmentB.entity;
    const worldAnchorA = !entityA && attachmentA.endpoint?.kind === "world" ? this.#fixedAnchor(attachmentA.endpoint.point) : null;
    const worldAnchorB = !entityB && attachmentB.endpoint?.kind === "world" ? this.#fixedAnchor(attachmentB.endpoint.point) : null;
    const bodyA = entityA?.rigidBody || worldAnchorA;
    const bodyB = entityB?.rigidBody || worldAnchorB;
    const authoredA = entityA ? this.graph.bodies.find(body => body.id === entityA.bodyId) : null;
    const authoredB = entityB ? this.graph.bodies.find(body => body.id === entityB.bodyId) : null;
    const anchorA = entityA ? localAnchorForBody(authoredA, attachmentA.endpoint, this.worldScale) : { x: 0, y: 0 };
    const anchorB = entityB ? localAnchorForBody(authoredB, attachmentB.endpoint, this.worldScale) : { x: 0, y: 0 };
    const thickness = Math.max(0.5, finite(constraint.thickness, 4));
    const collisionGroups = resolvePhysicsCollisionGroups(this.graph.world, constraint);
    const links = [];
    const joints = [];
    const makeLink = (start, end, index) => {
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-4) return null;
      const halfLength = length * this.worldScale / 2;
      const halfThickness = thickness * this.worldScale / 2;
      const rigidBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation((start[0] + end[0]) * this.worldScale / 2, (start[1] + end[1]) * this.worldScale / 2)
        .setRotation(Math.atan2(dy, dx))
        .setLinearDamping(Math.max(0.02, this.graph.world.viscosity + 0.02))
        .setAngularDamping(0.03)
        .setCcdEnabled(true));
      const collider = this.world.createCollider(RAPIER.ColliderDesc
        .roundCuboid(halfLength, halfThickness, Math.min(halfLength, halfThickness))
        .setDensity(1)
        .setFriction(0.5)
        .setRestitution(0.05)
        .setCollisionGroups(((collisionGroups.group & 0xffff) << 16) | (collisionGroups.mask & 0xffff))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS), rigidBody);
      const entity = {
        id: `rope:${constraint.id}:${index}`,
        bodyId: `rope:${constraint.id}:${index}`,
        populationId: null,
        instanceId: null,
        objectRef: null,
        tracking: "runtime-lite",
        bodyType: "dynamic",
        tags: ["rope", ...((entityA?.tags || []).filter(tag => tag !== "wall"))],
        mappingValues: {},
        sensor: false,
        material: { friction: 0.5, restitution: 0.05, density: 1 },
        render: {},
        collider: { kind: "rope-link", width: length, height: thickness },
        ropeLink: true,
        rigidBody,
        colliderHandle: collider.handle,
        colliderHandles: [collider.handle],
      };
      this.bodyById.set(entity.id, entity);
      this.entityByCollider.set(collider.handle, entity);
      this.entityByRigidBody.set(rigidBody.handle, entity);
      return { rigidBody, entity, halfLength, length: length * this.worldScale };
    };
    for (let index = 1; index < points.length; index += 1) {
      const link = makeLink(points[index - 1], points[index], links.length);
      if (link) links.push(link);
    }
    if (!links.length) return;
    const attach = (firstBody, secondBody, firstAnchor, secondAnchor) => {
      if (!firstBody || !secondBody) return;
      const joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(firstAnchor, secondAnchor), firstBody, secondBody, true);
      joint.setContactsEnabled(constraint.collideConnected === true);
      joints.push(joint);
    };
    attach(bodyA, links[0].rigidBody, anchorA, { x: -links[0].halfLength, y: 0 });
    for (let index = 1; index < links.length; index += 1) {
      attach(links[index - 1].rigidBody, links[index].rigidBody, { x: links[index - 1].halfLength, y: 0 }, { x: -links[index].halfLength, y: 0 });
    }
    attach(links.at(-1).rigidBody, bodyB, { x: links.at(-1).halfLength, y: 0 }, anchorB);
    this.constraints.set(constraint.id, {
      definition: { ...constraint, restLength: constraint.restLength || polylineLength(points) },
      rope: true,
      joints,
      links,
      bodyA,
      bodyB,
      entityA,
      entityB,
      worldAnchorA,
      worldAnchorB,
      anchorA,
      anchorB,
    });
  }

  #ropePath(state) {
    if (!state?.rope || !state.links?.length) return null;
    const endpoint = (link, side) => {
      const translation = link.rigidBody.translation();
      const angle = link.rigidBody.rotation();
      const local = side * link.halfLength;
      return [
        (translation.x + Math.cos(angle) * local) * this.inverseWorldScale,
        (translation.y + Math.sin(angle) * local) * this.inverseWorldScale,
      ];
    };
    return [endpoint(state.links[0], -1), ...state.links.map(link => endpoint(link, 1))];
  }

  #thrusterPath(state) {
    if (!state?.thruster || !state.entity?.rigidBody) return null;
    const start = this.#worldPointForAnchor(state.entity.rigidBody, state.anchor);
    const angle = state.entity.rigidBody.rotation();
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const direction = {
      x: cosine * state.localDirection.x - sine * state.localDirection.y,
      y: sine * state.localDirection.x + cosine * state.localDirection.y,
    };
    return [
      [start.x * this.inverseWorldScale, start.y * this.inverseWorldScale],
      [(start.x + direction.x * state.length) * this.inverseWorldScale, (start.y + direction.y * state.length) * this.inverseWorldScale],
    ];
  }

  #contactDetails(handleA, handleB) {
    const colliderA = this.world.getCollider(handleA);
    const colliderB = this.world.getCollider(handleB);
    let point = null;
    let normal = null;
    let impulse = 0;
    if (colliderA && colliderB) this.world.contactPair(colliderA, colliderB, (manifold, flipped) => {
      if (!normal) {
        const value = manifold.normal();
        normal = [value.x * (flipped ? -1 : 1), value.y * (flipped ? -1 : 1)];
      }
      if (!point && manifold.numSolverContacts() > 0) {
        const value = manifold.solverContactPoint(0);
        point = [value.x * this.inverseWorldScale, value.y * this.inverseWorldScale];
      }
      for (let index = 0; index < manifold.numContacts(); index += 1) impulse += Math.abs(manifold.contactImpulse(index)) * this.inverseWorldScale;
    });
    return { point, normal, impulse };
  }

  #relativeSpeed(a, b) {
    const av = a.rigidBody.linvel();
    const bv = b.rigidBody.linvel();
    return Math.hypot(av.x - bv.x, av.y - bv.y) * this.inverseWorldScale;
  }

  step() {
    const started = performance.now();
    this.#applyAuthoredForces();
    this.world.step(this.eventQueue);
    this.stepIndex += 1;
    this.time = this.stepIndex * this.fixedDt;
    const gravity = resolveSystemGravity(this.graph, this.system, this.worldScale);
    const world = {
      gravityX: gravity.x,
      gravityY: gravity.y,
      step: this.stepIndex,
      time: this.time,
      timeScale: this.system.clock.timeScale,
      simSpeed: this.graph.world.simSpeed,
      pixelsPerMeter: this.graph.world.pixelsPerMeter,
    };
    const events = [];
    const append = event => {
      if (events.length < MAX_EVENTS_PER_STEP) events.push(event);
      else this.droppedEvents += 1;
    };
    this.eventQueue.drainCollisionEvents((handleA, handleB, startedCollision) => {
      const a = this.entityByCollider.get(handleA);
      const b = this.entityByCollider.get(handleB);
      if (!a || !b) return;
      const sensor = a.sensor || b.sensor;
      const pairKey = handleA < handleB ? `${handleA}:${handleB}` : `${handleB}:${handleA}`;
      if (startedCollision) this.activePairs.set(pairKey, { handleA, handleB, startedStep: this.stepIndex });
      else this.activePairs.delete(pairKey);
      const details = startedCollision && !sensor ? this.#contactDetails(handleA, handleB) : { point: null, normal: null, impulse: 0 };
      append({
        version: 1,
        systemId: this.system.id,
        step: this.stepIndex,
        simTime: this.time,
        phase: sensor ? (startedCollision ? "enter" : "exit") : (startedCollision ? "begin" : "end"),
        collisionClass: collisionClassFor(a, b),
        a: collisionEntityPayload(a, this.inverseWorldScale),
        b: collisionEntityPayload(b, this.inverseWorldScale),
        world,
        point: details.point,
        normal: details.normal,
        impulse: details.impulse,
        relativeSpeed: this.#relativeSpeed(a, b),
      });
    });
    this.eventQueue.drainContactForceEvents(forceEvent => {
      const handleA = forceEvent.collider1();
      const handleB = forceEvent.collider2();
      const a = this.entityByCollider.get(handleA);
      const b = this.entityByCollider.get(handleB);
      if (!a || !b) return;
      const direction = forceEvent.maxForceDirection();
      const details = this.#contactDetails(handleA, handleB);
      append({
        version: 1,
        systemId: this.system.id,
        step: this.stepIndex,
        simTime: this.time,
        phase: "hit",
        collisionClass: collisionClassFor(a, b),
        a: collisionEntityPayload(a, this.inverseWorldScale),
        b: collisionEntityPayload(b, this.inverseWorldScale),
        world,
        point: details.point,
        normal: [direction.x, direction.y],
        impulse: forceEvent.totalForceMagnitude() * this.fixedDt * this.inverseWorldScale,
        relativeSpeed: this.#relativeSpeed(a, b),
      });
    });
    if (this.system.emitStayEvents) {
      for (const pair of this.activePairs.values()) {
        if (pair.startedStep === this.stepIndex) continue;
        const a = this.entityByCollider.get(pair.handleA);
        const b = this.entityByCollider.get(pair.handleB);
        if (!a || !b) continue;
        const details = a.sensor || b.sensor ? { point: null, normal: null, impulse: 0 } : this.#contactDetails(pair.handleA, pair.handleB);
        append({
          version: 1,
          systemId: this.system.id,
          step: this.stepIndex,
          simTime: this.time,
          phase: "stay",
          collisionClass: collisionClassFor(a, b),
          a: collisionEntityPayload(a, this.inverseWorldScale),
          b: collisionEntityPayload(b, this.inverseWorldScale),
          world,
          point: details.point,
          normal: details.normal,
          impulse: details.impulse,
          relativeSpeed: this.#relativeSpeed(a, b),
        });
      }
    }
    const broken = [];
    for (const [constraintId, state] of this.constraints) {
      const threshold = state.definition.breakForce;
      if (state.rope || !Number.isFinite(threshold) || threshold <= 0 || !state.joint?.isValid?.()) continue;
      const aPosition = state.bodyA.translation();
      const bPosition = state.bodyB.translation();
      const distance = Math.hypot(aPosition.x - bPosition.x, aPosition.y - bPosition.y) * this.inverseWorldScale;
      const aVelocity = state.bodyA.linvel();
      const bVelocity = state.bodyB.linvel();
      const relativeSpeed = Math.hypot(aVelocity.x - bVelocity.x, aVelocity.y - bVelocity.y) * this.inverseWorldScale;
      const estimatedForce = Math.abs(distance - state.definition.restLength) * state.definition.stiffness + relativeSpeed * state.definition.damping;
      if (estimatedForce < threshold) continue;
      broken.push([constraintId, state, estimatedForce]);
    }
    for (const [constraintId, state, estimatedForce] of broken) {
      const a = this.entityByRigidBody.get(state.bodyA.handle);
      const b = this.entityByRigidBody.get(state.bodyB.handle);
      this.world.removeImpulseJoint(state.joint, true);
      this.constraints.delete(constraintId);
      append({
        version: 1,
        systemId: this.system.id,
        step: this.stepIndex,
        simTime: this.time,
        phase: "break",
        collisionClass: "constraint-break",
        constraintId,
        a: a ? collisionEntityPayload(a, this.inverseWorldScale) : null,
        b: b ? collisionEntityPayload(b, this.inverseWorldScale) : null,
        world,
        point: null,
        normal: null,
        impulse: estimatedForce * this.fixedDt,
        relativeSpeed: 0,
      });
    }
    return { events, stepMs: performance.now() - started, step: this.stepIndex, time: this.time, droppedEvents: this.droppedEvents };
  }

  poses(reusable = null) {
    // Rope links are a solver implementation detail. Their generated path is
    // returned separately below, so they must not masquerade as authored or
    // population poses in the canvas transfer buffer.
    const entities = [...this.bodyById.values()].filter(entity => !entity.ropeLink);
    const values = reusable instanceof Float32Array && reusable.length === entities.length * 4
      ? reusable
      : new Float32Array(entities.length * 4);
    const metadata = new Array(entities.length);
    entities.forEach((entity, index) => {
      const translation = entity.rigidBody.translation();
      values[index * 4] = translation.x * this.inverseWorldScale;
      values[index * 4 + 1] = translation.y * this.inverseWorldScale;
      values[index * 4 + 2] = entity.rigidBody.rotation();
      values[index * 4 + 3] = entity.rigidBody.isSleeping() ? 0 : 1;
      metadata[index] = {
        ...entityPayload(entity),
        render: entity.render,
        collider: entity.collider,
      };
    });
    const ropePaths = [...this.constraints.entries()]
      .filter(([, state]) => state.rope)
      .map(([constraintId, state]) => ({ constraintId, points: this.#ropePath(state) }))
      .filter(path => path.points?.length >= 2);
    const constraintAnchors = [...this.constraints.entries()]
      .filter(([, state]) => state.definition?.a?.kind === "rope" || state.definition?.b?.kind === "rope")
      .flatMap(([constraintId, state]) => {
        const ropeAttachments = [];
        for (const side of ["a", "b"]) {
          if (state.definition?.[side]?.kind !== "rope") continue;
          const entity = side === "a" ? state.entityA : state.entityB;
          const localAnchor = side === "a" ? state.anchorA : state.anchorB;
          const linkIndex = side === "a" ? state.ropeLinkIndexA : state.ropeLinkIndexB;
          const linkCount = side === "a" ? state.ropeLinkCountA : state.ropeLinkCountB;
          const stableProgress = side === "a" ? state.ropeProgressA : state.ropeProgressB;
          if (!entity?.rigidBody || !localAnchor || !Number.isInteger(linkIndex) || linkIndex < 0) continue;
          const ropePoint = this.#worldPointForAnchor(entity.rigidBody, localAnchor);
          ropeAttachments.push({
            side,
            point: [ropePoint.x * this.inverseWorldScale, ropePoint.y * this.inverseWorldScale],
            linkIndex,
            ropeProgress: Number.isFinite(Number(stableProgress))
              ? Number(stableProgress)
              : (linkCount > 1 ? linkIndex / (linkCount - 1) : 0),
          });
        }
        // A rope-to-World pivot is authored and dragged by its fixed World
        // anchor. The rope-side joint point can lag behind that target while
        // the solver relaxes the chain, so publishing it makes the visible
        // pivot snap/lag even though the requested anchor moved correctly.
        const worldAnchor = state.worldAnchorA || state.worldAnchorB;
        if (worldAnchor) {
          const point = worldAnchor.translation();
          return [{ constraintId, point: [point.x * this.inverseWorldScale, point.y * this.inverseWorldScale], ropeAttachments }];
        }
        const entity = state.entityA || state.entityB;
        const localAnchor = state.entityA ? state.anchorA : state.anchorB;
        if (!entity?.rigidBody || !localAnchor) return [];
        const point = this.#worldPointForAnchor(entity.rigidBody, localAnchor);
        return [{ constraintId, point: [point.x * this.inverseWorldScale, point.y * this.inverseWorldScale], ropeAttachments }];
      });
    const thrusterPaths = [...this.constraints.entries()]
      .filter(([, state]) => state.thruster)
      .map(([constraintId, state]) => ({ constraintId, points: this.#thrusterPath(state) }))
      .filter(path => path.points?.length >= 2);
    return { values, metadata, ropePaths, constraintAnchors, thrusterPaths };
  }

  setKinematicTarget(entityId, point, angle = null) {
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    entity.rigidBody.setNextKinematicTranslation({ x: finite(point?.[0]) * this.worldScale, y: finite(point?.[1]) * this.worldScale });
    if (Number.isFinite(Number(angle))) entity.rigidBody.setNextKinematicRotation(Number(angle));
    return true;
  }

  // Resolve an authored pose without advancing simulation time. The bodies
  // directly edited on canvas become temporary kinematic anchors; Rapier then
  // performs a bounded, zero-gravity joint solve so connected bodies follow.
  // The caller commits these returned poses as a new reset pose afterwards.
  relaxConstraints(entityIds = [], iterations = 18) {
    const requested = new Set((Array.isArray(entityIds) ? entityIds : [entityIds]).filter(Boolean));
    const targets = [...requested]
      .map(id => this.bodyById.get(id))
      .filter(entity => entity && entity.tracking === "authored-rigid" && !entity.rigidBody.isFixed());
    if (!targets.length) return this.#authoredRigidPoseRecords();

    const gravity = this.world.gravity;
    const temporaryTypes = [];
    const targetPoses = targets.map(entity => {
      const translation = entity.rigidBody.translation();
      return { entity, translation: { x: translation.x, y: translation.y }, angle: entity.rigidBody.rotation() };
    });
    const eventQueue = new RAPIER.EventQueue(false);
    try {
      this.world.gravity = { x: 0, y: 0 };
      for (const target of targetPoses) {
        const previousType = target.entity.rigidBody.bodyType();
        if (previousType !== RAPIER.RigidBodyType.KinematicPositionBased) {
          temporaryTypes.push({ entity: target.entity, previousType });
          target.entity.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        }
        target.entity.rigidBody.setLinvel({ x: 0, y: 0 }, true);
        target.entity.rigidBody.setAngvel(0, true);
      }
      const count = Math.max(1, Math.min(96, Math.round(finite(iterations, 18))));
      for (let index = 0; index < count; index += 1) {
        for (const target of targetPoses) {
          target.entity.rigidBody.setNextKinematicTranslation(target.translation);
          target.entity.rigidBody.setNextKinematicRotation(target.angle);
        }
        this.world.step(eventQueue);
      }
      // This is pose authoring, not a hidden simulation. Remove impulse left
      // by the solver so the next Play begins calmly from the authored frame.
      for (const entity of this.bodyById.values()) {
        entity.rigidBody.setLinvel({ x: 0, y: 0 }, true);
        entity.rigidBody.setAngvel(0, true);
      }
      this.activePairs.clear();
      return this.#authoredRigidPoseRecords();
    } finally {
      for (const { entity, previousType } of temporaryTypes) {
        entity.rigidBody.setBodyType(previousType, true);
        entity.rigidBody.setLinvel({ x: 0, y: 0 }, true);
        entity.rigidBody.setAngvel(0, true);
      }
      this.world.gravity = gravity;
      eventQueue.free();
    }
  }

  #authoredRigidPoseRecords() {
    return [...this.bodyById.values()]
      .filter(entity => entity.tracking === "authored-rigid")
      .map(entity => {
        const translation = entity.rigidBody.translation();
        return {
          bodyId: entity.bodyId,
          x: translation.x * this.inverseWorldScale,
          y: translation.y * this.inverseWorldScale,
          angle: entity.rigidBody.rotation(),
        };
      });
  }

  applyImpulse(entityId, impulse, wake = true) {
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    entity.rigidBody.applyImpulse({ x: finite(impulse?.[0]) * this.worldScale, y: finite(impulse?.[1]) * this.worldScale }, wake);
    return true;
  }

  queryPoint(point) {
    const hits = [];
    this.world.intersectionsWithPoint({ x: finite(point?.[0]) * this.worldScale, y: finite(point?.[1]) * this.worldScale }, collider => {
      const entity = this.entityByCollider.get(collider.handle);
      if (entity) hits.push(entityPayload(entity));
      return true;
    });
    return hits;
  }

  castRay(origin, direction, maxDistance = 10000) {
    const length = Math.max(1e-9, Math.hypot(finite(direction?.[0]), finite(direction?.[1])));
    const ray = new RAPIER.Ray(
      { x: finite(origin?.[0]) * this.worldScale, y: finite(origin?.[1]) * this.worldScale },
      { x: finite(direction?.[0]) / length, y: finite(direction?.[1]) / length },
    );
    const hit = this.world.castRayAndGetNormal(ray, Math.max(0, finite(maxDistance)) * this.worldScale, true);
    if (!hit) return null;
    const entity = this.entityByCollider.get(hit.collider.handle);
    const distance = hit.timeOfImpact * this.inverseWorldScale;
    return {
      entity: entity ? entityPayload(entity) : null,
      distance,
      point: [finite(origin?.[0]) + finite(direction?.[0]) / length * distance, finite(origin?.[1]) + finite(direction?.[1]) / length * distance],
      normal: [hit.normal.x, hit.normal.y],
    };
  }

  #localAnchorAtPoint(entity, point) {
    const translation = entity.rigidBody.translation();
    const dx = finite(point?.[0]) * this.worldScale - translation.x;
    const dy = finite(point?.[1]) * this.worldScale - translation.y;
    const angle = entity.rigidBody.rotation();
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      x: cosine * dx + sine * dy,
      y: -sine * dx + cosine * dy,
    };
  }

  // This solves constraints in-place for direct manipulation without updating
  // the authored reset pose or advancing the public simulation clock. It is
  // deliberately runtime-only: releasing the grab leaves the scene's t=0
  // authoring data untouched, and Reset restores that authored state.
  #solveLivePose(iterations = 24) {
    const gravity = this.world.gravity;
    const eventQueue = new RAPIER.EventQueue(false);
    // Live pose is a constraint relaxation pass, not simulation time. Rapier
    // motors are evaluated by world.step(), so mute them just for this pass:
    // otherwise a live-pose drag at transport zero can spin an unrelated axle
    // even though Drawerator's public clock never advances.
    const mutedMotors = [];
    for (const state of this.constraints.values()) {
      if (!state.joint
        || state.definition.motorEnabled !== true
        || !["revolute", "pin", "axle"].includes(state.definition.kind)
        || typeof state.joint.configureMotorVelocity !== "function") continue;
      mutedMotors.push({
        joint: state.joint,
        speed: finite(state.definition.motorSpeed) * Math.PI / 180,
        torque: Math.max(0, finite(state.definition.motorTorque)),
      });
      state.joint.configureMotorVelocity(0, 0);
    }
    try {
      this.world.gravity = { x: 0, y: 0 };
      const count = Math.max(1, Math.min(96, Math.round(finite(iterations, 24))));
      for (let index = 0; index < count; index += 1) this.world.step(eventQueue);
      for (const entity of this.bodyById.values()) {
        if (entity.rigidBody.isFixed()) continue;
        entity.rigidBody.setLinvel({ x: 0, y: 0 }, true);
        entity.rigidBody.setAngvel(0, true);
      }
      this.activePairs.clear();
    } finally {
      for (const motor of mutedMotors) motor.joint.configureMotorVelocity(motor.speed, motor.torque);
      this.world.gravity = gravity;
      eventQueue.free();
    }
  }

  grab(entityId, point, stiffness = 120, damping = 12, { livePose = false } = {}) {
    this.releaseGrab();
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    const anchor = this.#fixedAnchor(point);
    const localAnchor = this.#localAnchorAtPoint(entity, point);
    const joint = this.world.createImpulseJoint(RAPIER.JointData.spring(0, stiffness, damping, { x: 0, y: 0 }, localAnchor), anchor, entity.rigidBody, true);
    this.grabState = { kind: "body", entityId, anchor, joint, livePose };
    if (livePose) this.#solveLivePose();
    return true;
  }

  grabConstraint(constraintId, point, stiffness = 120, damping = 12, { livePose = false } = {}) {
    this.releaseGrab();
    const state = this.constraints.get(constraintId);
    if (!state) return false;
    // A free rope has no authored endpoint entity to grab. Its generated links
    // are the physical body, so choose the link under the pointer and reuse
    // the normal body-grab path for both playback and Live pose.
    if (state.rope) {
      const link = state.links?.reduce((closest, candidate) => {
        const translation = candidate.rigidBody.translation();
        const distance = Math.hypot(translation.x * this.inverseWorldScale - finite(point?.[0]), translation.y * this.inverseWorldScale - finite(point?.[1]));
        return !closest || distance < closest.distance ? { candidate, distance } : closest;
      }, null)?.candidate;
      return link ? this.grab(link.entity.id, point, stiffness, damping, { livePose }) : false;
    }
    const worldAnchor = state.worldAnchorA || state.worldAnchorB;
    if (worldAnchor) {
      this.grabState = { kind: "constraint-world", constraintId, worldAnchor, livePose };
      return this.moveGrab(point, { livePose });
    }
    const entity = state.entityA || state.entityB;
    const localAnchor = state.entityA ? state.anchorA : state.anchorB;
    if (!entity || !localAnchor) return false;
    const anchor = this.#fixedAnchor(point);
    const joint = this.world.createImpulseJoint(RAPIER.JointData.spring(0, stiffness, damping, { x: 0, y: 0 }, localAnchor), anchor, entity.rigidBody, true);
    this.grabState = { kind: "constraint", constraintId, anchor, joint, livePose };
    if (livePose) this.#solveLivePose();
    return true;
  }

  moveGrab(point, { livePose = false, iterations = 24 } = {}) {
    if (!this.grabState) return false;
    const target = { x: finite(point?.[0]) * this.worldScale, y: finite(point?.[1]) * this.worldScale };
    if (this.grabState.worldAnchor) this.grabState.worldAnchor.setTranslation(target, true);
    else this.grabState.anchor?.setTranslation(target, true);
    if (this.grabState.livePose || livePose) this.#solveLivePose(iterations);
    return true;
  }

  releaseGrab() {
    if (!this.grabState) return;
    if (this.grabState.joint) this.world.removeImpulseJoint(this.grabState.joint, true);
    if (this.grabState.anchor) this.world.removeRigidBody(this.grabState.anchor);
    this.grabState = null;
  }

  snapshot() { return this.world.takeSnapshot(); }

  reset() {
    if (this.#hasRopes()) {
      this.#rebuildWorld();
      return;
    }
    this.releaseGrab();
    this.world.free();
    this.world = RAPIER.World.restoreSnapshot(this.initialSnapshot);
    this.world.timestep = this.fixedDt;
    this.#reindexRestoredWorld();
    this.stepIndex = 0;
    this.time = 0;
    this.droppedEvents = 0;
    this.activePairs.clear();
  }

  restore(snapshot, step = 0) {
    if (this.#hasRopes()) {
      this.#rebuildWorld();
      const targetStep = Math.max(0, Math.round(finite(step)));
      while (this.stepIndex < targetStep) this.step();
      return;
    }
    this.releaseGrab();
    this.world.free();
    this.world = RAPIER.World.restoreSnapshot(snapshot);
    this.world.timestep = this.fixedDt;
    this.#reindexRestoredWorld();
    this.stepIndex = Math.max(0, Math.round(finite(step)));
    this.time = this.stepIndex * this.fixedDt;
    this.activePairs.clear();
  }

  #reindexRestoredWorld() {
    const oldEntities = [...this.bodyById.values()];
    const oldConstraints = [...this.constraints.entries()];
    const bodies = this.world.bodies.getAll();
    const colliders = this.world.colliders.getAll();
    const joints = this.world.impulseJoints.getAll();
    this.bodyById.clear();
    this.entityByCollider.clear();
    this.entityByRigidBody.clear();
    this.bodyIdByObjectId.clear();
    this.constraints.clear();
    oldEntities.forEach((old, index) => {
      const rigidBody = bodies[index];
      // A path chain is a compound body: every segment owns a Rapier collider.
      // A restored world has fresh collider instances, so all of them need to
      // resolve to the authored body. Otherwise only the first chain segment
      // can emit a routable collision after Reset/checkpoint replay.
      const bodyColliders = rigidBody
        ? colliders.filter(candidate => candidate.parent()?.handle === rigidBody.handle)
        : [];
      if (!rigidBody || !bodyColliders.length) return;
      const entity = {
        ...old,
        rigidBody,
        colliderHandle: bodyColliders[0].handle,
        colliderHandles: bodyColliders.map(collider => collider.handle),
      };
      this.bodyById.set(entity.id, entity);
      bodyColliders.forEach(collider => this.entityByCollider.set(collider.handle, entity));
      this.entityByRigidBody.set(rigidBody.handle, entity);
      if (entity.objectRef?.kind === "element") this.bodyIdByObjectId.set(entity.objectRef.elementId, entity.id);
    });
    let jointIndex = 0;
    oldConstraints.forEach(([constraintId, previous]) => {
      // Free axles deliberately have no Rapier joint. Rebind their authored
      // body after snapshot restoration so reset/transport rewind keeps the
      // same motor semantics rather than silently dropping the drive.
      if (previous.directMotor) {
        const entityA = previous.entityA ? this.bodyById.get(previous.entityA.id) || null : null;
        const entityB = previous.entityB ? this.bodyById.get(previous.entityB.id) || null : null;
        this.constraints.set(constraintId, {
          ...previous,
          bodyA: entityA?.rigidBody || null,
          bodyB: entityB?.rigidBody || null,
          entityA,
          entityB,
        });
        return;
      }
      const joint = joints[jointIndex];
      jointIndex += 1;
      if (!joint) return;
      const bodyA = joint.body1();
      const bodyB = joint.body2();
      this.constraints.set(constraintId, {
        ...previous,
        joint,
        bodyA,
        bodyB,
        entityA: this.entityByRigidBody.get(bodyA.handle) || null,
        entityB: this.entityByRigidBody.get(bodyB.handle) || null,
        worldAnchorA: previous.worldAnchorA ? bodyA : null,
        worldAnchorB: previous.worldAnchorB ? bodyB : null,
      });
    });
  }

  #hasRopes() {
    return [...this.constraints.values()].some(state => state.rope);
  }

  #rebuildWorld() {
    this.releaseGrab();
    this.world?.free();
    const gravity = resolveSystemGravity(this.graph, this.system, this.worldScale);
    this.world = new RAPIER.World(gravity);
    this.world.timestep = this.fixedDt;
    this.bodyById.clear();
    this.entityByCollider.clear();
    this.entityByRigidBody.clear();
    this.bodyIdByObjectId.clear();
    this.constraints.clear();
    this.activePairs.clear();
    this.anchorBodies = [];
    this.stepIndex = 0;
    this.time = 0;
    this.droppedEvents = 0;
    this.#build();
    this.initialSnapshot = this.world.takeSnapshot();
  }

  dispose() {
    this.eventQueue?.free();
    this.world?.free();
    this.bodyById.clear();
    this.entityByCollider.clear();
  }
}
