import React from "react";
import { infoProps } from "./uiInfo.js";
import { SCRIPT_TYPES } from "./scriptTypes.js";

export default function ScriptPanel({ type, onTypeChange, editorFontSize, children }) {
  const definition = SCRIPT_TYPES[type] || SCRIPT_TYPES.brush;
  return (
    <div className="script-panel">
      <label
        className="script-panel-type"
        {...infoProps(
          "Script type",
          `${definition.description} Selects the script language, catalog, execution environment, and available actions.`,
        )}
      >
        <span>Script type</span>
        <select value={definition.id} onChange={event => onTypeChange(event.target.value)}>
          {Object.values(SCRIPT_TYPES).map(candidate => (
            <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
          ))}
        </select>
      </label>
      <div className="script-panel-editor" data-script-type={definition.id} style={{ "--script-editor-font-size": `${editorFontSize}px` }}>
        {children}
      </div>
    </div>
  );
}
