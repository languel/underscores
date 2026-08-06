import {
  bezierLocalPointToWorld,
  bezierWorldPointToLocal,
  flattenBezierGeometry,
  getBezierWorldAnchors,
  getBezierWorldPath,
  hasCubicBezierGeometry,
  normalizeBezierGeometry,
  setElementBezierGeometry,
} from "./bezierGeometry.js";
import { normalizePhysicsEndpoint } from "./relationshipGraph.js";

const EPSILON = 1e-7;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, finite(value)));
const lerp = (a, b, amount) => a + (b - a) * amount;
const pointLerp = (a, b, amount) => [lerp(a[0], b[0], amount), lerp(a[1], b[1], amount)];
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const explicitContactSkin = collider => Number.isFinite(Number(collider?.contactSkin))
  ? { contactSkin: Number(collider.contactSkin) }
  : {};

const closedFreehandContour = (element, points, width, height) => {
  if (element?.type !== "freedraw" || points.length < 3) return false;
  // Excalidraw usually repeats the first point at the end of a closed
  // freehand contour. Retain a scale-aware fallback for imported strokes.
  return distance(points[0], points.at(-1)) <= Math.max(2, Math.min(width, height) * 0.08);
};

const distinctPoints = points => points.filter((point, index) => (
  index === 0 || distance(point, points[index - 1]) > EPSILON
));

const rotatePoint = (point, center, angle) => {
  if (!angle) return point;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
};

const localBoundsCenter = points => {
  if (!Array.isArray(points) || !points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = finite(point?.[0]);
    const y = finite(point?.[1]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) && Number.isFinite(minY)
    ? [(minX + maxX) / 2, (minY + maxY) / 2]
    : null;
};

// Linear and freehand elements are allowed to retain points outside their
// width/height frame (notably after point edits, import, or a resize).  Their
// rendered rotation origin is the bounds of those points, not necessarily the
// frame's `[width / 2, height / 2]`. Physics must use the very same origin for
// its body pose and collider-local coordinates or a rotating chain will drift
// away from its drawing.
export const getPhysicsElementLocalCenter = element => {
  if (!element) return [0, 0];
  if (hasCubicBezierGeometry(element)) {
    const path = flattenBezierGeometry(element.customData.draweratorGeometry, 0.35);
    const normalizedCenter = localBoundsCenter(path);
    if (normalizedCenter) {
      return [
        normalizedCenter[0] * finite(element.width),
        normalizedCenter[1] * finite(element.height),
      ];
    }
  }
  const pointCenter = localBoundsCenter(element.points);
  if (pointCenter) return pointCenter;
  return [finite(element.width) / 2, finite(element.height) / 2];
};

export const getPhysicsElementCenter = element => {
  const localCenter = getPhysicsElementLocalCenter(element);
  return [
    finite(element?.x) + localCenter[0],
    finite(element?.y) + localCenter[1],
  ];
};

export const getPhysicsElementWorldPoints = element => {
  if (!element) return [];
  if (hasCubicBezierGeometry(element)) return getBezierWorldPath(element, 1.2);
  if (!Array.isArray(element.points)) return [];
  const center = getPhysicsElementCenter(element);
  return element.points.map(point => rotatePoint([
    finite(element.x) + finite(point?.[0]),
    finite(element.y) + finite(point?.[1]),
  ], center, finite(element.angle)));
};

// Rapier colliders are defined in body-local space and are then transformed by
// the rigid body's pose.  Keep this separate from the world-point helper used
// by endpoint resolution: feeding already-rotated world points to a rotating
// rigid body applies the angle twice and makes moving path chains drift away
// from their authored drawing.
export const getPhysicsElementLocalPoints = element => {
  if (!element) return [];
  const center = getPhysicsElementCenter(element);
  if (hasCubicBezierGeometry(element)) {
    const angle = finite(element.angle);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return getBezierWorldPath(element, 1.2).map(point => {
      const dx = point[0] - center[0];
      const dy = point[1] - center[1];
      return [dx * cos - dy * sin, dx * sin + dy * cos];
    });
  }
  if (!Array.isArray(element.points)) return [];
  const localCenter = getPhysicsElementLocalCenter(element);
  return element.points.map(point => [
    finite(point?.[0]) - localCenter[0],
    finite(point?.[1]) - localCenter[1],
  ]);
};

const sampledColliderPoints = points => {
  const source = distinctPoints(points);
  const maximum = 128;
  if (source.length <= maximum) return source;
  return Array.from({ length: maximum }, (_, index) => source[Math.round(index * (source.length - 1) / (maximum - 1))]);
};

const primitiveConvexColliderPoints = (element, width, height) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  if (element?.type === "ellipse") {
    const segments = 24;
    return Array.from({ length: segments }, (_, index) => {
      const angle = (index / segments) * Math.PI * 2;
      return [Math.cos(angle) * halfWidth, Math.sin(angle) * halfHeight];
    });
  }
  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
};

export const inferPhysicsColliderFromElement = (element, kind = "box", _bodyType = "dynamic") => {
  if (!element) return null;
  const width = Math.max(1, Math.abs(finite(element.width, 1)));
  const height = Math.max(1, Math.abs(finite(element.height, 1)));
  if (kind === "ellipse") return { kind: "ellipse", width, height };
  if (kind === "convex") {
    const points = sampledColliderPoints(getPhysicsElementLocalPoints(element));
    return points.length >= 3
      ? { kind: "convex", points, localOriginVersion: 2 }
      : { kind: "convex", points: primitiveConvexColliderPoints(element, width, height), localOriginVersion: 2 };
  }
  if (kind === "chain") {
    const localPoints = sampledColliderPoints(getPhysicsElementLocalPoints(element));
    if (localPoints.length < 2) return { kind: "box", width, height };
    // A canvas stroke has visible width, so its physical path must too. Both
    // fixed walls and moving paths use a compound chain of rounded segments;
    // a zero-width Rapier polyline lets small bodies slip through its joins.
    return { kind: "chain", points: localPoints, thickness: Math.max(2, finite(element.strokeWidth, 2)), localOriginVersion: 2 };
  }
  return { kind: "box", width, height };
};

// The collider shape is an authored body property.  Re-evaluate its dimensions
// after a paused canvas edit, but never silently switch a user-picked shape
// back to the automatic inference for the drawing.
export const inferPhysicsColliderForBody = (element, body) => {
  const existing = body?.collider;
  if (!existing) return inferPhysicsBodyFromElement(element, body)?.collider || null;
  const sensor = existing.sensor === true;

  // A circle is the automatic default for a round ellipse or closed freehand
  // contour. Keep that convenient default responsive to resize while it still
  // resolves as a circle; after the drawing changes shape, retain the authored
  // circle rather than unexpectedly changing it to a box or hull.
  if (existing.kind === "circle") {
    const inferred = inferPhysicsBodyFromElement(element, body)?.collider;
    return inferred?.kind === "circle"
      ? { ...inferred, sensor, ...explicitContactSkin(existing) }
      : { ...existing, sensor };
  }

  // Fixed path colliders serialize as `polyline`, while the editor exposes the
  // same choice as `chain`. Rebuild either representation from current points.
  const requestedKind = ["polyline", "chain"].includes(existing.kind) ? "chain" : existing.kind;
  const inferred = inferPhysicsColliderFromElement(element, requestedKind, body?.bodyType);
  return inferred ? { ...inferred, sensor, ...explicitContactSkin(existing) } : { ...existing, sensor };
};

// `circle` is a Rapier optimisation of the editor's Bounding ellipse choice.
// HTML selects must only receive values that have an option, otherwise the
// browser displays the first option (Bounding box) despite the actual circle.
export const getPhysicsColliderSelectionValue = (collider, { allowPath = true } = {}) => {
  const kind = collider?.kind;
  if (kind === "circle" || kind === "ellipse") return "ellipse";
  if (kind === "convex") return "convex";
  if (allowPath && (kind === "polyline" || kind === "chain")) return "chain";
  return "box";
};

// Version-1 path colliders were centred on Excalidraw's width/height frame,
// while current colliders are centred on the rendered path bounds. Only
// migrate a legacy record when its reset pose still disagrees with the
// rendered centre. That protects bodies authored immediately before the
// version marker was introduced: they already have the correct canvas pose
// and must not be shifted a second time during hydration.
export const needsLegacyPhysicsColliderOriginRebase = (collider, initial, inferredInitial) => {
  if (![
    "polyline",
    "chain",
    "convex",
  ].includes(collider?.kind) || (collider?.localOriginVersion || 0) >= 2) return false;
  const epsilon = 0.01;
  return Math.abs(finite(initial?.x) - finite(inferredInitial?.x)) > epsilon
    || Math.abs(finite(initial?.y) - finite(inferredInitial?.y)) > epsilon;
};

export const inferPhysicsBodyFromElement = (element, overrides = {}) => {
  if (!element) return null;
  const center = getPhysicsElementCenter(element);
  const width = Math.max(1, Math.abs(finite(element.width, 1)));
  const height = Math.max(1, Math.abs(finite(element.height, 1)));
  let collider;
  let bodyType = overrides.bodyType || "dynamic";
  const freehandPoints = element.type === "freedraw" ? getPhysicsElementWorldPoints(element) : [];
  const localFreehandPoints = element.type === "freedraw" ? getPhysicsElementLocalPoints(element) : [];
  if (closedFreehandContour(element, freehandPoints, width, height)) {
    const nearRound = Math.abs(width - height) <= Math.max(width, height) * 0.16;
    if (nearRound) {
      collider = { kind: "circle", radius: Math.min(width, height) / 2 };
    } else {
      collider = {
        kind: "convex",
        points: distinctPoints(localFreehandPoints),
        // These vertices are already measured from the rendered freehand
        // centre. Flag the same current origin convention used by explicit
        // convex/path-chain selections so hydration does not mistake a new
        // body for an old frame-centred collider and rebase it again.
        localOriginVersion: 2,
      };
    }
  } else if (["line", "arrow", "freedraw"].includes(element.type) || hasCubicBezierGeometry(element)) {
    // A user who explicitly makes an open drawing dynamic or kinematic gets a
    // bounding box by default. Fixed drawings use a solid path chain whose
    // thickness matches the visible canvas stroke.
    if (["dynamic", "kinematic"].includes(overrides.bodyType)) {
      collider = { kind: "box", width, height };
    } else {
      collider = {
        kind: "chain",
        points: getPhysicsElementLocalPoints(element),
        thickness: Math.max(2, finite(element.strokeWidth, 2)),
        localOriginVersion: 2,
      };
      bodyType = "fixed";
    }
  } else if (element.type === "ellipse" && Math.abs(width - height) <= Math.max(width, height) * 0.12) {
    collider = { kind: "circle", radius: Math.min(width, height) / 2 };
  } else {
    collider = { kind: "box", width, height };
  }
  return {
    id: overrides.id || `physics-body-${crypto.randomUUID()}`,
    systemId: String(overrides.systemId || ""),
    name: overrides.name || element.customData?.name || `${element.type} body`,
    enabled: true,
    tracking: overrides.tracking || "authored-rigid",
    bodyType,
    objectRef: { kind: "element", elementId: element.id },
    collider: { ...collider, sensor: overrides.sensor === true },
    material: overrides.material,
    collisionTags: overrides.collisionTags || [],
    initial: {
      x: center[0],
      y: center[1],
      angle: finite(element.angle),
      velocityX: finite(overrides.velocityX),
      velocityY: finite(overrides.velocityY),
      angularVelocity: finite(overrides.angularVelocity),
    },
    render: overrides.render,
  };
};

const pointAtProgress = (points, progress) => {
  if (!points.length) return null;
  if (points.length === 1) return [...points[0]];
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) lengths.push(lengths.at(-1) + distance(points[index - 1], points[index]));
  const total = lengths.at(-1);
  if (total <= EPSILON) return [...points[0]];
  const target = clamp(progress, 0, 1) * total;
  for (let index = 1; index < lengths.length; index += 1) {
    if (target > lengths[index]) continue;
    const span = Math.max(EPSILON, lengths[index] - lengths[index - 1]);
    return pointLerp(points[index - 1], points[index], (target - lengths[index - 1]) / span);
  }
  return [...points.at(-1)];
};

export const resolvePhysicsEndpoint = (endpointValue, { elements = [], streams = null } = {}) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  if (!endpoint) return { ok: false, reason: "invalid-endpoint" };
  if (endpoint.kind === "world") return { ok: true, point: endpoint.point, endpoint };
  if (endpoint.kind === "stream") {
    const value = streams?.get?.(endpoint.streamId, endpoint.featureId) ?? streams?.read?.(endpoint.streamId, endpoint.featureId);
    const path = endpoint.path.split(".").filter(Boolean);
    let resolved = value;
    for (const segment of path) resolved = resolved?.[segment];
    const point = Array.isArray(resolved) ? resolved : [resolved?.x, resolved?.y];
    return Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1]))
      ? { ok: true, point: [Number(point[0]), Number(point[1])], endpoint }
      : { ok: false, reason: "missing-stream-value", endpoint };
  }
  const element = elements.find(candidate => candidate.id === endpoint.objectRef.elementId && !candidate.isDeleted);
  if (!element) return { ok: false, reason: "missing-object", endpoint };
  if (endpoint.kind === "object") {
    if (endpoint.anchor === "center") return { ok: true, point: getPhysicsElementCenter(element), endpoint, element };
    const local = endpoint.localPoint;
    const center = getPhysicsElementCenter(element);
    const unrotated = [element.x + local[0] * element.width, element.y + local[1] * element.height];
    return { ok: true, point: rotatePoint(unrotated, center, finite(element.angle)), endpoint, element };
  }
  if (endpoint.kind === "bezier-anchor") {
    if (!hasCubicBezierGeometry(element)) return { ok: false, reason: "missing-bezier-geometry", endpoint, element };
    const anchor = getBezierWorldAnchors(element).find(candidate => candidate.id === endpoint.anchorId);
    return anchor ? { ok: true, point: anchor.anchor, endpoint, element } : { ok: false, reason: "missing-anchor", endpoint, element };
  }
  const points = getPhysicsElementWorldPoints(element);
  const point = pointAtProgress(points, endpoint.progress);
  return point ? { ok: true, point, endpoint, element } : { ok: false, reason: "missing-curve", endpoint, element };
};

// A visual constraint is authored against an exact point on an object, while
// a running rigid body only exposes its current centre and rotation.  Prefer
// the hydrated `localAnchor` whenever it is available: unlike `localPoint`,
// it is measured from the collider's actual local origin and therefore stays
// coincident for freehand/Bezier shapes whose render bounds differ from their
// Excalidraw frame.  The normal endpoint resolver remains the compatibility
// fallback for legacy records and paused authoring.
export const resolvePhysicsEndpointAtPose = (endpointValue, {
  elements = [],
  bodies = [],
  poseByBodyId = new Map(),
  streams = null,
} = {}) => {
  const endpoint = normalizePhysicsEndpoint(endpointValue);
  if (endpoint?.kind === "object" && Array.isArray(endpoint.localAnchor)) {
    const body = bodies.find(candidate => (
      candidate?.objectRef?.kind === "element"
      && candidate.objectRef.elementId === endpoint.objectRef?.elementId
    ));
    const pose = body ? poseByBodyId?.get?.(body.id) : null;
    if (pose && Number.isFinite(Number(pose.x)) && Number.isFinite(Number(pose.y))) {
      const angle = finite(pose.angle);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const localX = finite(endpoint.localAnchor[0]);
      const localY = finite(endpoint.localAnchor[1]);
      return {
        ok: true,
        point: [
          finite(pose.x) + localX * cosine - localY * sine,
          finite(pose.y) + localX * sine + localY * cosine,
        ],
        endpoint,
        body,
      };
    }
  }
  return resolvePhysicsEndpoint(endpoint, { elements, streams });
};

const seededRandom = seedValue => {
  let state = (Math.round(finite(seedValue, 1)) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
};

const smoothAnchors = (anchors, amount, iterations, closed) => {
  let current = anchors.map(anchor => ({ ...anchor }));
  const blend = clamp(amount, 0, 1);
  for (let pass = 0; pass < Math.max(1, Math.round(iterations)); pass += 1) {
    current = current.map((anchor, index, source) => {
      if (!closed && (index === 0 || index === source.length - 1)) return anchor;
      const previous = source[(index - 1 + source.length) % source.length];
      const next = source[(index + 1) % source.length];
      return {
        ...anchor,
        x: lerp(anchor.x, (previous.x + next.x) / 2, blend),
        y: lerp(anchor.y, (previous.y + next.y) / 2, blend),
      };
    });
  }
  return current;
};

export const applyBezierSculptOperator = (element, operator, options = {}) => {
  if (!hasCubicBezierGeometry(element)) return element;
  const geometry = normalizeBezierGeometry(element.customData.draweratorGeometry);
  let anchors = geometry.anchors.map(anchor => ({ ...anchor, in: anchor.in && [...anchor.in], out: anchor.out && [...anchor.out] }));
  if (operator === "smooth") {
    anchors = smoothAnchors(anchors, finite(options.amount, 0.35), finite(options.iterations, 1), geometry.closed);
  } else if (operator === "randomize") {
    const random = seededRandom(options.seed);
    const amount = Math.max(0, finite(options.amount, 0.02));
    anchors = anchors.map(anchor => ({ ...anchor, x: anchor.x + (random() * 2 - 1) * amount, y: anchor.y + (random() * 2 - 1) * amount }));
  } else if (operator === "attract" || operator === "repel") {
    const worldTarget = [finite(options.point?.[0]), finite(options.point?.[1])];
    const localTarget = bezierWorldPointToLocal(element, worldTarget);
    const radius = Math.max(EPSILON, finite(options.radius, 120) / Math.max(1, Math.abs(element.width), Math.abs(element.height)));
    const amount = clamp(options.amount ?? 0.25, 0, 1) * (operator === "repel" ? -1 : 1);
    anchors = anchors.map(anchor => {
      const delta = [localTarget[0] - anchor.x, localTarget[1] - anchor.y];
      const d = Math.hypot(...delta);
      const influence = d >= radius ? 0 : (1 - d / radius) * amount;
      return { ...anchor, x: anchor.x + delta[0] * influence, y: anchor.y + delta[1] * influence };
    });
  } else if (operator === "morph") {
    const target = options.targetElement;
    if (!target || !hasCubicBezierGeometry(target)) return element;
    const targetWorld = getBezierWorldPath(target, 1);
    const amount = clamp(options.amount ?? 1, 0, 1);
    anchors = anchors.map((anchor, index) => {
      const targetPoint = pointAtProgress(targetWorld, anchors.length <= 1 ? 0 : index / (anchors.length - 1));
      if (!targetPoint) return anchor;
      const local = bezierWorldPointToLocal(element, targetPoint);
      return { ...anchor, x: lerp(anchor.x, local[0], amount), y: lerp(anchor.y, local[1], amount) };
    });
  } else {
    throw new Error(`Unknown Bézier sculpt operator: ${operator}`);
  }
  return setElementBezierGeometry(element, { ...geometry, revision: geometry.revision + 1, anchors });
};

export const applyAnchorAttractorFrame = (element, targets = [], deltaSeconds = 1 / 60) => {
  if (!hasCubicBezierGeometry(element) || !targets.length) return element;
  const geometry = normalizeBezierGeometry(element.customData.draweratorGeometry);
  const targetById = new Map(targets.map(target => [target.anchorId, target]));
  const anchors = geometry.anchors.map(anchor => {
    const target = targetById.get(anchor.id);
    if (!target?.point) return anchor;
    const local = bezierWorldPointToLocal(element, target.point);
    const stiffness = Math.max(0, finite(target.stiffness, 18));
    const amount = 1 - Math.exp(-stiffness * Math.max(0, deltaSeconds));
    return { ...anchor, x: lerp(anchor.x, local[0], amount), y: lerp(anchor.y, local[1], amount) };
  });
  return setElementBezierGeometry(element, { ...geometry, anchors });
};

export const sampleBezierWorldAtProgress = (element, progress) => pointAtProgress(getBezierWorldPath(element, 1), progress);
export const projectWorldPointToBezierLocal = (element, point) => bezierWorldPointToLocal(element, point);
export const projectBezierLocalPointToWorld = (element, point) => bezierLocalPointToWorld(element, point);
export const flattenNormalizedBezier = geometry => flattenBezierGeometry(geometry, 0.003);
