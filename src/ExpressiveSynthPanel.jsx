import { useEffect, useMemo, useState } from "react";
import InspectorSection from "./InspectorSection.jsx";
import { infoProps } from "./uiInfo.js";
import TimeValueInput from "./TimeValueInput.jsx";
import { createTimeValue } from "./timeValue.js";
import {
  DEFAULT_EXPRESSIVE_SYNTH_CONFIG,
  EXPRESSIVE_SYNTH_PRESETS,
  getExpressiveSynthPrograms,
} from "./expressiveSynth.js";

const NumericField = ({ label, value, min, max, step, defaultValue, unit, onChange, help }) => (
  <label className="settings-panel-field expressive-synth-field" {...infoProps(label, help)}>
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

const TimeField = ({ label, value, context, defaultValue, minSeconds, routePath, onChange, help }) => (
  <label className="settings-panel-field expressive-synth-field" {...infoProps(label, help)}>
    <span>{label}</span>
    <TimeValueInput aria-label={label} data-route-path={routePath} value={value} context={context} defaultValue={defaultValue} minSeconds={minSeconds} onChange={onChange} />
  </label>
);

const programDraft = program => ({
  id: program.id,
  label: program.label,
  preset: program.preset || program.id,
  voiceGain: program.voiceGain,
  attack: program.attack,
  decay: program.decay,
  sustain: program.sustain,
  release: program.release,
  brightness: program.brightness,
  damping: program.damping,
  pressure: program.pressure,
  vibratoDepth: program.vibratoDepth,
  vibratoRate: program.vibratoRate,
  transpose: program.transpose,
  glideMs: program.glideMs,
  attackValue: program.attackValue || createTimeValue(`${program.attack} s`, program.attack),
  decayValue: program.decayValue || createTimeValue(`${program.decay} s`, program.decay),
  releaseValue: program.releaseValue || createTimeValue(`${program.release} s`, program.release),
  glideValue: program.glideValue || createTimeValue(`${program.glideMs} ms`, program.glideMs / 1000),
});

const createProgramId = label => {
  const slug = String(label || "program").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "program";
  return `user-${slug}-${Date.now().toString(36)}`;
};

export default function ExpressiveSynthPanel({
  config,
  status,
  error,
  voiceCount,
  onOpenMixer,
  onEnable,
  onTest,
  onResetAudio,
  onPanic,
  onUpdate,
  onSaveProgram,
  onDeleteProgram,
  onResetConfig,
  timeContext,
}) {
  const defaults = DEFAULT_EXPRESSIVE_SYNTH_CONFIG;
  const programs = useMemo(() => getExpressiveSynthPrograms(config), [config]);
  const [selectedProgramId, setSelectedProgramId] = useState(config.preset || "bowed");
  const selectedProgram = programs.find(program => program.id === selectedProgramId) || programs[0];
  const [draft, setDraft] = useState(() => programDraft(selectedProgram));

  useEffect(() => {
    const next = programs.find(program => program.id === selectedProgramId) || programs[0];
    if (!next) return;
    if (next.id !== selectedProgramId) setSelectedProgramId(next.id);
    setDraft(programDraft(next));
  }, [programs, selectedProgramId]);

  const updateDraft = patch => setDraft(current => ({ ...current, ...patch }));
  const chooseProgram = id => {
    const next = programs.find(program => program.id === id);
    if (!next) return;
    setSelectedProgramId(id);
    setDraft(programDraft(next));
  };
  const saveAs = () => {
    const label = draft.label.trim() || `${selectedProgram.label} copy`;
    const id = createProgramId(label);
    onSaveProgram({ ...draft, id, label });
    setSelectedProgramId(id);
  };
  const save = () => {
    if (selectedProgram.builtin) return saveAs();
    onSaveProgram({ ...draft, id: selectedProgram.id, label: draft.label.trim() || selectedProgram.label });
  };

  return (
    <div className="expressive-synth-panel">
      <InspectorSection
        title="Engine"
        aside={<span>{status}{voiceCount > 0 ? ` · ${voiceCount} voices` : ""}</span>}
      >
        <label className="settings-panel-field" {...infoProps("Mixer routing", "Mixer tracks choose their MIDI channel, output destination, instrument, and program. Expressive tracks may share a program or use different programs.")}>
          <span>Routing</span>
          <button type="button" className="iannix-flat-button expressive-output-button" onClick={onOpenMixer}>Open Mixer</button>
        </label>
        <div className="expressive-synth-actions">
          <button type="button" className="iannix-flat-button" onClick={onEnable} {...infoProps("Enable audio", "Start or resume the browser audio engine after a user gesture.")}>Enable</button>
          <button type="button" className="iannix-flat-button" onClick={() => onTest(draft)} {...infoProps("Test program", "Play a short glissando with the currently edited program, including unsaved changes.")}>Test</button>
          <button type="button" className="iannix-flat-button" onClick={onPanic} {...infoProps("Panic", "Immediately release all internal and external notes.")}>Panic</button>
          <button type="button" className="iannix-flat-button" onClick={onResetAudio} {...infoProps("Reset audio", "Close and recreate the expressive audio engine if sound becomes stuck.")}>Reset audio</button>
        </div>
        <NumericField label="Master" value={config.masterGain} min="0" max="1" step="0.01" defaultValue={defaults.masterGain} help="Global Expressive Synth output level. This is shared by all programs and tracks." onChange={value => onUpdate({ masterGain: value })} />
        {error ? <div className="settings-panel-hint warning">{error}</div> : null}
      </InspectorSection>

      <InspectorSection title="Program">
        <label className="settings-panel-field" {...infoProps("Program", "Choose a built-in program to audition or a user program to edit. Mixer tracks select from the same program library.")}>
          <span>Program</span>
          <select value={selectedProgram.id} onChange={event => chooseProgram(event.target.value)}>
            <optgroup label="Factory">
              {programs.filter(program => program.builtin).map(program => <option key={program.id} value={program.id}>{program.label}</option>)}
            </optgroup>
            {programs.some(program => !program.builtin) ? (
              <optgroup label="Scene">
                {programs.filter(program => !program.builtin).map(program => <option key={program.id} value={program.id}>{program.label}</option>)}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="settings-panel-field" {...infoProps("Program name", "Name used by the program picker in the Mixer. User programs are stored with the scene.")}>
          <span>Name</span>
          <input type="text" value={draft.label} onChange={event => updateDraft({ label: event.target.value })} />
        </label>
        <label className="settings-panel-field" {...infoProps("Synthesis model", "Select the oscillator or physical-model-inspired voice structure used by this program.")}>
          <span>Model</span>
          <select value={draft.preset} onChange={event => updateDraft({ preset: event.target.value })}>
            {EXPRESSIVE_SYNTH_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <div className="expressive-program-actions">
          <button type="button" className="iannix-flat-button" onClick={save}>{selectedProgram.builtin ? "Save As" : "Save"}</button>
          {!selectedProgram.builtin ? <button type="button" className="iannix-flat-button" onClick={saveAs}>Save As</button> : null}
          {!selectedProgram.builtin ? (
            <button type="button" className="iannix-flat-button" onClick={() => {
              onDeleteProgram(selectedProgram.id);
              setSelectedProgramId("bowed");
            }}>Delete</button>
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection title="Voice">
        <NumericField label="Voice gain" value={draft.voiceGain} min="0" max="1" step="0.01" defaultValue={selectedProgram.voiceGain} help="Per-voice level stored in this program." onChange={value => updateDraft({ voiceGain: value })} />
        <NumericField label="Brightness" value={draft.brightness} min="0" max="1" step="0.01" defaultValue={selectedProgram.brightness} help="Base low-pass brightness before score-driven modulation." onChange={value => updateDraft({ brightness: value })} />
        <NumericField label="Damping" value={draft.damping} min="0" max="1" step="0.01" defaultValue={selectedProgram.damping} help="Controls resonance and energy loss in the voice model." onChange={value => updateDraft({ damping: value })} />
        <NumericField label="Pressure" value={draft.pressure} min="0" max="1" step="0.01" defaultValue={selectedProgram.pressure} help="Base excitation pressure before stroke-width modulation." onChange={value => updateDraft({ pressure: value })} />
        <NumericField label="Transpose" value={draft.transpose} min="-48" max="48" step="1" defaultValue={selectedProgram.transpose} unit="st" help="Program pitch offset in semitones." onChange={value => updateDraft({ transpose: value })} />
        <TimeField label="Glide" value={draft.glideValue} context={timeContext} defaultValue="24 ms" minSeconds={0} routePath={`synth.programs.${selectedProgram.id}.glide`} help="Pitch smoothing time for continuously moving score voices." onChange={(next, seconds) => updateDraft({ glideValue: next, glideMs: seconds * 1000 })} />
      </InspectorSection>

      <InspectorSection title="Envelope">
        <TimeField label="Attack" value={draft.attackValue} context={timeContext} defaultValue="60 ms" minSeconds={0.001} routePath={`synth.programs.${selectedProgram.id}.attack`} help="Time for a new voice to reach full level." onChange={(next, seconds) => updateDraft({ attackValue: next, attack: seconds })} />
        <TimeField label="Decay" value={draft.decayValue} context={timeContext} defaultValue="160 ms" minSeconds={0.001} routePath={`synth.programs.${selectedProgram.id}.decay`} help="Time from full level to the sustain level." onChange={(next, seconds) => updateDraft({ decayValue: next, decay: seconds })} />
        <NumericField label="Sustain" value={draft.sustain} min="0" max="1" step="0.01" defaultValue={selectedProgram.sustain} help="Held level while the trigger or cursor voice remains active." onChange={value => updateDraft({ sustain: value })} />
        <TimeField label="Release" value={draft.releaseValue} context={timeContext} defaultValue="350 ms" minSeconds={0.005} routePath={`synth.programs.${selectedProgram.id}.release`} help="Fade time after the geometric note gate ends." onChange={(next, seconds) => updateDraft({ releaseValue: next, release: seconds })} />
      </InspectorSection>

      <InspectorSection title="Modulation" defaultOpen={false}>
        <NumericField label="Vibrato depth" value={draft.vibratoDepth} min="0" max="2" step="0.01" defaultValue={selectedProgram.vibratoDepth} unit="st" help="Program vibrato range in semitones." onChange={value => updateDraft({ vibratoDepth: value })} />
        <NumericField label="Vibrato rate" value={draft.vibratoRate} min="0.05" max="20" step="0.1" defaultValue={selectedProgram.vibratoRate} unit="Hz" help="Program vibrato frequency." onChange={value => updateDraft({ vibratoRate: value })} />
      </InspectorSection>

      <InspectorSection title="Score mapping" defaultOpen={false}>
        <label className="settings-panel-check" {...infoProps("Cursor voices", "Allow active score cursors routed to expressive tracks to create continuous voices.")}>
          <span>Cursor voices</span>
          <input type="checkbox" checked={config.cursorVoices} onChange={event => onUpdate({ cursorVoices: event.target.checked })} />
        </label>
        <label className="settings-panel-check" {...infoProps("Trigger voices", "Allow geometric trigger gates routed to expressive tracks to create voices.")}>
          <span>Trigger voices</span>
          <input type="checkbox" checked={config.triggerVoices} onChange={event => onUpdate({ triggerVoices: event.target.checked })} />
        </label>
        <NumericField label="Pitch at Y origin" value={config.referenceNote} min="0" max="127" step="1" defaultValue={defaults.referenceNote} unit="note" help="MIDI note represented by the score's Y origin." onChange={value => onUpdate({ referenceNote: value })} />
        <NumericField label="Y origin" value={config.referenceY} min="-100000" max="100000" step="1" defaultValue={defaults.referenceY} unit="px" help="World-space Y coordinate used as the pitch reference." onChange={value => onUpdate({ referenceY: value })} />
        <NumericField label="Pixels per octave" value={config.pixelsPerOctave} min="1" max="10000" step="1" defaultValue={defaults.pixelsPerOctave} unit="px" help="Vertical score distance spanning twelve semitones." onChange={value => onUpdate({ pixelsPerOctave: value })} />
        <NumericField label="Width → pressure" value={config.strokeWidthAmount} min="-1" max="1" step="0.01" defaultValue={defaults.strokeWidthAmount} help="Amount by which authored stroke width modulates excitation pressure." onChange={value => onUpdate({ strokeWidthAmount: value })} />
        <NumericField label="Speed → brightness" value={config.speedAmount} min="-1" max="1" step="0.01" defaultValue={defaults.speedAmount} help="Amount by which cursor speed modulates brightness." onChange={value => onUpdate({ speedAmount: value })} />
        <NumericField label="Voice limit" value={config.maxVoices} min="1" max="256" step="1" defaultValue={defaults.maxVoices} help="Maximum simultaneous Expressive Synth voices across all tracks." onChange={value => onUpdate({ maxVoices: value })} />
        <button type="button" className="iannix-flat-button" onClick={onResetConfig}>Reset engine settings</button>
      </InspectorSection>
    </div>
  );
}
