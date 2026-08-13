import {
  createBezierGeometryFromElement,
  getBezierWorldPath,
  hasCubicBezierGeometry,
} from "./bezierGeometry.js";
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

export const getRopeWorldPoints = element => {
  // Rounded native lines keep their source polyline in `points`, while the
  // canvas renders a smooth curve. Sample a transient cubic representation so
  // turning that line into a rope preserves the visible shape without changing
  // the source element or leaving canonical geometry behind.
  const smoothGeometry = !hasCubicBezierGeometry(element)
    && Boolean(element?.roundness)
    && (element?.type === "line" || element?.type === "freedraw")
    ? createBezierGeometryFromElement(element)
    : null;
  const source = smoothGeometry
    ? {
      ...element,
      customData: { ...(element.customData || {}), underscoreGeometry: smoothGeometry },
    }
    : element;
  const points = smoothGeometry ? getBezierWorldPath(source, 1.2) : getPhysicsElementWorldPoints(source);
  return (points || [])
    .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(point => [Number(point[0]), Number(point[1])]);
};

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

// A direct rope grab should author only that rope on release. A pivot that is
// attached to a rope carries the rope ID in either endpoint, so it promotes
// that rope together with its moved anchor. Other free ropes in the worker
// snapshot are independent runtime state and must remain untouched.
export const getLivePoseRopeConstraintIds = constraint => [...new Set([
  constraint?.kind === "rope" ? constraint.id : null,
  ...[constraint?.a, constraint?.b]
    .filter(endpoint => endpoint?.kind === "rope" && endpoint.constraintId)
    .map(endpoint => endpoint.constraintId),
].filter(Boolean))];

export const selectRopePathsForLivePose = (ropePaths, constraintIds = null) => {
  const paths = Array.isArray(ropePaths) ? ropePaths : [];
  if (constraintIds === null) return paths;
  const ids = new Set(constraintIds || []);
  return paths.filter(path => ids.has(path?.constraintId));
};

// A Live-pose drag solves World-bound pivot anchors inside Rapier. Persisting
// that pose means moving the authored World endpoint to the solved point while
// preserving whichever rope/body endpoint the pivot is bound to.
export const persistConstraintWorldAnchor = (constraint, worldPoint) => {
  if (!constraint || !Array.isArray(worldPoint)
    || !Number.isFinite(Number(worldPoint[0])) || !Number.isFinite(Number(worldPoint[1]))) return constraint;
  const point = [Number(worldPoint[0]), Number(worldPoint[1])];
  if (constraint.a?.kind !== "world" && constraint.b?.kind !== "world") return constraint;
  return {
    ...constraint,
    ...(constraint.a?.kind === "world" ? { a: { ...constraint.a, point: [...point] } } : {}),
    ...(constraint.b?.kind === "world" ? { b: { ...constraint.b, point: [...point] } } : {}),
  };
};

export const persistConstraintRopeAttachments = (constraint, attachments = []) => {
  if (!constraint || !Array.isArray(attachments) || !attachments.length) return constraint;
  const bySide = new Map(attachments
    .filter(attachment => ["a", "b"].includes(attachment?.side)
      && Array.isArray(attachment.point)
      && Number.isFinite(Number(attachment.point[0]))
      && Number.isFinite(Number(attachment.point[1])))
    .map(attachment => [attachment.side, attachment]));
  let changed = false;
  const updateEndpoint = side => {
    const endpoint = constraint[side];
    const attachment = bySide.get(side);
    if (endpoint?.kind !== "rope" || !attachment) return endpoint;
    changed = true;
    return {
      ...endpoint,
      point: [Number(attachment.point[0]), Number(attachment.point[1])],
      ...(Number.isInteger(Number(attachment.linkIndex)) && Number(attachment.linkIndex) >= 0
        ? { linkIndex: Math.floor(Number(attachment.linkIndex)) }
        : {}),
      ...(Number.isFinite(Number(attachment.ropeProgress))
        ? { ropeProgress: Math.max(0, Math.min(1, Number(attachment.ropeProgress))) }
        : {}),
    };
  };
  const a = updateEndpoint("a");
  const b = updateEndpoint("b");
  return changed ? { ...constraint, a, b } : constraint;
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

const projectPointToSegment = (point, start, end) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 1e-9
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
    : 0;
  const projected = [start[0] + dx * t, start[1] + dy * t];
  return {
    point: projected,
    distance: Math.hypot(projected[0] - point[0], projected[1] - point[1]),
    t,
  };
};

// Rope endpoints are authored in world space so a pivot can bind to any point
// along the visible chain, not only to the original start/end. Keep the
// normalized progress alongside the point: generated link counts can change
// when link length is edited, while progress remains stable.
export const ropeEndpointAtPoint = (constraint, point) => {
  const points = (constraint?.pathPoints || [])
    .filter(candidate => Array.isArray(candidate) && Number.isFinite(Number(candidate[0])) && Number.isFinite(Number(candidate[1])))
    .map(candidate => [Number(candidate[0]), Number(candidate[1])]);
  if (!constraint?.id || constraint.objectRef?.kind !== "element" || points.length < 2) return null;
  const target = [finite(point?.[0]), finite(point?.[1])];
  let best = null;
  let distanceBefore = 0;
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const projection = projectPointToSegment(target, start, end);
    if (!best || projection.distance < best.distance) {
      best = {
        point: projection.point,
        distance: projection.distance,
        pointIndex: index - 1,
        progressDistance: distanceBefore + length * projection.t,
      };
    }
    distanceBefore += length;
    totalLength += length;
  }
  if (!best || totalLength <= 1e-6) return null;
  return {
    kind: "rope",
    objectRef: { kind: "element", elementId: constraint.objectRef.elementId },
    constraintId: constraint.id,
    point: [...best.point],
    ropeProgress: Math.max(0, Math.min(1, best.progressDistance / totalLength)),
    distance: best.distance,
  };
};

// The pivot is a separate authored object that deliberately overlaps a body.
// Scene hit-testing is front-to-back, so the body can be reported before the
// small pivot that the user actually clicked. Prefer any non-body object here;
// a prior pivot remains eligible so clicking it updates its relationship.
export const chooseConstraintPivot = elements => (elements || []).find(element => {
  if (!element || element.isDeleted) return false;
  const physics = element.customData?.physics || element.customData?.underscorePhysics;
  return physics?.role !== "body";
}) || null;

// A pivot marker is often drawn around the visible end of a narrow path rather
// than pixel-perfectly centred on it. When a one-body axle contains that path
// endpoint, use the endpoint itself as the authored pivot. Otherwise the
// solver correctly pins an invisible point a few pixels beside the stroke and
// the visible end appears to orbit or "wobble" around a stable axle.
const snapAxlePointToContainedPathEndpoint = (pivot, bodyCandidates, point) => {
  if (bodyCandidates.length !== 1) return point;
  const body = bodyCandidates[0];
  if (!["line", "arrow", "freedraw"].includes(body?.type)) return point;
  const endpoints = getSpringEndpointWorldPoints(body);
  if (!endpoints) return point;
  const threshold = Math.max(4, Math.min(Math.abs(finite(pivot?.width)), Math.abs(finite(pivot?.height))) / 2);
  const candidates = [endpoints.start, endpoints.end]
    .map(endpoint => ({ endpoint, distance: Math.hypot(endpoint[0] - point[0], endpoint[1] - point[1]) }))
    .sort((first, second) => first.distance - second.distance);
  return candidates[0]?.distance <= threshold ? [...candidates[0].endpoint] : point;
};

// Scenes authored before endpoint snapping can contain a mathematically valid
// one-body axle a few pixels beside the visible end of a thick path. Rapier
// keeps that invisible point fixed, so the visible cap orbits it as the body
// rotates and reads as joint wobble. Repair only the narrow legacy case that
// current authoring already snaps: one path body, one World endpoint, and a
// visible endpoint contained by the pivot marker.
export const repairLegacyAxleEndpointAlignment = ({ constraint, pivot, elements = [] }) => {
  if (constraint?.kind !== "axle" || !pivot) return null;
  const objectSide = constraint.a?.kind === "object" && constraint.b?.kind === "world"
    ? "a"
    : constraint.b?.kind === "object" && constraint.a?.kind === "world"
      ? "b"
      : null;
  if (!objectSide) return null;
  const worldSide = objectSide === "a" ? "b" : "a";
  const objectEndpoint = constraint[objectSide];
  const bodyElement = elements.find(element => (
    element?.id === objectEndpoint.objectRef?.elementId && !element.isDeleted
  ));
  if (!bodyElement || !["line", "arrow", "freedraw"].includes(bodyElement.type)) return null;
  const center = getPhysicsElementCenter(pivot);
  const pivotPoint = [center.x, center.y];
  const snapped = snapAxlePointToContainedPathEndpoint(pivot, [bodyElement], pivotPoint);
  if (Math.hypot(snapped[0] - pivotPoint[0], snapped[1] - pivotPoint[1]) < 0.001) return null;
  return {
    pivotPoint: snapped,
    constraint: {
      ...constraint,
      [objectSide]: physicsEndpointAtPoint(bodyElement, snapped),
      [worldSide]: { ...constraint[worldSide], point: [...snapped] },
    },
  };
};

// Constraint tools act on a small visual pivot object. The pivot's centre is
// the anchor and it discovers the topmost one or two overlapping physics
// bodies or nearby rope segments. One target becomes a World constraint; two
// targets become a joint. Axle/Weld can also remain detached for later editing.
export const resolveConstraintPivot = ({ pivot, elements = [], bodies = [], constraints = [], systemId, kind = "axle" }) => {
  if (!pivot?.id) return { error: "Choose a pivot object." };
  const bodyIds = new Set((bodies || [])
    .filter(body => body?.enabled !== false && body?.objectRef?.kind === "element" && (!systemId || body.systemId === systemId))
    .map(body => body.objectRef.elementId));
  const point = getPhysicsElementCenter(pivot);
  const bodyCandidates = [...elements].reverse().filter(element => (
    element?.id !== pivot.id
    && bodyIds.has(element?.id)
    && (
      elementContainsPhysicsPoint(element, [point.x, point.y])
      || physicsElementsOverlap(pivot, element)
    )
  ));
  const ropeCandidates = constraints
    .filter(constraint => constraint?.enabled !== false && constraint?.kind === "rope" && (!systemId || constraint.systemId === systemId))
    .map(constraint => {
      const endpoint = ropeEndpointAtPoint(constraint, [point.x, point.y]);
      return endpoint ? { constraint, endpoint } : null;
    })
    // A control point can be much farther than the visible rope segment when
    // the path was sampled sparsely. Use the segment distance for discovery,
    // then retain a stable progress-based endpoint for the generated links.
    .filter(candidate => candidate
      && candidate.constraint.objectRef?.kind === "element"
      && candidate.constraint.objectRef.elementId !== pivot.id
      && candidate.endpoint.distance <= 14);
  const candidates = [...ropeCandidates, ...bodyCandidates];
  const [first, second] = candidates;
  const anchor = kind === "axle" && !ropeCandidates.length
    ? snapAxlePointToContainedPathEndpoint(pivot, bodyCandidates, [point.x, point.y])
    : [point.x, point.y];
  if (!first && ["axle", "fixate"].includes(kind)) {
    // A pivot is still a useful authored object when it starts detached. The
    // user can choose a body, World, or rope point later from the properties
    // selectors/eyedroppers, so do not make overlap a prerequisite for Axle
    // and Weld creation.
    return {
      pivotPoint: anchor,
      primary: null,
      secondary: null,
      constraint: {
        id: `physics-${kind}-${crypto.randomUUID()}`,
        systemId: String(systemId || ""),
        name: kind === "fixate" ? "Weld" : "Axle",
        kind,
        objectRef: { kind: "element", elementId: pivot.id },
        a: { kind: "none" },
        b: { kind: "none" },
        collideConnected: false,
        limitsEnabled: false,
        lowerLimit: null,
        upperLimit: null,
      },
    };
  }
  if (!first) return { error: "Place the pivot over a physics body or rope control point." };
  const endpointForCandidate = candidate => candidate.constraint
    ? (() => {
      const { distance: _distance, ...endpoint } = candidate.endpoint;
      return endpoint;
    })()
    : physicsEndpointAtPoint(candidate, anchor);
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
      a: endpointForCandidate(first),
      b: second ? endpointForCandidate(second) : first.constraint
        ? { kind: "world", point: [...first.endpoint.point] }
        : { kind: "world", point: anchor },
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

// Ropes use all authored path points to create generated runtime links. The
// rope is otherwise free: pivots can later bind any of these control points.
export const resolveRopeConstraint = ({ rope, elements = [], bodies = [], systemId }) => {
  if (!rope?.id) return { error: "Choose a rope path." };
  const pathPoints = getRopeWorldPoints(rope);
  if (pathPoints.length < 2) return { error: "Rope needs at least two path points." };
  const start = pathPoints[0];
  const end = pathPoints[pathPoints.length - 1];
  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.001) return { error: "Rope needs two distinct endpoints." };
  const restLength = pathPoints.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point[0] - pathPoints[index][0], point[1] - pathPoints[index][1])
  ), 0);
  return {
    endpointPoints: { start, end },
    pathPoints,
    constraint: {
      id: `physics-rope-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Rope",
      kind: "rope",
      objectRef: { kind: "element", elementId: rope.id },
      a: { kind: "none" },
      b: { kind: "none" },
      pathPoints,
      segmentLength: 24,
      thickness: Math.max(2, finite(rope.strokeWidth, 2) + 2),
      collisionLayers: ["default"],
      selfCollisions: false,
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

// An attractor is a first-class authored point object. It does not need to
// overlap a body: its centre is the field origin and its optional tag filter
// selects the dynamic bodies it influences at runtime.
export const resolveAttractorConstraint = ({ attractor, systemId }) => {
  if (!attractor?.id) return { error: "Choose an attractor object." };
  const point = getPhysicsElementCenter(attractor);
  const anchor = [point.x, point.y];
  return {
    pivotPoint: anchor,
    constraint: {
      id: `physics-attractor-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Attractor",
      kind: "attractor",
      objectRef: { kind: "element", elementId: attractor.id },
      a: { kind: "world", point: anchor },
      b: { kind: "world", point: anchor },
      attractionStrength: 20,
      attractionRadius: 300,
      attractionFalloff: 1,
      attractionMode: "attract",
      targetTags: [],
      collideConnected: false,
    },
  };
};

// A tracer is a solver-free diagnostic point. When its visual overlaps a body
// or rope it follows that exact authored endpoint; otherwise it records its
// own fixed scene position. It never creates a Rapier joint or rigid body.
export const resolveTracerConstraint = ({ tracer, elements = [], bodies = [], constraints = [], systemId }) => {
  if (!tracer?.id) return { error: "Choose a tracer object." };
  const point = getPhysicsElementCenter(tracer);
  const anchor = [point.x, point.y];
  const resolved = resolveConstraintPivot({
    pivot: tracer,
    elements,
    bodies,
    constraints,
    systemId,
    kind: "tracer",
  });
  const attachedEndpoint = resolved?.primary ? resolved.constraint.a : null;
  return {
    pivotPoint: anchor,
    primary: resolved?.primary || null,
    constraint: {
      id: `physics-tracer-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Tracer",
      kind: "tracer",
      objectRef: { kind: "element", elementId: tracer.id },
      a: attachedEndpoint || { kind: "world", point: anchor },
      b: { kind: "none" },
      trail: { enabled: true, color: "#4f8cff", duration: 4, opacity: 0.75 },
      collideConnected: false,
    },
  };
};

// A thruster is a two-ended visual. Its start point must sit on a dynamic
// body; its end gives the authored force direction and remains a live visual
// guide as the body rotates.
export const resolveThrusterConstraint = ({ thruster, elements = [], bodies = [], systemId }) => {
  if (!thruster?.id) return { error: "Choose a thruster object." };
  const endpoints = getSpringEndpointWorldPoints(thruster);
  if (!endpoints) return { error: "Thruster needs two distinct endpoints." };
  // A visual can overlap a wall, a sensor, and a dynamic body at once. A
  // thruster needs an impulse receiver, so deliberately ignore any
  // non-dynamic candidates instead of accepting the topmost physics object
  // and silently creating a no-op runtime force.
  const dynamicElementIds = new Set((bodies || [])
    .filter(body => (
      body?.enabled !== false
      && body?.bodyType === "dynamic"
      && body?.collider?.sensor !== true
      && body?.objectRef?.kind === "element"
      && (!systemId || body.systemId === systemId)
    ))
    .map(body => body.objectRef.elementId));
  const primary = bodyCandidatesAtPoint({ visual: thruster, point: endpoints.start, elements, bodies, systemId })
    .find(candidate => dynamicElementIds.has(candidate.id)) || null;
  if (!primary) return { error: "Place the thruster start point on a dynamic body." };
  return {
    endpointPoints: endpoints,
    primary,
    constraint: {
      id: `physics-thruster-${crypto.randomUUID()}`,
      systemId: String(systemId || ""),
      name: "Thruster",
      kind: "thruster",
      objectRef: { kind: "element", elementId: thruster.id },
      a: physicsEndpointAtPoint(primary, endpoints.start),
      b: { kind: "world", point: [...endpoints.end] },
      thrusterForce: 20,
      collideConnected: false,
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
  motorEnabled: constraint.motorEnabled === true,
  motorSpeed: constraint.motorSpeed,
  motorTorque: constraint.motorTorque,
  attractionStrength: constraint.attractionStrength,
  attractionRadius: constraint.attractionRadius,
  attractionFalloff: constraint.attractionFalloff,
  attractionMode: constraint.attractionMode,
  targetTags: constraint.targetTags,
  thrusterForce: constraint.thrusterForce,
  trail: constraint.trail,
  limitsEnabled: constraint.limitsEnabled === true,
  lowerLimit: constraint.lowerLimit ?? null,
  upperLimit: constraint.upperLimit ?? null,
  breakForce: constraint.breakForce ?? null,
  collideConnected: constraint.collideConnected === true,
});
