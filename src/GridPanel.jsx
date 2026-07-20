import React from "react";
import { formatGridTimeMapping } from "./gridSystem.js";

const NumberField = ({ label, value, onChange, ...inputProps }) => (
  <label className="grid-panel-field">
    <span>{label}</span>
    <input type="number" value={value} onChange={onChange} {...inputProps} />
  </label>
);

const SelectField = ({ label, value, onChange, children }) => (
  <label className="grid-panel-field">
    <span>{label}</span>
    <select value={value} onChange={onChange}>{children}</select>
  </label>
);

const Check = ({ label, checked, onChange }) => (
  <label className="grid-panel-check">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span>{label}</span>
  </label>
);

export default function GridPanel({
  grid,
  selectionFilter,
  tempo,
  signature,
  fps,
  onUpdate,
  onReset,
  onQuantizeSelection,
  onToggleSelectionFilter,
}) {
  return (
    <div className="grid-panel" role="form" aria-label="Global grid controls">
      <section className="grid-panel-group grid-panel-geometry" aria-label="Grid geometry">
        <div className="grid-panel-group-title">Geometry</div>
        <div className="grid-panel-row">
          <Check label="Visible" checked={grid.appearance.visible} onChange={event => onUpdate({ appearance: { visible: event.target.checked } })} />
          <NumberField label="Spacing X" aria-label="Global grid spacing X" min="1" step="1" value={grid.spacing.x} onChange={event => onUpdate({ spacing: { x: event.target.value } })} />
          <NumberField label="Spacing Y" aria-label="Global grid spacing Y" min="1" step="1" value={grid.spacing.y} onChange={event => onUpdate({ spacing: { y: event.target.value } })} />
          <NumberField label="Rotation" aria-label="Global grid rotation" step="1" value={Math.round(grid.transform.rotation * 180 / Math.PI * 100) / 100} onChange={event => onUpdate({ transform: { rotation: Number(event.target.value) * Math.PI / 180 } })} />
        </div>
        <div className="grid-panel-row">
          <NumberField label="Sub X" aria-label="Global grid X subdivisions" min="1" max="64" step="1" value={grid.spacing.subdivisionsX} onChange={event => onUpdate({ spacing: { subdivisionsX: event.target.value } })} />
          <NumberField label="Sub Y" aria-label="Global grid Y subdivisions" min="1" max="64" step="1" value={grid.spacing.subdivisionsY} onChange={event => onUpdate({ spacing: { subdivisionsY: event.target.value } })} />
          <NumberField label="Origin X" aria-label="Global grid origin X" step="1" value={grid.transform.origin[0]} onChange={event => onUpdate({ transform: { origin: [event.target.value, grid.transform.origin[1]] } })} />
          <NumberField label="Origin Y" aria-label="Global grid origin Y" step="1" value={grid.transform.origin[1]} onChange={event => onUpdate({ transform: { origin: [grid.transform.origin[0], event.target.value] } })} />
        </div>
        <div className="grid-panel-row grid-panel-appearance">
          <Check label="Minor" checked={grid.appearance.showMinor} onChange={event => onUpdate({ appearance: { showMinor: event.target.checked } })} />
          <Check label="Major" checked={grid.appearance.showMajor} onChange={event => onUpdate({ appearance: { showMajor: event.target.checked } })} />
          <Check label="Axes" checked={grid.appearance.showAxes} onChange={event => onUpdate({ appearance: { showAxes: event.target.checked } })} />
          <label className="grid-panel-range"><span>Opacity</span><input aria-label="Global grid opacity" type="range" min="2" max="100" value={Math.round(grid.appearance.opacity * 100)} onChange={event => onUpdate({ appearance: { opacity: Number(event.target.value) / 100 } })} /><output>{Math.round(grid.appearance.opacity * 100)}%</output></label>
        </div>
      </section>

      <section className="grid-panel-group grid-panel-snap" aria-label="Grid snapping">
        <div className="grid-panel-group-title">Snap</div>
        <div className="grid-panel-row">
          <SelectField label="Mode" value={grid.snap.mode} onChange={event => onUpdate({ snap: { mode: event.target.value } })}>
            <option value="off">Off</option><option value="hard">Hard</option><option value="magnetic">Magnetic</option>
          </SelectField>
          <SelectField label="Resolution" value={grid.snap.resolution} onChange={event => onUpdate({ snap: { resolution: event.target.value } })}>
            <option value="minor">Minor</option><option value="major">Major</option>
          </SelectField>
          <SelectField label="Axes" value={grid.snap.axes} onChange={event => onUpdate({ snap: { axes: event.target.value } })}>
            <option value="both">X + Y</option><option value="x">X only</option><option value="y">Y only</option>
          </SelectField>
          <NumberField label="Radius px" aria-label="Global grid magnetic threshold" min="1" max="64" value={grid.snap.thresholdPx} onChange={event => onUpdate({ snap: { thresholdPx: event.target.value } })} />
        </div>
        <div className="grid-panel-row grid-panel-targets">
          {[['Input', 'input'], ['Transforms', 'transforms'], ['Points', 'points'], ['Generated', 'generated']].map(([label, key]) => (
            <Check key={key} label={label} checked={grid.snap.targets[key]} onChange={event => onUpdate({ snap: { targets: { [key]: event.target.checked } } })} />
          ))}
        </div>
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onQuantizeSelection}>Quantize selection</button>
        </div>
      </section>

      <section className="grid-panel-group grid-panel-selection" aria-label="Selection filter">
        <div className="grid-panel-group-title">Select</div>
        <div className="grid-panel-selection-options">
          {[["Anything", "anything"], ["Curve", "curve"], ["Cursor", "cursor"], ["Trigger", "trigger"]].map(([label, key]) => (
            <Check key={key} label={label} checked={selectionFilter[key]} onChange={() => onToggleSelectionFilter(key)} />
          ))}
        </div>
        <div className="grid-panel-selection-summary">
          {selectionFilter.anything ? "All canvas objects" : "Only checked roles"}
        </div>
      </section>

      <section className="grid-panel-group grid-panel-time" aria-label="Grid time mapping">
        <div className="grid-panel-group-title">Time mapping</div>
        <div className="grid-panel-row">
          <NumberField label="Per cell" aria-label="Global grid time amount" min="0.000001" step="0.25" value={grid.time.amount} onChange={event => onUpdate({ time: { amount: event.target.value } })} />
          <SelectField label="Unit" value={grid.time.unit} onChange={event => onUpdate({ time: { unit: event.target.value } })}>
            <option value="beat">Beats</option><option value="bar">Bars</option><option value="second">Seconds</option><option value="millisecond">Milliseconds</option><option value="frame">Frames</option><option value="custom">Custom</option>
          </SelectField>
          {grid.time.unit === "custom" ? <>
            <NumberField label="Seconds" aria-label="Global grid custom seconds" min="0.000001" step="0.01" value={grid.time.customSeconds} onChange={event => onUpdate({ time: { customSeconds: event.target.value } })} />
            <label className="grid-panel-field"><span>Name</span><input aria-label="Global grid custom duration name" type="text" value={grid.time.customLabel} onChange={event => onUpdate({ time: { customLabel: event.target.value } })} /></label>
          </> : null}
        </div>
        <div className="grid-panel-mapping">{formatGridTimeMapping(grid, { tempo, signature, fps })}</div>
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onReset}>Reset grid</button>
        </div>
      </section>
    </div>
  );
}
