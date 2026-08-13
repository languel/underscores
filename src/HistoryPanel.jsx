import { memo, useEffect, useMemo, useRef, useState } from "react";
import { infoProps } from "./uiInfo.js";
import TimeValueInput from "./TimeValueInput.jsx";
import { createTimeValue, resolveTimeValue } from "./timeValue.js";

const formatSeconds = value => `${Math.max(0, Number(value) || 0).toFixed(3)}s`;

const actionLabel = (action, commandNames) => {
  if (action.kind === "stroke") return `Stroke · ${action.args?.samples?.length || 0} samples`;
  if (action.kind === "scene") return action.args?.label || "Canvas edit";
  if (action.kind === "midi") return action.args?.description || "MIDI event";
  if (action.kind === "presentation") return action.args?.label || "Presentation";
  return commandNames.get(action.commandId) || action.commandId || action.kind;
};

const IconButton = ({ title, children, ...props }) => (
  <button type="button" className="history-icon-button" title={title} aria-label={title} {...props}>{children}</button>
);

const HistoryPanel = memo(function HistoryPanel({
  snapshot,
  commands = [],
  macros = [],
  includePresentation,
  presentationMode = false,
  emitMidi,
  showPointer,
  clockMode,
  recordFilter,
  timeContext,
  onIncludePresentationChange,
  onPresentationModeChange,
  onEmitMidiChange,
  onShowPointerChange,
  onClockModeChange,
  onRecordFilterChange,
  onStart,
  onPause,
  onStop,
  onPlay,
  onPlayAction,
  onSeek,
  onRateChange,
  onUpdateAction,
  onRemoveAction,
  onDuplicateAction,
  onMoveAction,
  onSaveMacro,
  onInsertMacro,
  onRemoveMacro,
  onExport,
  onImport,
  onClear,
}) {
  const fileRef = useRef(null);
  const [selectedActionId, setSelectedActionId] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [rangeStart, setRangeStart] = useState(() => createTimeValue("0 s"));
  const [rangeEnd, setRangeEnd] = useState(() => createTimeValue("0 s"));
  const commandNames = useMemo(() => new Map(commands.map(command => [command.id, command.title || command.name || command.id])), [commands]);
  const session = snapshot.session;
  const actions = session?.actions || [];
  const selectedAction = actions.find(action => action.id === selectedActionId) || null;

  useEffect(() => {
    if (!selectedAction) {
      setDraft("");
      setDraftError("");
      return;
    }
    setDraft(JSON.stringify(selectedAction, null, 2));
    setDraftError("");
  }, [selectedAction]);

  const applyDraft = () => {
    try {
      const parsed = JSON.parse(draft);
      if (!parsed || parsed.id !== selectedActionId) throw new Error("Action id cannot be changed.");
      onUpdateAction(selectedActionId, parsed);
      setDraftError("");
    } catch (error) {
      setDraftError(error.message || "Invalid action JSON.");
    }
  };

  const isRecording = snapshot.status === "recording" || snapshot.status === "recording-paused";
  const isPlaying = snapshot.status === "playing" || snapshot.status === "playback-paused";

  useEffect(() => {
    setRangeEnd(createTimeValue(`${snapshot.duration} s`, snapshot.duration));
  }, [snapshot.duration]);

  return (
    <div className="history-panel">
      <div className="history-transport">
        <IconButton title={isRecording ? "Stop recording" : "Start recording"} className={isRecording ? "recording" : ""} onClick={isRecording ? onStop : onStart}>
          {isRecording ? <span className="history-stop-icon" /> : <span className="history-record-icon" />}
        </IconButton>
        <IconButton title={snapshot.status.includes("paused") ? "Resume" : "Pause"} onClick={onPause} disabled={snapshot.status === "idle"}>
          <span className="history-pause-icon" />
        </IconButton>
        <IconButton title={isPlaying ? "Stop playback" : "Play session"} onClick={isPlaying ? onStop : onPlay} disabled={!actions.length}>
          {isPlaying ? <span className="history-stop-icon" /> : <span className="history-play-icon" />}
        </IconButton>
        <input
          className="history-seek"
          type="range"
          min="0"
          max={Math.max(0.001, snapshot.duration)}
          step="0.001"
          value={Math.min(snapshot.playhead, Math.max(0.001, snapshot.duration))}
          onChange={event => onSeek(Number(event.target.value))}
          aria-label="Session playhead"
        />
        <TimeValueInput className="history-time-input" aria-label="History playhead" data-route-path="history.playhead" value={`${snapshot.playhead} s`} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={(next, seconds) => onSeek(seconds)} />
        <select value={snapshot.playbackRate} onChange={event => onRateChange(Number(event.target.value))} aria-label="History playback rate">
          {[0.25, 0.5, 1, 2, 4].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </div>

      <div className="history-options">
        <label {...infoProps("History clock", "Choose how global History time advances while recording: wall-clock time, time only during actions, or a held playhead.")}>
          <span>Clock</span>
          <select value={clockMode} onChange={event => onClockModeChange(event.target.value)} disabled={isRecording}>
            <option value="realtime">Real time</option>
            <option value="active">Active actions</option>
            <option value="hold">Hold</option>
          </select>
        </label>
        <label {...infoProps("Presentation", "Include panel, view, and other presentation-only actions in the recording.")}><span>Presentation</span><input type="checkbox" checked={includePresentation} onChange={event => onIncludePresentationChange(event.target.checked)} /></label>
        <label {...infoProps("Live presentation mode", "Show embeds configured as Presentation only. Use this for lectures or playback; web pages remain hidden when it is off.")}><span>Live presentation</span><input type="checkbox" checked={presentationMode} onChange={event => onPresentationModeChange?.(event.target.checked)} /></label>
        <label {...infoProps("MIDI armed", "Recorded MIDI is sent to the currently selected route only while this is armed.")}><span>MIDI armed</span><input type="checkbox" checked={emitMidi} onChange={event => onEmitMidiChange(event.target.checked)} /></label>
        <label {...infoProps("Pointer", "Show the recorded pointer position during History playback.")}><span>Pointer</span><input type="checkbox" checked={showPointer} onChange={event => onShowPointerChange(event.target.checked)} /></label>
        <div className="history-file-actions">
          <button type="button" onClick={onClear} disabled={!actions.length || isRecording || isPlaying}>Clear</button>
          <button type="button" onClick={onExport} disabled={!actions.length}>Export</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} hidden type="file" accept=".json,.underscores-session" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) file.text().then(onImport);
          }} />
        </div>
      </div>

      <div className="history-section-heading">
        <span>Actions</span>
        <span className="history-section-controls">
          <select value={recordFilter} onChange={event => onRecordFilterChange(event.target.value)} aria-label="Choose which History action type to record" {...infoProps("Record filter", "Record every action or restrict the session to one action category.")}>
            <option value="all">Record all</option>
            {['stroke', 'command', 'scene', 'midi', 'presentation'].map(kind => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <span>{actions.length}</span>
        </span>
      </div>
      {actions.length > 0 ? (
        <div className="history-range-save">
          <label><span>From</span><TimeValueInput aria-label="History range start" data-route-path="history.range.start" value={rangeStart} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={setRangeStart} /></label>
          <label><span>To</span><TimeValueInput aria-label="History range end" data-route-path="history.range.end" value={rangeEnd} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={setRangeEnd} /></label>
          <button type="button" onClick={() => { const start = resolveTimeValue(rangeStart, timeContext); const end = resolveTimeValue(rangeEnd, timeContext); onSaveMacro({ start: Math.min(start, end), end: Math.max(start, end) }); }}>Save range</button>
        </div>
      ) : null}
      <div className="history-action-list" role="listbox" aria-label="Recorded actions">
        {actions.length === 0 ? (
          <div className="history-empty">Start recording, then draw or use Underscores commands.</div>
        ) : actions.map(action => {
          const index = actions.findIndex(candidate => candidate.id === action.id);
          return (
          <div key={action.id} className={`history-action ${selectedActionId === action.id ? "selected" : ""} ${action.enabled ? "" : "disabled"}`}>
            <button type="button" className="history-action-main" onClick={() => setSelectedActionId(action.id)}>
              <span className={`history-action-kind kind-${action.kind}`} />
              <span className="history-action-copy">
                <strong>{actionLabel(action, commandNames)}</strong>
                <small>{formatSeconds(action.at)} · {action.source}</small>
              </span>
            </button>
            <div className="history-action-tools">
              <IconButton title="Play this action" onClick={() => onPlayAction(action.id)} disabled={!action.enabled}>
                <span className="history-play-icon" />
              </IconButton>
              <input type="checkbox" checked={action.enabled} onChange={event => onUpdateAction(action.id, { enabled: event.target.checked })} title="Enable action" />
              <IconButton title="Move earlier" onClick={() => onMoveAction(action.id, -1)} disabled={index === 0}>↑</IconButton>
              <IconButton title="Move later" onClick={() => onMoveAction(action.id, 1)} disabled={index === actions.length - 1}>↓</IconButton>
              <IconButton title="Duplicate action" onClick={() => onDuplicateAction(action.id)}>⧉</IconButton>
              <IconButton title="Delete action" onClick={() => onRemoveAction(action.id)}>×</IconButton>
            </div>
          </div>
          );
        })}
      </div>

      {selectedAction ? (
        <div className="history-editor">
          <div className="history-section-heading"><span>Edit action JSON</span><span>{selectedAction.kind}</span></div>
          <label className="history-action-time"><span>Action time</span><TimeValueInput aria-label="History action time" data-route-path={`history.actions.${selectedAction.id}.at`} value={selectedAction.atValue || `${selectedAction.at} s`} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={(next, seconds) => onUpdateAction(selectedAction.id, { at: seconds, atValue: next })} /></label>
          <label className="history-action-time"><span>Duration</span><TimeValueInput aria-label="History action duration" data-route-path={`history.actions.${selectedAction.id}.duration`} value={selectedAction.durationValue || `${selectedAction.duration} s`} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={(next, seconds) => onUpdateAction(selectedAction.id, { duration: seconds, durationValue: next })} /></label>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} spellCheck="false" />
          {draftError ? <div className="history-error">{draftError}</div> : null}
          <div className="history-editor-actions">
            <button type="button" onClick={applyDraft}>Apply</button>
            <button type="button" onClick={() => setDraft(JSON.stringify(selectedAction, null, 2))}>Reset</button>
            <button type="button" onClick={() => onSaveMacro({ actionIds: [selectedAction.id] })}>Save step as macro</button>
          </div>
        </div>
      ) : null}

      <div className="history-section-heading"><span>Sequence library</span><span>{macros.length}</span></div>
      <div className="history-macro-list">
        {macros.length === 0 ? <div className="history-empty compact">Select an action and save it as a reusable macro.</div> : macros.map(macro => (
          <div className="history-macro" key={macro.id}>
            <span>{macro.name}</span>
            <button type="button" onClick={() => onInsertMacro(macro, "relative")}>Insert relative</button>
            <button type="button" onClick={() => onInsertMacro(macro, "absolute")}>Absolute</button>
            <button type="button" onClick={() => onRemoveMacro(macro.id)} aria-label={`Remove ${macro.name}`}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
});

export default HistoryPanel;
