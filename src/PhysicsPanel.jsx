import { useMemo, useState } from "react";
import InspectorSection from "./InspectorSection.jsx";
import { createDefaultPhysicsSystem, normalizeRelationshipGraph } from "./relationshipGraph.js";
import { infoProps } from "./uiInfo.js";

const Button = ({ children, active = false, ...props }) => <button type="button" className={`physics-flat-button${active ? " active" : ""}`} {...props}>{children}</button>;

export default function PhysicsPanel({
  graph: graphValue,
  activeSystemId,
  onActiveSystemChange,
  selectedElementCount = 0,
  selectedElementIds = {},
  activeTool = null,
  telemetry = {},
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
  onAddRoute,
  onMaterialize,
  onSculpt,
  onLoadExample,
}) {
  const graph = normalizeRelationshipGraph(graphValue);
  const system = graph.systems.find(candidate => candidate.id === activeSystemId) || graph.systems[0] || null;
  const [populationCount, setPopulationCount] = useState(250);
  const [particleSize, setParticleSize] = useState(7);
  const systemTelemetry = telemetry.systems?.find(candidate => candidate.systemId === system?.id);
  const selectedIdSet = useMemo(() => new Set(Object.keys(selectedElementIds).filter(id => selectedElementIds[id])), [selectedElementIds]);
  const selectedBodies = useMemo(() => graph.bodies.filter(body => body.objectRef?.kind === "element" && selectedIdSet.has(body.objectRef.elementId)), [graph.bodies, selectedIdSet]);
  const selectedBody = selectedBodies[0] || null;
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
      routes: graph.routes.filter(item => item.systemId !== system.id),
    });
  };
  const counts = useMemo(() => system ? {
    bodies: graph.bodies.filter(item => item.systemId === system.id).length,
    populations: graph.populations.filter(item => item.systemId === system.id).length,
    constraints: graph.constraints.filter(item => item.systemId === system.id).length,
    routes: graph.routes.filter(item => item.systemId === system.id).length,
  } : { bodies: 0, populations: 0, constraints: 0, routes: 0 }, [graph, system]);

  return <div className="physics-panel">
    <div className="physics-toolbar">
      <Button onClick={createSystem} {...infoProps("Add physics system", "Create an independent physics world with its own clock, gravity, bodies, and routes.")}>Add system</Button>
      <Button onClick={() => onLoadExample?.("gas")}>Musical gas</Button>
      <Button onClick={() => onLoadExample?.("marionette")}>Marionette</Button>
      <Button onClick={() => onLoadExample?.("portrait")}>Portrait</Button>
    </div>

    {system ? <>
      <InspectorSection title="System" defaultOpen>
        <label className="physics-field"><span>System</span><select value={system.id} onChange={event => onActiveSystemChange(event.target.value)}>{graph.systems.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label className="physics-field"><span>Name</span><input value={system.name} onChange={event => patchSystem({ name: event.target.value })} /></label>
        <div className="physics-two-column">
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity X (world)" : "Gravity X"}</span><input type="number" step="10" value={system.gravityMode === "world" ? graph.world.gravity.x : system.gravity.x} disabled={system.gravityMode === "world"} onChange={event => patchSystem({ gravity: { ...system.gravity, x: Number(event.target.value) } })} /></label>
          <label className="physics-field"><span>{system.gravityMode === "world" ? "Gravity Y (world)" : "Gravity Y"}</span><input type="number" step="10" value={system.gravityMode === "world" ? graph.world.gravity.y : system.gravity.y} disabled={system.gravityMode === "world"} onChange={event => patchSystem({ gravity: { ...system.gravity, y: Number(event.target.value) } })} /></label>
        </div>
        <div className="physics-two-column">
          <label className="physics-field"><span>Clock</span><select value={system.clock.mode} onChange={event => patchSystem({ clock: { ...system.clock, mode: event.target.value } })}><option value="realtime">Independent</option><option value="transport">Music transport</option></select></label>
          <label className="physics-field"><span>Time scale</span><input type="number" min="0" max="8" step="0.05" value={system.clock.timeScale} onChange={event => patchSystem({ clock: { ...system.clock, timeScale: Number(event.target.value) } })} /></label>
        </div>
        <label className="physics-check"><input type="checkbox" checked={system.emitStayEvents} onChange={event => patchSystem({ emitStayEvents: event.target.checked })} /><span>Continuous stay events</span></label>
        <div className="physics-transport">
          <Button onClick={() => onPlay(system.id)}>Play</Button>
          <Button onClick={() => onPause(system.id)}>Pause</Button>
          <Button onClick={() => onReset(system.id)}>Reset</Button>
          <Button onClick={() => onApply(system.id)}>Apply pose</Button>
          <Button onClick={removeSystem}>Remove</Button>
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

      <InspectorSection title="Collision routes" defaultOpen={false}>
        <div className="physics-toolbar">
          <Button onClick={() => onAddRoute({ systemId: system.id, collisionClass: "body-body", sound: "particle" })}>Body ↔ body sound</Button>
          <Button onClick={() => onAddRoute({ systemId: system.id, collisionClass: "body-wall", sound: "wall" })}>Body ↔ wall sound</Button>
        </div>
        {graph.routes.filter(route => route.systemId === system.id).map(route => <div key={route.id} className="physics-route-row"><span>{route.name}</span><small>{route.filter.classes.join(", ") || "any"} · {route.actions.map(action => action.kind).join("+")}</small></div>)}
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
        <div className="physics-readout"><span>Routes</span><strong>{counts.routes}</strong></div>
        <div className="physics-readout"><span>Runtime bodies</span><strong>{systemTelemetry?.bodyCount || 0}</strong></div>
        <div className="physics-readout"><span>Solver step</span><strong>{Number(telemetry.stepMs || 0).toFixed(2)} ms</strong></div>
        <div className="physics-readout"><span>Events</span><strong>{Number(telemetry.eventRate || 0).toFixed(1)}/s</strong></div>
        <div className="physics-readout"><span>Dropped</span><strong>{systemTelemetry?.droppedEvents || 0}</strong></div>
      </InspectorSection>
    </> : <div className="physics-empty">Add a physics system, then draw or select objects on the canvas.</div>}
  </div>;
}
