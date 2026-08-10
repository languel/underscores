import { useEffect, useMemo, useState } from "react";
import InspectorSection from "./InspectorSection.jsx";
import {
  MAX_PHYSICS_COLLISION_LAYERS,
  collisionLayerPairKey,
  createDefaultPhysicsSystem,
  normalizePhysicsCollisionLayers,
  normalizePhysicsConstraint,
  normalizeRelationshipGraph,
  normalizeRelationshipMapping,
  setPhysicsCollisionLayerPair,
} from "./relationshipGraph.js";
import { compileMappingExpression } from "./mappingExpression.js";
import { getPhysicsColliderSelectionValue } from "./physicsGeometry.js";
import { getSpringGeometricLength } from "./physicsConstraintAuthoring.js";
import NumericInput from "./NumericInput.jsx";
import GeometryResetIcon from "./GeometryResetIcon.jsx";
import { infoProps } from "./uiInfo.js";

const Button = ({ children, active = false, ...props }) => <button type="button" className={`iannix-flat-button physics-flat-button${active ? " active" : ""}`} {...props}>{children}</button>;

const DEBUG_ENTRIES = Object.freeze([
  ["bodies", "Bodies", "Physics body outlines"],
  ["colliders", "Colliders", "Collision shapes and contact skin"],
  ["constraints", "Springs + constraints", "Joints, springs, and constraint links"],
  ["labels", "Labels", "Object and constraint labels"],
  ["contacts", "Contacts", "Contact points"],
  ["collisions", "Collision pulses", "Recent collision rings"],
  ["forces", "Contact forces", "Contact normal and impulse vectors"],
]);

const DEBUG_COLOR_FALLBACKS = Object.freeze({
  bodies: "#518effe6",
  colliders: "#61d5b1f2",
  constraints: "#ffbe50f2",
  labels: "#6db7ffff",
  contacts: "#61d5b1ff",
  collisions: "#ff7867ff",
  forces: "#ffd05eff",
});

const isCssColor = value => {
  const candidate = String(value || "").trim();
  if (!candidate) return false;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    return CSS.supports("color", candidate);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      const sentinel = "#010203";
      context.fillStyle = sentinel;
      context.fillStyle = candidate;
      return String(context.fillStyle || "").toLowerCase() !== sentinel;
    }
  }
  return /^(?:[a-z][a-z0-9-]*|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\s*\()/i.test(candidate);
};

const normalizeDebugColor = (value, fallback) => {
  const candidate = String(value || "").trim();
  if (candidate.toLowerCase() === "object") return "object";
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return `${candidate.toLowerCase()}ff`;
  if (/^#[0-9a-f]{8}$/i.test(candidate)) return candidate.toLowerCase();
  return isCssColor(candidate) ? candidate : fallback;
};

const cssColorToHex = (value, fallback) => {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(candidate)) return candidate.slice(0, 7).toLowerCase();
  if (typeof document === "undefined") return fallback;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return fallback;
  const sentinel = "#010203";
  context.fillStyle = sentinel;
  context.fillStyle = candidate;
  const resolved = String(context.fillStyle || "");
  const match = resolved.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!match || resolved.toLowerCase() === sentinel) return fallback;
  return `#${match.slice(1, 4).map(channel => Math.min(255, Math.max(0, Math.round(Number(channel)))).toString(16).padStart(2, "0")).join("")}`;
};

function DebugColorPicker({ keyName, label, description, value, active, disabled, onToggle, onChange }) {
  const fallback = DEBUG_COLOR_FALLBACKS[keyName] || "#ffffffcc";
  const color = normalizeDebugColor(value, fallback);
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  const colorInputValue = color === "object" ? fallback.slice(0, 7) : cssColorToHex(draft, fallback.slice(0, 7));
  const alphaSuffix = /^#[0-9a-f]{8}$/i.test(color) ? color.slice(7) : "";
  const commit = next => {
    const normalized = normalizeDebugColor(next, color);
    setDraft(normalized);
    onChange(normalized);
  };
  return <div className="physics-debug-color-field" title={description}>
    <button
      type="button"
      className={`physics-debug-color-toggle${active ? " active" : ""}`}
      disabled={disabled}
      onClick={onToggle}
    >{label}</button>
    <span className="physics-debug-color-control">
      <input
        type="color"
        aria-label={`${label} color`}
        value={colorInputValue}
        disabled={disabled}
        onChange={event => commit(`${event.target.value}${color === "object" ? "" : alphaSuffix}`)}
      />
      <input
        type="text"
        aria-label={`${label} CSS color`}
        value={draft}
        disabled={disabled}
        spellCheck="false"
        onChange={event => setDraft(event.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(draft); event.currentTarget.blur(); } }}
      />
    </span>
  </div>;
}

function CollisionLayerMembershipPicker({ layers, values, disabled = false, onChange }) {
  const defaultId = layers[0]?.id;
  const membershipFor = value => Array.isArray(value) ? value : (defaultId ? [defaultId] : []);
  const memberships = values.map(membershipFor);
  const toggle = layerId => {
    const current = new Set(memberships[0] || []);
    if (current.has(layerId)) current.delete(layerId);
    else current.add(layerId);
    onChange?.([...current]);
  };
  return <div className="physics-collision-layer-memberships" aria-label="Collision layer memberships">
    {layers.map(layer => {
      const included = memberships.map(membership => membership.includes(layer.id));
      const active = included.length > 0 && included.every(Boolean);
      const mixed = included.some(Boolean) && !active;
      return <label key={layer.id} title={`Belongs to ${layer.name}`}>
        <input
          type="checkbox"
          checked={active}
          ref={node => { if (node) node.indeterminate = mixed; }}
          disabled={disabled}
          onChange={() => toggle(layer.id)}
        />
        <span>{layer.name}</span>
      </label>;
    })}
  </div>;
}

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
  onMakeConstraint,
  onCreatePopulation,
  onBeginTool,
  onAddMapping,
  onMaterialize,
  onSculpt,
  onLoadExample,
  expressivePrograms = [],
  selectedElements = [],
  sceneElements = [],
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
  const sceneElementsById = useMemo(() => new Map(sceneElements.map(element => [element.id, element])), [sceneElements]);
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
  const collisionLayerStack = graph.world.collisionLayers;
  const patchCollisionLayers = updater => {
    const nextLayers = normalizePhysicsCollisionLayers(updater(collisionLayerStack));
    onSetGraph({ ...graph, world: { ...graph.world, collisionLayers: nextLayers } });
  };
  const addCollisionLayer = () => {
    if (collisionLayerStack.layers.length >= MAX_PHYSICS_COLLISION_LAYERS) return;
    patchCollisionLayers(stack => ({
      ...stack,
      layers: [...stack.layers, {
        id: `layer-${crypto.randomUUID().slice(0, 8)}`,
        name: `Layer ${stack.layers.length + 1}`,
      }],
    }));
  };
  const renameCollisionLayer = (layerId, name) => patchCollisionLayers(stack => ({
    ...stack,
    layers: stack.layers.map(layer => layer.id === layerId ? { ...layer, name } : layer),
  }));
  const removeCollisionLayer = layerId => {
    if (layerId === "default" || collisionLayerStack.layers.length <= 1) return;
    patchCollisionLayers(stack => ({ ...stack, layers: stack.layers.filter(layer => layer.id !== layerId) }));
  };
  const updateSelectedCollisionLayers = collisionLayers => patchSelectedBody({ collisionLayers });

  return <div className="physics-panel">
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

      <InspectorSection title={`Collision layers · ${collisionLayerStack.layers.length}`} defaultOpen={false} {...infoProps("Collision layers", "Each body belongs to one or more named layers. The symmetric matrix decides which layer pairs make physical contact. New layers start fully connected so existing scenes retain their historical behaviour.")}>
        <div className="physics-layer-toolbar">
          <Button disabled={collisionLayerStack.layers.length >= MAX_PHYSICS_COLLISION_LAYERS} onClick={addCollisionLayer}>Add layer</Button>
        </div>
        <div className="physics-layer-list">
          {collisionLayerStack.layers.map(layer => <div key={layer.id} className="physics-layer-row">
            <label className="physics-field"><span>{layer.id === "default" ? "Default" : "Layer"}</span><input value={layer.name} onChange={event => renameCollisionLayer(layer.id, event.target.value)} /></label>
            <Button disabled={layer.id === "default" || collisionLayerStack.layers.length <= 1} onClick={() => removeCollisionLayer(layer.id)}>Remove</Button>
          </div>)}
        </div>
        <small className="physics-layer-help">Assign objects with <em>Belongs to layers</em>; use this table to choose which layer pairs can contact.</small>
        <div className="physics-layer-matrix" role="grid" aria-label="Collision layer matrix" style={{ "--physics-layer-count": collisionLayerStack.layers.length }}>
          <div className="physics-layer-matrix-head" aria-hidden="true"><span>Collides with</span>{collisionLayerStack.layers.map(layer => <span key={layer.id} title={layer.name}>{layer.name}</span>)}</div>
          {collisionLayerStack.layers.map(first => <div key={first.id} className="physics-layer-matrix-row" role="row">
            <strong title={first.name}>{first.name}</strong>
            {collisionLayerStack.layers.map(second => {
              const key = collisionLayerPairKey(first.id, second.id);
              const enabled = collisionLayerStack.matrix[key] !== false;
              return <label key={second.id} title={`${first.name} ${enabled ? "collides with" : "does not collide with"} ${second.name}`}>
                <input type="checkbox" checked={enabled} onChange={event => patchCollisionLayers(stack => setPhysicsCollisionLayerPair(stack, first.id, second.id, event.target.checked))} />
              </label>;
            })}
          </div>)}
        </div>
      </InspectorSection>

      <InspectorSection title="Debug overlay" defaultOpen={false} {...infoProps("Physics debug overlay", "A canvas-only diagnostic view. It never becomes a scene object or export. When disabled it does not subscribe to collision events or draw diagnostic geometry.")}>
        <label className="physics-check">
          <input type="checkbox" checked={debug.enabled === true} onChange={event => patchDebug({ enabled: event.target.checked })} />
          <span>Show physics diagnostics</span>
        </label>
        <label className="physics-check" {...infoProps("Trajectory trails", "Show runtime-only trails enabled on physics bodies, Axle/Weld pivots, and Tracer objects. Trail color, time length, and opacity are configured on each object in Properties.")}>
          <input type="checkbox" checked={debug.trails === true} disabled={!debug.enabled} onChange={event => patchDebug({ trails: event.target.checked })} />
          <span>Show trajectory trails</span>
        </label>
        <div className="physics-debug-colors" aria-disabled={!debug.enabled}>
          {DEBUG_ENTRIES.map(([key, label, description]) => <DebugColorPicker
            key={key}
            keyName={key}
            label={label}
            description={description}
            value={debug.colors?.[key]}
            active={debug[key] === true}
            disabled={!debug.enabled}
            onToggle={() => patchDebug({ [key]: !debug[key] })}
            onChange={value => patchDebug({ colors: { ...(debug.colors || {}), [key]: value } })}
          />)}
        </div>
      </InspectorSection>

      <InspectorSection title={`Constraints · ${systemConstraints.length}`} defaultOpen>
        <div className="physics-constraint-list">
          {systemConstraints.map((constraint, index) => <ConstraintCard
            key={constraint.id}
            constraint={constraint}
            collisionLayers={collisionLayerStack.layers}
            springElement={sceneElementsById.get(constraint.objectRef?.elementId)}
            expanded={expandedConstraintId === null ? index === 0 : expandedConstraintId === constraint.id}
            onToggle={() => setExpandedConstraintId(current => current === constraint.id ? false : constraint.id)}
            onUpdate={patch => updateConstraint(constraint.id, patch)}
            onRemove={() => removeConstraint(constraint.id)}
          />)}
          {!systemConstraints.length && <div className="physics-empty">Select a visual object, then choose axle, weld, or spring.</div>}
        </div>
      </InspectorSection>

      <InspectorSection title={`Selection · ${selectedElementCount}`} defaultOpen>
        <div className="physics-role-grid">
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "dynamic" })}>Dynamic</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "kinematic" })}>Kinematic</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: false })}>Static</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: true })}>Sensor</Button>
        </div>
        <div className="physics-tool-grid">
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "fixate", systemId: system.id })}
            {...infoProps("Weld", "Converts each selected canvas object into a Weld pivot. Overlapping bodies weld automatically; if none overlap, the pivot stays detached for later endpoint assignment.")}
          >Weld</Button>
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "axle", systemId: system.id })}
            {...infoProps("Make axle object", "Converts each selected canvas object into a freely rotating Axle pivot. Overlapping bodies connect automatically; if none overlap, the pivot stays detached for later endpoint assignment.")}
          >Axle</Button>
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "spring", systemId: system.id })}
            {...infoProps("Make spring object", "Converts each selected visual object into a Spring. Its rendered start and end independently attach to bodies beneath them, or World.")}
          >Spring</Button>
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "attractor", systemId: system.id })}
            {...infoProps("Make attractor object", "Converts each selected canvas object into a radial force. It attracts or repels dynamic bodies within a configurable radius.")}
          >Attractor</Button>
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "thruster", systemId: system.id })}
            {...infoProps("Make thruster object", "Converts each selected two-ended canvas path into a Thruster. Its start attaches to a dynamic body and its visible direction applies continuous force.")}
          >Thruster</Button>
          <Button
            disabled={!selectedElementCount}
            onClick={() => onMakeConstraint?.({ kind: "tracer", systemId: system.id })}
            {...infoProps("Make tracer object", "Converts each selected object into a solver-free diagnostic Tracer. It follows an overlapping body or rope point, or stays at its own fixed position.")}
          >Tracer</Button>
        </div>
        {selectedBody && <div className="physics-selected-properties">
          {selectedBodies.length === 1 && <label className="physics-field"><span>Physics name</span><input value={selectedBody.name} onChange={event => patchSelectedBody({ name: event.target.value })} /></label>}
          <label className="physics-check"><input type="checkbox" checked={selectedBody.enabled} onChange={event => patchSelectedBody({ enabled: event.target.checked })} /><span>Enabled{selectedBodies.length > 1 ? ` · ${selectedBodies.length} bodies` : ""}</span></label>
          <label className="physics-field"><span>Tags</span><input value={selectedBody.collisionTags.join(", ")} onChange={event => patchSelectedBody({ collisionTags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
          <div className="physics-field physics-collision-layer-field" {...infoProps("Collision-layer membership", "These checkboxes assign the selected body to one or more layers. The matrix above controls which layer pairs make contact.")}><span>Belongs to layers</span><CollisionLayerMembershipPicker layers={collisionLayerStack.layers} values={selectedBodies.map(body => body.collisionLayers)} onChange={updateSelectedCollisionLayers} /></div>
          <label className="physics-field" {...infoProps("Object note", "A per-body value available to collision mappings as aNote/noteA or bNote/noteB.")}><span>Object note</span><NumericInput min="0" max="127" step="1" value={selectedBody.mappingValues.note} defaultValue={60} onCommit={note => patchSelectedBody({ mappingValues: { note } })} /></label>
          {selectedBodyElements.length === selectedBodies.length && <label className="physics-field"><span>Collider</span><select value={getPhysicsColliderSelectionValue(selectedBody.collider, { allowPath: selectedBodyElements.every(element => ["freedraw", "line", "arrow"].includes(element.type) || element.customData?.draweratorGeometry?.kind === "cubicBezierPath") })} onChange={event => patchSelectedBody({ colliderKind: event.target.value })}><option value="box">Bounding box</option><option value="ellipse">Bounding ellipse</option><option value="convex">Convex hull</option>{selectedBodyElements.every(element => ["freedraw", "line", "arrow"].includes(element.type) || element.customData?.draweratorGeometry?.kind === "cubicBezierPath") && <option value="chain">Path chain</option>}</select></label>}
          <label className="physics-field" {...infoProps("Collision skin", "Invisible scene-pixel padding around this collider. It helps small or fast bodies make stable contact with fine paths.")}><span>Collision skin</span><NumericInput min="0" max="64" step="0.5" value={selectedBody.collider.contactSkin} defaultValue={0} onCommit={contactSkin => patchSelectedBody({ collider: { contactSkin } })} /></label>
          <label className="physics-check" {...infoProps("Trajectory trail", "Draw a runtime-only centre-of-mass trail for this body.")}><input type="checkbox" checked={selectedBody.trail?.enabled === true} onChange={event => patchSelectedBody({ trail: { ...selectedBody.trail, enabled: event.target.checked } })} /><span>Trail</span></label>
          <div className="physics-two-column">
            <label className="physics-field"><span>Trail color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(selectedBody.trail?.color) ? selectedBody.trail.color : "#4f8cff"} onChange={event => patchSelectedBody({ trail: { ...selectedBody.trail, color: event.target.value } })} /></label>
            <label className="physics-field"><span>Time length (s)</span><NumericInput min="0.1" max="120" step="0.25" value={selectedBody.trail?.duration} defaultValue={4} onCommit={duration => patchSelectedBody({ trail: { ...selectedBody.trail, duration } })} /></label>
            <label className="physics-field"><span>Opacity</span><NumericInput min="0" max="1" step="0.05" value={selectedBody.trail?.opacity} defaultValue={0.75} onCommit={opacity => patchSelectedBody({ trail: { ...selectedBody.trail, opacity } })} /></label>
          </div>
          <div className="physics-two-column">
            <label className="physics-field"><span>Friction</span><NumericInput min="0" max="10" step="0.05" value={selectedBody.material.friction} defaultValue={0.2} onCommit={friction => patchSelectedBody({ material: { ...selectedBody.material, friction } })} /></label>
            <label className="physics-field"><span>Bounce</span><NumericInput min="0" max="2" step="0.05" value={selectedBody.material.restitution} defaultValue={0.5} onCommit={restitution => patchSelectedBody({ material: { ...selectedBody.material, restitution } })} /></label>
            <label className="physics-field"><span>Density</span><NumericInput min="0.01" max="100" step="0.1" value={selectedBody.material.density} defaultValue={1} onCommit={density => patchSelectedBody({ material: { ...selectedBody.material, density } })} /></label>
            <label className="physics-field"><span>Damping</span><NumericInput min="0" max="100" step="0.05" value={selectedBody.material.linearDamping} defaultValue={0.01} onCommit={linearDamping => patchSelectedBody({ material: { ...selectedBody.material, linearDamping } })} /></label>
          </div>
          <Button onClick={removeSelectedBody}>Remove physics role</Button>
        </div>}
      </InspectorSection>

      <InspectorSection title="System" defaultOpen>
        <div className="physics-toolbar">
          <Button onClick={createSystem} {...infoProps("Add physics system", "Create an independent physics world with its own clock, gravity, bodies, and mappings.")}>Add system</Button>
          <Button onClick={() => onLoadExample?.("gas")}>Musical gas</Button>
          <Button onClick={() => onLoadExample?.("marionette")}>Marionette</Button>
          <Button onClick={() => onLoadExample?.("portrait")}>Portrait</Button>
        </div>
        <label className="physics-field"><span>System</span><select value={system.id} onChange={event => onActiveSystemChange(event.target.value)}>{graph.systems.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label className="physics-field"><span>Name</span><input value={system.name} onChange={event => patchSystem({ name: event.target.value })} /></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity X (world)" : "Gravity X"}</span><NumericInput step="10" value={system.gravityMode === "world" ? graph.world.gravity.x : system.gravity.x} defaultValue={0} disabled={system.gravityMode === "world"} onCommit={x => patchSystem({ gravity: { ...system.gravity, x } })} /></label>
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity Y (world)" : "Gravity Y"}</span><NumericInput step="10" value={system.gravityMode === "world" ? graph.world.gravity.y : system.gravity.y} defaultValue={-9.8} disabled={system.gravityMode === "world"} onCommit={y => patchSystem({ gravity: { ...system.gravity, y } })} /></label>
        </div>
        <div className="physics-transport">
          <Button onClick={() => onPlay(system.id)}>Play</Button>
          <Button onClick={() => onPause(system.id)}>Pause</Button>
          <Button onClick={() => onReset(system.id)}>Reset</Button>
          <Button onClick={() => onApply(system.id)}>Apply pose</Button>
          <Button onClick={removeSystem}>Remove</Button>
        </div>
        <div className="physics-subsection" aria-label="Population">
          <strong>Population</strong>
          <div className="physics-two-column">
            <label className="physics-field"><span>Count</span><NumericInput min="1" max="5000" step="1" value={populationCount} defaultValue={250} onCommit={setPopulationCount} /></label>
            <label className="physics-field"><span>Point size</span><NumericInput min="1" max="80" step="1" value={particleSize} defaultValue={7} onCommit={setParticleSize} /></label>
          </div>
          <div className="physics-toolbar">
            <Button onClick={() => onCreatePopulation({ systemId: system.id, count: populationCount, radius: particleSize })}>Add runtime gas</Button>
            <Button onClick={() => onMaterialize({ systemId: system.id })}>Materialize all</Button>
          </div>
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
    </> : <InspectorSection title="System" defaultOpen>
      <div className="physics-toolbar">
        <Button onClick={createSystem} {...infoProps("Add physics system", "Create an independent physics world with its own clock, gravity, bodies, and mappings.")}>Add system</Button>
        <Button onClick={() => onLoadExample?.("gas")}>Musical gas</Button>
        <Button onClick={() => onLoadExample?.("marionette")}>Marionette</Button>
        <Button onClick={() => onLoadExample?.("portrait")}>Portrait</Button>
      </div>
      <div className="physics-empty">Add a physics system, then draw or select objects on the canvas.</div>
    </InspectorSection>}
  </div>;
}

const constraintLabel = kind => ({
  fixate: "Weld",
  axle: "Axle",
  spring: "Spring",
  rope: "Rope",
  distance: "Distance",
  pin: "Pin",
  revolute: "Revolute",
  weld: "Weld",
  attractor: "Attractor",
  thruster: "Thruster",
  tracer: "Tracer",
}[kind] || "Constraint");

const endpointLabel = endpoint => {
  if (!endpoint) return "Missing endpoint";
  if (endpoint.kind === "none") return "None";
  if (endpoint.kind === "world") return `World · ${Math.round(endpoint.point?.[0] || 0)}, ${Math.round(endpoint.point?.[1] || 0)}`;
  if (endpoint.kind === "stream") return `Stream · ${endpoint.featureId || endpoint.streamId}`;
  if (endpoint.kind === "bezier-anchor") return `Curve anchor · ${endpoint.anchorId}`;
  if (endpoint.kind === "curve-progress") return `Curve · ${Math.round((endpoint.progress || 0) * 100)}%`;
  return `Object · ${endpoint.objectRef?.elementId?.slice(0, 10) || "missing"}`;
};

function ConstraintCard({ constraint: constraintValue, collisionLayers = [], springElement, expanded, onToggle, onUpdate, onRemove }) {
  const constraint = normalizePhysicsConstraint(constraintValue);
  const isSpring = ["spring", "distance"].includes(constraint.kind);
  const isRope = constraint.kind === "rope";
  const isAxle = ["axle", "pin", "revolute"].includes(constraint.kind);
  const isAttractor = constraint.kind === "attractor";
  const isThruster = constraint.kind === "thruster";
  const isTracer = constraint.kind === "tracer";
  const supportsTrail = isTracer || isAxle || ["weld", "fixate"].includes(constraint.kind);
  const limitDegrees = radians => Number((radians * 180 / Math.PI).toFixed(2));
  const setLimitsEnabled = enabled => onUpdate(enabled
    ? {
        limitsEnabled: true,
        lowerLimit: constraint.lowerLimit ?? -Math.PI,
        upperLimit: constraint.upperLimit ?? Math.PI,
      }
    : { limitsEnabled: false, lowerLimit: null, upperLimit: null });
  const resetSpringRestLength = () => {
    const restLength = getSpringGeometricLength(springElement);
    if (restLength !== null) onUpdate({ restLength });
  };
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
          <option value="fixate">Weld</option><option value="axle">Axle</option><option value="spring">Spring</option><option value="rope">Rope</option><option value="attractor">Attractor</option><option value="thruster">Thruster</option><option value="tracer">Tracer</option><option value="distance">Distance</option>
          <option value="pin">Pin (legacy)</option><option value="revolute">Revolute (legacy)</option><option value="weld">Weld (legacy)</option>
        </select></label>
        {!isTracer && <label className="physics-check" {...infoProps("Collide while connected", "Controls only colliders joined directly by this pivot. It does not assign collision layers and it does not enable a rope to collide with every other link.")}><input type="checkbox" checked={constraint.collideConnected} onChange={event => onUpdate({ collideConnected: event.target.checked })} /><span>Collide while connected</span></label>}
      </div>
      <div className="physics-constraint-endpoints"><span>A · {endpointLabel(constraint.a)}</span>{!isTracer && <span>B · {endpointLabel(constraint.b)}</span>}</div>
      {isSpring && <div className="physics-two-column">
        <label className="physics-field"><span>Rest length</span><div className="iannix-inline-action"><NumericInput min="0" step="any" value={constraint.restLength} defaultValue={100} onCommit={restLength => onUpdate({ restLength })} /><Button className="geometry-reset-button" onClick={resetSpringRestLength} disabled={getSpringGeometricLength(springElement) === null} title="Set to current geometry" aria-label="Set rest length to current geometry"><GeometryResetIcon /></Button></div></label>
        <label className="physics-field"><span>Stiffness</span><NumericInput min="0" step="any" value={constraint.stiffness} defaultValue={40} onCommit={stiffness => onUpdate({ stiffness })} /></label>
        <label className="physics-field"><span>Damping</span><NumericInput min="0" step="any" value={constraint.damping} defaultValue={4} onCommit={damping => onUpdate({ damping })} /></label>
      </div>}
      {isRope && <div className="physics-two-column">
        <label className="physics-field"><span>Link length</span><NumericInput min="2" step="any" value={constraint.segmentLength} defaultValue={24} onCommit={segmentLength => onUpdate({ segmentLength })} /></label>
        <label className="physics-field"><span>Thickness</span><NumericInput min="0.5" step="any" value={constraint.thickness} defaultValue={4} onCommit={thickness => onUpdate({ thickness })} /></label>
      </div>}
      {isRope && <>
        <div className="physics-field physics-collision-layer-field" {...infoProps("Collision-layer membership", "These checkboxes assign the rope to one or more layers. The world matrix controls which layer pairs make contact with the rope.")}><span>Belongs to layers</span><CollisionLayerMembershipPicker layers={collisionLayers} values={[constraint.collisionLayers]} onChange={collisionLayersValue => onUpdate({ collisionLayers: collisionLayersValue })} /></div>
        <label className="physics-check" {...infoProps("Self collisions", "Allow non-adjacent links in this rope to collide with one another. Leave this off for a lighter, more stable rope; layer-pair settings still control rope-to-body contact.")}><input type="checkbox" checked={constraint.selfCollisions === true} onChange={event => onUpdate({ selfCollisions: event.target.checked })} /><span>Self collisions</span></label>
      </>}
      {isAxle && <>
        <label className="physics-check" {...infoProps("Motor", "Drives the axle at the chosen angular speed. Positive values rotate counter-clockwise; torque limits how strongly the motor corrects the speed.")}><input type="checkbox" checked={constraint.motorEnabled === true} onChange={event => onUpdate({ motorEnabled: event.target.checked })} /><span>Motor enabled</span></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>Motor speed (°/s)</span><NumericInput step="1" value={constraint.motorSpeed} defaultValue={0} onCommit={motorSpeed => onUpdate({ motorSpeed })} /></label>
          <label className="physics-field"><span>Motor torque</span><NumericInput min="0" step="any" value={constraint.motorTorque} defaultValue={10} onCommit={motorTorque => onUpdate({ motorTorque })} /></label>
        </div>
        <label className="physics-check" {...infoProps("Limit rotation", "Off means an axle can rotate freely through 360 degrees. Enable it to define a lower and upper angle in degrees.")}><input type="checkbox" checked={constraint.limitsEnabled === true} onChange={event => setLimitsEnabled(event.target.checked)} /><span>Limit rotation · {constraint.limitsEnabled ? "custom" : "full 360°"}</span></label>
        <div className="physics-two-column">
          <label className="physics-field" {...infoProps("Lower angle limit", "Axle limit in degrees. Both limits are required when rotation limits are enabled.")}><span>Lower limit (°)</span><NumericInput step="1" disabled={!constraint.limitsEnabled} value={constraint.lowerLimit === null ? "" : limitDegrees(constraint.lowerLimit)} emptyValue={null} onCommit={lowerLimit => onUpdate({ limitsEnabled: true, lowerLimit: lowerLimit === null ? null : lowerLimit * Math.PI / 180 })} /></label>
          <label className="physics-field" {...infoProps("Upper angle limit", "Axle limit in degrees. Both limits are required when rotation limits are enabled.")}><span>Upper limit (°)</span><NumericInput step="1" disabled={!constraint.limitsEnabled} value={constraint.upperLimit === null ? "" : limitDegrees(constraint.upperLimit)} emptyValue={null} onCommit={upperLimit => onUpdate({ limitsEnabled: true, upperLimit: upperLimit === null ? null : upperLimit * Math.PI / 180 })} /></label>
        </div>
      </>}
      {isAttractor && <>
        <div className="physics-two-column">
          <label className="physics-field"><span>Mode</span><select value={constraint.attractionMode} onChange={event => onUpdate({ attractionMode: event.target.value })}><option value="attract">Attract</option><option value="repel">Repel</option></select></label>
          <label className="physics-field"><span>Strength</span><NumericInput min="0" step="any" value={constraint.attractionStrength} defaultValue={20} onCommit={attractionStrength => onUpdate({ attractionStrength })} /></label>
          <label className="physics-field"><span>Radius</span><NumericInput min="0" step="any" value={constraint.attractionRadius} defaultValue={300} onCommit={attractionRadius => onUpdate({ attractionRadius })} /></label>
          <label className="physics-field"><span>Falloff</span><NumericInput min="0" step="0.1" value={constraint.attractionFalloff} defaultValue={1} onCommit={attractionFalloff => onUpdate({ attractionFalloff })} /></label>
        </div>
        <label className="physics-field" {...infoProps("Target tags", "Optional comma-separated collision tags. Leave blank to affect every dynamic body in this physics system.")}><span>Target tags</span><input value={constraint.targetTags.join(", ")} onChange={event => onUpdate({ targetTags: event.target.value.split(",").map(tag => tag.trim()).filter(Boolean) })} /></label>
      </>}
      {isThruster && <label className="physics-field" {...infoProps("Force", "Continuous force in the path's start-to-end direction. The thruster start must attach to a dynamic body.")}><span>Force</span><NumericInput step="any" value={constraint.thrusterForce} defaultValue={20} onCommit={thrusterForce => onUpdate({ thrusterForce })} /></label>}
      {supportsTrail && <>
        <label className="physics-check"><input type="checkbox" checked={constraint.trail?.enabled === true} onChange={event => onUpdate({ trail: { ...constraint.trail, enabled: event.target.checked } })} /><span>Trail</span></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>Trail color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(constraint.trail?.color) ? constraint.trail.color : "#4f8cff"} onChange={event => onUpdate({ trail: { ...constraint.trail, color: event.target.value } })} /></label>
          <label className="physics-field"><span>Time length (s)</span><NumericInput min="0.1" max="120" step="0.25" value={constraint.trail?.duration} defaultValue={4} onCommit={duration => onUpdate({ trail: { ...constraint.trail, duration } })} /></label>
          <label className="physics-field"><span>Opacity</span><NumericInput min="0" max="1" step="0.05" value={constraint.trail?.opacity} defaultValue={0.75} onCommit={opacity => onUpdate({ trail: { ...constraint.trail, opacity } })} /></label>
        </div>
      </>}
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
          <label className="physics-field"><span>Input min</span><NumericInput value={mapping.source.range.min} defaultValue={0} onCommit={min => patchSource({ range: { ...mapping.source.range, min } })} /></label>
          <label className="physics-field"><span>Input max</span><NumericInput value={mapping.source.range.max} defaultValue={10} onCommit={max => patchSource({ range: { ...mapping.source.range, max } })} /></label>
        </div>
        <div className="physics-two-column">
          <label className="physics-field"><span>A tags</span><input value={mapping.source.tagsA.join(", ")} onChange={event => patchSource({ tagsA: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
          <label className="physics-field"><span>B tags</span><input value={mapping.source.tagsB.join(", ")} onChange={event => patchSource({ tagsB: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
        </div>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Filter</legend>
        <div className="physics-two-column">
          <label className="physics-field"><span>Minimum</span><NumericInput value={mapping.filter.min ?? ""} emptyValue={null} onCommit={min => patchFilter({ min })} /></label>
          <label className="physics-field"><span>Maximum</span><NumericInput value={mapping.filter.max ?? ""} emptyValue={null} onCommit={max => patchFilter({ max })} /></label>
        </div>
        <label className="physics-field" {...infoProps("Filter formula", FORMULA_HELP.filter, FORMULA_EXAMPLES.filter)}><span>Formula</span><input value={mapping.filter.expression} placeholder="e.g. impulse > 0.3 && speed > 0.1" onChange={event => patchFilter({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Transform</legend>
        <div className="physics-two-column">
          <label className="physics-field"><span>Output min</span><NumericInput value={mapping.transform.outputMin} defaultValue={0} onCommit={outputMin => patchTransform({ outputMin })} /></label>
          <label className="physics-field"><span>Output max</span><NumericInput value={mapping.transform.outputMax} defaultValue={1} onCommit={outputMax => patchTransform({ outputMax })} /></label>
          <label className="physics-field"><span>Scale</span><NumericInput value={mapping.transform.scale} defaultValue={1} step="0.1" onCommit={scale => patchTransform({ scale })} /></label>
          <label className="physics-field"><span>Offset</span><NumericInput value={mapping.transform.offset} defaultValue={0} step="0.1" onCommit={offset => patchTransform({ offset })} /></label>
        </div>
        <label className="physics-check"><input type="checkbox" checked={mapping.transform.clamp} onChange={event => patchTransform({ clamp: event.target.checked })} /><span>Clamp output</span></label>
        <label className="physics-field" {...infoProps("Transform formula", FORMULA_HELP.transform, FORMULA_EXAMPLES.transform)}><span>Formula</span><input value={mapping.transform.expression} placeholder="e.g. clamp(norm * 127, 1, 127)" onChange={event => patchTransform({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Target</legend>
        <label className="physics-field"><span>Type</span><select value={target.kind} onChange={event => patchTarget({ kind: event.target.value })}><option value="midi-note">MIDI Note</option><option value="midi-cc">MIDI CC</option><option value="midi-bend">MIDI Pitch Bend</option><option value="expressive-voice">Expressive Synth</option>{target.kind === "legacy-action" && <option value="legacy-action">Compatibility route</option>}</select></label>
        {target.kind === "midi-note" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Channel</span><NumericInput min="1" max="16" value={target.channel} defaultValue={1} onCommit={channel => patchTarget({ channel })} /></label><label className="physics-field"><span>Note</span><NumericInput min="0" max="127" value={target.note} defaultValue={60} onCommit={note => patchTarget({ note })} /></label><label className="physics-field"><span>Duration</span><NumericInput min="0.01" step="0.01" value={target.duration} defaultValue={0.16} onCommit={duration => patchTarget({ duration })} /></label></div>
          <label className="physics-field" {...infoProps("Pitch formula", FORMULA_HELP.pitch, FORMULA_EXAMPLES.pitch)}><span>Pitch formula</span><input value={target.noteExpression} placeholder="e.g. major(baseNote, floor(speed / 12))" onChange={event => patchTarget({ noteExpression: event.target.value })} /></label>
          <label className="physics-field" {...infoProps("Velocity formula", FORMULA_HELP.velocity, FORMULA_EXAMPLES.velocity)}><span>Velocity formula</span><input value={target.velocityExpression} onChange={event => patchTarget({ velocityExpression: event.target.value })} /></label>
          <label className="physics-field"><span>Minimum hold</span><NumericInput min="0" step="0.01" value={target.minimumHold} defaultValue={0.02} onCommit={minimumHold => patchTarget({ minimumHold })} /></label>
        </>}
        {target.kind === "midi-cc" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><NumericInput min="1" max="16" value={target.channel} defaultValue={1} onCommit={channel => patchTarget({ channel })} /></label><label className="physics-field"><span>Controller</span><NumericInput min="0" max="127" value={target.controller} defaultValue={1} onCommit={controller => patchTarget({ controller })} /></label><label className="physics-field" {...infoProps("CC value formula", FORMULA_HELP.cc, FORMULA_EXAMPLES.cc)}><span>Value formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "midi-bend" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><NumericInput min="1" max="16" value={target.channel} defaultValue={1} onCommit={channel => patchTarget({ channel })} /></label><label className="physics-field" {...infoProps("Pitch bend formula", FORMULA_HELP.bend, FORMULA_EXAMPLES.bend)}><span>Bend formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "expressive-voice" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Program</span><select value={target.program} onChange={event => patchTarget({ program: event.target.value })}>{(programs.length ? programs : [{ id: "bowed", name: "Bowed" }]).map(program => <option key={program.id} value={program.id}>{program.name || program.id}</option>)}</select></label></div>
          <div className="physics-two-column"><label className="physics-field" {...infoProps("Voice note formula", FORMULA_HELP.voiceNote, FORMULA_EXAMPLES.voiceNote)}><span>Note formula</span><input value={target.noteExpression} onChange={event => patchTarget({ noteExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice gain formula", FORMULA_HELP.voiceGain, FORMULA_EXAMPLES.voiceGain)}><span>Gain formula</span><input value={target.gainExpression} onChange={event => patchTarget({ gainExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice pressure formula", FORMULA_HELP.voicePressure, FORMULA_EXAMPLES.voicePressure)}><span>Pressure formula</span><input value={target.pressureExpression} onChange={event => patchTarget({ pressureExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice brightness formula", FORMULA_HELP.voiceBrightness, FORMULA_EXAMPLES.voiceBrightness)}><span>Brightness formula</span><input value={target.brightnessExpression} onChange={event => patchTarget({ brightnessExpression: event.target.value })} /></label><label className="physics-field" {...infoProps("Voice pan formula", FORMULA_HELP.voicePan, FORMULA_EXAMPLES.voicePan)}><span>Pan formula</span><input value={target.panExpression} onChange={event => patchTarget({ panExpression: event.target.value })} /></label><label className="physics-field"><span>Duration</span><NumericInput min="0.01" step="0.01" value={target.duration} defaultValue={0.16} onCommit={duration => patchTarget({ duration })} /></label></div>
        </>}
        {target.kind === "legacy-action" && <small>Imported compatibility route. Create a new MIDI or Expressive Synth mapping to edit the canonical target.</small>}
      </fieldset>
      <div className="physics-two-column"><label className="physics-field"><span>Cooldown ms</span><NumericInput min="0" value={mapping.cooldownMs} defaultValue={35} onCommit={cooldownMs => onUpdate({ cooldownMs })} /></label><label className="physics-check"><input type="checkbox" checked={mapping.perPair} onChange={event => onUpdate({ perPair: event.target.checked })} /><span>Cooldown per pair</span></label></div>
      {expressionError && <div className="physics-mapping-error">{expressionError}</div>}
    </div>}
  </article>;
}
