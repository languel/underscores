import { useEffect, useMemo, useRef, useState } from "react";
import {
  isMediaStreamElement,
  MEDIA_STREAM_KINDS,
  normalizeMediaStreamConfig,
} from "./mediaStream.js";
import { FACE_DISPLAY_GROUPS } from "./mediaLandmarkOntology.js";
import { MediaRuntimePreview } from "./MediaStreamOverlay.jsx";
import { getMediaRuntimeSource } from "./mediaStreamRuntime.js";
import { infoProps } from "./uiInfo.js";

const stopKeyPropagation = event => event.stopPropagation();

const StatusLine = ({ status }) => status?.message
  ? <div className={`media-stream-panel-status is-${status.kind || "info"}`} role="status">{status.message}</div>
  : null;

const useMediaStatus = selectedId => {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    const handler = event => {
      const detail = event.detail || {};
      if (!detail.elementId) return;
      setStatuses(previous => ({ ...previous, [detail.elementId]: detail }));
    };
    window.addEventListener("drawerator:media-stream-status", handler);
    return () => window.removeEventListener("drawerator:media-stream-status", handler);
  }, []);
  return statuses[selectedId] || null;
};

const useSourceMetrics = sourceId => {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      const element = getMediaRuntimeSource(sourceId)?.element;
      if (element?.dataset.frameTime) setMetrics({
        output: [element.width || 0, element.height || 0],
        original: [Number(element.dataset.originalWidth) || 0, Number(element.dataset.originalHeight) || 0],
        fps: Number(element.dataset.liveFps) || 0,
      });
      else setMetrics(null);
      timer = window.setTimeout(refresh, 400);
    };
    refresh();
    return () => window.clearTimeout(timer);
  }, [sourceId]);
  return metrics;
};

const SourceKindIcon = ({ kind }) => {
  if (kind === MEDIA_STREAM_KINDS.CAMERA) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h10.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm12.5 3.2 4-2.4a1 1 0 0 1 1.5.86v7.68a1 1 0 0 1-1.5.86l-4-2.4" /></svg>;
  if (kind === MEDIA_STREAM_KINDS.CANVAS) return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="m5.5 17 4.8-5 3.2 3 2.2-2 3 4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" /><circle cx="8.5" cy="9" r="1.4" /><path d="m5.5 17 4.8-5 3.2 3 2.2-2 3 4" /></svg>;
};

const sourceKindLabel = kind => ({
  [MEDIA_STREAM_KINDS.CAMERA]: "Camera",
  [MEDIA_STREAM_KINDS.CANVAS]: "Canvas source",
  [MEDIA_STREAM_KINDS.MEDIA]: "Media source",
}[kind] || "Image source");

const SourceList = ({ sources, selectedId, empty, onSelect, onDelete }) => {
  if (!sources.length) return <div className="media-stream-panel-empty">{empty}</div>;
  return <div className="media-stream-panel-list" role="list">
    {sources.map(source => <div
      key={source.id}
      role="listitem"
      data-media-source-id={source.id}
      className={`media-stream-panel-row ${source.id === selectedId ? "is-selected" : ""}`}
    >
      <button
        type="button"
        draggable
        className="media-stream-panel-row-source-icon"
        aria-label={`Drag ${source.name} to the canvas as a preview`}
        title={`Drag ${sourceKindLabel(source.kind)} to canvas as preview`}
        onClick={() => onSelect(source.id)}
        onDragStart={event => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("application/x-drawerator-media-source", source.id);
          event.dataTransfer.setData("text/plain", source.name);
        }}
      ><SourceKindIcon kind={source.kind} /></button>
      <button type="button" className="media-stream-panel-row-select" onClick={() => onSelect(source.id)}>
        <span className="media-stream-panel-row-name">{source.name}</span>
      </button>
      {onDelete && <button
        type="button"
        className="media-stream-panel-row-delete"
        aria-label={`Delete ${source.name}`}
        title={`Delete ${source.name}`}
        onClick={() => onDelete(source.id)}
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.8 13h9.4l.8-13" /></svg></button>}
    </div>)}
  </div>;
};

const ProcessorList = ({ elements, selectedElementIds, onSelect }) => {
  if (!elements.length) return <div className="media-stream-panel-empty">No Holistic processor objects yet.</div>;
  return <div className="media-stream-panel-list" role="list">
    {elements.map(element => {
      const config = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
      return <button
        key={element.id}
        type="button"
        role="listitem"
        className={`media-stream-panel-row media-stream-panel-row-select ${selectedElementIds?.[element.id] ? "is-selected" : ""}`}
        onClick={() => onSelect(element.id)}
      >
        <span className="media-stream-panel-row-name">{config.name}</span>
        <span className="media-stream-panel-row-kind">{config.kind}</span>
      </button>;
    })}
  </div>;
};

const CropControls = ({ crop, onPatch }) => <div className="media-stream-panel-crop">
  <span>Crop</span>
  {[
    ["x", "X", 0, 0.99],
    ["y", "Y", 0, 0.99],
    ["width", "W", 0.01, 1],
    ["height", "H", 0.01, 1],
  ].map(([field, label, min, max]) => <label key={field}>
    <span>{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      step="0.01"
      value={crop[field]}
      onKeyDown={stopKeyPropagation}
      onChange={event => onPatch({ crop: { [field]: event.target.value } })}
    />
  </label>)}
</div>;

const isAnimatedSource = source => source.kind === MEDIA_STREAM_KINDS.CAMERA
  || (source.kind === MEDIA_STREAM_KINDS.MEDIA && (
    source.media.mediaType === "video"
    || /\.gif(?:$|[?#])/i.test(source.media.url || source.media.fileName || "")
  ));

const SourceTransportControls = ({ source, onPatch }) => {
  const isCamera = source.kind === MEDIA_STREAM_KINDS.CAMERA;
  const canSetRate = !isCamera && isAnimatedSource(source);
  const isPlaying = source.media.playing;
  const transportTitle = isPlaying ? "Freeze input" : "Resume input";
  const transportHelp = isCamera
    ? "Freeze or resume this camera's processed output. The camera stays connected while frozen."
    : "Pause or resume this input independently of the global transport. Its processed frame remains available to downstream processors while paused.";
  return <div className="media-stream-panel-transport">
    <button
      type="button"
      className={`iannix-flat-button media-source-play-toggle ${isPlaying ? "active" : ""}`}
      onClick={() => onPatch({ media: { playing: !isPlaying } })}
      aria-label={transportTitle}
      aria-pressed={isPlaying}
      {...infoProps(transportTitle, transportHelp)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isPlaying
          ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>
          : <path d="M7 5.5v13l11-6.5z" />}
      </svg>
    </button>
    {canSetRate && <label className="media-stream-panel-field">
      <span>Speed</span>
      <input type="number" min="0.1" max="8" step="0.1" value={source.media.playbackRate} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ media: { playbackRate: event.target.value } })} />
    </label>}
  </div>;
};

const SourceDetail = ({ source, onPatch, onCreatePreview, onAssignPreview, canAssignPreview, children, status }) => {
  const metrics = useSourceMetrics(source.id);
  return <div className="media-stream-panel-detail">
  <MediaRuntimePreview sourceId={source.id} className="media-stream-panel-preview" />
  <label className="media-stream-panel-field">
    <span>Name</span>
    <input value={source.name} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ name: event.target.value })} />
  </label>
  <label className="media-stream-panel-field">
    <span>Type</span>
    <select value={source.kind} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ kind: event.target.value })}>
      <option value={MEDIA_STREAM_KINDS.MEDIA}>File / URL</option>
      <option value={MEDIA_STREAM_KINDS.CAMERA}>Camera</option>
      <option value={MEDIA_STREAM_KINDS.CANVAS}>Canvas</option>
    </select>
  </label>
  {children}
  <SourceTransportControls source={source} onPatch={onPatch} />
  <div className="media-stream-panel-output" role="group" aria-label="Published image stream settings">
    <label className="media-stream-panel-field"><span>FPS</span>
      <select value={source.output.fps} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ output: { fps: Number(event.target.value) } })}>
        {[60, 30, 24, 15, 12, 8, 4, 1].map(fps => <option key={fps} value={fps}>{fps}</option>)}
      </select>
    </label>
    <label className="media-stream-panel-field"><span>Resolution</span>
      <select value={source.output.maxDimension} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ output: { maxDimension: Number(event.target.value) } })}>
        <option value="0">Original</option>
        {[1920, 1280, 960, 640, 480, 320].map(size => <option key={size} value={size}>{size}px max</option>)}
      </select>
    </label>
    {metrics && <div className="media-stream-panel-metrics">{metrics.original[0]} × {metrics.original[1]} original · {metrics.output[0]} × {metrics.output[1]} output{metrics.fps ? ` · ${metrics.fps} fps live` : ""}</div>}
  </div>
  <label className="media-stream-panel-check" {...infoProps("Mirror output", "Mirror the processed output used by all previews and downstream processors.")}>
    <input type="checkbox" checked={source.mirror} onChange={event => onPatch({ mirror: event.target.checked })} />
    <span>Mirror</span>
  </label>
  <CropControls crop={source.crop} onPatch={onPatch} />
  <label className="media-stream-panel-check" {...infoProps("Input enabled", "Turn off this source runtime without deleting its stored configuration or any assigned previews.")}>
    <input type="checkbox" checked={source.enabled} onChange={event => onPatch({ enabled: event.target.checked })} />
    <span>Enabled</span>
  </label>
  <div className="media-stream-panel-preview-actions">
    <button type="button" className="iannix-flat-button" onClick={onCreatePreview}>Add preview</button>
    <button type="button" className="iannix-flat-button" disabled={!canAssignPreview} onClick={onAssignPreview}>Use selected</button>
  </div>
  <StatusLine status={status} />
</div>;
};

const useSelectedSource = (sources, controlledId, onControlledChange) => {
  const [localSelectedId, setLocalSelectedId] = useState("");
  const selectedId = controlledId ?? localSelectedId;
  const setSelectedId = id => {
    setLocalSelectedId(id);
    onControlledChange?.(id);
  };
  useEffect(() => {
    if (!sources.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!sources.some(source => source.id === selectedId)) setSelectedId(sources[0].id);
  }, [selectedId, sources]);
  return [sources.find(source => source.id === selectedId) || sources[0] || null, setSelectedId];
};

export function MediaInputPanel({ sources, canvasTargets = [], selectedCanvasTarget, activeSourceId, onActiveSourceChange, onCreate, onPatch, onCreatePreview, onAssignPreview, onPickCanvasTarget, onChooseFile, onDelete }) {
  const fileRef = useRef(null);
  const [selected, setSelectedId] = useSelectedSource(sources, activeSourceId, onActiveSourceChange);
  const status = useMediaStatus(selected?.id);
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState("");

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceStatus("Camera enumeration is unavailable.");
      return;
    }
    try {
      const found = await navigator.mediaDevices.enumerateDevices();
      setDevices(found.filter(device => device.kind === "videoinput"));
      setDeviceStatus("");
    } catch (error) {
      setDeviceStatus(error?.message || "Could not enumerate cameras.");
    }
  };

  useEffect(() => { void refreshDevices(); }, []);

  const addSource = () => {
    const source = onCreate(MEDIA_STREAM_KINDS.MEDIA, { name: "Image source" });
    if (source?.id) setSelectedId(source.id);
  };

  return <div className="media-stream-panel">
    <div className="media-stream-panel-source-header">
      <span>Sources</span>
      <button type="button" className="iannix-flat-button media-stream-panel-add-source" onClick={addSource} aria-label="Add image source" title="Add image source">+</button>
    </div>
    <input ref={fileRef} type="file" hidden accept="image/*,video/*,.gif" onChange={event => {
      const file = event.target.files?.[0];
      if (file) onChooseFile(file, selected?.id);
      event.target.value = "";
    }} />
    <SourceList sources={sources} selectedId={selected?.id} empty="No image inputs yet." onSelect={setSelectedId} onDelete={onDelete} />
    {selected && <SourceDetail
      source={selected}
      onPatch={patch => onPatch(selected.id, patch)}
      onCreatePreview={() => onCreatePreview(selected.id)}
      onAssignPreview={() => onAssignPreview(selected.id, selectedCanvasTarget?.id)}
      canAssignPreview={Boolean(selectedCanvasTarget)}
      status={status || (selected.kind === MEDIA_STREAM_KINDS.CAMERA && deviceStatus ? { kind: "error", message: deviceStatus } : null)}
    >
      {selected.kind === MEDIA_STREAM_KINDS.CAMERA
        ? <label className="media-stream-panel-field">
            <span>Camera</span>
            <div className="media-stream-panel-inline-control">
              <select value={selected.camera.deviceId} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { camera: { deviceId: event.target.value } })}>
                <option value="">Default camera</option>
                {devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
              </select>
              <button type="button" className="iannix-flat-button media-stream-panel-icon-button" onClick={() => void refreshDevices()} aria-label="Refresh cameras" title="Refresh cameras">↻</button>
            </div>
          </label>
        : selected.kind === MEDIA_STREAM_KINDS.CANVAS
          ? <>
              <label className="media-stream-panel-field">
                <span>Canvas target</span>
                <div className="media-stream-panel-inline-control">
                  <select value={selected.canvas.elementId} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { canvas: { elementId: event.target.value } })}>
                    <option value="">Choose a frame or rectangle</option>
                    {canvasTargets.map(element => <option key={element.id} value={element.id}>{element.customData?.draweratorLabel || element.type} · {element.id.slice(0, 6)}</option>)}
                  </select>
                  <button type="button" className="iannix-flat-button media-stream-panel-icon-button" onClick={() => onPickCanvasTarget?.(selected.id)} aria-label="Pick canvas object" title="Pick a frame or rectangle (Option-I)">⌖</button>
                </div>
              </label>
              <label className="media-stream-panel-check" {...infoProps("Live capture", "Continuously capture the target at the configured stream FPS. Turn this off for an event-driven static capture whenever the target changes.")}>
                <input type="checkbox" checked={selected.canvas.live} onChange={event => onPatch(selected.id, { canvas: { live: event.target.checked } })} />
                <span>Live</span>
              </label>
            </>
        : <>
            <label className="media-stream-panel-field">
              <span>URL</span>
              <div className="media-stream-panel-inline-control">
                <input value={selected.media.url} placeholder={selected.media.fileName || "https://…"} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { media: { url: event.target.value, fileName: "" } })} />
                <button type="button" className="iannix-flat-button media-stream-panel-icon-button" onClick={() => fileRef.current?.click()} aria-label="Choose media file" title="Choose image, GIF, or video">⌑</button>
              </div>
            </label>
            {isAnimatedSource(selected) && <>
              <label className="media-stream-panel-check">
                <input type="checkbox" checked={selected.media.loop} onChange={event => onPatch(selected.id, { media: { loop: event.target.checked } })} />
                <span>Loop</span>
              </label>
              {selected.media.mediaType === "video" && <label className="media-stream-panel-check">
                <input type="checkbox" checked={selected.media.muted} onChange={event => onPatch(selected.id, { media: { muted: event.target.checked } })} />
                <span>Muted</span>
              </label>}
            </>}
            {selected.media.fileName && <div className="media-stream-panel-note">Local file: {selected.media.fileName}. Choose it again after reloading the page.</div>}
          </>}
    </SourceDetail>}
  </div>;
}

export function HolisticPanel({ elements, sources, selectedElementIds, onCreate, onPatch, onSelect, onSnapshot }) {
  const processors = useMemo(() => elements.filter(element => (
    isMediaStreamElement(element)
    && normalizeMediaStreamConfig(element.customData.draweratorMediaStream).kind === MEDIA_STREAM_KINDS.HOLISTIC
  )), [elements]);
  const selected = processors.find(element => selectedElementIds?.[element.id]) || processors[0] || null;
  const config = selected ? normalizeMediaStreamConfig(selected.customData.draweratorMediaStream) : null;
  const status = useMediaStatus(selected?.id);
  const defaultSourceId = sources[0]?.id || "";
  const faceGroupEntries = Object.entries(FACE_DISPLAY_GROUPS);
  const allFaceGroupsEnabled = config && faceGroupEntries.every(([id]) => config.holistic.faceGroups[id]);

  return <div className="media-stream-panel">
    <div className="media-stream-panel-toolbar">
      <button type="button" className="iannix-flat-button" disabled={!defaultSourceId} onClick={() => onCreate(MEDIA_STREAM_KINDS.HOLISTIC, { holistic: { sourceId: defaultSourceId } })}>Add Holistic object</button>
      <button type="button" className="iannix-flat-button" disabled={!selected} onClick={() => onSnapshot(selected.id)}>Snapshot landmarks</button>
    </div>
    {!sources.length && <div className="media-stream-panel-note">Create a camera or media input first.</div>}
    <ProcessorList elements={processors} selectedElementIds={selectedElementIds} onSelect={onSelect} />
    {config && <div className="media-stream-panel-detail">
      <label className="media-stream-panel-field">
        <span>Name</span>
        <input value={config.name} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { name: event.target.value })} />
      </label>
      <label className="media-stream-panel-field">
        <span>Input stream</span>
        <select value={config.holistic.sourceId} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { holistic: { sourceId: event.target.value } })}>
          <option value="">Choose input</option>
          {sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <div className="media-stream-panel-colors" role="group" aria-label="Holistic overlay colors">
        {[["pose", "Pose"], ["leftHand", "Left hand"], ["rightHand", "Right hand"], ["face", "Face"]].map(([field, label]) => <label key={field}>
          <span>{label}</span>
          <input type="color" value={config.holistic.colors[field]} onChange={event => onPatch(selected.id, { holistic: { colors: { [field]: event.target.value } } })} />
        </label>)}
      </div>
      {[["showSource", "Source feed"], ["showPose", "Pose"], ["showHands", "Hands"], ["refineFaceLandmarks", "Refine face + iris"]].map(([field, label]) => <label key={field} className="media-stream-panel-check">
        <input type="checkbox" checked={config.holistic[field]} onChange={event => onPatch(selected.id, { holistic: { [field]: event.target.checked } })} />
        <span>{label}</span>
      </label>)}
      <details className="media-stream-face-filter" open>
        <summary>Face points</summary>
        <div className="media-stream-face-filter-body">
          <label className="media-stream-panel-check">
            <input type="checkbox" checked={allFaceGroupsEnabled} onChange={event => onPatch(selected.id, {
              holistic: { showFace: event.target.checked, faceGroups: Object.fromEntries(faceGroupEntries.map(([id]) => [id, event.target.checked])) },
            })} />
            <span>All</span>
          </label>
          {faceGroupEntries.map(([id, group]) => <label key={id} className="media-stream-panel-check">
            <input type="checkbox" checked={config.holistic.faceGroups[id]} onChange={event => onPatch(selected.id, { holistic: { showFace: true, faceGroups: { [id]: event.target.checked } } })} />
            <span>{group.label}</span>
          </label>)}
        </div>
      </details>
      {[['showPoints', 'Points'], ['showConnections', 'Connections'], ['showIds', 'Landmark IDs']].map(([field, label]) => <label key={field} className="media-stream-panel-check">
        <input type="checkbox" checked={config.holistic[field]} onChange={event => onPatch(selected.id, { holistic: { [field]: event.target.checked } })} />
        <span>{label}</span>
      </label>)}
      <label className="media-stream-panel-field">
        <span>Model</span>
        <select value={config.holistic.modelComplexity} onChange={event => onPatch(selected.id, { holistic: { modelComplexity: Number(event.target.value) } })}>
          <option value="0">Lite</option>
          <option value="1">Full</option>
          <option value="2">Heavy</option>
        </select>
      </label>
      <div className="media-stream-panel-note">MediaPipe consumes the source&apos;s processed output. The source feed toggle affects only this Holistic view.</div>
      <StatusLine status={status} />
    </div>}
  </div>;
}
