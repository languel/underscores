import InspectorSection from "./InspectorSection.jsx";
import { DEFAULT_EXPRESSIVE_SYNTH_CONFIG, EXPRESSIVE_SYNTH_PRESETS } from "./expressiveSynth.js";

const NumericField = ({ label, value, min, max, step, defaultValue, unit, onChange }) => (
  <label className="settings-panel-field expressive-synth-field">
    <span>{label}</span>
    <span className="expressive-synth-value">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        data-default={defaultValue}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
      />
      {unit ? <small>{unit}</small> : null}
    </span>
  </label>
);

export default function ExpressiveSynthPanel({
  config,
  status,
  error,
  selected,
  voiceCount,
  onSelect,
  onEnable,
  onTest,
  onResetAudio,
  onPanic,
  onCreateDemo,
  onUpdate,
  onResetConfig,
}) {
  const defaults = DEFAULT_EXPRESSIVE_SYNTH_CONFIG;
  return (
    <div className="expressive-synth-panel">
      <InspectorSection
        title="Engine"
        aside={<span>{status}{voiceCount > 0 ? ` · ${voiceCount} voices` : ""}</span>}
      >
        <label className="settings-panel-field">
          <span>Score output</span>
          <button type="button" className={`iannix-flat-button expressive-output-button ${selected ? "active" : ""}`} onClick={onSelect}>
            {selected ? "Expressive Synth selected" : "Use Expressive Synth"}
          </button>
        </label>
        <div className="expressive-synth-actions">
          <button type="button" className="iannix-flat-button" onClick={onEnable}>Enable</button>
          <button type="button" className="iannix-flat-button" onClick={onTest}>Test</button>
          <button type="button" className="iannix-flat-button" onClick={onPanic}>Panic</button>
          <button type="button" className="iannix-flat-button" onClick={onResetAudio}>Reset audio</button>
        </div>
        <div className="settings-panel-hint">
          No voice routing is required: every linked cursor is one voice. Curve Y sets pitch, curve width adds pressure, and cursor speed adds brightness.
        </div>
        <button type="button" className="iannix-flat-button" onClick={onCreateDemo}>Add &amp; play 6-voice glissando demo</button>
        {error ? <div className="settings-panel-hint warning">{error}</div> : null}
      </InspectorSection>

      <InspectorSection title="Voice">
        <label className="settings-panel-field">
          <span>Preset</span>
          <select value={config.preset} onChange={event => onUpdate({ preset: event.target.value })}>
            {EXPRESSIVE_SYNTH_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <NumericField label="Master" value={config.masterGain} min="0" max="1" step="0.01" defaultValue={defaults.masterGain} onChange={value => onUpdate({ masterGain: value })} />
        <NumericField label="Voice gain" value={config.voiceGain} min="0" max="1" step="0.01" defaultValue={defaults.voiceGain} onChange={value => onUpdate({ voiceGain: value })} />
        <NumericField label="Brightness" value={config.brightness} min="0" max="1" step="0.01" defaultValue={defaults.brightness} onChange={value => onUpdate({ brightness: value })} />
        <NumericField label="Damping" value={config.damping} min="0" max="1" step="0.01" defaultValue={defaults.damping} onChange={value => onUpdate({ damping: value })} />
        <NumericField label="Pressure" value={config.pressure} min="0" max="1" step="0.01" defaultValue={defaults.pressure} onChange={value => onUpdate({ pressure: value })} />
      </InspectorSection>

      <InspectorSection title="Envelope">
        <NumericField label="Attack" value={config.attack} min="0.001" max="10" step="0.01" defaultValue={defaults.attack} unit="s" onChange={value => onUpdate({ attack: value })} />
        <NumericField label="Decay" value={config.decay} min="0.001" max="10" step="0.01" defaultValue={defaults.decay} unit="s" onChange={value => onUpdate({ decay: value })} />
        <NumericField label="Sustain" value={config.sustain} min="0" max="1" step="0.01" defaultValue={defaults.sustain} onChange={value => onUpdate({ sustain: value })} />
        <NumericField label="Release" value={config.release} min="0.005" max="20" step="0.01" defaultValue={defaults.release} unit="s" onChange={value => onUpdate({ release: value })} />
      </InspectorSection>

      <InspectorSection title="Visual mapping">
        <label className="settings-panel-check">
          <span>Cursor voices</span>
          <input type="checkbox" checked={config.cursorVoices} onChange={event => onUpdate({ cursorVoices: event.target.checked })} />
        </label>
        <label className="settings-panel-check">
          <span>Trigger voices</span>
          <input type="checkbox" checked={config.triggerVoices} onChange={event => onUpdate({ triggerVoices: event.target.checked })} />
        </label>
        <NumericField label="Pitch at Y origin" value={config.referenceNote} min="0" max="127" step="1" defaultValue={defaults.referenceNote} unit="note" onChange={value => onUpdate({ referenceNote: value })} />
        <NumericField label="Y origin" value={config.referenceY} min="-100000" max="100000" step="1" defaultValue={defaults.referenceY} unit="px" onChange={value => onUpdate({ referenceY: value })} />
        <NumericField label="Pixels per octave" value={config.pixelsPerOctave} min="1" max="10000" step="1" defaultValue={defaults.pixelsPerOctave} unit="px" onChange={value => onUpdate({ pixelsPerOctave: value })} />
        <NumericField label="Transpose" value={config.transpose} min="-48" max="48" step="1" defaultValue={defaults.transpose} unit="st" onChange={value => onUpdate({ transpose: value })} />
        <NumericField label="Glide" value={config.glideMs} min="0" max="2000" step="1" defaultValue={defaults.glideMs} unit="ms" onChange={value => onUpdate({ glideMs: value })} />
        <NumericField label="Width → pressure" value={config.strokeWidthAmount} min="-1" max="1" step="0.01" defaultValue={defaults.strokeWidthAmount} onChange={value => onUpdate({ strokeWidthAmount: value })} />
        <NumericField label="Speed → brightness" value={config.speedAmount} min="-1" max="1" step="0.01" defaultValue={defaults.speedAmount} onChange={value => onUpdate({ speedAmount: value })} />
      </InspectorSection>

      <InspectorSection title="Modulation" defaultOpen={false}>
        <NumericField label="Vibrato depth" value={config.vibratoDepth} min="0" max="2" step="0.01" defaultValue={defaults.vibratoDepth} unit="st" onChange={value => onUpdate({ vibratoDepth: value })} />
        <NumericField label="Vibrato rate" value={config.vibratoRate} min="0.05" max="20" step="0.1" defaultValue={defaults.vibratoRate} unit="Hz" onChange={value => onUpdate({ vibratoRate: value })} />
        <NumericField label="Voice limit" value={config.maxVoices} min="1" max="256" step="1" defaultValue={defaults.maxVoices} onChange={value => onUpdate({ maxVoices: value })} />
        <button type="button" className="iannix-flat-button" onClick={onResetConfig}>Reset synth settings</button>
      </InspectorSection>
    </div>
  );
}
