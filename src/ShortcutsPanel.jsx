import React, { useState } from "react";
import { SHORTCUT_ACTIONS, shortcutFromEvent, shortcutLabel } from "./shortcutSystem.js";
import { infoProps } from "./uiInfo.js";

export default function ShortcutsPanel({ bindings, onChange, onReset }) {
  const [recordingId, setRecordingId] = useState(null);
  const duplicates = new Set(Object.values(bindings).filter((binding, index, values) => binding && values.indexOf(binding) !== index));

  const capture = (event, actionId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecordingId(null);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      onChange(actionId, "");
      setRecordingId(null);
      return;
    }
    const binding = shortcutFromEvent(event);
    if (!binding) return;
    onChange(actionId, binding);
    setRecordingId(null);
  };

  return (
    <div className="settings-panel-section shortcuts-panel">
      <div className="shortcut-help" tabIndex={0} {...infoProps("Editing shortcuts", "Click a shortcut and press the new keys. Escape cancels; Delete or Backspace clears the binding. Conflicting bindings are marked.")}>?</div>
      {SHORTCUT_ACTIONS.map(action => {
        const binding = bindings[action.id];
        return (
          <div className="shortcut-row" key={action.id}>
            <span>{action.label}</span>
            <button
              type="button"
              className={`shortcut-binding${recordingId === action.id ? " recording" : ""}${duplicates.has(binding) ? " conflict" : ""}`}
              onClick={event => { event.currentTarget.focus(); setRecordingId(action.id); }}
              onKeyDown={event => capture(event, action.id)}
              aria-label={`Shortcut for ${action.label}`}
              title={duplicates.has(binding) ? "This shortcut is assigned more than once" : undefined}
            >
              {recordingId === action.id ? "Press keys…" : shortcutLabel(binding)}
            </button>
          </div>
        );
      })}
      <button type="button" className="iannix-flat-button" onClick={onReset}>Reset shortcuts</button>
    </div>
  );
}
