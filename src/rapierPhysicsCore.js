import RAPIER from "@dimforge/rapier2d-deterministic-compat";
import { normalizeRelationshipGraph, normalizePhysicsEndpoint } from "./relationshipGraph.js";

export const PHYSICS_WORLD_SCALE = 0.01;
const INV_SCALE = 1 / PHYSICS_WORLD_SCALE;
const MAX_EVENTS_PER_STEP = 512;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const resolveSystemGravity = (graph, system) => system.gravityMode === "world"
  ? {
      x: graph.world.gravity.x * graph.world.pixelsPerMeter,
      // Canvas Y grows downwards; the authored world convention follows the
      // usual physics sign where negative Y is up.
      y: -graph.world.gravity.y * graph.world.pixelsPerMeter,
    }
  : system.gravity;

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

const bodyDescription = (body, viscosity = 0) => {
  const desc = body.bodyType === "fixed"
    ? RAPIER.RigidBodyDesc.fixed()
    : body.bodyType === "kinematic"
      ? RAPIER.RigidBodyDesc.kinematicPositionBased()
      : RAPIER.RigidBodyDesc.dynamic();
  return desc
    .setTranslation(body.initial.x * PHYSICS_WORLD_SCALE, body.initial.y * PHYSICS_WORLD_SCALE)
    .setRotation(body.initial.angle)
    .setLinvel(body.initial.velocityX * PHYSICS_WORLD_SCALE, body.initial.velocityY * PHYSICS_WORLD_SCALE)
    .setAngvel(body.initial.angularVelocity)
    .setLinearDamping(body.material.linearDamping + viscosity)
    .setAngularDamping(body.material.angularDamping)
    .setCcdEnabled(body.bodyType === "dynamic");
};

const colliderDescription = body => {
  const collider = body.collider;
  let desc;
  if (collider.kind === "circle") desc = RAPIER.ColliderDesc.ball(collider.radius * PHYSICS_WORLD_SCALE);
  else if (collider.kind === "convex") {
    desc = RAPIER.ColliderDesc.convexHull(new Float32Array(collider.points.flatMap(point => [point[0] * PHYSICS_WORLD_SCALE, point[1] * PHYSICS_WORLD_SCALE])));
  } else if (collider.kind === "polyline") {
    desc = RAPIER.ColliderDesc.polyline(new Float32Array(collider.points.flatMap(point => [point[0] * PHYSICS_WORLD_SCALE, point[1] * PHYSICS_WORLD_SCALE])));
  } else desc = RAPIER.ColliderDesc.cuboid(collider.width * PHYSICS_WORLD_SCALE / 2, collider.height * PHYSICS_WORLD_SCALE / 2);
  if (!desc) desc = RAPIER.ColliderDesc.cuboid(0.12, 0.12);
  return desc
    .setSensor(collider.sensor)
    .setDensity(body.material.density)
    .setFriction(body.material.friction)
    .setRestitution(body.material.restitution)
    .setCollisionGroups(((body.collisionGroup & 0xffff) << 16) | (body.collisionMask & 0xffff))
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(0);
};

const localAnchorForBody = (body, endpoint) => {
  if (!endpoint || endpoint.kind !== "object" || endpoint.anchor === "center") return { x: 0, y: 0 };
  const width = body.collider.kind === "circle" ? body.collider.radius * 2 : body.collider.width;
  const height = body.collider.kind === "circle" ? body.collider.radius * 2 : body.collider.height;
  return {
    x: (endpoint.localPoint[0] - 0.5) * width * PHYSICS_WORLD_SCALE,
    y: (endpoint.localPoint[1] - 0.5) * height * PHYSICS_WORLD_SCALE,
  };
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
    const gravity = resolveSystemGravity(this.graph, this.system);
    this.world = new RAPIER.World({
      x: gravity.x * PHYSICS_WORLD_SCALE,
      y: gravity.y * PHYSICS_WORLD_SCALE,
    });
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
    this.graph.constraints.filter(constraint => constraint.enabled && constraint.systemId === this.system.id).forEach(constraint => this.#addConstraint(constraint));
  }

  #addBody(body, runtime = {}) {
    const rigidBody = this.world.createRigidBody(bodyDescription({ ...body, initial: { ...body.initial, ...runtime.initial } }, this.graph.world.viscosity));
    const collider = this.world.createCollider(colliderDescription(body), rigidBody);
    const entity = {
      id: runtime.id || body.id,
      bodyId: body.id,
      populationId: runtime.populationId || null,
      instanceId: runtime.instanceId || null,
      objectRef: body.objectRef || null,
      tracking: runtime.tracking || body.tracking,
      bodyType: body.bodyType,
      tags: [...body.collisionTags],
      sensor: body.collider.sensor,
      render: { ...body.render },
      collider: { ...body.collider },
      rigidBody,
      colliderHandle: collider.handle,
    };
    this.bodyById.set(entity.id, entity);
    this.entityByCollider.set(collider.handle, entity);
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
    if (!endpoint || ["world", "stream", "bezier-anchor", "curve-progress"].includes(endpoint.kind)) return { endpoint, entity: null };
    const entityId = this.bodyIdByObjectId.get(endpoint.objectRef.elementId);
    return { endpoint, entity: this.bodyById.get(entityId) || null };
  }

  #fixedAnchor(point) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(point[0] * PHYSICS_WORLD_SCALE, point[1] * PHYSICS_WORLD_SCALE));
    this.anchorBodies.push(body);
    return body;
  }

  #addConstraint(constraint) {
    const a = this.#resolveBodyEndpoint(constraint.a);
    const b = this.#resolveBodyEndpoint(constraint.b);
    let entityA = a.entity;
    let entityB = b.entity;
    let bodyA = entityA?.rigidBody;
    let bodyB = entityB?.rigidBody;
    if (!bodyA && a.endpoint?.kind === "world") bodyA = this.#fixedAnchor(a.endpoint.point);
    if (!bodyB && b.endpoint?.kind === "world") bodyB = this.#fixedAnchor(b.endpoint.point);
    if (!bodyA || !bodyB) return;
    const anchorA = entityA ? localAnchorForBody(this.graph.bodies.find(body => body.id === entityA.bodyId), a.endpoint) : { x: 0, y: 0 };
    const anchorB = entityB ? localAnchorForBody(this.graph.bodies.find(body => body.id === entityB.bodyId), b.endpoint) : { x: 0, y: 0 };
    let data;
    if (constraint.kind === "revolute" || constraint.kind === "pin") data = RAPIER.JointData.revolute(anchorA, anchorB);
    else if (constraint.kind === "weld") data = RAPIER.JointData.fixed(anchorA, 0, anchorB, 0);
    else data = RAPIER.JointData.spring(constraint.restLength * PHYSICS_WORLD_SCALE, constraint.stiffness, constraint.damping, anchorA, anchorB);
    const joint = this.world.createImpulseJoint(data, bodyA, bodyB, true);
    joint.setContactsEnabled(constraint.collideConnected);
    if (typeof joint.setLimits === "function" && constraint.lowerLimit !== null && constraint.upperLimit !== null) {
      joint.setLimits(constraint.lowerLimit, constraint.upperLimit);
    }
    this.constraints.set(constraint.id, { definition: constraint, joint, bodyA, bodyB });
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
        point = [value.x * INV_SCALE, value.y * INV_SCALE];
      }
      for (let index = 0; index < manifold.numContacts(); index += 1) impulse += Math.abs(manifold.contactImpulse(index)) * INV_SCALE;
    });
    return { point, normal, impulse };
  }

  #relativeSpeed(a, b) {
    const av = a.rigidBody.linvel();
    const bv = b.rigidBody.linvel();
    return Math.hypot(av.x - bv.x, av.y - bv.y) * INV_SCALE;
  }

  step() {
    const started = performance.now();
    this.world.step(this.eventQueue);
    this.stepIndex += 1;
    this.time = this.stepIndex * this.fixedDt;
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
        a: entityPayload(a),
        b: entityPayload(b),
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
        a: entityPayload(a),
        b: entityPayload(b),
        point: details.point,
        normal: [direction.x, direction.y],
        impulse: forceEvent.totalForceMagnitude() * this.fixedDt * INV_SCALE,
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
          a: entityPayload(a),
          b: entityPayload(b),
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
      if (!Number.isFinite(threshold) || threshold <= 0 || !state.joint?.isValid?.()) continue;
      const aPosition = state.bodyA.translation();
      const bPosition = state.bodyB.translation();
      const distance = Math.hypot(aPosition.x - bPosition.x, aPosition.y - bPosition.y) * INV_SCALE;
      const aVelocity = state.bodyA.linvel();
      const bVelocity = state.bodyB.linvel();
      const relativeSpeed = Math.hypot(aVelocity.x - bVelocity.x, aVelocity.y - bVelocity.y) * INV_SCALE;
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
        a: a ? entityPayload(a) : null,
        b: b ? entityPayload(b) : null,
        point: null,
        normal: null,
        impulse: estimatedForce * this.fixedDt,
        relativeSpeed: 0,
      });
    }
    return { events, stepMs: performance.now() - started, step: this.stepIndex, time: this.time, droppedEvents: this.droppedEvents };
  }

  poses(reusable = null) {
    const entities = [...this.bodyById.values()];
    const values = reusable instanceof Float32Array && reusable.length === entities.length * 4
      ? reusable
      : new Float32Array(entities.length * 4);
    const metadata = new Array(entities.length);
    entities.forEach((entity, index) => {
      const translation = entity.rigidBody.translation();
      values[index * 4] = translation.x * INV_SCALE;
      values[index * 4 + 1] = translation.y * INV_SCALE;
      values[index * 4 + 2] = entity.rigidBody.rotation();
      values[index * 4 + 3] = entity.rigidBody.isSleeping() ? 0 : 1;
      metadata[index] = {
        ...entityPayload(entity),
        render: entity.render,
        collider: entity.collider,
      };
    });
    return { values, metadata };
  }

  setKinematicTarget(entityId, point, angle = null) {
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    entity.rigidBody.setNextKinematicTranslation({ x: finite(point?.[0]) * PHYSICS_WORLD_SCALE, y: finite(point?.[1]) * PHYSICS_WORLD_SCALE });
    if (Number.isFinite(Number(angle))) entity.rigidBody.setNextKinematicRotation(Number(angle));
    return true;
  }

  applyImpulse(entityId, impulse, wake = true) {
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    entity.rigidBody.applyImpulse({ x: finite(impulse?.[0]) * PHYSICS_WORLD_SCALE, y: finite(impulse?.[1]) * PHYSICS_WORLD_SCALE }, wake);
    return true;
  }

  queryPoint(point) {
    const hits = [];
    this.world.intersectionsWithPoint({ x: finite(point?.[0]) * PHYSICS_WORLD_SCALE, y: finite(point?.[1]) * PHYSICS_WORLD_SCALE }, collider => {
      const entity = this.entityByCollider.get(collider.handle);
      if (entity) hits.push(entityPayload(entity));
      return true;
    });
    return hits;
  }

  castRay(origin, direction, maxDistance = 10000) {
    const length = Math.max(1e-9, Math.hypot(finite(direction?.[0]), finite(direction?.[1])));
    const ray = new RAPIER.Ray(
      { x: finite(origin?.[0]) * PHYSICS_WORLD_SCALE, y: finite(origin?.[1]) * PHYSICS_WORLD_SCALE },
      { x: finite(direction?.[0]) / length, y: finite(direction?.[1]) / length },
    );
    const hit = this.world.castRayAndGetNormal(ray, Math.max(0, finite(maxDistance)) * PHYSICS_WORLD_SCALE, true);
    if (!hit) return null;
    const entity = this.entityByCollider.get(hit.collider.handle);
    const distance = hit.timeOfImpact * INV_SCALE;
    return {
      entity: entity ? entityPayload(entity) : null,
      distance,
      point: [finite(origin?.[0]) + finite(direction?.[0]) / length * distance, finite(origin?.[1]) + finite(direction?.[1]) / length * distance],
      normal: [hit.normal.x, hit.normal.y],
    };
  }

  grab(entityId, point, stiffness = 120, damping = 12) {
    this.releaseGrab();
    const entity = this.bodyById.get(entityId);
    if (!entity) return false;
    const anchor = this.#fixedAnchor(point);
    const joint = this.world.createImpulseJoint(RAPIER.JointData.spring(0, stiffness, damping, { x: 0, y: 0 }, { x: 0, y: 0 }), anchor, entity.rigidBody, true);
    this.grabState = { entityId, anchor, joint };
    return true;
  }

  moveGrab(point) {
    if (!this.grabState) return false;
    this.grabState.anchor.setTranslation({ x: finite(point?.[0]) * PHYSICS_WORLD_SCALE, y: finite(point?.[1]) * PHYSICS_WORLD_SCALE }, true);
    return true;
  }

  releaseGrab() {
    if (!this.grabState) return;
    this.world.removeImpulseJoint(this.grabState.joint, true);
    this.world.removeRigidBody(this.grabState.anchor);
    this.grabState = null;
  }

  snapshot() { return this.world.takeSnapshot(); }

  reset() {
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
    const bodies = this.world.bodies.getAll();
    const colliders = this.world.colliders.getAll();
    this.bodyById.clear();
    this.entityByCollider.clear();
    this.entityByRigidBody.clear();
    this.bodyIdByObjectId.clear();
    this.constraints.clear();
    oldEntities.forEach((old, index) => {
      const rigidBody = bodies[index];
      const collider = colliders.find(candidate => candidate.parent()?.handle === rigidBody?.handle);
      if (!rigidBody || !collider) return;
      const entity = { ...old, rigidBody, colliderHandle: collider.handle };
      this.bodyById.set(entity.id, entity);
      this.entityByCollider.set(collider.handle, entity);
      this.entityByRigidBody.set(rigidBody.handle, entity);
      if (entity.objectRef?.kind === "element") this.bodyIdByObjectId.set(entity.objectRef.elementId, entity.id);
    });
  }

  dispose() {
    this.eventQueue?.free();
    this.world?.free();
    this.bodyById.clear();
    this.entityByCollider.clear();
  }
}
