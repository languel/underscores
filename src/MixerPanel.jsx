import { GM_PROGRAMS, isPercussionChannel } from "./generalMidi.js";
import NumericInput from "./NumericInput.jsx";
import { infoProps } from "./uiInfo.js";
import {
  externalMixerDestination,
  getExternalMixerOutputId,
  MIXER_DESTINATION_INTERNAL,
  MIXER_DESTINATION_NONE,
  MIXER_INSTRUMENT_EXPRESSIVE,
  MIXER_INSTRUMENT_GM,
  MIXER_INSTRUMENT_MIDI,
} from "./mixerSystem.js";

const destinationLabel = (track, outputs) => {
  if (track.destination === MIXER_DESTINATION_NONE) return "None";
  if (track.destination === MIXER_DESTINATION_INTERNAL) return "Internal audio";
  const outputId = getExternalMixerOutputId(track.destination);
  return outputs.find(output => output.id === outputId)?.name || "Unavailable MIDI output";
};

const instrumentLabel = track => track.instrument === MIXER_INSTRUMENT_EXPRESSIVE
  ? "Expressive Synth"
  : track.instrument === MIXER_INSTRUMENT_MIDI ? "External MIDI" : "General MIDI";

export default function MixerPanel({
  mixer,
  midiOutputs,
  expressiveVoiceCount,
  expressivePrograms = [],
  internalStatus,
  expressiveStatus,
  onUpdateTrack,
  onAddTrack,
  onRemoveTrack,
  onConnectMidi,
  onPanic,
}) {
  const tracks = mixer?.tracks || [];
  return (
    <div className="mixer-panel">
      <div className="mixer-toolbar">
        <span>{tracks.length} tracks · {expressiveVoiceCount} expressive voices</span>
        <div className="mixer-toolbar-actions">
          <button type="button" className="iannix-flat-button" onClick={onConnectMidi} {...infoProps("MIDI devices", "Request or refresh browser access to external MIDI inputs and outputs.")}>MIDI</button>
          <button type="button" className="iannix-flat-button" onClick={onPanic} {...infoProps("Panic", "Immediately release notes on every internal and external mixer destination.")}>Panic</button>
          <button type="button" className="iannix-flat-button" onClick={onAddTrack} {...infoProps("Add track", "Create another mixer track. Tracks route score MIDI channels to internal or external instruments.")}>Add track</button>
        </div>
      </div>
      <div className="mixer-track-list">
        {tracks.map((track, index) => {
          const outputId = getExternalMixerOutputId(track.destination);
          const percussion = track.instrument === MIXER_INSTRUMENT_GM && isPercussionChannel(track.midiChannel);
          return (
            <details className={`mixer-track ${track.muted ? "muted" : ""}`} key={track.id}>
              <summary>
                <span className="mixer-track-number">{index + 1}</span>
                <span className="mixer-track-summary-name">{track.name}</span>
                <span className="mixer-track-summary-route">Ch {track.midiChannel} · {destinationLabel(track, midiOutputs)} · {instrumentLabel(track)}</span>
                <button type="button" className={track.solo ? "active" : ""} aria-label={`Solo ${track.name}`} aria-pressed={track.solo} onClick={event => { event.preventDefault(); onUpdateTrack(track.id, { solo: !track.solo }); }} {...infoProps("Solo track", "Hear this track while suppressing non-solo tracks.")}>S</button>
                <button type="button" className={track.muted ? "active" : ""} aria-label={`Mute ${track.name}`} aria-pressed={track.muted} onClick={event => { event.preventDefault(); onUpdateTrack(track.id, { muted: !track.muted }); }} {...infoProps("Mute track", "Suppress this track without changing its routing or program.")}>M</button>
              </summary>
              <div className="mixer-track-controls">
                <label className="mixer-field" {...infoProps("Destination", "Choose no output, the browser's internal audio engines, or a connected external MIDI port.")}>
                  <span>Destination</span>
                  <select value={track.destination} onChange={event => {
                    const destination = event.target.value;
                    const external = getExternalMixerOutputId(destination) !== null;
                    onUpdateTrack(track.id, {
                      destination,
                      instrument: external ? MIXER_INSTRUMENT_MIDI : track.instrument === MIXER_INSTRUMENT_MIDI ? MIXER_INSTRUMENT_GM : track.instrument,
                    });
                  }}>
                    <option value={MIXER_DESTINATION_NONE}>None</option>
                    <option value={MIXER_DESTINATION_INTERNAL}>Internal audio</option>
                    {outputId && !midiOutputs.some(output => output.id === outputId) && <option value={track.destination}>Unavailable — {outputId}</option>}
                    {midiOutputs.map(output => <option key={output.id} value={externalMixerDestination(output.id)}>{output.name}{output.manufacturer ? ` — ${output.manufacturer}` : ""}</option>)}
                  </select>
                </label>
                <label className="mixer-field" {...infoProps("Instrument", "Choose General MIDI or Expressive Synth for internal audio. External destinations send MIDI bytes to the selected device.")}>
                  <span>Instrument</span>
                  {track.destination === MIXER_DESTINATION_INTERNAL ? (
                    <select value={track.instrument} onChange={event => onUpdateTrack(track.id, {
                      instrument: event.target.value,
                      program: event.target.value === MIXER_INSTRUMENT_EXPRESSIVE ? "bowed" : 0,
                    })}>
                      <option value={MIXER_INSTRUMENT_GM}>General MIDI</option>
                      <option value={MIXER_INSTRUMENT_EXPRESSIVE}>Expressive Synth</option>
                    </select>
                  ) : <span className="mixer-field-readout">{track.destination === MIXER_DESTINATION_NONE ? "—" : "External MIDI"}</span>}
                </label>
                <label className="mixer-field mixer-program-field">
                  <span>Program</span>
                  {track.instrument === MIXER_INSTRUMENT_EXPRESSIVE ? (
                    <select
                      value={track.program}
                      disabled={track.destination === MIXER_DESTINATION_NONE}
                      onChange={event => onUpdateTrack(track.id, { program: event.target.value })}
                      title="Select an Expressive Synth program. Edit scene programs in the Synth panel."
                      data-info-title="Expressive program"
                      data-info="Choose a factory or scene program for this track. Programs are authored in the Synth panel, and each track may choose a different one."
                    >
                      {!expressivePrograms.some(program => program.id === track.program) ? <option value={track.program}>Unavailable — {track.program}</option> : null}
                      <optgroup label="Factory">
                        {expressivePrograms.filter(program => program.builtin).map(program => <option key={program.id} value={program.id}>{program.label}</option>)}
                      </optgroup>
                      {expressivePrograms.some(program => !program.builtin) ? (
                        <optgroup label="Scene">
                          {expressivePrograms.filter(program => !program.builtin).map(program => <option key={program.id} value={program.id}>{program.label}</option>)}
                        </optgroup>
                      ) : null}
                    </select>
                  ) : percussion ? (
                    <span className="mixer-field-readout">Percussion</span>
                  ) : (
                    <select value={track.program} disabled={track.destination === MIXER_DESTINATION_NONE} onChange={event => onUpdateTrack(track.id, { program: Number(event.target.value) })}>
                      {GM_PROGRAMS.map((name, program) => <option key={program} value={program}>{String(program + 1).padStart(3, "0")} {name}</option>)}
                    </select>
                  )}
                </label>
                <label className="mixer-field mixer-channel-field" {...infoProps("MIDI channel", "Score events on this MIDI channel are routed through this track. Multiple tracks may listen to the same channel.")}>
                  <span>MIDI channel</span>
                  <NumericInput min="1" max="16" step="1" defaultValue={index % 16 + 1} value={track.midiChannel} onCommit={midiChannel => onUpdateTrack(track.id, { midiChannel })} />
                </label>
                <div className="mixer-track-actions-row">
                  <label className="mixer-track-enabled" {...infoProps("Track enabled", "Disable this track without removing its destination, instrument, program, or MIDI channel settings.")}>
                    <span>Enabled</span>
                    <input type="checkbox" checked={track.enabled} onChange={event => onUpdateTrack(track.id, { enabled: event.target.checked })} />
                  </label>
                  <button type="button" className="iannix-flat-button mixer-remove-track" disabled={tracks.length <= 1} onClick={() => onRemoveTrack(track.id)}>Remove</button>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      <div className="mixer-status">GM: {internalStatus} · Expressive: {expressiveStatus}</div>
    </div>
  );
}
