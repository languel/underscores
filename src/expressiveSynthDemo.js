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

const makeLine = ({ id, start, end, strokeColor, strokeWidth = 2, iannix }) => {
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  return {
    ...makeBaseElement("line", id, x, y, Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]), strokeColor),
    points: [[start[0] - x, start[1] - y], [end[0] - x, end[1] - y]],
    strokeWidth,
    customData: { iannix: normalizeIannixData(iannix) },
  };
};

const GLISSANDO_LINES = Object.freeze([
  Object.freeze([-0.47, 0.34, 0.47, -0.50]),
  Object.freeze([-0.45, -0.56, 0.22, 0.64]),
  Object.freeze([-0.30, 0.12, 0.43, -0.24]),
  Object.freeze([-0.46, -0.28, 0.48, 0.42]),
  Object.freeze([-0.18, 0.62, 0.06, 0.20]),
  Object.freeze([0.16, 0.36, 0.42, 0.60]),
]);

/**
 * Builds a Metastaseis-inspired continuous glissando study. One cursor sweeps
 * a horizontal timeline. Every blue Trigger is a geometric gate: intersection
 * with the moving vertical cursor starts and sustains one Mixer-track voice,
 * its Y intersection supplies fractional pitch, and leaving its X extent
 * releases the voice.
 */
export const createExpressiveSynthDemoScore = ({
  center = [0, 0],
  width = 720,
  height = 420,
  timelineColor = "#f08c00",
  cursorColor = "#1b1b1f",
  triggerColor = "#12aeea",
  duration = EXPRESSIVE_SYNTH_DEMO_DURATION,
  idPrefix = `expressive_demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
} = {}) => {
  const safeCenter = [Number(center[0]) || 0, Number(center[1]) || 0];
  const safeWidth = Math.max(240, Number(width) || 720);
  const safeHeight = Math.max(160, Number(height) || 420);
  const safeDuration = Math.max(0.1, Number(duration) || EXPRESSIVE_SYNTH_DEMO_DURATION);
  const timelineStart = [safeCenter[0] - safeWidth / 2, safeCenter[1]];
  const timelineEnd = [safeCenter[0] + safeWidth / 2, safeCenter[1]];
  const timelineCurve = makeLine({
    id: `${idPrefix}_timeline`,
    start: timelineStart,
    end: timelineEnd,
    strokeColor: timelineColor,
    strokeWidth: 2.5,
    iannix: {
      role: "curve",
      active: true,
      label: "Timeline",
      midi: { midiChannel: 16, baseNote: 60, pitchRangeOctaves: 2.5 },
      time: { start: 0, duration: safeDuration, rate: 1, loopMode: "loop" },
    },
  });

  const cursorId = `${idPrefix}_cursor`;
  const cursor = makeLine({
    id: cursorId,
    start: [timelineStart[0], safeCenter[1] - safeHeight / 2],
    end: [timelineStart[0], safeCenter[1] + safeHeight / 2],
    strokeColor: "transparent",
    strokeWidth: 2.5,
    iannix: {
      role: "cursor",
      active: true,
      label: "Time cursor",
      midi: { midiChannel: 16, baseNote: 60, pitchRangeOctaves: 2.5, velocity: 100 },
      time: { start: 0, duration: safeDuration, rate: 1, loopMode: "loop" },
      cursor: {
        curveId: timelineCurve.id,
        followTangent: true,
        visualSmoothing: 0.2,
        sourceOpacity: 100,
        sourceStrokeColor: cursorColor,
      },
    },
  });
  cursor.opacity = 0;
  cursor.strokeColor = "transparent";

  const triggers = GLISSANDO_LINES.map((line, index) => makeLine({
    id: `${idPrefix}_glissando_${index + 1}`,
    start: [
      safeCenter[0] + line[0] * safeWidth,
      safeCenter[1] + line[1] * safeHeight,
    ],
    end: [
      safeCenter[0] + line[2] * safeWidth,
      safeCenter[1] + line[3] * safeHeight,
    ],
    strokeColor: triggerColor,
    strokeWidth: 1.5 + index * 0.35,
    iannix: {
      role: "trigger",
      active: true,
      label: `Glissando ${index + 1}`,
      trigger: {
        behavior: "glissando",
        midiEnabled: true,
        midiChannel: index + 1,
        midiBaseSource: "cursor",
        midiVelocity: 88 + index * 5,
      },
    },
  }));

  const [preparedCursor] = reconcileRuntimeCursorHosts([cursor], [timelineCurve, cursor, ...triggers]);
  return {
    elements: [timelineCurve, preparedCursor, ...triggers],
    curves: [timelineCurve],
    timelineCurve,
    cursors: [preparedCursor],
    cursor: preparedCursor,
    triggers,
    duration: safeDuration,
    center: safeCenter,
    voiceCount: triggers.length,
  };
};
