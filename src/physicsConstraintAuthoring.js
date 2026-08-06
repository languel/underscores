import {
  getPhysicsElementCenter as getGeometryPhysicsElementCenter,
  getPhysicsElementWorldPoints,
} from "./physicsGeometry.js";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Constraint discovery, endpoint authoring, and the Rapier body must agree on
// one origin. `physicsGeometry` deliberately uses a freehand path's rendered
// bounds rather than its sometimes-stale Excalidraw frame bounds.
export const getPhysicsElementCenter = element => {
  const [x, y] = getGeometryPhysicsElementCenter(element);
  return { x, y };
};

// Springs are authored by a visible object, but unlike a pivot their two
// anchors are intentionally independent.  Use the rendered geometry so a
// rotated line, arrow, path, or freehand gets the same endpoints the user sees.
export const getSpringEndpointWorldPoints = element => {
  const points = (getPhysicsElementWorldPoints(element) || [])
    .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.001) return null;
  return { start, end };
};

export const getSpringGeometricLength = element => {
  const endpoints = getSpringEndpointWorldPoints(element);
  return endpoints
    ? Math.hypot(endpoints.end[0] - endpoints.start[0], endpoints.end[1] - endpoints.start[1])
    : null;
};

export const getRopeWorldPoints = element => (getPhysicsElementWorldPoints(element) || [])
  .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
  .map(point => [Number(point[0]), Number(point[1])]);

// Springs are drawn as ordinary Excalidraw geometry, while Rapier resolves
// their two anchors independently. Rebuild the visual geometry from the
// current visible endpoints rather than treating a spring like a point pivot:
// a spring must translate, rotate, and stretch with its constraint.
//
// The patch deliberately flattens the element angle into its points. That
// makes the resulting scene coordinates unambiguous for line, arrow, and
// freehand spring visuals and avoids accumulating an origin offset while the
// solver updates at display cadence.
export const getSpringVisualGeometryPatch = (element, start, end) => {
  if (!Array.isArray(element?.points) || !Array.isArray(start) || !Array.isArray(end)) return null;
  const source = getSpringEndpointWorldPoints(element);
  if (!source) return null;
  const targetStart = [Number(start[0]), Number(start[1])];
  const targetEnd = [Number(end[0]), Number(end[1])];
  if (!targetStart.every(Number.isFinite) || !targetEnd.every(Number.isFinite)) return null;
  const sourceDx = source.end[0] - source.start[0];
  const sourceDy = source.end[1] - source.start[1];
  const targetDx = targetEnd[0] - targetStart[0];
  const targetDy = targetEnd[1] - targetStart[1];
  const sourceLength = Math.hypot(sourceDx, sourceDy);
  const targetLength = Math.hypot(targetDx, targetDy);
  if (sourceLength < 0.001 || targetLength < 0.001) return null;
  const scale = targetLength / sourceLength;
  const rotation = Math.atan2(targetDy, targetDx) - Math.atan2(sourceDy, sourceDx);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const worldPoints = getPhysicsElementWorldPoints(element);
  if (worldPoints.length !== element.points.length) return null;
  const transformed = worldPoints.map(point => {
    const dx = point[0] - source.start[0];
    const dy = point[1] - source.start[1];
    return [
      targetStart[0] + scale * (cosine * dx - sine * dy),
      targetStart[1] + scale * (sine * dx + cosine * dy),
    ];
  });
  transformed[0] = targetStart;
  transformed[transformed.length - 1] = targetEnd;
  const xs = transformed.map(point => point[0]);
  const ys = transformed.map(point => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  return {
    x,
    y,
    width,
    height,
    angle: 0,
    points: transformed.map(point => [point[0] - x, point[1] - y]),
  };
};

// A rope's visible path comes directly from its generated link endpoints. It
// deliberately does not preserve the original affine transform: the points
// are now an evaluated physics path, and a flat world-space representation is
// the only stable form for freehand, lines, arrows, and cubic-path hosts.
export const getRopeVisualGeometryPatch = (element, worldPoints) => {
  if (!element || !Array.isArray(worldPoints) || worldPoints.length < 2) return null;
  const points = worldPoints
    .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(point => [Number(point[0]), Number(point[1])]);
  if (points.length < 2) return null;
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    angle: 0,
    points: points.map(point => [point[0] - x, point[1] - y]),
  };
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
      name: kind === "fixate" ? "Weld" : "Axle",
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

const bodyCandidatesAtPoint = ({ visual, point, elements = [], bodies = [], systemId }) => {
  const bodyIds = new Set((bodies || [])
    .filter(body => body?.enabled !== false && body?.objectRef?.kind === "element" && (!systemId || body.systemId === systemId))
    .map(body => body.objectRef.elementId));
  return [...elements].reverse().filter(element => (
    element?.id !== visual?.id
    && bodyIds.has(element?.id)
    && elementContainsPhysicsPoint(element, point)
  ));
};

// A spring visual can be any two-ended canvas geometry. Each visible endpoint
// independently finds the topmost physics body beneath it; an empty endpoint
// attaches to World at its authored scene coordinate.
export const resolveSpringConstraint = ({ spring, elements = [], bodies = [], systemId }) => {
  if (!spring?.id) return { error: "Choose a spring object." };
  const endpoints = getSpringEndpointWorldPoints(spring);
  if (!endpoints) return { error: "Spring needs two distinct endpoints." };
  const primary = bodyCandidatesAtPoint({ visual: spring, point: endpoints.start, elements, bodies, systemId })[0] || null;
  const secondary = bodyCandidatesAtPoint({ visual: spring, point: endpoints.end, elements, bodies, systemId })[0] || null;
  const restLength = Math.hypot(
    endpoints.end[0] - endpoints.start[0],
    endpoints.end[1] - endpoints.start[1],
  );
  return {
    endpointPoints: endpoints,
    primary,
    secondary,
    constraint: {
      id: `physics-spring-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Spring",
      kind: "spring",
      objectRef: { kind: "element", elementId: spring.id },
      a: primary ? physicsEndpointAtPoint(primary, endpoints.start) : { kind: "world", point: [...endpoints.start] },
      b: secondary ? physicsEndpointAtPoint(secondary, endpoints.end) : { kind: "world", point: [...endpoints.end] },
      restLength,
      stiffness: 40,
      damping: 4,
      collideConnected: false,
      limitsEnabled: false,
      lowerLimit: null,
      upperLimit: null,
    },
  };
};

// Ropes use all authored path points rather than only their endpoints. The
// first and last points attach exactly like a Spring; Rapier fills the path
// between them with generated runtime links and revolute joints.
export const resolveRopeConstraint = ({ rope, elements = [], bodies = [], systemId }) => {
  if (!rope?.id) return { error: "Choose a rope path." };
  const pathPoints = getRopeWorldPoints(rope);
  if (pathPoints.length < 2) return { error: "Rope needs at least two path points." };
  const start = pathPoints[0];
  const end = pathPoints[pathPoints.length - 1];
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.001) return { error: "Rope needs two distinct endpoints." };
  const primary = bodyCandidatesAtPoint({ visual: rope, point: start, elements, bodies, systemId })[0] || null;
  const secondary = bodyCandidatesAtPoint({ visual: rope, point: end, elements, bodies, systemId })[0] || null;
  const restLength = pathPoints.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point[0] - pathPoints[index][0], point[1] - pathPoints[index][1])
  ), 0);
  return {
    endpointPoints: { start, end },
    pathPoints,
    primary,
    secondary,
    constraint: {
      id: `physics-rope-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Rope",
      kind: "rope",
      objectRef: { kind: "element", elementId: rope.id },
      a: primary ? physicsEndpointAtPoint(primary, start) : { kind: "world", point: [...start] },
      b: secondary ? physicsEndpointAtPoint(secondary, end) : { kind: "world", point: [...end] },
      pathPoints,
      segmentLength: 24,
      thickness: Math.max(2, finite(rope.strokeWidth, 2) + 2),
      restLength,
      stiffness: 40,
      damping: 4,
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
  pathPoints: constraint.pathPoints,
  segmentLength: constraint.segmentLength,
  thickness: constraint.thickness,
  stiffness: constraint.stiffness,
  damping: constraint.damping,
  limitsEnabled: constraint.limitsEnabled === true,
  lowerLimit: constraint.lowerLimit ?? null,
  upperLimit: constraint.upperLimit ?? null,
  breakForce: constraint.breakForce ?? null,
  collideConnected: constraint.collideConnected === true,
});
