import React from "react";
import { formatGridTimeMapping } from "./gridSystem.js";
import InspectorSection from "./InspectorSection.jsx";
import { infoProps } from "./uiInfo.js";
import TimeValueInput from "./TimeValueInput.jsx";
import NumericInput from "./NumericInput.jsx";

const NumberField = ({ label, value, onChange, defaultValue, help, ...inputProps }) => (
  <label className="grid-panel-field" {...(help ? infoProps(label, help) : {})}>
    <span>{label}</span>
    <NumericInput value={value} defaultValue={defaultValue} onCommit={next => onChange({ target: { value: String(next), valueAsNumber: next } })} data-default={defaultValue} {...inputProps} />
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
    <input type="checkbox" checked={checked === true} onChange={onChange} />
  </label>
);

export default function GridPanel({
  grid,
  selectionFilter,
  tempo,
  signature,
  fps,
  sampleRate = 48000,
  onUpdate,
  onReset,
  onQuantizeSelection,
  onToggleSelectionFilter,
}) {
  return (
    <div className="grid-panel" role="form" aria-label="Global grid controls">
      <InspectorSection title="Geometry" className="grid-panel-group grid-panel-geometry" aria-label="Grid geometry">
        <div className="grid-panel-row">
          <Check label="Visible" help="Show or hide the Underscores grid without changing its snapping behavior." checked={grid.appearance.visible} onChange={event => onUpdate({ appearance: { visible: event.target.checked } })} />
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
          <Check label="Dots when Snap Off" help="Show only grid intersections as dots while snapping is Off. Snap-enabled grids keep the line rendering." checked={grid.appearance.unsnappedDots} onChange={event => onUpdate({ appearance: { unsnappedDots: event.target.checked } })} />
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
            ['Transforms', 'transforms', 'Snap object bounds during movement and resizing. Freehand shape and pressure remain intact; multi-selection preserves relative spacing.'],
            ['Points', 'points', 'Snap individual line, spline, Bézier, and freehand points while entering or explicitly editing them.'],
            ['Generated', 'generated', 'Allow modifier- or script-generated geometry to opt into grid snapping. Disabled by default to preserve procedural output.'],
          ].map(([label, key, help]) => (
            <Check key={key} label={label} help={help} checked={grid.snap.targets[key]} onChange={event => onUpdate({ snap: { targets: { [key]: event.target.checked } } })} />
          ))}
        </div>
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onQuantizeSelection} {...infoProps("Quantize points", "Explicitly snap every authored point in the selection to the current grid. Use Transform snapping when you only want the object bounds aligned.")}>Quantize points</button>
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
          <label className="grid-panel-field" {...infoProps("Per cell", "Time represented by one major grid cell. Accepts seconds, milliseconds, frames, samples, clock time, bars, beats, BBU, and note values.")}>
            <span>Per cell</span>
            <TimeValueInput aria-label="Global grid time per cell" data-route-path="grid.time.perCell" value={grid.time.perCell} context={{ tempo, signature, fps, sampleRate }} defaultValue="1 beat" minSeconds={0.000001} onChange={next => onUpdate({ time: { perCell: next } })} />
          </label>
        </div>
        <div className="grid-panel-mapping">{formatGridTimeMapping(grid, { tempo, signature, fps, sampleRate })}</div>
      </InspectorSection>

      <InspectorSection title="Value mapping" className="grid-panel-group grid-panel-value" aria-label="Grid value mapping">
        <div className="grid-panel-row">
          <SelectField label="Axis" help="Grid-local axis used to derive mapped values from object positions." value={grid.value.axis} onChange={event => onUpdate({ value: { axis: event.target.value } })}>
            <option value="y">Y</option><option value="x">X</option>
          </SelectField>
          <SelectField label="Direction" help="Direction in which mapped values increase. Up compensates for the canvas Y axis pointing downward." value={grid.value.direction} onChange={event => onUpdate({ value: { direction: event.target.value } })}>
            <option value="up">Up</option><option value="down">Down</option><option value="right">Right</option><option value="left">Left</option>
          </SelectField>
          <NumberField label="Per cell" help="Value change across one major cell." aria-label="Grid value per cell" step="0.01" defaultValue="1" value={grid.value.amount} onChange={event => onUpdate({ value: { amount: event.target.value } })} />
          <SelectField label="Unit" help="Semitone and scale modes produce MIDI-note values; Hz and ratio modes produce frequencies." value={grid.value.unit} onChange={event => onUpdate({ value: { unit: event.target.value } })}>
            <option value="semitone">Semitone</option><option value="cent">Cent</option><option value="scaleDegree">Scale degree</option><option value="hertz">Hertz</option><option value="ratio">Ratio</option>
          </SelectField>
        </div>
        <div className="grid-panel-row">
          <NumberField label="Origin cell" help="Grid coordinate treated as the value origin." aria-label="Grid value origin cell" step="1" defaultValue="0" value={grid.value.originCell} onChange={event => onUpdate({ value: { originCell: event.target.value } })} />
          <NumberField label="Origin value" help="MIDI note or frequency at the mapping origin, depending on the selected unit." aria-label="Grid value origin" step="0.01" defaultValue="60" value={grid.value.originValue} onChange={event => onUpdate({ value: { originValue: event.target.value } })} />
          <NumberField label="A4 Hz" help="Concert tuning used when converting fractional MIDI notes to frequency." aria-label="Grid tuning frequency" min="1" step="0.1" defaultValue="440" value={grid.value.tuningHz} onChange={event => onUpdate({ value: { tuningHz: event.target.value } })} />
          {grid.value.unit === "scaleDegree" ? (
            <SelectField label="Scale" help="Degree map used by scale-degree conversion. Custom maps remain serialized with the scene." value={grid.value.scale.id} onChange={event => onUpdate({ value: { scale: { id: event.target.value } } })}>
              <option value="chromatic">Chromatic</option><option value="major">Major</option><option value="naturalMinor">Natural minor</option><option value="harmonicMinor">Harmonic minor</option><option value="melodicMinor">Melodic minor</option><option value="majorPentatonic">Major pentatonic</option><option value="minorPentatonic">Minor pentatonic</option><option value="custom">Custom</option>
            </SelectField>
          ) : null}
          {grid.value.unit === "scaleDegree" ? <NumberField label="Scale root" help="Semitone offset applied before scale degrees." aria-label="Grid scale root" step="1" defaultValue="0" value={grid.value.scale.root} onChange={event => onUpdate({ value: { scale: { root: event.target.value } } })} /> : null}
        </div>
        {grid.value.unit === "scaleDegree" && grid.value.scale.id === "custom" ? (
          <div className="grid-panel-row">
            <label className="grid-panel-field" {...infoProps("Custom degrees", "Ascending pitch offsets inside one octave, separated by commas. Fractional values are supported.")}>
              <span>Degrees</span>
              <input
                key={grid.value.scale.degrees.join(",")}
                type="text"
                aria-label="Custom scale degrees"
                defaultValue={grid.value.scale.degrees.join(", ")}
                onBlur={event => {
                  const degrees = event.currentTarget.value.split(/[\s,]+/).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
                  if (degrees.length) onUpdate({ value: { scale: { id: "custom", degrees } } });
                }}
              />
            </label>
            <NumberField label="Octave" help="Pitch span after the final custom degree." aria-label="Custom scale octave" min="0.000001" step="0.01" defaultValue="12" value={grid.value.scale.octave} onChange={event => onUpdate({ value: { scale: { id: "custom", octave: event.target.value } } })} />
          </div>
        ) : null}
        <div className="grid-panel-row grid-panel-actions">
          <button type="button" onClick={onReset}>Reset grid</button>
        </div>
      </InspectorSection>
    </div>
  );
}
