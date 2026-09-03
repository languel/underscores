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
  if (action.kind === "input") {
    const eventType = action.args?.eventType || "pointer";
    const scope = action.args?.scope === "ui" ? "UI" : action.args?.scope === "canvas" ? "Canvas" : "Input";
    const sampleCount = action.args?.samples?.length || 0;
    return `${scope} · ${eventType}${sampleCount ? ` · ${sampleCount} samples` : ""}`;
  }
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
  includeCanvasInput = false,
  includeUiInput = false,
  presentationMode = false,
  emitMidi,
  showPointer,
  loopOverdub,
  clockMode,
  recordFilter,
  timeContext,
  onIncludePresentationChange,
  onIncludeCanvasInputChange,
  onIncludeUiInputChange,
  onPresentationModeChange,
  onEmitMidiChange,
  onShowPointerChange,
  onLoopOverdubChange,
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
  onCreateWalkthrough,
}) {
  const fileRef = useRef(null);
  const selectionAnchorRef = useRef(null);
  const [selectedActionIds, setSelectedActionIds] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [rangeStart, setRangeStart] = useState(() => createTimeValue("0 s"));
  const [rangeEnd, setRangeEnd] = useState(() => createTimeValue("0 s"));
  const commandNames = useMemo(() => new Map(commands.map(command => [command.id, command.title || command.name || command.id])), [commands]);
  const session = snapshot.session;
  const actions = session?.actions || [];
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const actionIdsKey = actions.map(action => action.id).join("\u001f");
  const selectedActionId = selectedActionIds[0] || null;
  const selectedAction = actions.find(action => action.id === selectedActionId) || null;

  useEffect(() => {
    setSelectedActionIds(previous => {
      const availableIds = new Set(actionsRef.current.map(action => action.id));
      const next = previous.filter(id => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [actionIdsKey]);

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

  const selectAction = (event, actionId) => {
    const additive = event.metaKey || event.ctrlKey;
    if (event.shiftKey) {
      const anchorIndex = actions.findIndex(action => action.id === selectionAnchorRef.current);
      const targetIndex = actions.findIndex(action => action.id === actionId);
      const rangeIds = anchorIndex >= 0 && targetIndex >= 0
        ? actions.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1).map(action => action.id)
        : [actionId];
      setSelectedActionIds(previous => {
        const next = additive ? [...previous, ...rangeIds] : rangeIds;
        const order = new Map(actions.map((action, index) => [action.id, index]));
        return [...new Set(next)].sort((left, right) => order.get(left) - order.get(right));
      });
      if (anchorIndex < 0) selectionAnchorRef.current = actionId;
      return;
    }
    if (additive) {
      setSelectedActionIds(previous => previous.includes(actionId)
        ? previous.filter(id => id !== actionId)
        : [...previous, actionId]);
    } else setSelectedActionIds([actionId]);
    selectionAnchorRef.current = actionId;
  };

  const isRecording = snapshot.status === "recording" || snapshot.status === "recording-paused";
  const isRecordingPaused = snapshot.status === "recording-paused";
  const isPlaying = snapshot.status === "playing" || snapshot.status === "playback-paused";
  const isPlaybackPaused = snapshot.status === "playback-paused";
  const pauseTitle = isRecording
    ? (isRecordingPaused ? "Resume recording" : "Pause recording")
    : isPlaying
      ? (isPlaybackPaused ? "Resume playback" : "Pause playback")
      : "Pause recording or playback";
  const playbackTitle = snapshot.status === "playing"
    ? "Stop playback"
    : isPlaybackPaused
      ? "Restart playback from the beginning"
      : "Play session";
  const transportStatus = isRecordingPaused
    ? "Recording paused"
    : isRecording
      ? "Recording"
      : isPlaybackPaused
        ? "Playback paused"
        : snapshot.status === "playing"
          ? "Playing"
          : "";

  useEffect(() => {
    setRangeEnd(createTimeValue(`${snapshot.duration} s`, snapshot.duration));
  }, [snapshot.duration]);

  return (
    <div className="history-panel">
      <div className="history-transport">
        <IconButton title={isRecording ? "Stop recording" : "Record new take"} className={isRecording ? "recording" : ""} onClick={isRecording ? onStop : onStart}>
          {isRecording ? <span className="history-stop-icon" /> : <span className="history-record-icon" />}
        </IconButton>
        <IconButton title={pauseTitle} onClick={onPause} disabled={!isRecording && !isPlaying}>
          {snapshot.status.includes("paused") ? <span className="history-play-icon" /> : <span className="history-pause-icon" />}
        </IconButton>
        <IconButton title={playbackTitle} onClick={snapshot.status === "playing" ? onStop : onPlay} disabled={!actions.length || isRecording}>
          {snapshot.status === "playing" ? <span className="history-stop-icon" /> : <span className="history-play-icon" />}
        </IconButton>
        {transportStatus ? <span className={`history-transport-status ${isRecording ? "recording" : "playing"}`} role="status">{transportStatus}</span> : null}
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
        <label {...infoProps("Canvas / performance input", "Capture pointer, mouse, pen, touch, wheel, and laser gestures on the canvas and interactive performance surfaces. Leave this on while recording a performance, and turn UI events off when settings and panel edits should stay out of the take.")}><span>Canvas / performance</span><input type="checkbox" checked={includeCanvasInput} onChange={event => onIncludeCanvasInputChange?.(event.target.checked)} /></label>
        <label {...infoProps("UI input", "Capture pointer and mouse activity on panels, controls, editors, menus, and settings. Enable this for tutorials that demonstrate interface actions; leave it off for a clean performance take.")}><span>UI events</span><input type="checkbox" checked={includeUiInput} onChange={event => onIncludeUiInputChange?.(event.target.checked)} /></label>
        <label {...infoProps("Live presentation mode", "Show embeds configured as Presentation only. Use this for lectures or playback; web pages remain hidden when it is off.")}><span>Live presentation</span><input type="checkbox" checked={presentationMode} onChange={event => onPresentationModeChange?.(event.target.checked)} /></label>
        <label {...infoProps("MIDI armed", "Recorded MIDI is sent to the currently selected route only while this is armed.")}><span>MIDI armed</span><input type="checkbox" checked={emitMidi} onChange={event => onEmitMidiChange(event.target.checked)} /></label>
        <label {...infoProps("Virtual cursor", "Show a glowing playback cursor at recorded canvas and UI positions. The cursor uses the current laser color and can point into panels as well as the canvas.")}><span>Virtual cursor</span><input type="checkbox" checked={showPointer} onChange={event => onShowPointerChange(event.target.checked)} /></label>
        <label {...infoProps("Loop overdub", "Use the active transport loop as a repeating drawing pass. Recording rewinds to the loop start, starts transport playback, and adds completed strokes to the next pass.")}><span>Loop overdub</span><input type="checkbox" checked={loopOverdub} onChange={event => onLoopOverdubChange(event.target.checked)} disabled={isRecording} /></label>
        <div className="history-file-actions">
          <button type="button" onClick={onClear} disabled={!actions.length || isRecording || isPlaying}>Clear</button>
          <button type="button" onClick={onExport} disabled={!actions.length}>Export</button>
          <button type="button" onClick={onCreateWalkthrough} disabled={!actions.length}>Create walkthrough</button>
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
            {['stroke', 'command', 'scene', 'midi', 'presentation', 'input'].map(kind => <option key={kind} value={kind}>{kind}</option>)}
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
      <div className="history-action-list" role="listbox" aria-label="Recorded actions" aria-multiselectable="true">
        {actions.length === 0 ? (
          <div className="history-empty">Start recording, then draw or use Underscores commands.</div>
        ) : actions.map(action => {
          const index = actions.findIndex(candidate => candidate.id === action.id);
          return (
          <div key={action.id} role="option" aria-selected={selectedActionIds.includes(action.id)} className={`history-action ${selectedActionIds.includes(action.id) ? "selected" : ""} ${action.enabled ? "" : "disabled"}`}>
            <button type="button" className="history-action-main" onClick={event => selectAction(event, action.id)} title="Select action; Shift-click a range, or Command/Ctrl-click to toggle">
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

      {selectedActionIds.length > 1 ? (
        <div className="history-selection-summary">
          <div className="history-section-heading"><span>{selectedActionIds.length} actions selected</span><span>Shift-click range · Command/Ctrl-click toggle</span></div>
          <button type="button" onClick={() => onSaveMacro({ actionIds: selectedActionIds })}>Save selection as macro</button>
        </div>
      ) : selectedAction ? (
        <div className="history-editor">
          <div className="history-section-heading"><span>Edit action JSON</span><span>{selectedAction.kind}</span></div>
          <label className="history-action-time"><span>Action time</span><TimeValueInput aria-label="History action time" data-route-path={`history.actions.${selectedAction.id}.at`} value={selectedAction.atValue || `${selectedAction.at} s`} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={(next, seconds) => onUpdateAction(selectedAction.id, { at: seconds, atValue: next })} /></label>
          <label className="history-action-time"><span>Duration</span><TimeValueInput aria-label="History action duration" data-route-path={`history.actions.${selectedAction.id}.duration`} value={selectedAction.durationValue || `${selectedAction.duration} s`} context={timeContext} defaultValue="0 s" minSeconds={0} onChange={(next, seconds) => onUpdateAction(selectedAction.id, { duration: seconds, durationValue: next })} /></label>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} spellCheck="false" />
          {draftError ? <div className="history-error">{draftError}</div> : null}
          <div className="history-editor-actions">
            <button type="button" onClick={applyDraft}>Apply</button>
            <button type="button" onClick={() => setDraft(JSON.stringify(selectedAction, null, 2))}>Reset</button>
            <button type="button" onClick={() => onSaveMacro({ actionIds: [selectedAction.id] })}>Save action as macro</button>
          </div>
        </div>
      ) : null}

      <div className="history-section-heading"><span>Sequence library</span><span>{macros.length}</span></div>
      <div className="history-macro-list">
        {macros.length === 0 ? <div className="history-empty compact">Select one or more actions and save them as a reusable macro.</div> : macros.map(macro => (
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
