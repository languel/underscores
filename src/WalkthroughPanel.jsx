import { useEffect, useMemo, useState } from "react";
import { WALKTHROUGH_ADVANCE_MODES } from "./walkthroughSystem.js";

const RATE_OPTIONS = [0.25, 0.5, 1, 2, 4];

export default function WalkthroughPanel({
  walkthroughs = [],
  snapshot,
  activeId,
  onSelect,
  onCreate,
  onCreateFromHistory,
  onUpdate,
  onDelete,
  onStart,
  onPause,
  onResume,
  onStop,
  onNext,
  onPrevious,
  onRate,
  onExportRun,
  targetOptions = [],
}) {
  const active = walkthroughs.find(item => item.id === activeId) || walkthroughs[0] || null;
  const [selectedStepId, setSelectedStepId] = useState("");
  const selectedStep = active?.steps.find(step => step.id === selectedStepId) || active?.steps[0] || null;
  const running = snapshot && !["idle", "stopped", "completed"].includes(snapshot.status);
  const paused = snapshot?.status === "paused";
  const instant = snapshot?.instant === true;
  const completed = snapshot?.status === "completed";
  const finalStep = Boolean(snapshot?.walkthrough?.steps?.length && snapshot.stepIndex >= snapshot.walkthrough.steps.length - 1);

  useEffect(() => {
    if (!active?.steps.some(step => step.id === selectedStepId)) setSelectedStepId(active?.steps[0]?.id || "");
  }, [active?.id, active?.steps, selectedStepId]);

  const validation = useMemo(() => {
    if (!active) return [];
    const errors = [];
    if (!active.steps.length) errors.push("Add at least one step.");
    active.steps.forEach((step, index) => {
      if (!step.title.trim()) errors.push(`Step ${index + 1} needs a title.`);
      step.cues.forEach(cue => {
        if (cue.type === "command" && !cue.commandId) errors.push(`Step ${index + 1} has a command cue without a command.`);
        if (cue.type === "ui" && !cue.target) errors.push(`Step ${index + 1} has a UI cue without a registered target.`);
      });
    });
    return errors;
  }, [active]);

  const patchStep = patch => {
    if (!active || !selectedStep) return;
    onUpdate?.(active.id, { steps: active.steps.map(step => step.id === selectedStep.id ? { ...step, ...patch } : step) }, active.revision);
  };

  return <div className="walkthrough-panel">
    <div className="walkthrough-panel-toolbar">
      <select value={active?.id || ""} onChange={event => onSelect?.(event.target.value)} aria-label="Choose walkthrough">
        {!walkthroughs.length && <option value="">No walkthroughs</option>}
        {walkthroughs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <button type="button" onClick={onCreate} title="New walkthrough">＋</button>
      <button type="button" onClick={onCreateFromHistory} title="Create walkthrough from current History recording">History →</button>
      <button type="button" onClick={() => active && onDelete?.(active.id)} disabled={!active || running} title="Delete walkthrough">×</button>
    </div>

    <div className="walkthrough-transport">
      <button type="button" onClick={() => active && onStart?.(active.id, { rate: snapshot?.rate || active.defaultRate, instant })} disabled={!active || running || validation.length > 0} title="Start walkthrough">▶</button>
      <button type="button" onClick={paused ? onResume : onPause} disabled={!running} title={paused ? "Resume walkthrough" : "Pause walkthrough"}>{paused ? "▶" : "Ⅱ"}</button>
      <button type="button" onClick={onPrevious} disabled={!running}>←</button>
      <button type="button" onClick={onNext} disabled={!running}>→</button>
      <select value={instant ? "instant" : snapshot?.rate || active?.defaultRate || 1} onChange={event => event.target.value === "instant" ? onRate?.(1, { instant: true }) : onRate?.(Number(event.target.value), { instant: false })} aria-label="Walkthrough pace">
        {RATE_OPTIONS.map(rate => <option key={rate} value={rate}>{rate === .25 ? "Slow" : rate === 1 ? "Normal" : rate === 4 ? "Fast" : `${rate}×`}</option>)}
        <option value="instant">Instant</option>
      </select>
      <input className="walkthrough-custom-rate" type="number" min="0.05" max="100" step="0.05" value={instant ? 1 : snapshot?.rate || 1} onChange={event => onRate?.(Number(event.target.value), { instant: false })} aria-label="Custom walkthrough pace" title="Custom pace" />
      <button type="button" onClick={onStop} disabled={!running && !completed} title={completed || finalStep ? "Finish the walkthrough and choose whether to keep or restore its results" : "Stop walkthrough"}>{completed || finalStep ? "Done" : "■"}</button>
      <button type="button" onClick={onExportRun} disabled={!snapshot?.trace?.events?.length}>Export run</button>
    </div>

    {active && <>
      <label className="walkthrough-title-field"><span>Title</span><input value={active.title} onChange={event => onUpdate?.(active.id, { title: event.target.value }, active.revision)} /></label>
      <div className="walkthrough-step-list" role="listbox" aria-label="Walkthrough steps">
        {active.steps.map((step, index) => <button type="button" key={step.id} className={selectedStep?.id === step.id ? "active" : ""} onClick={() => setSelectedStepId(step.id)}>
          <span>{index + 1}</span><strong>{step.title}</strong><small>{step.advance.mode}</small>
        </button>)}
      </div>
      <div className="walkthrough-step-actions">
        <button type="button" onClick={() => onUpdate?.(active.id, { steps: [...active.steps, { title: `Step ${active.steps.length + 1}`, narration: "", focusTarget: "canvas", cues: [], advance: { mode: "continue" } }] }, active.revision)}>Add step</button>
        <button type="button" disabled={!selectedStep} onClick={() => onUpdate?.(active.id, { steps: active.steps.filter(step => step.id !== selectedStep?.id) }, active.revision)}>Delete step</button>
      </div>
      {selectedStep && <div className="walkthrough-step-editor">
        <label><span>Step title</span><input value={selectedStep.title} onChange={event => patchStep({ title: event.target.value })} /></label>
        <label><span>Narration</span><textarea value={selectedStep.narration} onChange={event => patchStep({ narration: event.target.value })} /></label>
        <label><span>Info</span><textarea value={selectedStep.info} onChange={event => patchStep({ info: event.target.value })} /></label>
        <label><span>Target</span><select value={selectedStep.focusTarget} onChange={event => patchStep({ focusTarget: event.target.value })}>
          {!targetOptions.includes(selectedStep.focusTarget) && <option value={selectedStep.focusTarget}>{selectedStep.focusTarget || "No target"}</option>}
          {targetOptions.map(target => <option key={target} value={target}>{target}</option>)}
        </select></label>
        <label><span>Advance</span><select value={selectedStep.advance.mode} onChange={event => patchStep({ advance: { ...selectedStep.advance, mode: WALKTHROUGH_ADVANCE_MODES.includes(event.target.value) ? event.target.value : "continue" } })}>{WALKTHROUGH_ADVANCE_MODES.map(mode => <option key={mode}>{mode}</option>)}</select></label>
        <label><span>Hint</span><input value={selectedStep.hint} onChange={event => patchStep({ hint: event.target.value })} /></label>
        <details>
          <summary>Cues · {selectedStep.cues.length}</summary>
          <textarea className="walkthrough-json-editor" value={JSON.stringify(selectedStep.cues, null, 2)} onChange={event => {
            try { patchStep({ cues: JSON.parse(event.target.value) }); } catch { /* retain the last valid model */ }
          }} spellCheck="false" />
        </details>
        <details>
          <summary>Assertion</summary>
          <textarea className="walkthrough-json-editor" value={JSON.stringify(selectedStep.advance.assertion, null, 2)} onChange={event => {
            try { patchStep({ advance: { ...selectedStep.advance, assertion: JSON.parse(event.target.value) } }); } catch { /* retain the last valid model */ }
          }} spellCheck="false" />
        </details>
      </div>}
      {validation.length > 0 && <div className="walkthrough-validation" role="status">{validation.map(error => <div key={error}>{error}</div>)}</div>}
    </>}
  </div>;
}
