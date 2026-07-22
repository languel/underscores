import { normalizeIannixData, reconcileRuntimeCursorHosts } from "./iannixEngine.js";

export const EXPRESSIVE_SYNTH_DEMO_DURATION = 12;
export const EXPRESSIVE_SYNTH_DEMO_VOICE_COUNT = 6;

const makeBaseElement = (type, id, x, y, width, height, strokeColor) => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor,
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: Math.floor(Math.random() * 1000000),
  version: 1,
  versionNonce: Math.floor(Math.random() * 1000000),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
  startBinding: null,
  endBinding: null,
  lastCommittedPoint: null,
});

const makeIdFactory = prefix => {
  let index = 0;
  return kind => `${prefix}_${kind}_${index++}`;
};

const DEMO_PATHS = Object.freeze([
  [-1.00, -0.18, 0.72, -0.48],
  [-0.66, -0.11, 0.46, -0.24],
  [-0.32, -0.04, 0.20, 0.02],
  [0.32, 0.04, -0.20, -0.02],
  [0.66, 0.11, -0.46, 0.24],
  [1.00, 0.18, -0.72, 0.48],
]);

/**
 * Builds a compact Metastaseis-inspired study: six independent polyline
 * glissandi, each with its own linked runtime cursor and therefore its own
 * Expressive Synth voice. The returned objects use the same IanniX metadata
 * and real cursor-host geometry as manually authored score objects.
 */
export const createExpressiveSynthDemoScore = ({
  center = [0, 0],
  width = 720,
  height = 360,
  strokeColor = "#1b1b1f",
  cursorColor = "#ff3b0a",
  duration = EXPRESSIVE_SYNTH_DEMO_DURATION,
  idPrefix = `expressive_demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
} = {}) => {
  const safeCenter = [Number(center[0]) || 0, Number(center[1]) || 0];
  const safeWidth = Math.max(240, Number(width) || 720);
  const safeHeight = Math.max(160, Number(height) || 360);
  const safeDuration = Math.max(0.1, Number(duration) || EXPRESSIVE_SYNTH_DEMO_DURATION);
  const nextId = makeIdFactory(idPrefix);
  const curves = [];
  const cursors = [];

  DEMO_PATHS.forEach((shape, index) => {
    const worldPoints = shape.map((vertical, pointIndex) => [
      safeCenter[0] - safeWidth / 2 + safeWidth * pointIndex / (shape.length - 1),
      safeCenter[1] + vertical * safeHeight * 0.42,
    ]);
    const minX = Math.min(...worldPoints.map(point => point[0]));
    const minY = Math.min(...worldPoints.map(point => point[1]));
    const maxX = Math.max(...worldPoints.map(point => point[0]));
    const maxY = Math.max(...worldPoints.map(point => point[1]));
    const curveId = nextId("curve");
    const cursorId = nextId("cursor");
    const curveWidth = 1 + index * 0.55;
    const curve = {
      ...makeBaseElement("line", curveId, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), strokeColor),
      points: worldPoints.map(point => [point[0] - minX, point[1] - minY]),
      strokeWidth: curveWidth,
      customData: {
        iannix: normalizeIannixData({
          role: "curve",
          active: true,
          label: `Glissando ${index + 1}`,
          time: { start: 0, duration: safeDuration, rate: 1, loopMode: "pingPong" },
        }),
      },
    };
    const cursorLength = 20;
    const cursor = {
      ...makeBaseElement("line", cursorId, worldPoints[0][0], worldPoints[0][1] - cursorLength / 2, 0, cursorLength, "transparent"),
      points: [[0, 0], [0, cursorLength]],
      strokeWidth: Math.max(1.5, curveWidth),
      strokeColor: "transparent",
      opacity: 0,
      customData: {
        iannix: normalizeIannixData({
          role: "cursor",
          active: true,
          label: `Voice ${index + 1}`,
          time: { start: 0, duration: safeDuration, rate: 1, loopMode: "pingPong" },
          cursor: {
            curveId,
            followTangent: true,
            visualSmoothing: 0.45,
            sourceOpacity: 100,
            sourceStrokeColor: cursorColor,
          },
        }),
      },
    };
    curves.push(curve);
    cursors.push(cursor);
  });

  const elements = reconcileRuntimeCursorHosts(cursors, [...curves, ...cursors]);
  return {
    elements: [...curves, ...elements],
    curves,
    cursors: elements,
    duration: safeDuration,
    center: safeCenter,
    voiceCount: elements.length,
  };
};
