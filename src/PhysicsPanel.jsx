import { useMemo, useState } from "react";
import InspectorSection from "./InspectorSection.jsx";
import { createDefaultPhysicsSystem, normalizeRelationshipGraph, normalizeRelationshipMapping } from "./relationshipGraph.js";
import { compileMappingExpression } from "./mappingExpression.js";
import { infoProps } from "./uiInfo.js";

const Button = ({ children, active = false, ...props }) => <button type="button" className={`iannix-flat-button physics-flat-button${active ? " active" : ""}`} {...props}>{children}</button>;

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
  onRemoveBody,
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
}) {
  const graph = normalizeRelationshipGraph(graphValue);
  const system = graph.systems.find(candidate => candidate.id === activeSystemId) || graph.systems[0] || null;
  const [populationCount, setPopulationCount] = useState(250);
  const [particleSize, setParticleSize] = useState(7);
  const [expandedMappingId, setExpandedMappingId] = useState(null);
  const systemTelemetry = telemetry.systems?.find(candidate => candidate.systemId === system?.id);
  const selectedIdSet = useMemo(() => new Set(Object.keys(selectedElementIds).filter(id => selectedElementIds[id])), [selectedElementIds]);
  const selectedBodies = useMemo(() => graph.bodies.filter(body => body.objectRef?.kind === "element" && selectedIdSet.has(body.objectRef.elementId)), [graph.bodies, selectedIdSet]);
  const selectedBody = selectedBodies[0] || null;
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
    if (onPatchBody) {
      onPatchBody(selectedBody.id, patch);
      return;
    }
    onSetGraph({ ...graph, bodies: graph.bodies.map(body => body.id === selectedBody.id ? { ...body, ...patch } : body) });
  };
  const removeSelectedBody = () => {
    if (!selectedBody) return;
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

      <InspectorSection title={`Selection · ${selectedElementCount}`} defaultOpen>
        <div className="physics-role-grid">
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "dynamic" })}>Dynamic body</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignBody({ systemId: system.id, bodyType: "kinematic" })}>Kinematic</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: false })}>Fixed collider</Button>
          <Button disabled={!selectedElementCount} onClick={() => onAssignCollider({ systemId: system.id, sensor: true })}>Sensor</Button>
        </div>
        <div className="physics-tool-grid">
          {["pin", "spring", "distance", "revolute", "weld", "attractor"].map(kind => <Button key={kind} active={activeTool === kind} onClick={() => onBeginTool(kind, system.id)}>{kind}</Button>)}
        </div>
        {selectedBody && <div className="physics-selected-properties">
          <label className="physics-field"><span>Physics name</span><input value={selectedBody.name} onChange={event => patchSelectedBody({ name: event.target.value })} /></label>
          <label className="physics-field"><span>Tags</span><input value={selectedBody.collisionTags.join(", ")} onChange={event => patchSelectedBody({ collisionTags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></label>
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
        <label className="physics-field" {...infoProps("Boolean formula", "Receives raw, norm, value, impulse, speed, x, y, normalX, and normalY. Use arithmetic, comparisons, boolean logic, if, abs, min, max, clamp, and rounding.")}><span>Formula</span><input value={mapping.filter.expression} placeholder="e.g. impulse > 0.3 && speed > 0.1" onChange={event => patchFilter({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Transform</legend>
        <div className="physics-two-column">
          <label className="physics-field"><span>Output min</span><input type="number" value={mapping.transform.outputMin} onChange={event => patchTransform({ outputMin: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Output max</span><input type="number" value={mapping.transform.outputMax} onChange={event => patchTransform({ outputMax: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Scale</span><input type="number" step="0.1" value={mapping.transform.scale} onChange={event => patchTransform({ scale: Number(event.target.value) })} /></label>
          <label className="physics-field"><span>Offset</span><input type="number" step="0.1" value={mapping.transform.offset} onChange={event => patchTransform({ offset: Number(event.target.value) })} /></label>
        </div>
        <label className="physics-check"><input type="checkbox" checked={mapping.transform.clamp} onChange={event => patchTransform({ clamp: event.target.checked })} /><span>Clamp output</span></label>
        <label className="physics-field"><span>Formula</span><input value={mapping.transform.expression} placeholder="e.g. clamp(norm * 127, 1, 127)" onChange={event => patchTransform({ expression: event.target.value })} /></label>
      </fieldset>

      <fieldset className="physics-mapping-block"><legend>Target</legend>
        <label className="physics-field"><span>Type</span><select value={target.kind} onChange={event => patchTarget({ kind: event.target.value })}><option value="midi-note">MIDI Note</option><option value="midi-cc">MIDI CC</option><option value="midi-bend">MIDI Pitch Bend</option><option value="expressive-voice">Expressive Synth</option>{target.kind === "legacy-action" && <option value="legacy-action">Compatibility route</option>}</select></label>
        {target.kind === "midi-note" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field"><span>Note</span><input type="number" min="0" max="127" value={target.note} onChange={event => patchTarget({ note: Number(event.target.value), noteExpression: String(Number(event.target.value)) })} /></label><label className="physics-field"><span>Duration</span><input type="number" min="0.01" step="0.01" value={target.duration} onChange={event => patchTarget({ duration: Number(event.target.value) })} /></label></div>
          <label className="physics-field"><span>Velocity formula</span><input value={target.velocityExpression} onChange={event => patchTarget({ velocityExpression: event.target.value })} /></label>
          <label className="physics-field"><span>Minimum hold</span><input type="number" min="0" step="0.01" value={target.minimumHold} onChange={event => patchTarget({ minimumHold: Number(event.target.value) })} /></label>
        </>}
        {target.kind === "midi-cc" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field"><span>Controller</span><input type="number" min="0" max="127" value={target.controller} onChange={event => patchTarget({ controller: Number(event.target.value) })} /></label><label className="physics-field"><span>Value formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "midi-bend" && <div className="physics-two-column"><label className="physics-field"><span>Channel</span><input type="number" min="1" max="16" value={target.channel} onChange={event => patchTarget({ channel: Number(event.target.value) })} /></label><label className="physics-field"><span>Bend formula</span><input value={target.valueExpression} onChange={event => patchTarget({ valueExpression: event.target.value })} /></label></div>}
        {target.kind === "expressive-voice" && <>
          <div className="physics-two-column"><label className="physics-field"><span>Mode</span><select value={target.mode} onChange={event => patchTarget({ mode: event.target.value })}><option value="hit">Hit</option><option value="gate">Begin / end gate</option></select></label><label className="physics-field"><span>Program</span><select value={target.program} onChange={event => patchTarget({ program: event.target.value })}>{(programs.length ? programs : [{ id: "bowed", name: "Bowed" }]).map(program => <option key={program.id} value={program.id}>{program.name || program.id}</option>)}</select></label></div>
          <div className="physics-two-column"><label className="physics-field"><span>Note formula</span><input value={target.noteExpression} onChange={event => patchTarget({ noteExpression: event.target.value })} /></label><label className="physics-field"><span>Gain formula</span><input value={target.gainExpression} onChange={event => patchTarget({ gainExpression: event.target.value })} /></label><label className="physics-field"><span>Pressure formula</span><input value={target.pressureExpression} onChange={event => patchTarget({ pressureExpression: event.target.value })} /></label><label className="physics-field"><span>Brightness formula</span><input value={target.brightnessExpression} onChange={event => patchTarget({ brightnessExpression: event.target.value })} /></label><label className="physics-field"><span>Pan formula</span><input value={target.panExpression} onChange={event => patchTarget({ panExpression: event.target.value })} /></label><label className="physics-field"><span>Duration</span><input type="number" min="0.01" step="0.01" value={target.duration} onChange={event => patchTarget({ duration: Number(event.target.value) })} /></label></div>
        </>}
        {target.kind === "legacy-action" && <small>Imported compatibility route. Create a new MIDI or Expressive Synth mapping to edit the canonical target.</small>}
      </fieldset>
      <div className="physics-two-column"><label className="physics-field"><span>Cooldown ms</span><input type="number" min="0" value={mapping.cooldownMs} onChange={event => onUpdate({ cooldownMs: Number(event.target.value) })} /></label><label className="physics-check"><input type="checkbox" checked={mapping.perPair} onChange={event => onUpdate({ perPair: event.target.checked })} /><span>Cooldown per pair</span></label></div>
      {expressionError && <div className="physics-mapping-error">{expressionError}</div>}
    </div>}
  </article>;
}
