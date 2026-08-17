import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import UnderscoresCodeEditor from "./UnderscoresCodeEditor.jsx";
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
import { validateP5Source } from "./p5Frame.js";
import { sourceDiagnostic } from "./scriptEditorDiagnostics.js";
import {
  getLivecodeEditorProfile,
  getLivecodeFont,
  getLivecodeKindDefinition,
  getLivecodeViewForDoubleClick,
  isLivecodeCommandOutputGesture,
  LIVECODE_KIND_DEFINITIONS,
  normalizeLivecodeNode,
  randomLivecodeName,
  shouldRenderLivecodeNode,
} from "./livecodeNode.js";
import { infoProps } from "./uiInfo.js";
import { createScriptConsole } from "./scriptConsole.js";
import { isPublicSafeBuild } from "./buildProfile.js";
import { getLivecodeFrameSnapshot } from "./livecodeFrameSnapshot.js";

const StopIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>;
const RunIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" /></svg>;

const editorStyleFor = typography => {
  const font = getLivecodeFont(typography.font);
  const ligaturesEnabled = font.supportsLigatures && typography.ligatures !== false;
  return {
    "--script-editor-font-size": `${typography.fontSize}px`,
    "--livecode-line-height": typography.lineHeight,
    "--livecode-font-family": font.family,
    "--livecode-font-feature-settings": ligaturesEnabled ? font.featureSettings : (font.supportsLigatures ? "none" : "normal"),
    "--livecode-font-variant-ligatures": ligaturesEnabled ? "common-ligatures contextual" : (font.supportsLigatures ? "none" : "normal"),
    "--livecode-font-weight": typography.fontWeight,
    "--livecode-letter-spacing": `${typography.letterSpacing}px`,
    "--livecode-code-opacity": `${Math.round(typography.codeOverlayOpacity * 100)}%`,
  };
};

export function LivecodeNodeEditor({
  node: rawNode,
  element,
  onPatch,
  onRun,
  onToggleRun,
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
  visualOnly = false,
  showGutters = false,
}) {
  const node = useMemo(() => normalizeLivecodeNode(rawNode), [rawNode]);
  const definition = getLivecodeKindDefinition(node.kind);
  if (isPublicSafeBuild && node.kind === "strudel") return <div
    className={`livecode-node-editor livecode-student-build-unavailable ${className}`.trim()}
    style={editorStyleFor(node.typography)}
    role="status"
  >Strudel is not included in this student build. Use a p5, Play Core, Orca, shader, or document node instead.</div>;
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
    settings={node.runtime.settings}
    onPatch={onPatch}
    onMidiEvents={onMidiEvents}
    onToggleRun={onToggleRun}
    onBlur={onBlur}
    focusRequest={focusRequest}
    ariaLabel={ariaLabel || "Orca grid editor"}
  /></div>;
  return (
    <UnderscoresCodeEditor
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
      getDiagnostics={node.kind === "p5" ? source => {
        const validation = validateP5Source(source);
        return validation.valid
          ? []
          : [sourceDiagnostic(source, `p5 does not compile: ${validation.error || "syntax error"}`)];
      } : undefined}
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
      visualOnly={visualOnly}
    />
  );
}

function createLivecodeBridge(element, node, scriptRuntimeRef, onStrudelTransport) {
  const canvas = createScriptCanvasApi(scriptRuntimeRef);
  const params = resolveScriptParameterValues(
    parseScriptParameters(node.source, { values: node.parameters }),
    scriptRuntimeRef,
    canvas,
  );
  const appearance = () => scriptRuntimeRef.current?.getAppearance?.() || {
    theme: "dark", currentColor: "#e8e8e8", currentRawColor: "#e8e8e8", currentOpacity: 100,
    currentBackgroundColor: "transparent", currentRawBackgroundColor: "transparent", currentStroke: "#e8e8e8",
    currentFill: "transparent", currentStrokeWidth: 1, colors: {}, appState: {},
  };
  const scriptConsole = createScriptConsole(scriptRuntimeRef, element.id);
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
    get currentRawColor() { return appearance().currentRawColor; },
    get currentOpacity() { return appearance().currentOpacity; },
    get currentBackgroundColor() { return appearance().currentBackgroundColor; },
    get currentRawBackgroundColor() { return appearance().currentRawBackgroundColor; },
    get currentBackgroundOpacity() { return appearance().currentBackgroundOpacity; },
    get currentStroke() { return appearance().currentStroke; },
    get currentFill() { return appearance().currentFill; },
    get currentStrokeWidth() { return appearance().currentStrokeWidth; },
    get currentFillStyle() { return appearance().currentFillStyle; },
    get currentStrokeStyle() { return appearance().currentStrokeStyle; },
    get currentRoughness() { return appearance().currentRoughness; },
    get currentRoundness() { return appearance().currentRoundness; },
    get currentFontFamily() { return appearance().currentFontFamily; },
    get currentFontSize() { return appearance().currentFontSize; },
    get currentFontWeight() { return appearance().currentFontWeight; },
    get currentTextAlign() { return appearance().currentTextAlign; },
    get currentVerticalAlign() { return appearance().currentVerticalAlign; },
    get activeTool() { return appearance().activeTool; },
    get zoom() { return appearance().zoom; },
    get scrollX() { return appearance().scrollX; },
    get scrollY() { return appearance().scrollY; },
    get appState() { return appearance().appState; },
    get colors() { return appearance().colors; },
    get theme() { return appearance().theme; },
    get appearance() { return appearance(); },
    get streams() { return scriptRuntimeRef?.current?.getStreams?.(element.id) || window.__?.streams; },
    console: scriptConsole,
    log: scriptConsole.log,
    info: scriptConsole.info,
    warn: scriptConsole.warn,
    error: scriptConsole.error,
    get art() { return window.__?.art; },
    strudel: Object.freeze({
      setTempo: bpm => onStrudelTransport?.(element, node, { type: "tempo", value: bpm }),
      setPlaying: playing => onStrudelTransport?.(element, node, { type: "playing", value: Boolean(playing) }),
    }),
    get api() { return window.__; },
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
    // IntersectionObserver owns visibility after registration. Start cold so
    // an offscreen node never paints one or more full frames before its first
    // observer callback.
    const unregister = runtime.registerFrameCanvas(nodeId, canvas, false);
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
  // Parameter edits are persisted independently from source revisions. Keep
  // them in the bridge identity so a running Strudel node recompiles with the
  // new __.params values at the scheduler's next safe beat.
  const parameterSignature = JSON.stringify(node.parameters || {});
  const transportMode = node.runtime.transportMode;
  const rawLaunchAt = node.runtime.settings?.launchAt;
  const launchAt = rawLaunchAt !== null && rawLaunchAt !== undefined && Number.isFinite(Number(rawLaunchAt))
    ? Number(rawLaunchAt)
    : null;
  const frameVisualsEnabled = node.runtime.settings?.frameVisuals !== false;
  const latestNodeRef = useRef(node);
  latestNodeRef.current = node;
  const runtimeNode = useMemo(() => ({
    ...latestNodeRef.current,
    source,
    evaluationRevision,
  }), [evaluationRevision, parameterSignature, source]);
  const bridge = useMemo(
    () => createLivecodeBridge(
      { id: elementId, width: elementWidth, height: elementHeight },
      runtimeNode,
      scriptRuntimeRef,
      onStrudelTransport,
    ),
    [elementHeight, elementId, elementWidth, onStrudelTransport, parameterSignature, runtimeNode, scriptRuntimeRef],
  );
  useEffect(() => {
    void runtime.upsert({
      nodeId: elementId,
      source,
      transportMode,
      bridge,
      launchAt,
    }).catch(() => undefined);
  }, [bridge, elementId, evaluationRevision, launchAt, runtime, source, transportMode]);
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
  // Runtime failures belong to the script panel and Event Console. Keep the
  // canvas surface empty while an invalid draft is being edited rather than
  // painting diagnostics over the user's artwork.
  if (!lastWorkingConfig) return null;
  return <div className="livecode-node-runtime visible" aria-label={`${getLivecodeKindDefinition(node.kind).label} runtime`}>
    {node.kind === "p5" ? <P5Frame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} transport={transport} transportMode={node.runtime.transportMode} /> : null}
    {node.kind === "playcore" ? <PlayCoreFrame element={element} config={lastWorkingConfig} scriptRuntimeRef={scriptRuntimeRef} transport={transport} transportMode={node.runtime.transportMode} /> : null}
    {node.kind === "shader" ? <ShaderLivecodeFrame element={element} node={node} transport={transport} scriptRuntimeRef={scriptRuntimeRef} /> : null}
  </div>;
}

function LivecodeRuntimeSurface({ element, node, scriptRuntimeRef, transport, editable = false, documentEditing = false, onActivate, onPatch, onCommit, onMidiEvents, onStrudelTransport, onToggleRun }) {
  useEffect(() => () => scriptRuntimeRef.current?.disposeStreamsOwner?.(element.id), [element.id, node.runtime.running, scriptRuntimeRef]);
  const lastFrame = node.runtime.settings?.keepLastFrame === true
    ? getLivecodeFrameSnapshot(element.id)
    : "";
  if (!node.runtime.running && lastFrame) return <div className="livecode-node-runtime visible livecode-last-frame" aria-label="Last rendered frame">
    <img src={lastFrame} alt="Last rendered Livecode frame" draggable="false" />
  </div>;
  if (node.kind === "orca") return <OrcaNode
    nodeId={element.id}
    source={node.source}
    revision={node.revision}
    running={node.runtime.running}
    transportMode={node.runtime.transportMode}
    transport={transport}
    settings={node.runtime.settings}
    onPatch={onPatch}
    onMidiEvents={onMidiEvents}
    onToggleRun={() => onToggleRun?.(element.id)}
    ariaLabel="Orca runtime grid"
  />;
  if (["markdown", "latex", "html"].includes(node.kind)) {
    return <LivecodePresentation element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} editable={editable} documentEditing={documentEditing} onActivate={onActivate} onPatch={onPatch} onCommit={onCommit} />;
  }
  if (node.kind === "strudel" && isLivecodeNodeRunnable(node)) {
    if (isPublicSafeBuild) return <div className="livecode-student-build-unavailable" role="status">Strudel is not included in this student build.</div>;
    return <StrudelNodeRuntime element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} onStrudelTransport={onStrudelTransport} />;
  }
  return isLivecodeNodeRunnable(node)
    ? <PersistedLivecodeRuntime key={node.kind} element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} transport={transport} />
    : null;
}

const nextLivecodeView = view => ({ preview: "source", source: "code", code: "split", split: "preview", overlay: "split" }[view] || "source");

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
      onChange={event => onPatch?.({ kind: event.target.value, name: randomLivecodeName(event.target.value) })}
      {...infoProps("Livecode kind", "Changes this node's adapter and editor profile. Its source stays on the node; choose a compatible kind before running it.")}
    >
      {Object.entries(LIVECODE_KIND_DEFINITIONS).filter(([id]) => !isPublicSafeBuild || id !== "strudel").map(([id, candidate]) => <option key={id} value={id}>{candidate.label}</option>)}
    </select>
    {!["orca", "strudel"].includes(node.kind) && <button type="button" onClick={() => onPatch?.({ view: nextLivecodeView(node.view) })} title="Cycle output, code, code overlay, and split view (Cmd/Ctrl+Shift+Enter while editing)" aria-label="Cycle livecode view">{node.view === "preview" ? "▥" : node.view === "source" ? "{}" : node.view === "code" || node.view === "overlay" ? "◒" : "‹/›"}</button>}
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
  return <div className={`underscores-livecode-overlay ${layer}`} aria-label={layer === "underlay" ? "Background Livecode canvas nodes" : "Livecode canvas nodes"}>{elements.filter(element => {
    if (!shouldRenderLivecodeNode(element)) return false;
    const candidate = normalizeLivecodeNode(element.customData.underscoresLivecode);
    const underlay = candidate.kind === "shader" && normalizeShaderCompositionSettings(candidate.runtime.settings).compositeMode === "underlay";
    return layer === "underlay" ? underlay : !underlay;
  }).map(element => {
    const node = normalizeLivecodeNode(element.customData.underscoresLivecode);
    const composition = normalizeShaderCompositionSettings(node.runtime.settings);
    const selected = Boolean(camera.selectedElementIds[element.id]);
    const editing = activeEditorId === element.id;
    const visible = selected || editing;
    const handleCommandOutputPointer = event => {
      if (!isLivecodeCommandOutputGesture(event)) return;
      if (event.target?.closest?.(".livecode-node-chrome")) return;
      if (event.target?.closest?.("textarea, .underscores-code-editor, .cm-editor")) return;
      event.preventDefault();
      event.stopPropagation();
      if (node.view !== "preview") onPatch?.(element.id, { view: "preview" }, { commitToHistory: true });
    };
    const handleCommandOutputClick = event => {
      if (!isLivecodeCommandOutputGesture(event)) return;
      if (event.target?.closest?.(".livecode-node-chrome")) return;
      if (event.target?.closest?.("textarea, .underscores-code-editor, .cm-editor")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    return <div
      key={element.id}
      className={`underscores-livecode-node ${selected ? "selected" : ""} ${editing ? "editing" : ""} ${node.typography.glyphOnlyOverlay ? "glyph-only-overlay" : ""} ${node.view}`}
      data-livecode-node-id={element.id}
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
      onPointerDownCapture={handleCommandOutputPointer}
      onClickCapture={handleCommandOutputClick}
    >
      {visible && node.runtime.settings?.showChrome === true && <NodeChrome
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
          editable={visible && node.kind === "markdown" && node.view === "preview"}
          documentEditing={editing}
          onActivate={event => onEdit?.(element.id, event ? { view: getLivecodeViewForDoubleClick(event) } : undefined)}
          onPatch={patch => onPatch?.(element.id, patch)}
          onCommit={() => onCommit?.(element.id)}
          onMidiEvents={(events, metadata) => onMidiEvents?.(element.id, events, metadata)}
          onStrudelTransport={onStrudelTransport}
          onToggleRun={onToggleRun}
        />;
        const editor = <LivecodeNodeEditor
          node={node}
          element={element}
          focusRequest={focusRequest}
          glyphOnlyOverlay={node.typography.glyphOnlyOverlay && (node.view === "code" || node.view === "overlay")}
          enableStrudelWidgets={node.kind === "strudel"}
          onPatch={patch => onPatch?.(element.id, patch)}
          onRun={() => {
            onToggleRun?.(element.id, { command: "run" });
          }}
          onToggleRun={() => onToggleRun?.(element.id)}
          onUpdate={node.kind === "strudel" ? () => onToggleRun?.(element.id, { command: "update" }) : undefined}
          onStop={node.kind === "strudel" && node.runtime.running ? () => onToggleRun?.(element.id) : undefined}
          onBlur={() => onCommit?.(element.id)}
          onCycleView={node.kind === "strudel" ? undefined : () => onPatch?.(element.id, { view: nextLivecodeView(node.view) })}
          transport={transport}
          onMidiEvents={(events, metadata) => onMidiEvents?.(element.id, events, metadata)}
          ariaLabel={node.kind === "orca" ? "Orca grid editor" : `${getLivecodeKindDefinition(node.kind).label} canvas node source`}
        />;
        if (node.kind === "orca") return <div
          className="livecode-node-surface orca-livecode-surface interactive"
          onPointerDownCapture={() => {
            if (!visible) onEdit?.(element.id);
          }}
          onClickCapture={() => {
            if (!visible) onEdit?.(element.id);
          }}
        >{editor}</div>;
        if (editing) {
          if (node.kind === "markdown" && node.view === "preview") {
            return <div className="livecode-node-surface interactive markdown-document-editor">{runtime}</div>;
          }
          if (node.view === "preview") return <div className={`livecode-node-surface interactive ${node.kind === "strudel" ? "livecode-node-strudel-visual-output" : ""}`}>
            {runtime}
            {node.kind === "strudel" && isLivecodeNodeRunnable(node) && <LivecodeNodeEditor
              node={node}
              element={element}
              readOnly
              visualOnly
              enableStrudelWidgets
              ariaLabel="Strudel visual output"
            />}
          </div>;
          if (node.view === "source") return editor;
          if (node.kind !== "orca" && node.view === "split") {
            return <div className="livecode-node-split interactive">{editor}<div className="livecode-node-output">{runtime}</div></div>;
          }
          if (node.kind !== "orca" && (node.view === "code" || node.view === "overlay")) {
            return <div className="livecode-node-surface interactive"><div className="livecode-node-code-overlay">
              <div className="livecode-node-output">{runtime}</div>
              {editor}
            </div></div>;
          }
          return editor;
        }
        if (node.view === "split") return <div className={`livecode-node-split ${visible ? "interactive" : ""}`} onPointerDown={visible ? () => onEdit?.(element.id) : undefined}><LivecodeNodeEditor
          node={node}
          element={element}
          readOnly
          glyphOnlyOverlay={false}
          enableStrudelWidgets={node.kind === "strudel"}
          onClick={visible ? () => onEdit?.(element.id) : undefined}
          onDoubleClick={visible ? event => onEdit?.(element.id, { view: getLivecodeViewForDoubleClick(event) }) : undefined}
          ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
        /><div className="livecode-node-output">{runtime}</div></div>;
        if (node.kind === "markdown" && node.view === "source") return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`} onPointerDown={visible ? () => onEdit?.(element.id) : undefined}><LivecodeNodeEditor
          node={node}
          element={element}
          readOnly
          onClick={visible ? () => onEdit?.(element.id) : undefined}
          onDoubleClick={visible ? event => onEdit?.(element.id, { view: getLivecodeViewForDoubleClick(event) }) : undefined}
          ariaLabel="Markdown canvas node source"
        /></div>;
        if (node.view === "code" || node.view === "overlay") return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`} onPointerDown={visible ? () => onEdit?.(element.id) : undefined}><div className="livecode-node-code-overlay">
          <div className="livecode-node-output">{runtime}</div>
          <LivecodeNodeEditor
            node={node}
            element={element}
            readOnly
            glyphOnlyOverlay={node.typography.glyphOnlyOverlay}
            enableStrudelWidgets={node.kind === "strudel"}
            onClick={visible ? () => onEdit?.(element.id) : undefined}
            onDoubleClick={visible ? event => onEdit?.(element.id, { view: getLivecodeViewForDoubleClick(event) }) : undefined}
            ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
          />
        </div></div>;
        if (node.view === "source") return <div className={`livecode-node-surface ${visible ? "interactive" : ""}`} onPointerDown={visible ? () => onEdit?.(element.id) : undefined}><LivecodeNodeEditor
          node={node}
          element={element}
          readOnly
          onClick={visible ? () => onEdit?.(element.id) : undefined}
          onDoubleClick={visible ? event => onEdit?.(element.id, { view: getLivecodeViewForDoubleClick(event) }) : undefined}
          ariaLabel={`${getLivecodeKindDefinition(node.kind).label} canvas node source`}
        /></div>;
        return <div className={`livecode-node-surface ${visible ? "interactive" : ""} ${node.kind === "strudel" ? "livecode-node-strudel-visual-output" : ""}`} onPointerDown={visible ? () => onEdit?.(element.id) : undefined}>
          {runtime}
          {node.kind === "strudel" && isLivecodeNodeRunnable(node) && <LivecodeNodeEditor
            node={node}
            element={element}
            readOnly
            visualOnly
            enableStrudelWidgets
            ariaLabel="Strudel visual output"
          />}
        </div>;
      })()}
    </div>;
  })}</div>;
}
