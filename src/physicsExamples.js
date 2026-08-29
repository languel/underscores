import { normalizeRelationshipGraph } from "./relationshipGraph.js";
import { normalizeIannixData } from "./iannixEngine.js";

const route = (id, systemId, collisionClass, frequency, waveform) => ({
  id,
  systemId,
  name: collisionClass === "body-wall" ? "Wall instruments" : "Particle collisions",
  filter: { phases: ["hit"], classes: [collisionClass], minImpulse: 0.2 },
  cooldownMs: collisionClass === "body-wall" ? 35 : 70,
  actions: [{ kind: "synth", frequency, waveform, positionToPitch: true, positionToPan: true, gainScale: 0.002 }],
});

const baseSystem = (id, name, gravity = { x: 0, y: 0 }) => ({ id, name, enabled: true, adapter: "rapier2d", clock: { mode: "realtime", fixedHz: 60, timeScale: 1 }, gravity, seed: 23 });

export const createMusicalGasExample = ({ x = 100, y = 100, width = 720, height = 460, idPrefix = `gas-${crypto.randomUUID()}` } = {}) => {
  const systemId = `${idPrefix}-system`;
  const walls = [
    { id: `${idPrefix}-wall-top`, type: "rectangle", x, y, width, height: 10, backgroundColor: "transparent", strokeColor: "#737985" },
    { id: `${idPrefix}-wall-right`, type: "rectangle", x: x + width - 10, y, width: 10, height, backgroundColor: "transparent", strokeColor: "#737985" },
    { id: `${idPrefix}-wall-bottom`, type: "rectangle", x, y: y + height - 10, width, height: 10, backgroundColor: "transparent", strokeColor: "#737985" },
    { id: `${idPrefix}-wall-left`, type: "rectangle", x, y, width: 10, height, backgroundColor: "transparent", strokeColor: "#737985" },
    { id: `${idPrefix}-string`, type: "freedraw", points: [[x + 80, y + height * 0.62], [x + 180, y + height * 0.48], [x + 300, y + height * 0.54], [x + 430, y + height * 0.42], [x + 610, y + height * 0.58]], strokeColor: "#d66fca", strokeWidth: 3, simulatePressure: false },
  ];
  const bodies = walls.map(spec => ({
    id: `${spec.id}-body`,
    systemId,
    name: spec.id.endsWith("string") ? "String wall" : "Wall",
    bodyType: "fixed",
    tracking: "authored-rigid",
    objectRef: { kind: "element", elementId: spec.id },
    collider: spec.type === "freedraw"
      ? { kind: "polyline", points: spec.points.map(point => [point[0] - (x + width / 2), point[1] - (y + height / 2)]) }
      : { kind: "box", width: spec.width, height: spec.height },
    material: { friction: 0.08, restitution: 0.96 },
    collisionTags: ["wall", spec.id.endsWith("string") ? "string" : "box"],
    initial: spec.type === "freedraw"
      ? { x: x + width / 2, y: y + height / 2 }
      : { x: spec.x + spec.width / 2, y: spec.y + spec.height / 2 },
  }));
  return {
    name: "Musical gas",
    elements: walls,
    graph: normalizeRelationshipGraph({
      systems: [baseSystem(systemId, "Musical gas")],
      bodies,
      populations: [{
        id: `${idPrefix}-particles`,
        systemId,
        name: "Gas particles",
        count: 250,
        seed: 23,
        bounds: { x: x + 25, y: y + 25, width: width - 50, height: height - 50 },
        prototype: {
          id: `${idPrefix}-particle-prototype`,
          systemId,
          bodyType: "dynamic",
          collider: { kind: "circle", radius: 7 },
          material: { density: 0.8, friction: 0.02, restitution: 0.98, linearDamping: 0.002 },
          collisionTags: ["particle"],
          render: { fill: "#5f91f2", opacity: 0.9 },
        },
        spawn: { speedMin: 75, speedMax: 220, angularSpeed: 3 },
      }],
      routes: [
        route(`${idPrefix}-particle-route`, systemId, "body-body", 330, "sine"),
        route(`${idPrefix}-wall-route`, systemId, "body-wall", 110, "triangle"),
      ],
    }),
  };
};

export const createMarionetteExample = ({ x = 180, y = 120, idPrefix = `marionette-${crypto.randomUUID()}` } = {}) => {
  const systemId = `${idPrefix}-system`;
  const parts = [
    { id: `${idPrefix}-head`, type: "ellipse", x: x + 70, y, width: 80, height: 80 },
    { id: `${idPrefix}-body`, type: "rectangle", x: x + 60, y: y + 105, width: 100, height: 150 },
    { id: `${idPrefix}-left-arm`, type: "rectangle", x, y: y + 115, width: 65, height: 22 },
    { id: `${idPrefix}-right-arm`, type: "rectangle", x: x + 155, y: y + 115, width: 65, height: 22 },
  ];
  const bodyByElement = new Map(parts.map(spec => [spec.id, `${spec.id}-body`]));
  const endpoint = elementId => ({ kind: "object", objectRef: elementId, anchor: "center" });
  return {
    name: "Marionette",
    elements: parts,
    graph: normalizeRelationshipGraph({
      systems: [baseSystem(systemId, "Marionette", { x: 0, y: 500 })],
      bodies: parts.map(spec => ({
        id: bodyByElement.get(spec.id), systemId, tracking: "authored-rigid", bodyType: "dynamic", objectRef: spec.id,
        collider: spec.type === "ellipse" ? { kind: "circle", radius: spec.width / 2 } : { kind: "box", width: spec.width, height: spec.height },
        material: { density: 1, friction: 0.4, restitution: 0.1 }, collisionTags: ["marionette"],
        initial: { x: spec.x + spec.width / 2, y: spec.y + spec.height / 2 },
      })),
      constraints: [
        { id: `${idPrefix}-pin`, systemId, kind: "pin", a: { kind: "world", point: [x + 110, y - 35] }, b: endpoint(`${idPrefix}-head`) },
        { id: `${idPrefix}-neck`, systemId, kind: "spring", a: endpoint(`${idPrefix}-head`), b: endpoint(`${idPrefix}-body`), restLength: 95, stiffness: 60, damping: 8 },
        { id: `${idPrefix}-left-shoulder`, systemId, kind: "revolute", a: endpoint(`${idPrefix}-left-arm`), b: endpoint(`${idPrefix}-body`) },
        { id: `${idPrefix}-right-shoulder`, systemId, kind: "revolute", a: endpoint(`${idPrefix}-right-arm`), b: endpoint(`${idPrefix}-body`) },
      ],
    }),
  };
};

export const createPortraitExample = ({ x = 160, y = 120, idPrefix = `portrait-${crypto.randomUUID()}` } = {}) => {
  const systemId = `${idPrefix}-system`;
  const curves = [
    { id: `${idPrefix}-outline`, type: "freedraw", points: [[x + 80, y], [x + 30, y + 50], [x + 20, y + 150], [x + 60, y + 250], [x + 130, y + 290], [x + 200, y + 250], [x + 240, y + 150], [x + 230, y + 50], [x + 180, y]], simulatePressure: false },
    { id: `${idPrefix}-eyes`, type: "freedraw", points: [[x + 55, y + 105], [x + 90, y + 90], [x + 120, y + 108], [x + 155, y + 108], [x + 190, y + 90], [x + 220, y + 105]], simulatePressure: false },
    { id: `${idPrefix}-mouth`, type: "freedraw", points: [[x + 85, y + 215], [x + 130, y + 235], [x + 180, y + 215]], simulatePressure: false },
  ];
  return {
    name: "Stream portrait",
    elements: curves,
    graph: normalizeRelationshipGraph({
      systems: [{ ...baseSystem(systemId, "Stream portrait", { x: 0, y: 0 }), adapter: "geometry" }],
      bodies: curves.map(spec => ({ id: `${spec.id}-deformable`, systemId, tracking: "authored-deformable", bodyType: "kinematic", objectRef: spec.id, collider: { kind: "polyline", points: [] }, collisionTags: ["portrait"] })),
      constraints: [
        { id: `${idPrefix}-face-attractor`, systemId, kind: "attractor", a: { kind: "bezier-anchor", objectRef: `${idPrefix}-outline`, anchorId: "anchor-4" }, b: { kind: "stream", streamId: "physics:fixture:face", featureId: "nose", path: "scene" }, stiffness: 18, damping: 6 },
      ],
    }),
  };
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : minimum));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const pendulumScoreData = (label, duration) => normalizeIannixData({
  role: "trigger",
  active: true,
  label,
  time: {
    start: 0,
    duration,
    rate: 1,
    loopMode: "loop",
  },
  trigger: {
    behavior: "physics-collision",
    midiEnabled: false,
  },
});

const expressivePendulumMapping = ({ id, name, systemId, bobTag, speakerTag, note, panExpression, bodyPrefix }) => ({
  id,
  name,
  enabled: true,
  source: {
    kind: "physics-collision",
    systemId,
    // The scaffold uses contact-begin as its first musical pulse. Rapier's
    // short, constrained bob/speaker contact may not emit a separate force
    // sample on every browser/backend, while begin always remains observable.
    phases: ["begin"],
    // Speakers are authored fixed bodies, so Rapier reports their impacts as
    // body-wall events. Keep body-body as a future-proof option for a later
    // articulated/dynamic speaker variant.
    classes: ["body-wall", "body-body"],
    tagsA: [bobTag],
    tagsB: [speakerTag],
    field: "relativeSpeed",
    range: { min: 0, max: 2400 },
  },
  filter: { min: 20 },
  transform: { outputMin: 24, outputMax: 127, scale: 1, offset: 0, clamp: true },
  target: {
    kind: "expressive-voice",
    mode: "hit",
    program: "bowed",
    noteExpression: String(note),
    gainExpression: "clamp(value / 127, 0.08, 0.8)",
    pressureExpression: `clamp(${bodyPrefix}Speed / 520, 0.12, 1)`,
    brightnessExpression: `clamp(abs(${bodyPrefix}AngularVelocity) / 7, 0.12, 1)`,
    panExpression,
    duration: 0.28,
    minimumHold: 0.03,
  },
  cooldownMs: 90,
  perPair: true,
});

/**
 * Builds a small, deliberately legible Reich-inspired pendulum study. Each
 * pendulum is a native line + bob pair attached to a world axle, with a fixed
 * speaker collider beneath it. Collision mappings turn contact velocity,
 * angular velocity, and position into an expressive-synth hit.
 *
 * The original phase-feedback piece is intentionally not hard-coded here:
 * this is the stable scaffold on which later raw-feedback and double-
 * pendulum variants can be layered without changing the document model.
 */
export const createReichPendulumExample = ({
  x = 100,
  y = 100,
  width = 820,
  height = 540,
  count = 4,
  length = 245,
  bobRadius = 18,
  speakerWidth = 86,
  speakerHeight = 34,
  spacing,
  initialAngles = [-0.22, -0.1, 0.1, 0.22],
  tempo = 60,
  duration = 16,
  idPrefix = `reich-pendulum-${crypto.randomUUID()}`,
} = {}) => {
  const safeCount = clamp(Math.round(finite(count, 4)), 1, 8);
  const safeWidth = Math.max(360, finite(width, 820));
  const safeHeight = Math.max(360, finite(height, 540));
  const safeLength = clamp(length, 100, Math.max(120, safeHeight - 150));
  const safeBobRadius = clamp(bobRadius, 8, 42);
  const safeSpeakerWidth = clamp(speakerWidth, 36, 160);
  const safeSpeakerHeight = clamp(speakerHeight, 18, 80);
  const safeSpacing = Math.max(safeSpeakerWidth + 28, finite(spacing, safeWidth / safeCount));
  const safeTempo = clamp(tempo, 20, 240);
  const safeDuration = clamp(duration, 1, 600);
  const pivotY = y + 68;
  // Position the speaker at the bob's lowest-point tangent. A displaced bob
  // starts above it, gathers speed, and then contacts it near the bottom of
  // the arc. Starting the speaker any higher overlaps the initial collider
  // and can lock the pendulum at time zero.
  const speakerY = pivotY + safeLength + safeBobRadius;
  const systemId = `${idPrefix}-system`;
  const elements = [];
  const bodies = [];
  const constraints = [];
  const mappings = [];
  const pendulums = [];
  const palette = ["#f08c00", "#12aeea", "#d66fca", "#6fba6a", "#8f7aea", "#e86f68", "#4ba3c7", "#d6aa43"];
  const rootX = x + Math.max(0, (safeWidth - safeSpacing * safeCount) / 2) + safeSpacing / 2;
  const baseNote = 48;

  for (let index = 0; index < safeCount; index += 1) {
    const number = index + 1;
    const color = palette[index % palette.length];
    const pivotX = rootX + index * safeSpacing;
    // `angle` is a musical/physical displacement from the vertical. Rapier's
    // box collider and Excalidraw line both use a horizontal zero-angle axis,
    // so convert it once for the authored rigid pose. Keeping that conversion
    // here ensures the visible rod, the body, and its two joint anchors agree.
    const angle = finite(initialAngles[index], index % 2 ? 0.12 : -0.12);
    const physicsAngle = Math.PI / 2 - angle;
    const rodLength = safeLength;
    const endX = pivotX + Math.sin(angle) * rodLength;
    const endY = pivotY + Math.cos(angle) * rodLength;
    const rodId = `${idPrefix}-pendulum-${number}-rod`;
    const bobId = `${idPrefix}-pendulum-${number}-bob`;
    const pivotId = `${idPrefix}-pendulum-${number}-pivot`;
    const speakerId = `${idPrefix}-pendulum-${number}-speaker`;
    const rodCenterX = (pivotX + endX) / 2;
    const rodCenterY = (pivotY + endY) / 2;
    const bobTag = `pendulum-${number}-bob`;
    const speakerTag = `speaker-${number}`;
    const note = baseNote + index * 7;
    const pan = safeCount === 1 ? 0 : (index / (safeCount - 1)) * 2 - 1;
    const label = `Pendulum ${number}`;

    elements.push({
      id: rodId,
      type: "line",
      x: rodCenterX - rodLength / 2,
      y: rodCenterY - 0.5,
      width: rodLength,
      height: 1,
      x2: rodCenterX + rodLength / 2,
      y2: rodCenterY - 0.5,
      angle: physicsAngle,
      strokeColor: color,
      strokeWidth: 4,
      customData: {
        label: `${label} rod`,
        underscoresDemo: { id: "reich-pendulum", role: "rod", index, label },
        score: pendulumScoreData(label, safeDuration),
      },
    });
    elements.push({
      id: bobId,
      type: "ellipse",
      x: endX - safeBobRadius,
      y: endY - safeBobRadius,
      width: safeBobRadius * 2,
      height: safeBobRadius * 2,
      backgroundColor: color,
      fillStyle: "solid",
      strokeColor: color,
      strokeWidth: 2,
      customData: {
        label: `${label} bob`,
        underscoresDemo: { id: "reich-pendulum", role: "bob", index, label, speakerId },
      },
    });
    elements.push({
      id: pivotId,
      type: "ellipse",
      x: pivotX - 7,
      y: pivotY - 7,
      width: 14,
      height: 14,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeColor: color,
      strokeWidth: 2,
      customData: {
        label: `${label} axle`,
        underscoresDemo: { id: "reich-pendulum", role: "axle", index, label },
      },
    });
    elements.push({
      id: speakerId,
      type: "rectangle",
      x: pivotX - safeSpeakerWidth / 2,
      y: speakerY,
      width: safeSpeakerWidth,
      height: safeSpeakerHeight,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeColor: color,
      strokeWidth: 2,
      customData: {
        label: `Speaker ${number}`,
        underscoresDemo: { id: "reich-pendulum", role: "speaker", index, label: `Speaker ${number}` },
      },
    });

    bodies.push({
      id: `${rodId}-body`,
      systemId,
      name: `${label} rod`,
      tracking: "authored-rigid",
      bodyType: "dynamic",
      objectRef: rodId,
      collider: { kind: "box", width: rodLength, height: 6 },
      material: { density: 0.7, friction: 0.18, restitution: 0.42, linearDamping: 0.01, angularDamping: 0.01 },
      collisionTags: ["pendulum", "pendulum-rod", `pendulum-${number}`],
      mappingValues: { note, index, pan },
      initial: { x: rodCenterX, y: rodCenterY, angle: physicsAngle },
      render: { fill: color, stroke: color, strokeWidth: 0, opacity: 1 },
    });
    bodies.push({
      id: `${bobId}-body`,
      systemId,
      name: `${label} bob`,
      tracking: "authored-rigid",
      bodyType: "dynamic",
      objectRef: bobId,
      collider: { kind: "circle", radius: safeBobRadius },
      material: { density: 1.2, friction: 0.22, restitution: 0.7, linearDamping: 0.015, angularDamping: 0.015 },
      collisionTags: ["pendulum", "pendulum-bob", bobTag, `pendulum-${number}`],
      mappingValues: { note, index, pan },
      initial: { x: endX, y: endY, angle: 0 },
      render: { fill: color, stroke: color, strokeWidth: 0, opacity: 1 },
    });
    bodies.push({
      id: `${speakerId}-body`,
      systemId,
      name: `Speaker ${number}`,
      tracking: "authored-rigid",
      bodyType: "fixed",
      objectRef: speakerId,
      collider: { kind: "box", width: safeSpeakerWidth, height: safeSpeakerHeight },
      material: { density: 1, friction: 0.2, restitution: 0.25 },
      collisionTags: ["speaker", speakerTag],
      initial: { x: pivotX, y: speakerY + safeSpeakerHeight / 2, angle: 0 },
      render: { fill: "transparent", stroke: color, strokeWidth: 0, opacity: 1 },
    });
    constraints.push({
      id: `${pivotId}-axle-constraint`,
      systemId,
      name: `${label} axle`,
      kind: "axle",
      objectRef: pivotId,
      a: { kind: "world", point: [pivotX, pivotY] },
      b: { kind: "object", objectRef: rodId, anchor: "local", localPoint: [0, 0.5] },
      motorEnabled: false,
    });
    constraints.push({
      id: `${bobId}-weld-constraint`,
      systemId,
      name: `${label} bob mount`,
      kind: "weld",
      a: { kind: "object", objectRef: rodId, anchor: "local", localPoint: [1, 0.5] },
      b: { kind: "object", objectRef: bobId, anchor: "center" },
      collideConnected: false,
    });
    mappings.push(expressivePendulumMapping({
      id: `${idPrefix}-mapping-${number}-forward`,
      name: `${label} impact → voice`,
      systemId,
      bobTag,
      speakerTag,
      note,
      panExpression: `clamp((x - ${x}) / ${Math.max(1, safeWidth)} * 2 - 1, -1, 1)`,
      bodyPrefix: "a",
    }));
    mappings.push(expressivePendulumMapping({
      id: `${idPrefix}-mapping-${number}-reverse`,
      name: `${label} impact → voice (reverse)`,
      systemId,
      bobTag: speakerTag,
      speakerTag: bobTag,
      note,
      panExpression: `clamp((x - ${x}) / ${Math.max(1, safeWidth)} * 2 - 1, -1, 1)`,
      bodyPrefix: "b",
    }));
    pendulums.push({ number, rodId, bobId, pivotId, speakerId, note, channel: number, angle, label });
  }

  const timelineId = `${idPrefix}-timeline`;
  elements.push({
    id: timelineId,
    type: "line",
    x,
    y: y + safeHeight - 54,
    width: safeWidth,
    height: 1,
    x2: x + safeWidth,
    y2: y + safeHeight - 54,
    strokeColor: "#737985",
    strokeWidth: 2,
    customData: {
      label: "Pendulum phase timeline",
      underscoresDemo: { id: "reich-pendulum", role: "timeline" },
      score: normalizeIannixData({
        role: "curve",
        active: true,
        label: "Pendulum phase timeline",
        time: { start: 0, duration: safeDuration, rate: 1, loopMode: "loop" },
      }),
    },
  });

  return {
    name: "Steve Reich-inspired pendulum study",
    id: "reich-pendulum",
    elements,
    graph: normalizeRelationshipGraph({
      systems: [{
        id: systemId,
        name: "Pendulum music",
        enabled: true,
        playing: false,
        adapter: "rapier2d",
        // Tie this score study to the musical transport.  The loader creates
        // an explicit loop, which keeps both the animation and its collision
        // voices alive for performance rather than stopping at a timeline end.
        clock: { mode: "transport", fixedHz: 60, timeScale: 1 },
        gravity: { x: 0, y: 500 },
        seed: 23,
      }],
      bodies,
      constraints,
      mappings,
    }),
    pendulums,
    timelineId,
    voiceCount: safeCount,
    duration: safeDuration,
    tempo: safeTempo,
    bounds: { x, y, width: safeWidth, height: safeHeight },
    demo: {
      id: "reich-pendulum",
      title: "Steve Reich-inspired pendulum music",
      version: 1,
      phase: "collision-to-expressive-voice",
      futureVariants: ["raw-feedback", "double-pendulum"],
      pendulumCount: safeCount,
      speakerCount: safeCount,
      systemId,
    },
  };
};

export const createPhysicsExample = (kind, options) => {
  if (kind === "marionette") return createMarionetteExample(options);
  if (kind === "portrait") return createPortraitExample(options);
  if (["reich-pendulum", "reich", "pendulum"].includes(kind)) return createReichPendulumExample(options);
  return createMusicalGasExample(options);
};
