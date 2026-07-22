import React from "react";
import { formatGridTimeMapping } from "./gridSystem.js";
import InspectorSection from "./InspectorSection.jsx";
import { infoProps } from "./uiInfo.js";

const NumberField = ({ label, value, onChange, defaultValue, help, ...inputProps }) => (
  <label className="grid-panel-field" {...(help ? infoProps(label, help) : {})}>
    <span>{label}</span>
    <input type="number" value={value} onChange={onChange} data-default={defaultValue} {...inputProps} />
  </label>
);

const SelectField = ({ label, value, onChange, children, help }) => (
  <label className="grid-panel-field" {...(help ? infoProps(label, help) : {})}>
    <span>{label}</span>
    <select value={value} onChange={onChange}>{children}</select>
  </label>
);

const Check = ({ label, checked, onChange, help }) => (
  <label className="grid-panel-check" {...(help ? infoProps(label, help) : {})}>
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={onChange} />
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
      <InspectorSection title="Geometry" className="grid-panel-group grid-panel-geometry" aria-label="Grid geometry">
        <div className="grid-panel-row">
          <Check label="Visible" help="Show or hide the Drawerator grid without changing its snapping behavior." checked={grid.appearance.visible} onChange={event => onUpdate({ appearance: { visible: event.target.checked } })} />
          <NumberField label="Spacing X" help="World-space width of one major grid cell." aria-label="Global grid spacing X" min="1" step="1" defaultValue="100" value={grid.spacing.x} onChange={event => onUpdate({ spacing: { x: event.target.value } })} />
          <NumberField label="Spacing Y" help="World-space height of one major grid cell." aria-label="Global grid spacing Y" min="1" step="1" defaultValue="100" value={grid.spacing.y} onChange={event => onUpdate({ spacing: { y: event.target.value } })} />
          <NumberField label="Rotation" help="Rotate the entire grid around its origin, in degrees." aria-label="Global grid rotation" step="1" defaultValue="0" value={Math.round(grid.transform.rotation * 180 / Math.PI * 100) / 100} onChange={event => onUpdate({ transform: { rotation: Number(event.target.value) * Math.PI / 180 } })} />
        </div>
        <div className="grid-panel-row">
          <NumberField label="Sub X" help="Number of minor intervals inside each major cell on the X axis." aria-label="Global grid X subdivisions" min="1" max="64" step="1" defaultValue="5" value={grid.spacing.subdivisionsX} onChange={event => onUpdate({ spacing: { subdivisionsX: event.target.value } })} />
          <NumberField label="Sub Y" help="Number of minor intervals inside each major cell on the Y axis." aria-label="Global grid Y subdivisions" min="1" max="64" step="1" defaultValue="5" value={grid.spacing.subdivisionsY} onChange={event => onUpdate({ spacing: { subdivisionsY: event.target.value } })} />
          <NumberField label="Origin X" help="World-space X coordinate of the grid origin and axis." aria-label="Global grid origin X" step="1" defaultValue="0" value={grid.transform.origin[0]} onChange={event => onUpdate({ transform: { origin: [event.target.value, grid.transform.origin[1]] } })} />
          <NumberField label="Origin Y" help="World-space Y coordinate of the grid origin and axis." aria-label="Global grid origin Y" step="1" defaultValue="0" value={grid.transform.origin[1]} onChange={event => onUpdate({ transform: { origin: [grid.transform.origin[0], event.target.value] } })} />
        </div>
        <div className="grid-panel-row grid-panel-appearance">
          <Check label="Minor" checked={grid.appearance.showMinor} onChange={event => onUpdate({ appearance: { showMinor: event.target.checked } })} />
          <Check label="Major" checked={grid.appearance.showMajor} onChange={event => onUpdate({ appearance: { showMajor: event.target.checked } })} />
          <Check label="Axes" checked={grid.appearance.showAxes} onChange={event => onUpdate({ appearance: { showAxes: event.target.checked } })} />
          <label className="grid-panel-field"><span>Opacity %</span><input aria-label="Global grid opacity" type="number" min="2" max="100" step="1" data-default="32" value={Math.round(grid.appearance.opacity * 100)} onChange={event => onUpdate({ appearance: { opacity: Number(event.target.value) / 100 } })} /></label>
        </div>
      </InspectorSection>

      <InspectorSection title="Snap" className="grid-panel-group grid-panel-snap" aria-label="Grid snapping">
        <div className="grid-panel-row">
          <SelectField label="Mode" help="Hard always quantizes to the nearest node. Magnetic snaps only while inside the screen-pixel radius." value={grid.snap.mode} onChange={event => onUpdate({ snap: { mode: event.target.value } })}>
            <option value="off">Off</option><option value="hard">Hard</option><option value="magnetic">Magnetic</option>
          </SelectField>
          <SelectField label="Resolution" help="Choose whether snapping uses every minor subdivision or major-cell intersections only." value={grid.snap.resolution} onChange={event => onUpdate({ snap: { resolution: event.target.value } })}>
            <option value="minor">Minor</option><option value="major">Major</option>
          </SelectField>
          <SelectField label="Axes" help="Limit quantization to horizontal, vertical, or both grid coordinates." value={grid.snap.axes} onChange={event => onUpdate({ snap: { axes: event.target.value } })}>
            <option value="both">X + Y</option><option value="x">X only</option><option value="y">Y only</option>
          </SelectField>
          <NumberField label="Radius px" help="Screen-space capture distance used by Magnetic mode; it stays consistent while zooming." aria-label="Global grid magnetic threshold" min="1" max="64" step="1" defaultValue="8" value={grid.snap.thresholdPx} onChange={event => onUpdate({ snap: { thresholdPx: event.target.value } })} />
        </div>
        <div className="grid-panel-row grid-panel-targets">
          {[
            ['Input', 'input', 'Snap pointer samples while drawing new lines and freehand strokes.'],
            ['Transforms', 'transforms', 'Snap object creation, movement, and resizing; multi-selection movement preserves relative spacing.'],
            ['Points', 'points', 'Snap individual line, spline, and Bézier points while entering or editing them.'],
            ['Generated', 'generated', 'Allow modifier- or script-generated geometry to opt into grid snapping. Disabled by default to preserve procedural output.'],
          ].map(([label, key, help]) => (
            <Check key={key} label={label} help={help} checked={grid.snap.targets[key]} onChange={event => onUpdate({ snap: { targets: { [key]: event.target.checked } } })} />
          ))}
        </div>
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onQuantizeSelection} {...infoProps("Quantize selection", "Move the selected authored geometry onto the current grid resolution immediately.")}>Quantize selection</button>
        </div>
      </InspectorSection>

      <InspectorSection title="Select" className="grid-panel-group grid-panel-selection" aria-label="Selection filter">
        <div className="grid-panel-selection-options">
          {[["Anything", "anything"], ["Curve", "curve"], ["Cursor", "cursor"], ["Trigger", "trigger"]].map(([label, key]) => (
            <Check key={key} label={label} help={key === "anything" ? "Allow selection of every canvas object." : `Allow selection of objects assigned the ${label} score role.`} checked={selectionFilter[key]} onChange={() => onToggleSelectionFilter(key)} />
          ))}
        </div>
      </InspectorSection>

      <InspectorSection title="Time mapping" className="grid-panel-group grid-panel-time" aria-label="Grid time mapping">
        <div className="grid-panel-row">
          <NumberField label="Per cell" help="Time represented by the distance of one major grid cell." aria-label="Global grid time amount" min="0.000001" step="0.25" defaultValue="1" value={grid.time.amount} onChange={event => onUpdate({ time: { amount: event.target.value } })} />
          <SelectField label="Unit" help="Map major-cell distance to musical, clock, frame, or custom duration units." value={grid.time.unit} onChange={event => onUpdate({ time: { unit: event.target.value } })}>
            <option value="beat">Beats</option><option value="bar">Bars</option><option value="second">Seconds</option><option value="millisecond">Milliseconds</option><option value="frame">Frames</option><option value="custom">Custom</option>
          </SelectField>
          {grid.time.unit === "custom" ? <>
            <NumberField label="Seconds" aria-label="Global grid custom seconds" min="0.000001" step="0.01" defaultValue="1" value={grid.time.customSeconds} onChange={event => onUpdate({ time: { customSeconds: event.target.value } })} />
            <label className="grid-panel-field"><span>Name</span><input aria-label="Global grid custom duration name" type="text" value={grid.time.customLabel} onChange={event => onUpdate({ time: { customLabel: event.target.value } })} /></label>
          </> : null}
        </div>
        <div className="grid-panel-mapping">{formatGridTimeMapping(grid, { tempo, signature, fps })}</div>
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onReset}>Reset grid</button>
        </div>
      </InspectorSection>
    </div>
  );
}
