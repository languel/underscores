import { useEffect, useMemo, useRef, useState } from "react";
import {
  isMediaStreamElement,
  MEDIA_STREAM_KINDS,
  normalizeMediaStreamConfig,
} from "./mediaStream.js";
import { MediaRuntimePreview } from "./MediaStreamOverlay.jsx";

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

const SourceList = ({ sources, selectedId, empty, onSelect }) => {
  if (!sources.length) return <div className="media-stream-panel-empty">{empty}</div>;
  return <div className="media-stream-panel-list" role="list">
    {sources.map(source => <button
      key={source.id}
      type="button"
      role="listitem"
      data-media-source-id={source.id}
      className={`media-stream-panel-row ${source.id === selectedId ? "is-selected" : ""}`}
      onClick={() => onSelect(source.id)}
    >
      <span className="media-stream-panel-row-name">{source.name}</span>
      <span className="media-stream-panel-row-kind">{source.kind}</span>
    </button>)}
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
        className={`media-stream-panel-row ${selectedElementIds?.[element.id] ? "is-selected" : ""}`}
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

const SourceDetail = ({ source, onPatch, onToggleCanvas, hasCanvasHost, children, status }) => <div className="media-stream-panel-detail">
  <MediaRuntimePreview sourceId={source.id} className="media-stream-panel-preview" />
  <label className="media-stream-panel-field">
    <span>Name</span>
    <input value={source.name} onKeyDown={stopKeyPropagation} onChange={event => onPatch({ name: event.target.value })} />
  </label>
  {children}
  <label className="media-stream-panel-check">
    <input type="checkbox" checked={source.mirror} onChange={event => onPatch({ mirror: event.target.checked })} />
    <span>Mirror processed output</span>
  </label>
  <CropControls crop={source.crop} onPatch={onPatch} />
  <label className="media-stream-panel-check">
    <input type="checkbox" checked={source.enabled} onChange={event => onPatch({ enabled: event.target.checked })} />
    <span>Runtime enabled</span>
  </label>
  <label className="media-stream-panel-check">
    <input type="checkbox" checked={hasCanvasHost} onChange={event => onToggleCanvas(event.target.checked)} />
    <span>Show as canvas object</span>
  </label>
  <StatusLine status={status} />
</div>;

const useSelectedSource = sources => {
  const [selectedId, setSelectedId] = useState("");
  useEffect(() => {
    if (!sources.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!sources.some(source => source.id === selectedId)) setSelectedId(sources[0].id);
  }, [selectedId, sources]);
  return [sources.find(source => source.id === selectedId) || sources[0] || null, setSelectedId];
};

export function VideoInputPanel({ sources, canvasHostSourceIds, onCreate, onPatch, onToggleCanvas, onDelete }) {
  const cameras = useMemo(() => sources.filter(source => source.kind === MEDIA_STREAM_KINDS.CAMERA), [sources]);
  const [selected, setSelectedId] = useSelectedSource(cameras);
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

  return <div className="media-stream-panel">
    <div className="media-stream-panel-toolbar">
      <button type="button" className="iannix-flat-button" onClick={() => onCreate(MEDIA_STREAM_KINDS.CAMERA)}>Add camera</button>
      <button type="button" className="iannix-flat-button" onClick={() => void refreshDevices()}>Refresh</button>
      <button type="button" className="iannix-flat-button" disabled={!selected} onClick={() => onDelete(selected.id)}>Delete input</button>
    </div>
    <SourceList sources={cameras} selectedId={selected?.id} empty="No camera inputs yet." onSelect={setSelectedId} />
    {selected && <SourceDetail
      source={selected}
      hasCanvasHost={canvasHostSourceIds.has(selected.id)}
      onPatch={patch => onPatch(selected.id, patch)}
      onToggleCanvas={visible => onToggleCanvas(selected.id, visible)}
      status={status || (deviceStatus ? { kind: "error", message: deviceStatus } : null)}
    >
      <label className="media-stream-panel-field">
        <span>Camera</span>
        <select value={selected.camera.deviceId} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { camera: { deviceId: event.target.value } })}>
          <option value="">Default camera</option>
          {devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
        </select>
      </label>
      <div className="media-stream-panel-note">The processed stream stays available to other objects even when it has no canvas view.</div>
    </SourceDetail>}
  </div>;
}

export function MediaInputPanel({ sources, canvasHostSourceIds, onCreate, onPatch, onToggleCanvas, onChooseFile, onDelete }) {
  const fileRef = useRef(null);
  const [url, setUrl] = useState("");
  const media = useMemo(() => sources.filter(source => source.kind === MEDIA_STREAM_KINDS.MEDIA), [sources]);
  const [selected, setSelectedId] = useSelectedSource(media);
  const status = useMediaStatus(selected?.id);

  const addUrl = () => {
    const next = url.trim();
    if (!next) return;
    const source = onCreate(MEDIA_STREAM_KINDS.MEDIA, { name: "Media URL", media: { url: next } });
    if (source?.id) setSelectedId(source.id);
    setUrl("");
  };

  return <div className="media-stream-panel">
    <div className="media-stream-panel-url-row">
      <input type="url" value={url} placeholder="Image, GIF, or video URL" onKeyDown={event => {
        stopKeyPropagation(event);
        if (event.key === "Enter") addUrl();
      }} onChange={event => setUrl(event.target.value)} />
      <button type="button" className="iannix-flat-button" onClick={addUrl}>Add URL</button>
    </div>
    <div className="media-stream-panel-toolbar">
      <button type="button" className="iannix-flat-button" onClick={() => fileRef.current?.click()}>Choose file</button>
      <button type="button" className="iannix-flat-button" disabled={!selected} onClick={() => onDelete(selected.id)}>Delete input</button>
      <input ref={fileRef} type="file" hidden accept="image/*,video/*,.gif" onChange={event => {
        const file = event.target.files?.[0];
        if (file) {
          const source = onChooseFile(file, selected?.id);
          if (source?.id) setSelectedId(source.id);
        }
        event.target.value = "";
      }} />
    </div>
    <SourceList sources={media} selectedId={selected?.id} empty="No media inputs yet." onSelect={setSelectedId} />
    {selected && <SourceDetail
      source={selected}
      hasCanvasHost={canvasHostSourceIds.has(selected.id)}
      onPatch={patch => onPatch(selected.id, patch)}
      onToggleCanvas={visible => onToggleCanvas(selected.id, visible)}
      status={status}
    >
      <label className="media-stream-panel-field">
        <span>URL</span>
        <input value={selected.media.url} placeholder={selected.media.fileName || "https://…"} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { media: { url: event.target.value, fileName: "" } })} />
      </label>
      {selected.media.mediaType === "video" && <>
        <label className="media-stream-panel-field">
          <span>Speed</span>
          <input type="number" min="0.1" max="8" step="0.1" value={selected.media.playbackRate} onKeyDown={stopKeyPropagation} onChange={event => onPatch(selected.id, { media: { playbackRate: event.target.value } })} />
        </label>
        <label className="media-stream-panel-check">
          <input type="checkbox" checked={selected.media.loop} onChange={event => onPatch(selected.id, { media: { loop: event.target.checked } })} />
          <span>Loop</span>
        </label>
        <label className="media-stream-panel-check">
          <input type="checkbox" checked={selected.media.muted} onChange={event => onPatch(selected.id, { media: { muted: event.target.checked } })} />
          <span>Muted</span>
        </label>
      </>}
      {selected.media.fileName && <div className="media-stream-panel-note">Local file: {selected.media.fileName}. Choose it again after reloading the page.</div>}
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
      <label className="media-stream-panel-field">
        <span>Overlay color</span>
        <input type="color" value={config.holistic.color} onChange={event => onPatch(selected.id, { holistic: { color: event.target.value } })} />
      </label>
      {[["showSource", "Source feed"], ["showPose", "Pose"], ["showHands", "Hands"], ["showFace", "Face points"], ["refineFaceLandmarks", "Refine face + iris"]].map(([field, label]) => <label key={field} className="media-stream-panel-check">
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
