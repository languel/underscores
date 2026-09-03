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
    { id: `${idPrefix}-head`, type: "ellipse", x: x + 70, y, width: 80, height: 80, backgroundColor: "#f2df55", strokeColor: "#f2df55", strokeWidth: 3 },
    { id: `${idPrefix}-body`, type: "rectangle", x: x + 60, y: y + 105, width: 100, height: 150, backgroundColor: "#e86f68", strokeColor: "#e86f68", strokeWidth: 3 },
    { id: `${idPrefix}-left-arm`, type: "rectangle", x, y: y + 115, width: 65, height: 22, backgroundColor: "#6fa5ff", strokeColor: "#6fa5ff", strokeWidth: 3 },
    { id: `${idPrefix}-right-arm`, type: "rectangle", x: x + 155, y: y + 115, width: 65, height: 22, backgroundColor: "#6ee795", strokeColor: "#6ee795", strokeWidth: 3 },
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

// Collision filtering here uses raw Rapier group/mask bits rather than the
// named layer stack: an example's graph is merged into whatever world the
// patch already has, and `world` is deliberately not part of that merge, so a
// named layer would not survive. Puppet parts therefore never collide with
// each other, both collide with the mobile, and the mobile's own shapes clink
// together like a wind chime.
const WAYANG_PUPPET_BITS = Object.freeze({ collisionGroup: 0b0001, collisionMask: 0b0010 });
const WAYANG_MOBILE_BITS = Object.freeze({ collisionGroup: 0b0010, collisionMask: 0b0011 });

// Slendro-inspired five-tone steps. This is an approximation for a teaching
// patch, not a claim to reproduce a tuned gamelan: real slendro is close to
// equidistant and varies by ensemble.
const WAYANG_SCALE_DEGREES = "0, 2, 5, 7, 9";

const wayangChimeMapping = ({ id, name, systemId, tagsA, tagsB, root, program, duration, gain }) => ({
  id,
  name,
  enabled: true,
  source: {
    kind: "physics-collision",
    systemId,
    // Contact-begin is the strike. A chime that stays in contact should not
    // retrigger, so the pair gate plus a cooldown keeps one hit per approach.
    phases: ["begin"],
    classes: ["body-body"],
    tagsA,
    tagsB,
    field: "relativeSpeed",
    range: { min: 0, max: 900 },
  },
  filter: { min: 12 },
  transform: { outputMin: 1, outputMax: 127, scale: 1, offset: 0, clamp: true },
  target: {
    kind: "expressive-voice",
    mode: "hit",
    program,
    // Contact height picks the pitch, so the top of the mobile rings higher
    // than its lowest hanging shape, the way a real set of chimes does.
    noteExpression: `scale(${root}, floor(clamp(4 - normalY * 2 + norm * 3, 0, 9)), ${WAYANG_SCALE_DEGREES})`,
    gainExpression: `clamp(value / 127, 0.06, ${gain})`,
    pressureExpression: "clamp(speed / 600, 0.15, 1)",
    brightnessExpression: "clamp(impulse / 40, 0.2, 1)",
    panExpression: "clamp((x / 500) - 1, -1, 1)",
    duration,
    minimumHold: 0.02,
  },
  cooldownMs: 110,
  perPair: true,
});

/**
 * A wayang-style rod puppet facing a Calder mobile hung with Miro-flavoured
 * shapes. The puppet is articulated the way a wayang kulit figure is — a body
 * that swings on one rod, with two-segment arms — so a lifted hand can reach
 * across and strike the mobile. Both arms are ordinary dynamic bodies, which
 * is what lets the mouse, Live pose, or a MediaPipe controller drive the rig.
 */
export const createWayangMobileExample = ({ x = 0, y = 0, idPrefix = `wayang-${crypto.randomUUID()}` } = {}) => {
  const systemId = `${idPrefix}-system`;
  const endpoint = (elementId, u, v) => ({ kind: "object", objectRef: elementId, anchor: "local", localPoint: [u, v] });
  const anchorPoint = (spec, u, v) => ({ x: spec.x + spec.width * u, y: spec.y + spec.height * v });

  // Place a limb so its authored local anchor lands exactly on `pivot` after
  // the element is rotated about its centre. Authoring the arms already
  // hanging keeps the rest pose compact, which is what leaves the right half
  // of the composition free for the mobile; a T-pose would author the arms
  // straight through the wires.
  const limbAt = (pivot, angle, u, v, width, height) => {
    const offsetX = (u - 0.5) * width;
    const offsetY = (v - 0.5) * height;
    const centreX = pivot.x - (offsetX * Math.cos(angle) - offsetY * Math.sin(angle));
    const centreY = pivot.y - (offsetX * Math.sin(angle) + offsetY * Math.cos(angle));
    return { x: centreX - width / 2, y: centreY - height / 2, width, height, angle };
  };

  // --- Puppet. One world hinge at the top of the body, a welded head, and two
  // two-segment arms hanging from shoulder and elbow hinges.
  const torso = { x: x + 118, y: y + 96, width: 56, height: 148 };
  const head = { x: x + 122, y: y + 26, width: 48, height: 58 };
  const shoulderY = torso.y + 24;
  const armLength = 66;
  const armThickness = 15;
  const leftShoulder = { x: torso.x, y: shoulderY };
  const rightShoulder = { x: torso.x + torso.width, y: shoulderY };
  const leftElbow = { x: leftShoulder.x, y: leftShoulder.y + armLength };
  const rightElbow = { x: rightShoulder.x, y: rightShoulder.y + armLength };
  const upperLeft = limbAt(leftShoulder, -Math.PI / 2, 1, 0.5, armLength, armThickness);
  const foreLeft = limbAt(leftElbow, -Math.PI / 2, 1, 0.5, armLength, armThickness);
  const upperRight = limbAt(rightShoulder, Math.PI / 2, 0, 0.5, armLength, armThickness);
  const foreRight = limbAt(rightElbow, Math.PI / 2, 0, 0.5, armLength, armThickness);
  const shoulderV = (shoulderY - torso.y) / torso.height;

  // --- Mobile. Every wire is a real body with a hinge at each end, which is
  // how a Calder mobile is actually built: without them a bar hung from one
  // distance link is free to rotate about that single point and the whole
  // assembly flails instead of swinging.
  const WIRE = 3;
  const topBar = { x: x + 240, y: y + 44, width: 210, height: 9 };
  const subBar = { width: 130, height: 7 };
  const wires = [];
  const loads = [];
  const hangs = [];

  // Hang `load` from `anchor` on a vertical wire, deriving the load's position
  // so the wire is straight and both hinge anchors coincide exactly.
  const hang = (id, anchor, wireLength, load, loadU, loadV) => {
    const wire = { id: `${idPrefix}-wire-${id}`, type: "rectangle", x: anchor.x - WIRE / 2, y: anchor.y, width: WIRE, height: wireLength };
    const placed = { ...load, x: anchor.x - load.width * loadU, y: anchor.y + wireLength - load.height * loadV };
    wires.push(wire);
    hangs.push({ id, wire, load: placed, loadU, loadV });
    return placed;
  };

  const topLeft = anchorPoint(topBar, 0.02, 1);
  const topRight = anchorPoint(topBar, 0.98, 1);
  const discRed = hang("red", topLeft, 100, { id: `${idPrefix}-disc-red`, type: "ellipse", width: 60, height: 60, backgroundColor: "#d8322b" }, 0.5, 0);
  const discBlack = hang("black", anchorPoint(discRed, 0.5, 1), 28, { id: `${idPrefix}-disc-black`, type: "ellipse", width: 28, height: 28, backgroundColor: "#161616" }, 0.5, 0);
  const subBarPlaced = hang("sub", topRight, 80, { id: `${idPrefix}-sub-bar`, type: "rectangle", ...subBar, backgroundColor: "#161616" }, 0.5, 0);
  const discBlue = hang("blue", anchorPoint(subBarPlaced, 0.04, 1), 62, { id: `${idPrefix}-disc-blue`, type: "ellipse", width: 44, height: 72, backgroundColor: "#2f5fd0" }, 0.5, 0);
  const discYellow = hang("yellow", anchorPoint(subBarPlaced, 0.96, 1), 46, { id: `${idPrefix}-disc-yellow`, type: "ellipse", width: 56, height: 56, backgroundColor: "#f0c419" }, 0.5, 0);
  loads.push(discRed, discBlack, subBarPlaced, discBlue, discYellow);

  const DENSITY = Object.freeze({ bar: 0.5, chime: 0.7, wire: 0.35 });
  const densityOf = spec => (spec.width <= WIRE ? DENSITY.wire : spec.type === "ellipse" ? DENSITY.chime : DENSITY.bar);
  // Collider area, not drawn area: an ellipse gets a circle of its minor axis.
  const massOf = spec => (spec.type === "ellipse"
    ? Math.PI * (Math.min(spec.width, spec.height) / 2) ** 2
    : spec.width * spec.height) * densityOf(spec);

  // A mobile balances at the centre of mass of everything it carries, so the
  // world hook is derived rather than guessed. Each sub-assembly's weight acts
  // at the point it hangs from.
  const leftLoad = [wires[0], discRed, wires[1], discBlack].reduce((total, spec) => total + massOf(spec), 0);
  const rightLoad = [wires[2], subBarPlaced, wires[3], discBlue, wires[4], discYellow].reduce((total, spec) => total + massOf(spec), 0);
  const barMass = massOf(topBar);
  const topPivotU = (leftLoad * 0.02 + rightLoad * 0.98 + barMass * 0.5) / (leftLoad + rightLoad + barMass);

  // Readable names so Outliner, Properties, and the debug overlay label the rig
  // instead of showing generated ids.
  const NAMES = Object.freeze({
    head: "Puppet head", torso: "Puppet body",
    "upper-left": "Left upper arm", "fore-left": "Left hand",
    "upper-right": "Right upper arm", "fore-right": "Right hand",
    "top-bar": "Mobile top bar", "sub-bar": "Mobile sub bar",
    "wire-red": "Red chime wire", "wire-black": "Counterweight wire", "wire-sub": "Sub bar wire",
    "wire-blue": "Blue chime wire", "wire-yellow": "Yellow chime wire",
    "disc-red": "Red chime", "disc-blue": "Blue chime", "disc-yellow": "Yellow chime", "disc-black": "Counterweight",
  });

  const parts = [
    { id: `${idPrefix}-head`, type: "ellipse", ...head, backgroundColor: "#d9b34a", group: "puppet" },
    { id: `${idPrefix}-torso`, type: "rectangle", ...torso, backgroundColor: "#b8452f", group: "puppet" },
    { id: `${idPrefix}-upper-left`, type: "rectangle", ...upperLeft, backgroundColor: "#c96a3c", group: "puppet" },
    { id: `${idPrefix}-fore-left`, type: "rectangle", ...foreLeft, backgroundColor: "#e0a04b", group: "hand" },
    { id: `${idPrefix}-upper-right`, type: "rectangle", ...upperRight, backgroundColor: "#c96a3c", group: "puppet" },
    { id: `${idPrefix}-fore-right`, type: "rectangle", ...foreRight, backgroundColor: "#e0a04b", group: "hand" },
    { id: `${idPrefix}-top-bar`, type: "rectangle", ...topBar, backgroundColor: "#161616", group: "bar" },
    ...wires.map(wire => ({ ...wire, backgroundColor: "#161616", group: "wire" })),
    { ...subBarPlaced, group: "bar" },
    { ...discRed, group: "chime" },
    { ...discBlue, group: "chime" },
    { ...discYellow, group: "chime" },
    { ...discBlack, group: "chime" },
  ].map(spec => ({
    strokeColor: "#161616",
    strokeWidth: 2,
    ...spec,
    // Outliner and Properties read `underscoresLabel`; the script canvas API
    // reads `label`. Set both so the rig is named wherever a learner looks.
    customData: (name => ({ label: name, underscoresLabel: name }))(NAMES[spec.id.slice(idPrefix.length + 1)] || "Wayang part"),
  }));

  // Damping stands in for air and for the friction of a real rod and wire.
  // Without it the mobile is an almost lossless compound pendulum: it keeps
  // swinging long after a strike and never settles into a rest pose.
  const roleOf = spec => {
    if (spec.group === "hand") return { name: "Puppet hand", tags: ["wayang", "wayang-hand"], bits: WAYANG_PUPPET_BITS, material: { density: 1.4, friction: 0.4, restitution: 0.2, linearDamping: 0.9, angularDamping: 1.6 } };
    if (spec.group === "puppet") return { name: "Puppet part", tags: ["wayang"], bits: WAYANG_PUPPET_BITS, material: { density: 1, friction: 0.4, restitution: 0.1, linearDamping: 1.1, angularDamping: 2.2 } };
    if (spec.group === "wire") return { name: "Mobile wire", tags: ["mobile", "mobile-wire"], bits: WAYANG_MOBILE_BITS, material: { density: DENSITY.wire, friction: 0.3, restitution: 0.1, linearDamping: 0.6, angularDamping: 1.1 } };
    if (spec.group === "bar") return { name: "Mobile bar", tags: ["mobile", "mobile-bar"], bits: WAYANG_MOBILE_BITS, material: { density: DENSITY.bar, friction: 0.3, restitution: 0.3, linearDamping: 0.5, angularDamping: 0.9 } };
    return { name: "Mobile chime", tags: ["mobile", "mobile-chime"], bits: WAYANG_MOBILE_BITS, material: { density: DENSITY.chime, friction: 0.25, restitution: 0.62, linearDamping: 0.4, angularDamping: 0.7 } };
  };

  const hangConstraints = hangs.flatMap(({ id: hangId, wire, load, loadU, loadV }) => {
    const parent = hangId === "red" || hangId === "sub" ? `${idPrefix}-top-bar` : hangId === "black" ? `${idPrefix}-disc-red` : subBarPlaced.id;
    const parentAnchor = hangId === "red" ? [0.02, 1] : hangId === "sub" ? [0.98, 1] : hangId === "black" ? [0.5, 1] : hangId === "blue" ? [0.04, 1] : [0.96, 1];
    return [
      { id: `${wire.id}-top`, systemId, name: `${load.id.split("-").pop()} wire hook`, kind: "revolute", a: endpoint(wire.id, 0.5, 0), b: endpoint(parent, parentAnchor[0], parentAnchor[1]) },
      { id: `${wire.id}-bottom`, systemId, name: `${load.id.split("-").pop()} wire eye`, kind: "revolute", a: endpoint(wire.id, 0.5, 1), b: endpoint(load.id, loadU, loadV) },
    ];
  });

  return {
    name: "Wayang and mobile",
    // `group` is authoring metadata for role assignment; it never reaches the scene.
    elements: parts.map(({ group: _group, ...spec }) => ({ ...spec, roughness: 0, fillStyle: "solid" })),
    graph: normalizeRelationshipGraph({
      systems: [baseSystem(systemId, "Wayang and mobile", { x: 0, y: 620 })],
      bodies: parts.map(spec => {
        const role = roleOf(spec);
        return {
          id: `${spec.id}-body`,
          systemId,
          name: role.name,
          tracking: "authored-rigid",
          bodyType: "dynamic",
          objectRef: spec.id,
          // A small contact skin keeps thin bars and fast hands from tunnelling
          // past a chime at the moment of a strike.
          collider: spec.type === "ellipse"
            ? { kind: "circle", radius: Math.min(spec.width, spec.height) / 2, contactSkin: 1 }
            : { kind: "box", width: spec.width, height: spec.height, contactSkin: 1 },
          material: role.material,
          collisionTags: role.tags,
          collisionGroup: role.bits.collisionGroup,
          collisionMask: role.bits.collisionMask,
          initial: { x: spec.x + spec.width / 2, y: spec.y + spec.height / 2, angle: spec.angle || 0 },
        };
      }),
      constraints: [
        // The puppet hangs from one world hinge at the top of its body, so the
        // whole figure sways the way a rod puppet does when it is carried.
        {
          id: `${idPrefix}-body-rod`, systemId, name: "Body rod", kind: "revolute",
          a: { kind: "world", point: [torso.x + torso.width / 2, torso.y + 6] },
          b: endpoint(`${idPrefix}-torso`, 0.5, 6 / torso.height),
        },
        {
          id: `${idPrefix}-neck`, systemId, name: "Neck", kind: "weld",
          a: endpoint(`${idPrefix}-head`, 0.5, 1),
          b: endpoint(`${idPrefix}-torso`, 0.5, 0),
        },
        {
          id: `${idPrefix}-shoulder-left`, systemId, name: "Left shoulder", kind: "revolute",
          a: endpoint(`${idPrefix}-upper-left`, 1, 0.5),
          b: endpoint(`${idPrefix}-torso`, 0, shoulderV),
        },
        {
          id: `${idPrefix}-elbow-left`, systemId, name: "Left elbow", kind: "revolute",
          a: endpoint(`${idPrefix}-fore-left`, 1, 0.5),
          b: endpoint(`${idPrefix}-upper-left`, 0, 0.5),
        },
        {
          id: `${idPrefix}-shoulder-right`, systemId, name: "Right shoulder", kind: "revolute",
          a: endpoint(`${idPrefix}-upper-right`, 0, 0.5),
          b: endpoint(`${idPrefix}-torso`, 1, shoulderV),
        },
        {
          id: `${idPrefix}-elbow-right`, systemId, name: "Right elbow", kind: "revolute",
          a: endpoint(`${idPrefix}-fore-right`, 0, 0.5),
          b: endpoint(`${idPrefix}-upper-right`, 1, 0.5),
        },
        {
          id: `${idPrefix}-mobile-hook`, systemId, name: "Mobile hook", kind: "revolute",
          a: { kind: "world", point: [topBar.x + topBar.width * topPivotU, topBar.y + topBar.height / 2] },
          b: endpoint(`${idPrefix}-top-bar`, topPivotU, 0.5),
        },
        ...hangConstraints,
      ],
      mappings: [
        wayangChimeMapping({
          id: `${idPrefix}-strike`, name: "Hand strikes mobile", systemId,
          tagsA: ["wayang-hand"], tagsB: ["mobile-chime"],
          root: 55, program: "fm", duration: 1.1, gain: 0.72,
        }),
        wayangChimeMapping({
          id: `${idPrefix}-chime`, name: "Mobile shapes meet", systemId,
          tagsA: ["mobile-chime"], tagsB: ["mobile-chime"],
          root: 67, program: "fm", duration: 0.7, gain: 0.36,
        }),
      ],
    }),
    systemId,
    reach: { shoulder: rightShoulder, radius: armLength * 2 },
    bounds: { x, y, width: 560, height: 300 },
  };
};

export const createPhysicsExample = (kind, options) => {
  if (kind === "marionette") return createMarionetteExample(options);
  if (["wayang", "wayang-mobile", "mobile"].includes(kind)) return createWayangMobileExample(options);
  if (kind === "portrait") return createPortraitExample(options);
  if (["reich-pendulum", "reich", "pendulum"].includes(kind)) return createReichPendulumExample(options);
  return createMusicalGasExample(options);
};
