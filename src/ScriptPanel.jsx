import React from "react";
import { infoProps } from "./uiInfo.js";
import { SCRIPT_TYPES } from "./scriptTypes.js";

export default function ScriptPanel({ type, onTypeChange, editorFontSize, children }) {
  const definition = SCRIPT_TYPES[type] || SCRIPT_TYPES.brush;
  const selectScriptType = (event, nextType) => {
    onTypeChange(nextType);
    event.currentTarget.closest("details")?.removeAttribute("open");
  };

  return (
    <div className="script-panel">
      <div
        className="script-panel-type"
        {...infoProps(
          "Script type",
          `${definition.description} Selects the script language, catalog, execution environment, and available actions.`,
        )}
      >
        <span>Script type</span>
        <details className="script-panel-type-picker">
          <summary aria-label={`Script type: ${definition.label}`}>
            <span>{definition.label}</span>
            <span className="script-panel-type-caret" aria-hidden="true">▼</span>
          </summary>
          <div className="script-panel-type-options" role="listbox" aria-label="Script type">
            {Object.values(SCRIPT_TYPES).map(candidate => (
              <button
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={candidate.id === definition.id}
                onClick={event => selectScriptType(event, candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
        </details>
      </div>
      <div className="script-panel-editor" data-script-type={definition.id} style={{ "--script-editor-font-size": `${editorFontSize}px` }}>
        {children}
      </div>
    </div>
  );
}
