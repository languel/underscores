import { getPhysicsElementCenter as getGeometryPhysicsElementCenter } from "./physicsGeometry.js";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Constraint discovery, endpoint authoring, and the Rapier body must agree on
// one origin. `physicsGeometry` deliberately uses a freehand path's rendered
// bounds rather than its sometimes-stale Excalidraw frame bounds.
export const getPhysicsElementCenter = element => {
  const [x, y] = getGeometryPhysicsElementCenter(element);
  return { x, y };
};

const rotateIntoElementSpace = (element, point) => {
  const center = getPhysicsElementCenter(element);
  const angle = finite(element?.angle);
  const dx = finite(point?.[0]) - center.x;
  const dy = finite(point?.[1]) - center.y;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * dx + sine * dy,
    y: -sine * dx + cosine * dy,
    width: Math.max(0.001, Math.abs(finite(element?.width))),
    height: Math.max(0.001, Math.abs(finite(element?.height))),
  };
};

export const elementContainsPhysicsPoint = (element, point, padding = 3) => {
  if (!element || element.isDeleted) return false;
  const local = rotateIntoElementSpace(element, point);
  const halfWidth = local.width / 2 + padding;
  const halfHeight = local.height / 2 + padding;
  if (element.type === "ellipse") {
    return (local.x / halfWidth) ** 2 + (local.y / halfHeight) ** 2 <= 1;
  }
  return Math.abs(local.x) <= halfWidth && Math.abs(local.y) <= halfHeight;
};

const elementPhysicsBoundsCorners = (element, padding = 0) => {
  const center = getPhysicsElementCenter(element);
  const halfWidth = Math.max(0.001, Math.abs(finite(element?.width)) / 2 + padding);
  const halfHeight = Math.max(0.001, Math.abs(finite(element?.height)) / 2 + padding);
  const cosine = Math.cos(finite(element?.angle));
  const sine = Math.sin(finite(element?.angle));
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x, y]) => [
    center.x + x * cosine - y * sine,
    center.y + x * sine + y * cosine,
  ]);
};

const projectPolygon = (points, axis) => {
  const values = points.map(point => point[0] * axis[0] + point[1] * axis[1]);
  return [Math.min(...values), Math.max(...values)];
};

const polygonsOverlap = (first, second) => {
  const polygons = [first, second];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy) || 1;
      const axis = [-dy / length, dx / length];
      const [firstMin, firstMax] = projectPolygon(first, axis);
      const [secondMin, secondMax] = projectPolygon(second, axis);
      if (firstMax < secondMin || secondMax < firstMin) return false;
    }
  }
  return true;
};

// Constraint authoring is object-based: the visual pivot itself must overlap a
// body, not merely have its centre inside it. A conservative oriented-bounds
// test keeps narrow pivots usable at an edge while the Rapier collider remains
// responsible for the actual simulation geometry.
export const physicsElementsOverlap = (first, second) => (
  Boolean(first && second && !first.isDeleted && !second.isDeleted)
  && polygonsOverlap(elementPhysicsBoundsCorners(first), elementPhysicsBoundsCorners(second))
);

export const physicsEndpointAtPoint = (element, point) => {
  if (!element) return { kind: "world", point: [finite(point?.[0]), finite(point?.[1])] };
  const local = rotateIntoElementSpace(element, point);
  return {
    kind: "object",
    objectRef: { kind: "element", elementId: element.id },
    anchor: "local",
    localPoint: [
      Math.min(1, Math.max(0, local.x / local.width + 0.5)),
      Math.min(1, Math.max(0, local.y / local.height + 0.5)),
    ],
  };
};

// The pivot is a separate authored object that deliberately overlaps a body.
// Scene hit-testing is front-to-back, so the body can be reported before the
// small pivot that the user actually clicked. Prefer any non-body object here;
// a prior pivot remains eligible so clicking it updates its relationship.
export const chooseConstraintPivot = elements => (elements || []).find(element => {
  if (!element || element.isDeleted) return false;
  const physics = element.customData?.physics || element.customData?.draweratorPhysics;
  return physics?.role !== "body";
}) || null;

// Constraint tools act on a small visual pivot object. The pivot's centre is
// the anchor and it discovers the topmost one or two overlapping physics
// bodies. One body becomes a World constraint; two bodies become a joint.
export const resolveConstraintPivot = ({ pivot, elements = [], bodies = [], systemId, kind = "axle" }) => {
  if (!pivot?.id) return { error: "Choose a pivot object." };
  const bodyIds = new Set((bodies || [])
    .filter(body => body?.enabled !== false && body?.objectRef?.kind === "element" && (!systemId || body.systemId === systemId))
    .map(body => body.objectRef.elementId));
  const point = getPhysicsElementCenter(pivot);
  const candidates = [...elements].reverse().filter(element => (
    element?.id !== pivot.id
    && bodyIds.has(element?.id)
    && (
      elementContainsPhysicsPoint(element, [point.x, point.y])
      || physicsElementsOverlap(pivot, element)
    )
  ));
  const [first, second] = candidates;
  if (!first) return { error: "Place the pivot over one or two physics bodies." };
  const anchor = [point.x, point.y];
  return {
    pivotPoint: anchor,
    primary: first,
    secondary: second || null,
    constraint: {
      id: `physics-${kind}-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: kind === "fixate" ? "Fixate" : "Axle",
      kind,
      objectRef: { kind: "element", elementId: pivot.id },
      a: physicsEndpointAtPoint(first, anchor),
      b: second ? physicsEndpointAtPoint(second, anchor) : { kind: "world", point: anchor },
      collideConnected: false,
      limitsEnabled: false,
      lowerLimit: null,
      upperLimit: null,
    },
  };
};

export const serializePhysicsConstraintCustomData = constraint => ({
  version: 1,
  role: constraint.kind,
  id: constraint.id,
  systemId: constraint.systemId,
  enabled: constraint.enabled !== false,
  name: constraint.name,
  constraintKind: constraint.kind,
  objectRef: constraint.objectRef,
  a: constraint.a,
  b: constraint.b,
  restLength: constraint.restLength,
  stiffness: constraint.stiffness,
  damping: constraint.damping,
  limitsEnabled: constraint.limitsEnabled === true,
  lowerLimit: constraint.lowerLimit ?? null,
  upperLimit: constraint.upperLimit ?? null,
  breakForce: constraint.breakForce ?? null,
  collideConnected: constraint.collideConnected === true,
});
