import { normalizeRelationshipGraph } from "./relationshipGraph.js";

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

export const createPhysicsExample = (kind, options) => {
  if (kind === "marionette") return createMarionetteExample(options);
  if (kind === "portrait") return createPortraitExample(options);
  return createMusicalGasExample(options);
};
