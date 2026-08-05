const Glyph = ({ kind }) => {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "dynamic") return <svg {...common}><circle cx="12" cy="12" r="6" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2" /></svg>;
  if (kind === "kinematic") return <svg {...common}><rect x="5" y="7" width="10" height="10" rx="1" /><path d="m15 12 4-3m-4 3 4 3" /></svg>;
  if (kind === "fixed") return <svg {...common}><path d="M4 15h16M6 15l2-5 2 5 2-5 2 5 2-5 2 5" /><path d="M5 19h14" /></svg>;
  if (kind === "sensor") return <svg {...common}><circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" /><circle cx="12" cy="12" r="1" /></svg>;
  if (kind === "spring") return <svg {...common}><path d="M3 12h3l2-5 3 10 3-10 3 5h3" /></svg>;
  if (kind === "fixate") return <svg {...common}><path d="M6 5v14m12-14v14M3 9h6m6 0h6M3 15h6m6 0h6" /><path d="M9 12h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v6m0 6v6M3 12h6m6 0h6" /></svg>;
};

const Tool = ({ kind, label, active, disabled, onClick }) => <button
  type="button"
  className={`physics-canvas-tool${active ? " active" : ""}`}
  aria-label={label}
  title={label}
  disabled={disabled}
  onClick={onClick}
>
  <Glyph kind={kind} />
</button>;

export default function PhysicsCanvasToolbar({ selectedCount = 0, activeTool, onAssignBody, onAssignCollider, onBeginTool }) {
  return <aside className="physics-canvas-toolbar" aria-label="Physics tools" onPointerDown={event => event.stopPropagation()}>
    <div className="physics-canvas-tool-group" aria-label="Physics body roles">
      <Tool kind="dynamic" label="Make selected objects dynamic bodies" disabled={!selectedCount} onClick={() => onAssignBody?.({ bodyType: "dynamic" })} />
      <Tool kind="kinematic" label="Make selected objects kinematic bodies" disabled={!selectedCount} onClick={() => onAssignBody?.({ bodyType: "kinematic" })} />
      <Tool kind="fixed" label="Make selected objects fixed colliders" disabled={!selectedCount} onClick={() => onAssignCollider?.({ sensor: false })} />
      <Tool kind="sensor" label="Make selected objects sensors" disabled={!selectedCount} onClick={() => onAssignCollider?.({ sensor: true })} />
    </div>
    <div className="physics-canvas-tool-separator" />
    <div className="physics-canvas-tool-group" aria-label="Physics constraints">
      <Tool kind="spring" label="Spring: click two attachment points" active={activeTool === "spring"} onClick={() => onBeginTool?.("spring")} />
      <Tool kind="fixate" label="Fixate: weld clicked body to overlapping body or World" active={activeTool === "fixate"} onClick={() => onBeginTool?.("fixate")} />
      <Tool kind="axle" label="Axle: hinge clicked body to overlapping body or World" active={activeTool === "axle"} onClick={() => onBeginTool?.("axle")} />
    </div>
  </aside>;
}
