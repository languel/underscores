import { useMemo, useState } from "react";
import InspectorSection from "./InspectorSection.jsx";
import { createDefaultPhysicsSystem, normalizePhysicsConstraint, normalizeRelationshipGraph, normalizeRelationshipMapping } from "./relationshipGraph.js";
import { compileMappingExpression } from "./mappingExpression.js";
import { getPhysicsColliderSelectionValue } from "./physicsGeometry.js";
import { infoProps } from "./uiInfo.js";

const Button = ({ children, active = false, ...props }) => <button type="button" className={`iannix-flat-button physics-flat-button${active ? " active" : ""}`} {...props}>{children}</button>;

const COLLISION_FORMULA_VALUES = "Values: raw (selected source field), norm (source range normalized), value (transformed output), impulse, speed (relative impact speed), x/y (contact point), normalX/normalY; aX/aY/aVx/aVy/aSpeed and bX/bY/bVx/bVy/bSpeed; a/b angle, angular velocity, mass, friction, bounce, density; object note as aNote/noteA and bNote/noteB; gravityX/gravityY, worldTime, step, timeScale, simSpeed, pixelsPerMeter.";
const FORMULA_LANGUAGE = "Safe language: numbers, arithmetic, comparisons, &&, ||, !, parentheses, if, abs, min, max, clamp, round, floor, ceil, pow. No JavaScript or object access.";
const FORMULA_HELP = Object.freeze({
  filter: `Returns non-zero to pass the event. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  transform: `Returns the mapped output before the target consumes it. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  pitch: `Returns a MIDI note. baseNote is the Note control above. ${COLLISION_FORMULA_VALUES} Scale helpers: major(root, degree), minor(root, degree), pentatonic(root, degree), or scale(root, degree, semitone0, ...). ${FORMULA_LANGUAGE}`,
  velocity: `Returns MIDI velocity from 1 to 127. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  cc: `Returns a MIDI CC value from 0 to 127. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  bend: `Returns a MIDI 1 pitch bend value from 0 to 16383; centre is 8192. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  voiceNote: `Returns an Expressive Synth MIDI note. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  voiceGain: `Returns an Expressive Synth gain, normally 0 to 1. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  voicePressure: `Returns an Expressive Synth pressure, normally 0 to 1. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  voiceBrightness: `Returns an Expressive Synth brightness, normally 0 to 1. ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
  voicePan: `Returns an Expressive Synth pan from -1 (left) to 1 (right). ${COLLISION_FORMULA_VALUES} ${FORMULA_LANGUAGE}`,
});
const FORMULA_EXAMPLES = Object.freeze({
  filter: ["impulse > 0.3 && aSpeed > 20"],
  transform: ["clamp(norm * 127, 1, 127)"],
  pitch: ["major(baseNote, floor(speed / 12))", "pentatonic(baseNote, floor(x / 150))", "pentatonic((noteA + noteB) / 2, floor(speed / 12))"],
  velocity: ["clamp(20 + speed * 2, 1, 127)"],
  cc: ["round(clamp((x / 1000) * 127, 0, 127))"],
  bend: ["round(clamp(8192 + normalX * 8191, 0, 16383))"],
  voiceNote: ["major(60, floor(aSpeed / 12))"],
  voiceGain: ["clamp(impulse / 10, 0, 1)"],
  voicePressure: ["clamp(norm, 0, 1)"],
  voiceBrightness: ["clamp(aSpeed / 240, 0, 1)"],
  voicePan: ["clamp((x / 500) - 1, -1, 1)"],
});

export default function PhysicsPanel({
  graph: graphValue,
  activeSystemId,
  onActiveSystemChange,
  selectedElementCount = 0,
  selectedElementIds = {},
  activeTool = null,
  telemetry = {},
  debug = {},
  onDebugChange,
  onSetGraph,
  onPatchBody,
  onPatchBodies,
  onRemoveBody,
  onRemoveBodies,
  onPatchConstraint,
  onRemoveConstraint,
  onRemoveSystem,
  onPlay,
  onPause,
  onReset,
  onApply,
  onAssignBody,
  onAssignCollider,
  onCreatePopulation,
  onBeginTool,
  onAddMapping,
  onMaterialize,
  onSculpt,
  onLoadExample,
  expressivePrograms = [],
  selectedElements = [],
}) {
  const graph = normalizeRelationshipGraph(graphValue);
  const system = graph.systems.find(candidate => candidate.id === activeSystemId) || graph.systems[0] || null;
  const [populationCount, setPopulationCount] = useState(250);
  const [particleSize, setParticleSize] = useState(7);
  const [expandedMappingId, setExpandedMappingId] = useState(null);
  const [expandedConstraintId, setExpandedConstraintId] = useState(null);
  const systemTelemetry = telemetry.systems?.find(candidate => candidate.systemId === system?.id);
  const selectedIdSet = useMemo(() => new Set(Object.keys(selectedElementIds).filter(id => selectedElementIds[id])), [selectedElementIds]);
  const selectedBodies = useMemo(() => graph.bodies.filter(body => body.objectRef?.kind === "element" && selectedIdSet.has(body.objectRef.elementId)), [graph.bodies, selectedIdSet]);
  const selectedBody = selectedBodies[0] || null;
  const selectedElementsById = useMemo(() => new Map(selectedElements.map(element => [element.id, element])), [selectedElements]);
  const selectedBodyElements = useMemo(() => selectedBodies
    .map(body => selectedElementsById.get(body.objectRef?.elementId))
    .filter(Boolean), [selectedBodies, selectedElementsById]);
  const patchDebug = patch => onDebugChange?.({ ...debug, ...patch });
  const patchSystem = patch => {
    if (!system) return;
    const nextPatch = patch.gravity ? { ...patch, gravityMode: "custom" } : patch;
    onSetGraph({ ...graph, systems: graph.systems.map(candidate => candidate.id === system.id ? { ...candidate, ...nextPatch } : candidate) });
  };
  const createSystem = () => {
    const next = createDefaultPhysicsSystem({ name: `Physics ${graph.systems.length + 1}` });
    onSetGraph({ ...graph, systems: [...graph.systems, next] });
    onActiveSystemChange(next.id);
  };
  const patchSelectedBody = patch => {
    if (!selectedBody) return;
    if (onPatchBodies) {
      onPatchBodies(selectedBodies.map(body => body.id), patch);
      return;
    }
    if (onPatchBody) {
      onPatchBody(selectedBody.id, patch);
      return;
    }
    onSetGraph({ ...graph, bodies: graph.bodies.map(body => body.id === selectedBody.id ? { ...body, ...patch } : body) });
  };
  const removeSelectedBody = () => {
    if (!selectedBody) return;
    if (onRemoveBodies) {
      onRemoveBodies(selectedBodies.map(body => body.id));
      return;
    }
    if (onRemoveBody) {
      onRemoveBody(selectedBody.id);
      return;
    }
    onSetGraph({ ...graph, bodies: graph.bodies.filter(body => body.id !== selectedBody.id) });
  };
  const removeSystem = () => {
    if (!system) return;
    if (onRemoveSystem) {
      onRemoveSystem(system.id);
      return;
    }
    onSetGraph({
      ...graph,
      systems: graph.systems.filter(candidate => candidate.id !== system.id),
      bodies: graph.bodies.filter(item => item.systemId !== system.id),
      populations: graph.populations.filter(item => item.systemId !== system.id),
      constraints: graph.constraints.filter(item => item.systemId !== system.id),
      mappings: graph.mappings.filter(item => item.source.systemId !== system.id),
      routes: graph.routes.filter(item => item.systemId !== system.id),
    });
  };
  const counts = useMemo(() => system ? {
    bodies: graph.bodies.filter(item => item.systemId === system.id).length,
    populations: graph.populations.filter(item => item.systemId === system.id).length,
    constraints: graph.constraints.filter(item => item.systemId === system.id).length,
    mappings: graph.mappings.filter(item => item.source.systemId === system.id).length,
  } : { bodies: 0, populations: 0, constraints: 0, mappings: 0 }, [graph, system]);
  const systemMappings = useMemo(() => graph.mappings.filter(mapping => mapping.source.systemId === system?.id), [graph.mappings, system?.id]);
  const systemConstraints = useMemo(() => graph.constraints.filter(constraint => constraint.systemId === system?.id), [graph.constraints, system?.id]);
  const updateMapping = (mappingId, patch) => onSetGraph({
    ...graph,
    mappings: graph.mappings.map(mapping => mapping.id === mappingId ? normalizeRelationshipMapping({ ...mapping, ...patch }) : mapping),
  });
  const removeMapping = mappingId => onSetGraph({ ...graph, mappings: graph.mappings.filter(mapping => mapping.id !== mappingId) });
  const addMapping = () => {
    const mapping = onAddMapping?.({ systemId: system?.id, collisionClass: "body-wall" });
    if (mapping?.id) setExpandedMappingId(mapping.id);
  };
  const duplicateMapping = mapping => {
    const copy = normalizeRelationshipMapping({ ...mapping, id: `mapping-${crypto.randomUUID()}`, name: `${mapping.name} copy` });
    onSetGraph({ ...graph, mappings: [...graph.mappings, copy] });
    setExpandedMappingId(copy.id);
  };
  const updateConstraint = (constraintId, patch) => {
    if (onPatchConstraint) {
      onPatchConstraint(constraintId, patch);
      return;
    }
    onSetGraph({
      ...graph,
      constraints: graph.constraints.map(constraint => constraint.id === constraintId
        ? normalizePhysicsConstraint({ ...constraint, ...patch })
        : constraint),
    });
  };
  const removeConstraint = constraintId => {
    if (onRemoveConstraint) {
      onRemoveConstraint(constraintId);
      return;
    }
    onSetGraph({ ...graph, constraints: graph.constraints.filter(constraint => constraint.id !== constraintId) });
  };

  return <div className="physics-panel">
    <div className="physics-toolbar">
      <Button onClick={createSystem} {...infoProps("Add physics system", "Create an independent physics world with its own clock, gravity, bodies, and mappings.")}>Add system</Button>
      <Button onClick={() => onLoadExample?.("gas")}>Musical gas</Button>
      <Button onClick={() => onLoadExample?.("marionette")}>Marionette</Button>
      <Button onClick={() => onLoadExample?.("portrait")}>Portrait</Button>
    </div>

    {system ? <>
      <InspectorSection title={`Mappings · ${systemMappings.length}`} defaultOpen>
        <div className="physics-toolbar">
          <Button onClick={addMapping} {...infoProps("Add collision mapping", "Create a source → filter → transform → MIDI Note mapping for collisions in this physics world.")}>Add collision mapping</Button>
        </div>
        <div className="physics-mapping-list">
          {systemMappings.map((mapping, index) => <MappingCard
            key={mapping.id}
            mapping={mapping}
            systems={graph.systems}
            programs={expressivePrograms}
            expanded={expandedMappingId === null ? index === 0 : expandedMappingId === mapping.id}
            onToggle={() => setExpandedMappingId(current => current === mapping.id ? false : mapping.id)}
            onUpdate={patch => updateMapping(mapping.id, patch)}
            onDuplicate={() => duplicateMapping(mapping)}
            onRemove={() => removeMapping(mapping.id)}
            index={index}
          />)}
          {!systemMappings.length && <div className="physics-empty">No mappings in this world.</div>}
        </div>
      </InspectorSection>

      <InspectorSection title="System" defaultOpen>
        <label className="physics-field"><span>System</span><select value={system.id} onChange={event => onActiveSystemChange(event.target.value)}>{graph.systems.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label className="physics-field"><span>Name</span><input value={system.name} onChange={event => patchSystem({ name: event.target.value })} /></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity X (world)" : "Gravity X"}</span><input type="number" step="10" value={system.gravityMode === "world" ? graph.world.gravity.x : system.gravity.x} disabled={system.gravityMode === "world"} onChange={event => patchSystem({ gravity: { ...system.gravity, x: Number(event.target.value) } })} /></label>
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity Y (world)" : "Gravity Y"}</span><input type="number" step="10" value={system.gravityMode === "world" ? graph.world.gravity.y : system.gravity.y} disabled={system.gravityMode === "world"} onChange={event => patchSystem({ gravity: { ...system.gravity, y: Number(event.target.value) } })} /></label>
        </div>
        <label className="physics-check" {...infoProps("Contact stay events", "Contacts normally emit begin, hit, and end. Enable this only when a mapping needs an additional stay event on every physics step while bodies remain in contact; it can produce up to 60 events per second for each active contact.")}><input type="checkbox" checked={system.emitStayEvents} onChange={event => patchSystem({ emitStayEvents: event.target.checked })} /><span>Contact stay events</span></label>
        <div className="physics-transport">
          <Button onClick={() => onPlay(system.id)}>Play</Button>
          <Button onClick={() => onPause(system.id)}>Pause</Button>
          <Button onClick={() => onReset(system.id)}>Reset</Button>
          <Button onClick={() => onApply(system.id)}>Apply pose</Button>
          <Button onClick={removeSystem}>Remove</Button>
        </div>
      </InspectorSection>

      <InspectorSection title="Debug overlay" defaultOpen={false} {...infoProps("Physics debug overlay", "A canvas-only diagnostic view. It never becomes a scene object or export. When disabled it does not subscribe to collision events or draw diagnostic geometry.")}>
        <label className="physics-check">
          <input type="checkbox" checked={debug.enabled === true} onChange={event => patchDebug({ enabled: event.target.checked })} />
          <span>Show physics diagnostics</span>
        </label>
        <div className="physics-debug-grid" aria-disabled={!debug.enabled}>
          {[
            ["bodies", "Bodies"],
            ["colliders", "Colliders"],
            ["constraints", "Springs + constraints"],
            ["labels", "Body labels"],
            ["contacts", "Contacts"],
            ["collisions", "Collision pulses"],
            ["forces", "Contact forces"],
          ].map(([key, label]) => <Button key={key} active={debug[key] === true} disabled={!debug.enabled} onClick={() => patchDebug({ [key]: !debug[key] })}>{label}</Button>)}
        </div>
      </InspectorSection>

      <InspectorSection title={`Constraints · ${systemConstraints.length}`} defaultOpen>
        <div className="physics-constraint-list">
          {systemConstraints.map((constraint, index) => <ConstraintCard
            key={constraint.id}
            constraint={constraint}
            expanded={expandedConstraintId === null ? index === 0 : expandedConstraintId === constraint.id}
            onToggle={() => setExpandedConstraintId(current => current === constraint.id ? false : constraint.id)}
            onUpdate={patch => updateConstraint(constraint.id, patch)}
            onRemove={() => removeConstraint(constraint.id)}
          />)}
          {!systemConstraints.length && <div className="physics-empty">Choose Spring, Fixate, or Axle, then author it on the canvas.</div>}
        </div>
      </InspectorSection>

      <InspectorSection title={`Selection · ${selectedElementCount}`} defaultOpen>
        <div className="physics-role-grid">
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "dynamic" })}>Dynamic body</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "kinematic" })}>Kinematic</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: false })}>Fixed collider</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: true })}>Sensor</Button>
        </div>
        <div className="physics-tool-grid">
          {[
            ["spring", "Spring", "Click two attachment points; its initial length becomes the resting length."],
            ["fixate", "Fixate", "Click one body: it welds to the body underneath, or to World when there is none."],
            ["axle", "Axle", "Click one body: it hinges to the body underneath, or to World when there is none."],
            ["distance", "Distance", "A stiffer spring between two attachment points."],
            ["revolute", "Revolute", "Compatibility hinge tool; Axle is the canvas-first equivalent."],
            ["weld", "Weld", "Compatibility rigid joint tool; Fixate is the canvas-first equivalent."],
          ].map(([kind, label, help]) => <Button key={kind} active={activeTool === kind} onClick={() => onBeginTool(kind, system.id)} {...infoProps(label, help)}>{label}</Button>)}
        </div>
        {selectedBody && <div className="physics-selected-properties">
          {selectedBodies.length === 1 && <label className="physics-field"><span>Physics name</span><input value={selectedBody.name} onChange={event => patchSelectedBody({ name: event.target.value })} /></label>}
          <label className="physics-check"><input type="checkbox" checked={selectedBody.enabled} onChange={event => patchSelectedBody({ enabled: event.target.checked })} /><span>Enabled{selectedBodies.length > 1 ? ` · ${selectedBodies.length} bodies` : ""}</span></label>
          <label className="physics-field"><span>Tags</span><input value={selectedBody.collisionTags.join(", ")} onChange={event => patchSelectedBody({ collisionTags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
          <label className="physics-field" {...infoProps("Object note", "A per-body value available to collision mappings as aNote/noteA or bNote/noteB.")}><span>Object note</span><input type="number" min="0" max="127" step="1" value={selectedBody.mappingValues.note} onChange={event => patchSelectedBody({ mappingValues: { note: event.target.valueAsNumber } })} /></label>
          {selectedBodyElements.length === selectedBodies.length && <label className="physics-field"><span>Collider</span><select value={getPhysicsColliderSelectionValue(selectedBody.collider, { allowPath: selectedBodyElements.every(element => ["freedraw", "line", "arrow"].includes(element.type) || element.customData?.draweratorGeometry?.kind === "cubicBezierPath") })} onChange={event => patchSelectedBody({ colliderKind: event.target.value })}><option value="box">Bounding box</option><option value="ellipse">Bounding ellipse</option><option value="convex">Convex hull</option>{selectedBodyElements.every(element => ["freedraw", "line", "arrow"].includes(element.type) || element.customData?.draweratorGeometry?.kind === "cubicBezierPath") && <option value="chain">Path chain</option>}</select></label>}
          <label className="physics-field" {...infoProps("Collision skin", "Invisible scene-pixel padding around this collider. It helps small or fast bodies make stable contact with fine paths.")}><span>Collision skin</span><input type="number" min="0" max="64" step="0.5" value={selectedBody.collider.contactSkin} onChange={event => patchSelectedBody({ collider: { contactSkin: event.target.valueAsNumber } })} /></label>
          <div className="physics-two-column">
            <label className="physics-field"><span>Friction</span><input type="number" min="0" max="10" step="0.05" value={selectedBody.material.friction} onChange={event => patchSelectedBody({ material: { ...selectedBody.material, friction: Number(event.target.value) } })} /></label>
            <label className="physics-field"><span>Bounce</span><input type="number" min="0" max="2" step="0.05" value={selectedBody.material.restitution} onChange={event => patchSelectedBody({ material: { ...selectedBody.material, restitution: Number(event.target.value) } })} /></label>
            <label className="physics-field"><span>Density</span><input type="number" min="0.01" max="100" step="0.1" value={selectedBody.material.density} onChange={event => patchSelectedBody({ material: { ...selectedBody.material, density: Number(event.target.value) } })} /></label>
            <label className="physics-field"><span>Damping</span><input type="number" min="0" max="100" step="0.05" value={selectedBody.material.linearDamping} onChange={event => patchSelectedBody({ material: { ...selectedBody.material, linearDamping: Number(event.target.value) } })} /></label>
          </div>
          <Button onClick={removeSelectedBody}>Remove physics role</Button>
        </div>}
      </InspectorSection>

      <InspectorSection title="Population" defaultOpen>
        <div className="physics-two-column">
          <label className="physics-field"><span>Count</span><input type="number" min="1" max="5000" step="1" value={populationCount} onChange={event => setPopulationCount(Number(event.target.value))} /></label>
          <label className="physics-field"><span>Point size</span><input type="number" min="1" max="80" step="1" value={particleSize} onChange={event => setParticleSize(Number(event.target.value))} /></label>
        </div>
        <div className="physics-toolbar">
          <Button onClick={() => onCreatePopulation({ systemId: system.id, count: populationCount, radius: particleSize })}>Add runtime gas</Button>
          <Button onClick={() => onMaterialize({ systemId: system.id })}>Materialize all</Button>
        </div>
      </InspectorSection>

      <InspectorSection title="Sculpt curves" defaultOpen={false}>
        <div className="physics-tool-grid">
          <Button disabled={!selectedElementCount} onClick={() => onSculpt("smooth")}>Smooth</Button>
          <Button disabled={!selectedElementCount} onClick={() => onSculpt("randomize")}>Randomize</Button>
          <Button disabled={!selectedElementCount} onClick={() => onBeginTool("attract-brush", system.id)}>Attract brush</Button>
          <Button disabled={selectedElementCount !== 2} onClick={() => onSculpt("morph")}>Morph</Button>
        </div>
      </InspectorSection>

      <InspectorSection title="Runtime" defaultOpen={false}>
        <div className="physics-readout"><span>Authored bodies</span><strong>{counts.bodies}</strong></div>
        <div className="physics-readout"><span>Populations</span><strong>{counts.populations}</strong></div>
        <div className="physics-readout"><span>Constraints</span><strong>{counts.constraints}</strong></div>
        <div className="physics-readout"><span>Mappings</span><strong>{counts.mappings}</strong></div>
        <div className="physics-readout"><span>Runtime bodies</span><strong>{systemTelemetry?.bodyCount || 0}</strong></div>
        <div className="physics-readout"><span>Solver step</span><strong>{Number(telemetry.stepMs || 0).toFixed(2)} ms</strong></div>
        <div className="physics-readout"><span>Events</span><strong>{Number(telemetry.eventRate || 0).toFixed(1)}/s</strong></div>
        <div className="physics-readout"><span>Mapping outputs</span><strong>{Number(telemetry.mappingRate || 0).toFixed(1)}/s</strong></div>
        <div className="physics-readout"><span>Dropped</span><strong>{systemTelemetry?.droppedEvents || 0}</strong></div>
      </InspectorSection>
    </> : <div className="physics-empty">Add a physics system, then draw or select objects on the canvas.</div>}
  </div>;
}

const constraintLabel = kind => ({
  fixate: "Fixate",
  axle: "Axle",
  spring: "Spring",
  distance: "Distance",
  pin: "Pin",
  revolute: "Revolute",
  weld: "Weld",
  attractor: "Attractor",
}[kind] || "Constraint");

const endpointLabel = endpoint => {
  if (!endpoint) return "Missing endpoint";
  if (endpoint.kind === "world") return `World · ${Math.round(endpoint.point?.[0] || 0)}, ${Math.round(endpoint.point?.[1] || 0)}`;
  if (endpoint.kind === "stream") return `Stream · ${endpoint.featureId || endpoint.streamId}`;
  if (endpoint.kind === "bezier-anchor") return `Curve anchor · ${endpoint.anchorId}`;
  if (endpoint.kind === "curve-progress") return `Curve · ${Math.round((endpoint.progress || 0) * 100)}%`;
  return `Object · ${endpoint.objectRef?.elementId?.slice(0, 10) || "missing"}`;
};

function ConstraintCard({ constraint: constraintValue, expanded, onToggle, onUpdate, onRemove }) {
  const constraint = normalizePhysicsConstraint(constraintValue);
  const isSpring = ["spring", "distance"].includes(constraint.kind);
  const isAxle = ["axle", "pin", "revolute"].includes(constraint.kind);
  return <article className="physics-constraint-card">
    <div className="physics-constraint-header">
      <button type="button" className="physics-mapping-toggle" onClick={onToggle} aria-expanded={expanded}>
        {expanded ? "⌄" : "›"} {constraint.name || constraintLabel(constraint.kind)}
      </button>
      <span className="physics-constraint-kind">{constraintLabel(constraint.kind)}</span>
      <label className="physics-mapping-enable"><input type="checkbox" checked={constraint.enabled} onChange={event => onUpdate({ enabled: event.target.checked })} />Enabled</label>
      <Button onClick={onRemove}>Remove</Button>
    </div>
    {expanded && <div className="physics-constraint-editor">
      <label className="physics-field"><span>Name</span><input value={constraint.name} onChange={event => onUpdate({ name: event.target.value })} /></label>
      <div className="physics-two-column">
        <label className="physics-field"><span>Kind</span><select value={constraint.kind} onChange={event => onUpdate({ kind: event.target.value })}>
          <option value="fixate">Fixate</option><option value="axle">Axle</option><option value="spring">Spring</option><option value="distance">Distance</option>
          <option value="pin">Pin (legacy)</option><option value="revolute">Revolute (legacy)</option><option value="weld">Weld (legacy)</option>
        </select></label>
        <label className="physics-check" {...infoProps("Collide while connected", "Off by default so connected parts do not immediately collide with one another. Enable when their colliders should still make contact.")}><input type="checkbox" checked={constraint.collideConnected} onChange={event => onUpdate({ collideConnected: event.target.checked })} /><span>Collide while connected</span></label>
      </div>
      <div className="physics-constraint-endpoints"><span>A · {endpointLabel(constraint.a)}</span><span>B · {endpointLabel(constraint.b)}</span></div>
      {isSpring && <div className="physics-two-column">
        <label className="physics-field"><span>Rest length</span><input type="number" min="0" step="1" value={constraint.restLength} onChange={event => onUpdate({ restLength: event.target.valueAsNumber })} /></label>
        <label className="physics-field"><span>Stiffness</span><input type="number" min="0" step="1" value={constraint.stiffness} onChange={event => onUpdate({ stiffness: event.target.valueAsNumber })} /></label>
        <label className="physics-field"><span>Damping</span><input type="number" min="0" step="0.1" value={constraint.damping} onChange={event => onUpdate({ damping: event.target.valueAsNumber })} /></label>
      </div>}
      {isAxle && <div className="physics-two-column">
        <label className="physics-field" {...infoProps("Lower angle limit", "Optional axle limit in radians. Enter both limits to enable them.")}><span>Lower limit</span><input type="number" step="0.1" value={constraint.lowerLimit ?? ""} onChange={event => onUpdate({ lowerLimit: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>
        <label className="physics-field" {...infoProps("Upper angle limit", "Optional axle limit in radians. Enter both limits to enable them.")}><span>Upper limit</span><input type="number" step="0.1" value={constraint.upperLimit ?? ""} onChange={event => onUpdate({ upperLimit: event.target.value === "" ? null : event.target.valueAsNumber })} /></label>
      </div>}
    </div>}
  </article>;
}

function MappingCard({ mapping: mappingValue, systems, programs, expanded, onToggle, onUpdate, onDuplicate, onRemove, index }) {
  const mapping = normalizeRelationshipMapping(mappingValue);
  const patchSource = patch => onUpdate({ source: { ...mapping.source, ...patch } });
  const patchFilter = patch => onUpdate({ filter: { ...mapping.filter, ...patch } });
  const patchTransform = patch => onUpdate({ transform: { ...mapping.transform, ...patch } });
  const patchTarget = patch => onUpdate({ target: { ...mapping.target, ...patch } });
  const setPhase = (phase, checked) => patchSource({ phases: checked ? [...new Set([...mapping.source.phases, phase])] : mapping.source.phases.filter(item => item !== phase) });
  const expressionError = [mapping.filter.expression, mapping.transform.expression, ...["noteExpression", "velocityExpression", "valueExpression", "gainExpression", "pressureExpression", "brightnessExpression", "panExpression"].map(key => mapping.target[key]).filter(Boolean)]
    .map(expression => compileMappingExpression(expression).error).find(Boolean);
  const target = mapping.target;
  const gate = target.mode === "gate";
  return <article className={`physics-mapping-card${expanded ? " open" : ""}`}>
    <div className="physics-mapping-header">
      <button type="button" className="physics-mapping-toggle" onClick={onToggle} aria-expanded={expanded}>{expanded ? "⌄" : "›"} {mapping.name || `Mapping ${index + 1}`}</button>
      <label className="physics-mapping-enable" {...infoProps("Enable mapping", "Disabled mappings stay in the scene but do not respond to events.")}><input type="checkbox" checked={mapping.enabled} onChange={event => onUpdate({ enabled: event.target.checked })} /><span>Enabled</span></label>
      <Button onClick={onDuplicate}>Duplicate</Button><Button onClick={onRemove}>Remove</Button>
    </div>
    {expanded && <div className="physics-mapping-stack">
      <label className="physics-field"><span>Name</span><input value={mapping.name} onChange={event => onUpdate({ name: event.target.value })} /></label>

      <fieldset className="physics-mapping-block"><legend>Source</legend>
        <label className="physics-field"><span>System</span><select value={mapping.source.systemId} onChange={event => patchSource({ systemId: event.target.value })}>{systems.map(system => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>Class</span><select value={mapping.source.classes[0] || ""} onChange={event => patchSource({ classes: event.target.value ? [event.target.value] : [] })}><option value="">Any collision</option><option value="body-body">Body ↔ body</option><option value="body-wall">Body ↔ wall</option><option value="body-sensor">Body ↔ sensor</option><option value="sensor-sensor">Sensor ↔ sensor</option></select></label>
          <label className="physics-field"><span>Field</span><select value={mapping.source.field} onChange={event => patchSource({ field: event.target.value })}><option value="impulse">Impulse</option><option value="relativeSpeed">Relative speed</option><option value="contactX">Contact X</option><option value="contactY">Contact Y</option><option value="normalX">Normal X</option><option value="normalY">Normal Y</option></select></label>
        </div>
        <div className="physics-mapping-phases">
          {(gate ? ["begin", "end", "stay"] : ["hit", "begin", "end", "stay", "enter", "exit"]).map(phase => <label key={phase}><input type="checkbox" checked={mapping.source.phases.includes(phase)} disabled={gate && phase !== "stay"} onChange={event => setPhase(phase, event.target.checked)} />{phase}</label>)}
        </div>
        <div className="physics-two-column">
          <label className="physics-field"><span>Input min</span><input type="number" value={mapping.source.range.min} onChange={event => patchSource({ range: { ...mapping.source.range, min: Number(event.target.value) } })} /></label>
          <label className="physics-field"><span>Input max</span><input type="number" value={mapping.source.range.max} onChange={event => patchSource({ range: { ...mapping.source.range, max: Number(event.target.value) } })} /></label>
        </div>
        <div className="physics-two-column">
          <label className="physics-field"><span>A tags</span><input value={mapping.source.tagsA.join(", ")} onChange={event => patchSource({ tagsA: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
          <label className="physics-field"><span>B tags</span><input value={mapping.source.tagsB.join(", ")} onChange={event => patchSource({ tagsB: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
        </div>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Filter</legend>
        <div className="physics-two-column">
          <label className="physics-field"><span>Minimum</span><input type="number" value={mapping.filter.min ?? ""} onChange={event => patchFilter({ min: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Maximum</span><input type="number" value={mapping.filter.max ?? ""} onChange={event => patchFilter({ max: event.target.value === "" ? null : Number(event.target.value) })} /></label>
        </div>
        <label className="physics-field" {...infoProps("Filter formula", FORMULA_HELP.filter, FORMULA_EXAMPLES.filter)}><span>Formula</span><input value={mapping.filter.expression} placeholder="e.g. impulse > 0.3 && speed > 0.1" onChange={event => patchFilter({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Transform</legend>
        <div className="physics-two-column">
          <label className="physics-field"><span>Output min</span><input type="number" value={mapping.transform.outputMin} onChange={event => patchTransform({ outputMin: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Output max</span><input type="number" value={mapping.transform.outputMax} onChange={event => patchTransform({ outputMax: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Scale</span><input type="number" step="0.1" value={mapping.transform.scale} onChange={event => patchTransform({ scale: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Offset</span><input type="number" step="0.1" value={mapping.transform.offset} onChange={event => patchTransform({ offset: Number(event.target.value) })} /></label>
        </div>
        <label className="physics-check"><input type="checkbox" checked={mapping.transform.clamp} onChange={event => patchTransform({ clamp: event.target.checked })} /><span>Clamp output</span></label>
        <label className="physics-field" {...infoProps("Transform formula", FORMULA_HELP.transform, FORMULA_EXAMPLES.transform)}><span>Formula</span><input value={mapping.transform.expression} placeholder="e.g. clamp(norm * 127, 1, 127)" onChange={event => patchTransform({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Target</legend>
        <label className="physics-field"><span>Type</span><select value={target.kind} onChange={event => patchTarget({ kind: event.target.value })}><option value="midi-note">MIDI Note</option><option value="midi-cc">MIDI CC</option><option value="midi-bend">MIDI Pitch Bend</option><option value="expressive-voice">Expressive Synth</option>{target.kind === "legacy-action" && <option value="legacy-action">Compatibility route</option>}</select></label>
        {target.kind === "midi-note" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field"><span>Note</span><input type="number" min="0" max="127" value={target.note} onChange={event => patchTarget({ note: Number(event.target.value) })} /></label><label className="physics-field"><span>Duration</span><input type="number" min="0.01" step="0.01" value={target.duration} onChange={event => patchTarget({ duration: Number(event.target.value) })} /></label></div>
          <label className="physics-field" {...infoProps("Pitch formula", FORMULA_HELP.pitch, FORMULA_EXAMPLES.pitch)}><span>Pitch formula</span><input value={target.noteExpression} placeholder="e.g. major(baseNote, floor(speed / 12))" onChange={event => patchTarget({ noteExpression: event.target.value })} /></label>
          <label className="physics-field" {...infoProps("Velocity formula", FORMULA_HELP.velocity, FORMULA_EXAMPLES.velocity)}><span>Velocity formula</span><input value={target.velocityExpression} onChange={event => patchTarget({ velocityExpression: event.target.value })} /></label>
          <label className="physics-field"><span>Minimum hold</span><input type="number" min="0" step="0.01" value={target.minimumHold} onChange={event => patchTarget({ minimumHold: Number(event.target.value) })} /></label>
        </>}
        {target.kind === "midi-cc" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field"><span>Controller</span><input type="number" min="0" max="127" value={target.controller} onChange={event => patchTarget({ controller: Number(event.target.value) })} /></label><label className="physics-field" {...infoProps("CC value formula", FORMULA_HELP.cc, FORMULA_EXAMPLES.cc)}><span>Value formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "midi-bend" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field" {...infoProps("Pitch bend formula", FORMULA_HELP.bend, FORMULA_EXAMPLES.bend)}><span>Bend formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "expressive-voice" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Program</span><select value={target.program} onChange={event => patchTarget({ program: event.target.value })}>{(programs.length ? programs : [{ id: "bowed", name: "Bowed" }]).map(program => <option key={program.id} value={program.id}>{program.name || program.id}</option>)}</select></label></div>
          <div className="physics-two-column"><label className="physics-field" {...infoProps("Voice note formula", FORMULA_HELP.voiceNote, FORMULA_EXAMPLES.voiceNote)}><span>Note formula</span><input value={target.noteExpression} onChange={event => patchTarget({ noteExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice gain formula", FORMULA_HELP.voiceGain, FORMULA_EXAMPLES.voiceGain)}><span>Gain formula</span><input value={target.gainExpression} onChange={event => patchTarget({ gainExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice pressure formula", FORMULA_HELP.voicePressure, FORMULA_EXAMPLES.voicePressure)}><span>Pressure formula</span><input value={target.pressureExpression} onChange={event => patchTarget({ pressureExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice brightness formula", FORMULA_HELP.voiceBrightness, FORMULA_EXAMPLES.voiceBrightness)}><span>Brightness formula</span><input value={target.brightnessExpression} onChange={event => patchTarget({ brightnessExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice pan formula", FORMULA_HELP.voicePan, FORMULA_EXAMPLES.voicePan)}><span>Pan formula</span><input value={target.panExpression} onChange={event => patchTarget({ panExpression: event.target.value })} /></label><label className="physics-field"><span>Duration</span><input type="number" min="0.01" step="0.01" value={target.duration} onChange={event => patchTarget({ duration: Number(event.target.value) })} /></label></div>
        </>}
        {target.kind === "legacy-action" && <small>Imported compatibility route. Create a new MIDI or Expressive Synth mapping to edit the canonical target.</small>}
      </fieldset>
      <div className="physics-two-column"><label className="physics-field"><span>Cooldown ms</span><input type="number" min="0" value={mapping.cooldownMs} onChange={event => onUpdate({ cooldownMs: Number(event.target.value) })} /></label><label className="physics-check"><input type="checkbox" checked={mapping.perPair} onChange={event => onUpdate({ perPair: event.target.checked })} /><span>Cooldown per pair</span></label></div>
      {expressionError && <div className="physics-mapping-error">{expressionError}</div>}
    </div>}
  </article>;
}
