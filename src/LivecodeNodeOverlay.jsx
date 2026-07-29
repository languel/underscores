import { useEffect, useMemo, useState } from "react";
import DraweratorCodeEditor from "./DraweratorCodeEditor.jsx";
import P5Frame from "./P5Frame.jsx";
import { PlayCoreFrame } from "./PlayCoreFrame.jsx";
import { getLivecodeRuntimeConfig, isLivecodeNodeRunnable, validateLivecodeNode } from "./livecodeAdapters.js";
import {
  getLivecodeEditorProfile,
  getLivecodeFont,
  getLivecodeKindDefinition,
  LIVE_CODE_FONT_OPTIONS,
  LIVECODE_KIND_DEFINITIONS,
  normalizeLivecodeNode,
  shouldRenderLivecodeNode,
} from "./livecodeNode.js";
import { infoProps } from "./uiInfo.js";

const StopIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>;
const RunIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>;

const editorStyleFor = typography => ({
  "--script-editor-font-size": `${typography.fontSize}px`,
  "--livecode-line-height": typography.lineHeight,
  "--livecode-font-family": getLivecodeFont(typography.font).family,
  "--livecode-font-weight": typography.fontWeight,
  "--livecode-letter-spacing": `${typography.letterSpacing}px`,
});

export function LivecodeNodeEditor({
  node: rawNode,
  onPatch,
  onRun,
  onBlur,
  className = "",
  ariaLabel,
}) {
  const node = normalizeLivecodeNode(rawNode);
  const definition = getLivecodeKindDefinition(node.kind);
  return (
    <DraweratorCodeEditor
      value={node.source}
      onChange={source => onPatch?.({ source })}
      onBlur={onBlur}
      onRun={onRun}
      scriptType={getLivecodeEditorProfile(node)}
      className={`livecode-node-editor ${className}`.trim()}
      ariaLabel={ariaLabel || `${definition.label} node source`}
      placeholder={definition.defaultSource}
      style={editorStyleFor(node.typography)}
    />
  );
}

const previewSource = source => String(source || "").split("\n").slice(0, 18).join("\n");

function PersistedLivecodeRuntime({ element, node, scriptRuntimeRef }) {
  const parametersKey = JSON.stringify(node.parameters);
  const settingsKey = JSON.stringify(node.runtime.settings);
  const config = useMemo(
    () => getLivecodeRuntimeConfig(node),
    [node.kind, node.source, parametersKey, settingsKey, node.revision],
  );
  const validation = validateLivecodeNode(node);
  const [lastWorkingConfig, setLastWorkingConfig] = useState(() => validation.valid ? config : null);
  useEffect(() => {
    if (validation.valid) setLastWorkingConfig(config);
  }, [node.kind, node.revision, validation.valid, config]);
  if (!lastWorkingConfig) return <div className="livecode-node-runtime-error">{validation.error || "This node needs valid source before it can run."}</div>;
  return <div className={`livecode-node-runtime ${node.view === "preview" ? "visible" : "hidden"}`} aria-label={`${getLivecodeKindDefinition(node.kind).label} runtime`}>
    {node.kind === "p5" ? <P5Frame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} /> : null}
    {node.kind === "playcore" ? <PlayCoreFrame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} /> : null}
  </div>;
}

function LivecodeRuntimeSurface({ element, node, scriptRuntimeRef }) {
  return isLivecodeNodeRunnable(node)
    ? <PersistedLivecodeRuntime key={node.kind} element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} />
    : null;
}

function LivecodeNodePreview({ node, onEdit }) {
  const definition = getLivecodeKindDefinition(node.kind);
  if (node.view === "preview") {
    return <div className={`livecode-node-preview livecode-node-preview-${node.kind}`}>
      <span className="livecode-node-preview-label">{definition.label} preview</span>
      <pre>{previewSource(node.source)}</pre>
    </div>;
  }
  return <button
    type="button"
    className="livecode-node-source-preview"
    onDoubleClick={event => {
      event.preventDefault();
      event.stopPropagation();
      onEdit?.();
    }}
    onPointerDown={event => event.stopPropagation()}
    aria-label={`Edit ${definition.label} node`}
    title="Double-click to edit this livecode node"
  ><pre>{previewSource(node.source)}</pre></button>;
}

function NodeChrome({ node, onPatch, onToggleRun, onDock }) {
  const definition = getLivecodeKindDefinition(node.kind);
  return <div className="livecode-node-chrome" onPointerDown={event => event.stopPropagation()}>
    <button
      type="button"
      className={`livecode-node-control ${node.runtime.running ? "running" : ""}`}
      onClick={() => onToggleRun?.()}
      aria-label={node.runtime.running ? `Stop ${definition.label}` : `Run ${definition.label}`}
      title={node.runtime.running ? "Stop node" : "Run node"}
      {...infoProps("Livecode runtime", "Starts or stops this node only. Runtime adapters are registered per node so other live nodes keep running.")}
    >{node.runtime.running ? <StopIcon /> : <RunIcon />}</button>
    <select
      value={node.kind}
      aria-label="Livecode node kind"
      title="Livecode kind"
      onChange={event => onPatch?.({ kind: event.target.value, name: getLivecodeKindDefinition(event.target.value).defaultName })}
      {...infoProps("Livecode kind", "Changes this node's adapter and editor profile. Its source stays on the node; choose a compatible kind before running it.")}
    >
      {Object.entries(LIVECODE_KIND_DEFINITIONS).map(([id, candidate]) => <option key={id} value={id}>{candidate.label}</option>)}
    </select>
    <button type="button" onClick={() => onPatch?.({ view: node.view === "code" ? "preview" : "code" })} title={node.view === "code" ? "Show preview" : "Show code"} aria-label={node.view === "code" ? "Show livecode preview" : "Show livecode code"}>{node.view === "code" ? "◒" : "‹/›"}</button>
    <select value={node.typography.font} onChange={event => onPatch?.({ typography: { font: event.target.value } })} aria-label="Livecode font" title="Node font">
      {LIVE_CODE_FONT_OPTIONS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}
    </select>
    <button type="button" onClick={onDock} title="Dock this editor in the Script panel" aria-label="Dock livecode editor">↗</button>
  </div>;
}

export function LivecodeNodeOverlay({
  elements = [],
  appState,
  activeEditorId = null,
  onEdit,
  onPatch,
  onCommit,
  onToggleRun,
  onDock,
  scriptRuntimeRef,
}) {
  const camera = useMemo(() => ({
    zoom: Number(appState?.zoom?.value) || 1,
    scrollX: Number(appState?.scrollX) || 0,
    scrollY: Number(appState?.scrollY) || 0,
    selectedElementIds: appState?.selectedElementIds || {},
  }), [appState]);
  return <div className="drawerator-livecode-overlay" aria-label="Livecode canvas nodes">{elements.filter(shouldRenderLivecodeNode).map(element => {
    const node = normalizeLivecodeNode(element.customData.draweratorLivecode);
    const selected = Boolean(camera.selectedElementIds[element.id]);
    const editing = activeEditorId === element.id;
    const visible = selected || editing;
    return <div
      key={element.id}
      className={`drawerator-livecode-node ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${node.view === "preview" ? "preview" : "code"}`}
      style={{
        left: (element.x + camera.scrollX) * camera.zoom,
        top: (element.y + camera.scrollY) * camera.zoom,
        width: Math.max(1, element.width * camera.zoom),
        height: Math.max(1, element.height * camera.zoom),
        transform: `rotate(${element.angle || 0}rad)`,
        opacity: Math.max(0, Math.min(1, (Number(element.opacity) || 100) / 100)),
        ...editorStyleFor(node.typography),
      }}
    >
      {editing ? <LivecodeNodeEditor
        node={node}
        onPatch={patch => onPatch?.(element.id, patch)}
        onRun={() => onToggleRun?.(element.id)}
        onBlur={() => onCommit?.(element.id)}
        ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
      /> : <div className={`livecode-node-surface ${visible ? "interactive" : ""}`}>
        {visible && <NodeChrome
          node={node}
          onPatch={patch => onPatch?.(element.id, patch)}
          onToggleRun={() => onToggleRun?.(element.id)}
          onDock={() => onDock?.(element.id)}
        />}
        <LivecodeRuntimeSurface element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} />
        {!(node.view === "preview" && isLivecodeNodeRunnable(node)) && <LivecodeNodePreview
          node={node}
          onEdit={visible ? () => onEdit?.(element.id) : undefined}
        />}
      </div>}
    </div>;
  })}</div>;
}
