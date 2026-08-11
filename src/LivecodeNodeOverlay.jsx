import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DraweratorCodeEditor from "./DraweratorCodeEditor.jsx";
import P5Frame from "./P5Frame.jsx";
import { PlayCoreFrame } from "./PlayCoreFrame.jsx";
import { getLivecodeRuntimeConfig, isLivecodeNodeRunnable, validateLivecodeNode } from "./livecodeAdapters.js";
import { getStrudelRuntimeManager } from "./strudelRuntime.js";
import { createScriptCanvasApi, resolveScriptParameterValues } from "./scriptRuntime.js";
import { parseScriptParameters } from "./scriptParameters.js";
import LivecodePresentation from "./LivecodePresentation.jsx";
import OrcaNode from "./OrcaNode.jsx";
import ShaderLivecodeFrame from "./ShaderLivecodeFrame.jsx";
import { normalizeShaderCompositionSettings } from "./shaderLivecode.js";
import {
  getLivecodeEditorProfile,
  getLivecodeFont,
  getLivecodeKindDefinition,
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
  "--livecode-code-opacity": `${Math.round(typography.codeOverlayOpacity * 100)}%`,
});

export function LivecodeNodeEditor({
  node: rawNode,
  element,
  onPatch,
  onRun,
  onUpdate,
  onStop,
  onBlur,
  onCycleView,
  transport,
  onMidiEvents,
  className = "",
  ariaLabel,
  readOnly = false,
  onClick,
  onDoubleClick,
  focusRequest = 0,
  glyphOnlyOverlay = false,
  enableStrudelWidgets = false,
  showGutters = false,
}) {
  const node = useMemo(() => normalizeLivecodeNode(rawNode), [rawNode]);
  const definition = getLivecodeKindDefinition(node.kind);
  const strudelVisualsCurrent = node.kind === "strudel"
    && evaluatedStrudelSource(node) === node.source;
  if (node.kind === "orca") return <div
    className={`livecode-node-editor ${className}`.trim()}
    style={editorStyleFor(node.typography)}
  ><OrcaNode
    nodeId={element?.id || node.nodeId}
    source={node.source}
    revision={node.revision}
    running={node.runtime.running}
    transportMode={node.runtime.transportMode}
    transport={transport}
    onPatch={onPatch}
    onMidiEvents={onMidiEvents}
    onBlur={onBlur}
    focusRequest={focusRequest}
    ariaLabel={ariaLabel || "Orca grid editor"}
  /></div>;
  return (
    <DraweratorCodeEditor
      value={node.source}
      onChange={source => onPatch?.({ source })}
      onBlur={onBlur}
      onRun={onRun}
      onUpdate={onUpdate}
      onStop={onStop}
      readOnly={readOnly}
      showLineNumbers={showGutters && node.typography.showLineNumbers}
      showFoldGutter={showGutters && node.typography.showFoldGutter}
      onToggleLineNumbers={showGutters
        ? () => onPatch?.({ typography: { showLineNumbers: !node.typography.showLineNumbers } })
        : undefined}
      onCycleView={onCycleView}
      scriptType={getLivecodeEditorProfile(node)}
      className={`livecode-node-editor ${className}`.trim()}
      ariaLabel={ariaLabel || `${definition.label} node source`}
      style={editorStyleFor(node.typography)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      focusRequest={focusRequest}
      glyphOnlyOverlay={glyphOnlyOverlay}
      strudelNodeId={strudelVisualsCurrent ? element?.id || node.nodeId : ""}
      strudelWidgets={strudelVisualsCurrent && enableStrudelWidgets}
    />
  );
}

const previewSource = source => String(source || "").split("\n").slice(0, 18).join("\n");

function createLivecodeBridge(element, node, scriptRuntimeRef, onStrudelTransport) {
  const canvas = createScriptCanvasApi(scriptRuntimeRef);
  const params = resolveScriptParameterValues(
    parseScriptParameters(node.source, { values: node.parameters }),
    scriptRuntimeRef,
    canvas,
  );
  const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {
    theme: "dark", currentColor: "#e8e8e8", currentOpacity: 1, colors: {},
  };
  return Object.freeze({
    element: Object.freeze({ id: element.id, width: element.width, height: element.height }),
    frame: node,
    canvas,
    objects: canvas,
    events: canvas.events,
    transport: canvas.transport,
    params,
    get object() { return canvas.get(element.id); },
    get time() { return canvas.transport.time; },
    get currentColor() { return appearance().currentColor; },
    get currentOpacity() { return appearance().currentOpacity; },
    get colors() { return appearance().colors; },
    get theme() { return appearance().theme; },
    get appearance() { return appearance(); },
    get streams() { return scriptRuntimeRef?.current?.getStreams?.(element.id) || window.drawerator?.streams; },
    strudel: Object.freeze({
      setTempo: bpm => onStrudelTransport?.(element, node, { type: "tempo", value: bpm }),
      setPlaying: playing => onStrudelTransport?.(element, node, { type: "playing", value: Boolean(playing) }),
    }),
    get api() { return window.drawerator; },
  });
}

const evaluatedStrudelSource = node => (
  typeof node.runtime.settings?.evaluatedSource === "string"
    ? node.runtime.settings.evaluatedSource
    : node.source
);

function StrudelFrameVisualizerCanvas({ runtime, nodeId, enabled }) {
  const canvasRef = useRef(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    resize();
    const unregister = runtime.registerFrameCanvas(nodeId, canvas);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(entries => {
      runtime.setFrameCanvasActive(nodeId, entries.some(entry => entry.isIntersecting));
    });
    intersectionObserver.observe(canvas);
    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      unregister();
    };
  }, [enabled, nodeId, runtime]);
  if (!enabled) return null;
  return <canvas
    ref={canvasRef}
    className="strudel-frame-visualizer"
    aria-label="Strudel frame visualization"
  />;
}

function StrudelNodeRuntime({ element, node, scriptRuntimeRef, onStrudelTransport }) {
  const runtime = useMemo(() => getStrudelRuntimeManager(), []);
  const elementId = element.id;
  const elementWidth = element.width;
  const elementHeight = element.height;
  const source = evaluatedStrudelSource(node);
  const evaluationRevision = Math.max(0, Number(node.runtime.settings?.evaluationRevision) || 0);
  const transportMode = node.runtime.transportMode;
  const frameVisualsEnabled = node.runtime.settings?.frameVisuals !== false;
  const latestNodeRef = useRef(node);
  latestNodeRef.current = node;
  const runtimeNode = useMemo(() => ({
    ...latestNodeRef.current,
    source,
    evaluationRevision,
  }), [evaluationRevision, source]);
  const bridge = useMemo(
    () => createLivecodeBridge(
      { id: elementId, width: elementWidth, height: elementHeight },
      runtimeNode,
      scriptRuntimeRef,
      onStrudelTransport,
    ),
    [elementHeight, elementId, elementWidth, onStrudelTransport, runtimeNode, scriptRuntimeRef],
  );
  useEffect(() => {
    void runtime.upsert({
      nodeId: elementId,
      source,
      transportMode,
      bridge,
    }).catch(() => undefined);
  }, [bridge, elementId, evaluationRevision, runtime, source, transportMode]);
  useEffect(() => {
    runtime.setNodeTransportMode(elementId, transportMode);
  }, [elementId, runtime, transportMode]);
  useEffect(() => () => { void runtime.remove(elementId); }, [elementId, runtime]);
  return <StrudelFrameVisualizerCanvas
    runtime={runtime}
    nodeId={elementId}
    enabled={frameVisualsEnabled}
  />;
}

export function StrudelPanelStatus({ nodeId, node, transport, message = "" }) {
  const runtime = useMemo(() => getStrudelRuntimeManager(), []);
  const [visuals, setVisuals] = useState(() => ({
    status: node.runtime.running ? "Ready" : "Stopped",
    error: "",
  }));
  useEffect(() => runtime.subscribeVisuals(nodeId, setVisuals), [nodeId, runtime]);
  const dirty = node.runtime.running && evaluatedStrudelSource(node) !== node.source;
  const runtimeStatus = visuals.error
    || (visuals.status === "Transport linked" && !transport?.playing
      ? "Waiting for score Play"
      : visuals.status);
  const text = dirty
    ? "Draft changed · Ctrl+Enter updates on the next beat"
    : message || runtimeStatus || "Ready";
  return <p className="p5-script-status" role="status" aria-live="polite">{text}</p>;
}

function PersistedLivecodeRuntime({ element, node, scriptRuntimeRef, transport }) {
  const config = useMemo(() => getLivecodeRuntimeConfig(node), [node]);
  const validation = validateLivecodeNode(node);
  const [lastWorkingConfig, setLastWorkingConfig] = useState(() => validation.valid ? config : null);
  useEffect(() => {
    if (validation.valid) setLastWorkingConfig(config);
  }, [node.kind, node.revision, validation.valid, config]);
  if (!lastWorkingConfig) return <div className="livecode-node-runtime-error">{validation.error || "This node needs valid source before it can run."}</div>;
  return <div className="livecode-node-runtime visible" aria-label={`${getLivecodeKindDefinition(node.kind).label} runtime`}>
    {node.kind === "p5" ? <P5Frame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} /> : null}
    {node.kind === "playcore" ? <PlayCoreFrame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} /> : null}
    {node.kind === "shader" ? <ShaderLivecodeFrame element={element} node={node} transport={transport} scriptRuntimeRef={scriptRuntimeRef} /> : null}
  </div>;
}

function LivecodeRuntimeSurface({ element, node, scriptRuntimeRef, transport, onPatch, onMidiEvents, onStrudelTransport }) {
  useEffect(() => () => scriptRuntimeRef.current?.disposeStreamsOwner?.(element.id), [element.id, node.runtime.running, scriptRuntimeRef]);
  if (node.kind === "orca") return <OrcaNode
    nodeId={element.id}
    source={node.source}
    revision={node.revision}
    running={node.runtime.running}
    transportMode={node.runtime.transportMode}
    transport={transport}
    onPatch={onPatch}
    onMidiEvents={onMidiEvents}
    ariaLabel="Orca runtime grid"
  />;
  if (["markdown", "latex", "html"].includes(node.kind)) {
    return <LivecodePresentation element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} />;
  }
  if (node.kind === "strudel" && isLivecodeNodeRunnable(node)) {
    return <StrudelNodeRuntime element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} onStrudelTransport={onStrudelTransport} />;
  }
  return isLivecodeNodeRunnable(node)
    ? <PersistedLivecodeRuntime key={node.kind} element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} transport={transport} />
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
    onClick={event => {
      event.preventDefault();
      event.stopPropagation();
      onEdit?.();
    }}
    onPointerDown={event => event.stopPropagation()}
    aria-label={`Edit ${definition.label} node`}
    title="Click to edit this livecode node"
  ><pre>{previewSource(node.source)}</pre></button>;
}

const nextLivecodeView = view => ({ code: "preview", preview: "split", split: "code" }[view] || "code");
const nextLivecodeQuickView = view => (view === "code" ? "preview" : "code");

function NodeChrome({ node, onPatch, onToggleRun }) {
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
    {!["orca", "strudel"].includes(node.kind) && <button type="button" onClick={() => onPatch?.({ view: nextLivecodeView(node.view) })} title="Cycle code, output, and split view (Cmd/Ctrl+Shift+Enter while editing)" aria-label="Cycle livecode view">{node.view === "code" ? "◒" : node.view === "preview" ? "▥" : "‹/›"}</button>}
  </div>;
}

export function LivecodeNodeOverlay({
  elements = [],
  appState,
  activeEditorId = null,
  focusRequest = 0,
  onEdit,
  onPatch,
  onCommit,
  onToggleRun,
  onMidiEvents,
  onStrudelTransport,
  scriptRuntimeRef,
  transport,
  layer = "overlay",
}) {
  const camera = useMemo(() => ({
    zoom: Number(appState?.zoom?.value) || 1,
    scrollX: Number(appState?.scrollX) || 0,
    scrollY: Number(appState?.scrollY) || 0,
    selectedElementIds: appState?.selectedElementIds || {},
  }), [appState]);
  useEffect(() => {
    void getStrudelRuntimeManager().setTransport({
      playing: Boolean(transport?.playing),
      bpm: Number(transport?.bpm) || 120,
      time: Math.max(0, Number(transport?.time) || 0),
    });
  }, [transport?.playing, transport?.bpm, transport?.time]);
  return <div className={`drawerator-livecode-overlay ${layer}`} aria-label={layer === "underlay" ? "Background Livecode canvas nodes" : "Livecode canvas nodes"}>{elements.filter(element => {
    if (!shouldRenderLivecodeNode(element)) return false;
    const candidate = normalizeLivecodeNode(element.customData.draweratorLivecode);
    const underlay = candidate.kind === "shader" && normalizeShaderCompositionSettings(candidate.runtime.settings).compositeMode === "underlay";
    return layer === "underlay" ? underlay : !underlay;
  }).map(element => {
    const node = normalizeLivecodeNode(element.customData.draweratorLivecode);
    const composition = normalizeShaderCompositionSettings(node.runtime.settings);
    const selected = Boolean(camera.selectedElementIds[element.id]);
    const editing = activeEditorId === element.id;
    const visible = selected || editing;
    return <div
      key={element.id}
      className={`drawerator-livecode-node ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${node.typography.glyphOnlyOverlay ? "glyph-only-overlay" : ""} ${node.view}`}
      data-livecode-node-id={element.id}
      onPointerDown={event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || !event.altKey || !event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        onPatch?.(element.id, { view: nextLivecodeQuickView(node.view) });
      }}
      style={{
        left: (element.x + camera.scrollX) * camera.zoom,
        top: (element.y + camera.scrollY) * camera.zoom,
        width: Math.max(1, element.width * camera.zoom),
        height: Math.max(1, element.height * camera.zoom),
        transform: `rotate(${element.angle || 0}rad)`,
        opacity: Math.max(0, Math.min(1, (Number(element.opacity) || 100) / 100)) * (node.kind === "shader" ? composition.compositeOpacity : 1),
        mixBlendMode: node.kind === "shader" ? composition.blendMode : undefined,
        ...editorStyleFor(node.typography),
      }}
    >
      {visible && !editing && <NodeChrome
        node={node}
        onPatch={patch => onPatch?.(element.id, patch)}
        onToggleRun={() => onToggleRun?.(element.id)}
      />}
      {(() => {
        const runtime = <LivecodeRuntimeSurface
          element={element}
          node={node}
          scriptRuntimeRef={scriptRuntimeRef}
          transport={transport}
          onPatch={patch => onPatch?.(element.id, patch)}
          onMidiEvents={events => onMidiEvents?.(element.id, events)}
          onStrudelTransport={onStrudelTransport}
        />;
        const editor = <LivecodeNodeEditor
          node={node}
          element={element}
          focusRequest={focusRequest}
          glyphOnlyOverlay={node.typography.glyphOnlyOverlay && node.view === "code"}
          enableStrudelWidgets={node.kind === "strudel"}
          onPatch={patch => onPatch?.(element.id, patch)}
          onRun={() => {
            onToggleRun?.(element.id, { command: "run" });
          }}
          onUpdate={node.kind === "strudel" ? () => onToggleRun?.(element.id, { command: "update" }) : undefined}
          onStop={node.kind === "strudel" && node.runtime.running ? () => onToggleRun?.(element.id) : undefined}
          onBlur={() => onCommit?.(element.id)}
          transport={transport}
          onMidiEvents={events => onMidiEvents?.(element.id, events)}
          ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
        />;
        if (editing) {
          if (node.kind !== "orca" && node.view === "split") {
            return <div className="livecode-node-split interactive">{editor}<div className="livecode-node-output">{runtime}</div></div>;
          }
          if (node.kind !== "orca" && node.view === "code") {
            return <div className="livecode-node-surface interactive"><div className="livecode-node-code-overlay">
              <div className="livecode-node-output">{runtime}</div>
              {editor}
            </div></div>;
          }
          return editor;
        }
        const preview = <LivecodeNodePreview
          node={node}
          onEdit={visible ? () => onEdit?.(element.id) : undefined}
        />;
        if (node.kind === "orca") return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`}><LivecodeNodeEditor
          node={node}
          element={element}
          onPatch={patch => onPatch?.(element.id, patch)}
          onBlur={() => onCommit?.(element.id)}
          transport={transport}
          onMidiEvents={events => onMidiEvents?.(element.id, events)}
          ariaLabel="Orca grid editor"
        /></div>;
        const hasOutput = node.kind === "orca" || isLivecodeNodeRunnable(node) || ["markdown", "latex", "html"].includes(node.kind);
        if (node.view === "split") return <div className={`livecode-node-split ${visible ? "interactive" : ""}`}><LivecodeNodeEditor
          node={node}
          element={element}
          readOnly
          glyphOnlyOverlay={node.typography.glyphOnlyOverlay}
          onClick={visible ? () => onEdit?.(element.id) : undefined}
          onDoubleClick={visible ? () => onEdit?.(element.id) : undefined}
          ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
        /><div className="livecode-node-output">{runtime}</div></div>;
        if (node.view === "code") return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`}><div className="livecode-node-code-overlay">
          <div className="livecode-node-output">{runtime}</div>
          <LivecodeNodeEditor
            node={node}
            element={element}
            readOnly
            glyphOnlyOverlay={node.typography.glyphOnlyOverlay}
            enableStrudelWidgets={node.kind === "strudel"}
            onClick={visible ? () => onEdit?.(element.id) : undefined}
            onDoubleClick={visible ? () => onEdit?.(element.id) : undefined}
            ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
          />
        </div></div>;
        return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`}>
          {runtime}
          {!(node.kind === "orca" || (node.view === "preview" && hasOutput)) && preview}
        </div>;
      })()}
    </div>;
  })}</div>;
}
