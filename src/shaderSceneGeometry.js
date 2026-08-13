import { getPhysicsElementWorldPoints } from "./physicsGeometry.js";

export const MAX_SHADER_SEGMENTS = 128;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const rotate = (point, center, angle) => {
  if (!angle) return point;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cosine - dy * sine, center[1] + dx * sine + dy * cosine];
};

const primitiveWorldPoints = element => {
  const x = finite(element?.x);
  const y = finite(element?.y);
  const width = finite(element?.width, 1);
  const height = finite(element?.height, 1);
  const center = [x + width / 2, y + height / 2];
  const angle = finite(element?.angle);
  if (element?.type === "ellipse") {
    const count = 28;
    return Array.from({ length: count }, (_, index) => {
      const theta = index / count * Math.PI * 2;
      return rotate([center[0] + Math.cos(theta) * width / 2, center[1] + Math.sin(theta) * height / 2], center, angle);
    });
  }
  const points = element?.type === "diamond"
    ? [[center[0], y], [x + width, center[1]], [center[0], y + height], [x, center[1]]]
    : [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  return points.map(point => rotate(point, center, angle));
};

const worldPointsForElement = element => {
  if (["line", "arrow", "freedraw"].includes(element?.type) && Array.isArray(element.points)) {
    return getPhysicsElementWorldPoints(element);
  }
  return primitiveWorldPoints(element);
};

const worldToNodeUv = (point, node) => {
  const width = Math.max(1, Math.abs(finite(node?.width, 1)));
  const height = Math.max(1, Math.abs(finite(node?.height, 1)));
  const center = [finite(node?.x) + width / 2, finite(node?.y) + height / 2];
  const unrotated = rotate(point, center, -finite(node?.angle));
  return [
    (unrotated[0] - finite(node?.x)) / width,
    1 - (unrotated[1] - finite(node?.y)) / height,
  ];
};

const segmentNearNode = segment => segment.some(point => (
  point[0] >= -0.35 && point[0] <= 1.35 && point[1] >= -0.35 && point[1] <= 1.35
));

export const DEFAULT_SHADER_SEGMENTS = Object.freeze([
  Object.freeze([0.18, 0.24, 0.42, 0.68]),
  Object.freeze([0.42, 0.68, 0.62, 0.35]),
  Object.freeze([0.62, 0.35, 0.82, 0.72]),
  Object.freeze([0.25, 0.78, 0.72, 0.82]),
]);

export const collectShaderSceneSegments = (elements, node, maximum = MAX_SHADER_SEGMENTS, { fallback = true } = {}) => {
  const segments = [];
  for (const element of elements || []) {
    if (!element || element.id === node?.id || element.isDeleted || element.customData?.outlinerHidden || element.customData?.underscoresLivecode) continue;
    const points = worldPointsForElement(element).map(point => worldToNodeUv(point, node));
    if (points.length < 2) continue;
    const closed = !["line", "arrow", "freedraw"].includes(element.type)
      || Boolean(element.closed)
      || (points.length > 2 && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 0.015);
    const count = closed ? points.length : points.length - 1;
    for (let index = 0; index < count; index += 1) {
      const segment = [points[index], points[(index + 1) % points.length]];
      if (segmentNearNode(segment)) segments.push([
        segment[0][0], segment[0][1], segment[1][0], segment[1][1],
      ]);
      if (segments.length >= maximum) return segments;
    }
  }
  return segments.length || !fallback ? segments : DEFAULT_SHADER_SEGMENTS.map(segment => [...segment]);
};

export const collectShaderWorldSegments = (worldSegments, node, maximum = MAX_SHADER_SEGMENTS) => {
  const segments = [];
  for (const value of worldSegments || []) {
    if (!Array.isArray(value) || value.length < 4 || !value.slice(0, 4).every(item => Number.isFinite(Number(item)))) continue;
    const segment = [
      worldToNodeUv([Number(value[0]), Number(value[1])], node),
      worldToNodeUv([Number(value[2]), Number(value[3])], node),
    ];
    if (!segmentNearNode(segment)) continue;
    segments.push([segment[0][0], segment[0][1], segment[1][0], segment[1][1]]);
    if (segments.length >= maximum) break;
  }
  return segments;
};

export const flattenShaderSegments = (segments, maximum = MAX_SHADER_SEGMENTS) => {
  const values = new Float32Array(maximum * 4);
  (segments || []).slice(0, maximum).forEach((segment, index) => {
    values.set(segment, index * 4);
  });
  return values;
};
