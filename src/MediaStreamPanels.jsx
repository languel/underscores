import { useEffect, useMemo, useRef, useState } from "react";
import {
  HOLISTIC_PROCESSING_FPS_OPTIONS,
  CANVAS_CAPTURE_TARGET_FRAME_ALL,
  isGifMediaSource,
  isMediaStreamElement,
  MEDIA_STREAM_KINDS,
  normalizeMediaStreamConfig,
  objectBoundsTargetLabel,
} from "./mediaStream.js";
import { FACE_DISPLAY_GROUPS } from "./mediaLandmarkOntology.js";
import { MediaRuntimePreview } from "./MediaStreamOverlay.jsx";
import { getMediaRuntimeSource, getMediaSessionFileUrl } from "./mediaStreamRuntime.js";
import { createGifClipRecorder, createMediaRecorderClip, MEDIA_CLIP_FORMATS } from "./mediaClipRecorder.js";
import { infoProps } from "./uiInfo.js";
import NumericInput from "./NumericInput.jsx";
import TimeValueInput from "./TimeValueInput.jsx";
import { normalizeUnicursalOptions, UNICURSAL_PRESETS } from "./unicursalPath.js";

const stopKeyPropagation = event => event.stopPropagation();

const StatusLine = ({ status }) => status?.message
  ? <div className={`media-stream-panel-status is-${status.kind || "info"}`} role="status">{status.message}</div>
  : null;

const waitForMediaRuntime = (sourceId, { visual = false, timeoutMs = 4000 } = {}) => new Promise((resolve, reject) => {
  const startedAt = performance.now();
  const poll = () => {
    const runtime = getMediaRuntimeSource(sourceId);
    const element = runtime?.element;
    const hasFrame = !visual || (
      Number(element?.width) > 0
      && Number(element?.height) > 0
      && Number(element?.dataset?.frameTime) > 0
    );
    if (runtime && hasFrame) {
      resolve(runtime);
      return;
    }
    if (performance.now() - startedAt >= timeoutMs) {
      reject(new Error(visual
        ? "The selected source has no rendered frame. Check the media URL, CORS permissions, and preview status."
        : "The selected source has no active media runtime. Check that it is enabled and loaded."));
      return;
    }
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(poll);
    else window.setTimeout(poll, 50);
  };
  poll();
});

const triggerMediaDownload = (url, filename, { revoke = false } = {}) => {
  if (!url || typeof document === "undefined") return false;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "clip";
  link.rel = "noopener";
  link.style.display = "none";
  document.body?.appendChild(link);
  link.click();
  link.remove();
  if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

const OverlayToggle = ({ label, title, checked, onChange, color, colorLabel, onColorChange }) => <div className="media-stream-overlay-toggle" title={title}>
  <label className="media-stream-panel-check">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>
  {color && <input
    type="color"
    value={color}
    aria-label={colorLabel || `${label} color`}
    title={`${label} color`}
    onChange={event => onColorChange(event.target.value)}
  />}
</div>;

const useMediaStatus = selectedId => {
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    const handler = event => {
      const detail = event.detail || {};
      if (!detail.elementId) return;
      setStatuses(previous => ({ ...previous, [detail.elementId]: detail }));
    };
    window.addEventListener("underscores:media-stream-status", handler);
    return () => window.removeEventListener("underscores:media-stream-status", handler);
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

const SourceList = ({ sources, selectedId, empty, onSelect, onDelete, onDownload }) => {
  if (!sources.length) return <div className="media-stream-panel-empty">{empty}</div>;
  return <div className="media-stream-panel-list" role="list">
    {sources.map(source => {
      const canDownload = Boolean(onDownload && source.kind === MEDIA_STREAM_KINDS.MEDIA && source.media?.fileName);
      return <div
        key={source.id}
        role="listitem"
        data-media-source-id={source.id}
        className={`media-stream-panel-row ${canDownload ? "has-download" : ""} ${source.id === selectedId ? "is-selected" : ""}`}
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
          event.dataTransfer.setData("application/x-underscores-media-source", source.id);
          event.dataTransfer.setData("text/plain", source.name);
        }}
      ><SourceKindIcon kind={source.kind} /></button>
      <button type="button" className="media-stream-panel-row-select" onClick={() => onSelect(source.id)}>
        <span className="media-stream-panel-row-name">{source.name}</span>
      </button>
      {canDownload && <button
        type="button"
        className="media-stream-panel-row-download"
        aria-label={`Download ${source.name}`}
        title={getMediaSessionFileUrl(source.id) ? `Download ${source.name}` : "Choose the local file again after reloading the page"}
        disabled={!getMediaSessionFileUrl(source.id)}
        onClick={() => onDownload(source)}
      >↓</button>}
      {onDelete && <button
        type="button"
        className="media-stream-panel-row-delete"
        aria-label={`Delete ${source.name}`}
        title={`Delete ${source.name}`}
        onClick={() => onDelete(source.id)}
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.8 13h9.4l.8-13" /></svg></button>}
      </div>;
    })}
  </div>;
};

const ProcessorList = ({ elements, selectedElementIds, onSelect }) => {
  if (!elements.length) return <div className="media-stream-panel-empty">No Holistic or artistic drawing objects yet.</div>;
  return <div className="media-stream-panel-list" role="list">
    {elements.map(element => {
      const config = normalizeMediaStreamConfig(element.customData.underscoresMediaStream);
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

const UnicursalNumber = ({ label, value, min, max, step = 0.01, defaultValue, onCommit }) => <label className="media-stream-panel-field">
  <span>{label}</span>
  <NumericInput allowOverflow min={min} max={max} step={step} value={value} defaultValue={defaultValue} onKeyDown={stopKeyPropagation} onCommit={onCommit} />
</label>;

const UnicursalDetail = ({ element, config, processors, onPatch, onSnapshot }) => {
  const art = config.unicursal;
  const patchGroup = (group, patch) => onPatch(element.id, { unicursal: { [group]: patch } });
  return <div className="media-stream-panel-detail unicursal-panel-detail">
    <label className="media-stream-panel-field"><span>Name</span><input value={config.name} onKeyDown={stopKeyPropagation} onChange={event => onPatch(element.id, { name: event.target.value })} /></label>
    <label className="media-stream-panel-field"><span>Holistic source</span>
      <select value={art.sourceId} onChange={event => onPatch(element.id, { unicursal: { sourceId: event.target.value } })}>
        <option value="">Choose Holistic</option>
        {processors.map(source => <option key={source.id} value={source.id}>{normalizeMediaStreamConfig(source.customData.underscoresMediaStream).name}</option>)}
      </select>
    </label>
    <label className="media-stream-panel-field"><span>Preset</span>
      <select value={art.preset} onChange={event => onPatch(element.id, { unicursal: { sourceId: art.sourceId, ...normalizeUnicursalOptions({ preset: event.target.value }) } })}>
        {Object.entries(UNICURSAL_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
      </select>
    </label>
    <button type="button" className="iannix-flat-button" onClick={() => onSnapshot(element.id)}>Snapshot path</button>
    <details open><summary>Anatomy</summary><div className="unicursal-control-grid">
      {[['silhouette', 'Silhouette'], ['face', 'Face'], ['leftHand', 'Left hand'], ['rightHand', 'Right hand'], ['body', 'Body accents']].map(([field, label]) => <label key={field} className="media-stream-panel-check"><input type="checkbox" checked={art.anatomy[field]} onChange={event => patchGroup("anatomy", { [field]: event.target.checked })} /><span>{label}</span></label>)}
      <UnicursalNumber label="Silhouette detail weight" value={art.anatomy.silhouetteWeight} min="0" max="2" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { silhouetteWeight: value })} />
      <UnicursalNumber label="Face detail weight" value={art.anatomy.faceWeight} min="0" max="2" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { faceWeight: value })} />
      <UnicursalNumber label="Hand detail weight" value={art.anatomy.handWeight} min="0" max="2" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { handWeight: value })} />
      <UnicursalNumber label="Body detail weight" value={art.anatomy.bodyWeight} min="0" max="2" step="0.05" defaultValue={0.65} onCommit={value => patchGroup("anatomy", { bodyWeight: value })} />
      <UnicursalNumber label="Silhouette exaggeration" value={art.anatomy.silhouetteExaggeration} min="0" max="3" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { silhouetteExaggeration: value })} />
      <UnicursalNumber label="Face exaggeration" value={art.anatomy.faceExaggeration} min="0" max="3" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { faceExaggeration: value })} />
      <UnicursalNumber label="Hand exaggeration" value={art.anatomy.handExaggeration} min="0" max="3" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { handExaggeration: value })} />
      <UnicursalNumber label="Body exaggeration" value={art.anatomy.bodyExaggeration} min="0" max="3" step="0.05" defaultValue={1} onCommit={value => patchGroup("anatomy", { bodyExaggeration: value })} />
    </div></details>
    <details><summary>Silhouette</summary><div className="unicursal-control-grid">
      <label className="media-stream-panel-field"><span>Mode</span><select value={art.silhouette.mode} onChange={event => patchGroup("silhouette", { mode: event.target.value })}><option value="hybrid">Hybrid</option><option value="segmentation">Segmentation</option><option value="envelope">Landmark envelope</option></select></label>
      <UnicursalNumber label="Threshold" value={art.silhouette.threshold} min="0.05" max="0.95" defaultValue={0.5} onCommit={value => patchGroup("silhouette", { threshold: value })} />
      <UnicursalNumber label="Simplification" value={art.silhouette.simplify} min="0" max="1" defaultValue={0.16} onCommit={value => patchGroup("silhouette", { simplify: value })} />
      <UnicursalNumber label="Detail" value={art.silhouette.detail} min="0" max="1" defaultValue={0.55} onCommit={value => patchGroup("silhouette", { detail: value })} />
    </div></details>
    <details><summary>Geometry</summary><div className="unicursal-control-grid">
      <UnicursalNumber label="Point budget" value={art.geometry.pointBudget} min="96" max="1024" step="16" defaultValue={384} onCommit={value => patchGroup("geometry", { pointBudget: value })} />
      <UnicursalNumber label="Max curve segments" value={art.geometry.maxSegments} min="1" max="12" step="1" defaultValue={1} onCommit={value => patchGroup("geometry", { maxSegments: value })} />
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.geometry.smoothCurves} onChange={event => patchGroup("geometry", { smoothCurves: event.target.checked })} /><span>Smooth curves</span></label>
      <label className="media-stream-panel-field"><span>Curve interpolation</span><select value={art.geometry.curveMode} onChange={event => patchGroup("geometry", { curveMode: event.target.value })}><option value="catmull-rom">Catmull–Rom</option><option value="quadratic">Quadratic</option><option value="polyline">Polyline</option></select></label>
      {[["abstraction", "Abstraction", 0.18], ["smoothing", "Smoothing", 0.72], ["tension", "Tension", 0.62], ["exaggeration", "Exaggeration", 0.12], ["bridgeCurvature", "Bridge curve", 0.45]].map(([field, label, fallback]) => <UnicursalNumber key={field} label={label} value={art.geometry[field]} min="0" max="1" defaultValue={fallback} onCommit={value => patchGroup("geometry", { [field]: value })} />)}
      <UnicursalNumber label="Return offset" value={art.geometry.returnOffset} min="0" max="0.1" step="0.002" defaultValue={0.012} onCommit={value => patchGroup("geometry", { returnOffset: value })} />
    </div></details>
    <details><summary>Ornament</summary><div className="unicursal-control-grid">
      <UnicursalNumber label="Seed" value={art.ornament.seed} min="0" max="2147483647" step="1" defaultValue={1701} onCommit={value => patchGroup("ornament", { seed: value })} />
      <UnicursalNumber label="Jitter" value={art.ornament.jitter} min="0" max="0.2" step="0.005" defaultValue={0} onCommit={value => patchGroup("ornament", { jitter: value })} />
      <UnicursalNumber label="Flourish" value={art.ornament.flourish} min="0" max="1" defaultValue={0.08} onCommit={value => patchGroup("ornament", { flourish: value })} />
      <UnicursalNumber label="Retracing" value={art.ornament.retrace} min="0" max="1" defaultValue={0.02} onCommit={value => patchGroup("ornament", { retrace: value })} />
    </div></details>
    <details open><summary>Ink</summary><div className="unicursal-control-grid">
      <label className="media-stream-panel-field"><span>Background</span><select value={art.background.mode} onChange={event => patchGroup("background", { mode: event.target.value })}><option value="transparent">Transparent</option><option value="solid">Solid</option></select></label>
      {art.background.mode === "solid" && <label className="media-stream-panel-field"><span>Background color</span><input type="color" value={art.background.color} onChange={event => patchGroup("background", { color: event.target.value })} /></label>}
      <label className="media-stream-panel-field"><span>Color</span><input type="color" value={art.ink.color} onChange={event => patchGroup("ink", { color: event.target.value })} /></label>
      <UnicursalNumber label="Opacity %" value={art.ink.opacity} min="0" max="100" step="1" defaultValue={100} onCommit={value => patchGroup("ink", { opacity: value })} />
      <UnicursalNumber label="Base width" value={art.ink.width} min="0.5" max="40" step="0.5" defaultValue={3} onCommit={value => patchGroup("ink", { width: value })} />
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.ink.variableWidth} onChange={event => patchGroup("ink", { variableWidth: event.target.checked })} /><span>Variable stroke weight</span></label>
      <UnicursalNumber label="Width variation" value={art.ink.widthVariation} min="0" max="1" defaultValue={0.42} onCommit={value => patchGroup("ink", { widthVariation: value })} />
      <UnicursalNumber label="Feature weight influence" value={art.ink.featureWidthInfluence} min="0" max="1" defaultValue={0.35} onCommit={value => patchGroup("ink", { featureWidthInfluence: value })} />
      <UnicursalNumber label="Taper" value={art.ink.taper} min="0" max="1" defaultValue={0.58} onCommit={value => patchGroup("ink", { taper: value })} />
      <UnicursalNumber label="Feather" value={art.ink.feather} min="0" max="1" defaultValue={0.08} onCommit={value => patchGroup("ink", { feather: value })} />
    </div></details>
    <details><summary>Landmark overlay</summary><div className="unicursal-control-grid">
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.landmarks.visible} onChange={event => patchGroup("landmarks", { visible: event.target.checked })} /><span>Show raw landmarks</span></label>
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.landmarks.points} onChange={event => patchGroup("landmarks", { points: event.target.checked })} /><span>Points</span></label>
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.landmarks.connections} onChange={event => patchGroup("landmarks", { connections: event.target.checked })} /><span>Semantic curves</span></label>
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.landmarks.rawOutline} onChange={event => patchGroup("landmarks", { rawOutline: event.target.checked })} /><span>Raw silhouette outline</span></label>
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.landmarks.matchInkColor} onChange={event => patchGroup("landmarks", { matchInkColor: event.target.checked })} /><span>Match ink color</span></label>
      <UnicursalNumber label="Opacity" value={art.landmarks.opacity} min="0" max="1" defaultValue={0.72} onCommit={value => patchGroup("landmarks", { opacity: value })} />
      <UnicursalNumber label="Point size" value={art.landmarks.pointSize} min="0.5" max="12" step="0.5" defaultValue={1.8} onCommit={value => patchGroup("landmarks", { pointSize: value })} />
      <UnicursalNumber label="Line width" value={art.landmarks.lineWidth} min="0.5" max="8" step="0.5" defaultValue={1} onCommit={value => patchGroup("landmarks", { lineWidth: value })} />
    </div></details>
    <details><summary>Motion</summary><div className="unicursal-control-grid">
      <UnicursalNumber label="Response ms" value={art.motion.responseMs} min="0" max="2000" step="10" defaultValue={140} onCommit={value => patchGroup("motion", { responseMs: value })} />
      <UnicursalNumber label="Missing grace ms" value={art.motion.missingGraceMs} min="0" max="5000" step="20" defaultValue={260} onCommit={value => patchGroup("motion", { missingGraceMs: value })} />
      <UnicursalNumber label="Inertia" value={art.motion.inertia} min="0" max="1" step="0.01" defaultValue={0.28} onCommit={value => patchGroup("motion", { inertia: value })} />
      <UnicursalNumber label="Confidence weight" value={art.motion.confidenceWeight} min="0" max="1" step="0.01" defaultValue={0.72} onCommit={value => patchGroup("motion", { confidenceWeight: value })} />
      <UnicursalNumber label="Feature stickiness" value={art.motion.stickiness} min="0" max="1" step="0.01" defaultValue={0.35} onCommit={value => patchGroup("motion", { stickiness: value })} />
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.motion.echoes} onChange={event => patchGroup("motion", { echoes: event.target.checked })} /><span>Echoes</span></label>
      <UnicursalNumber label="Echo count" value={art.motion.echoCount} min="0" max="8" step="1" defaultValue={2} onCommit={value => patchGroup("motion", { echoCount: value })} />
      <UnicursalNumber label="Echo delay ms" value={art.motion.echoDelayMs} min="16" max="2000" step="10" defaultValue={180} onCommit={value => patchGroup("motion", { echoDelayMs: value })} />
      <UnicursalNumber label="Echo opacity" value={art.motion.echoOpacity} min="0" max="1" defaultValue={0.22} onCommit={value => patchGroup("motion", { echoOpacity: value })} />
      <UnicursalNumber label="Echo decay" value={art.motion.echoDecay} min="0" max="1" defaultValue={0.55} onCommit={value => patchGroup("motion", { echoDecay: value })} />
      <label className="media-stream-panel-check"><input type="checkbox" checked={art.includeEchoesInSnapshot} onChange={event => onPatch(element.id, { unicursal: { includeEchoesInSnapshot: event.target.checked } })} /><span>Snapshot echoes</span></label>
    </div></details>
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
    <NumericInput
      min={min}
      max={max}
      step="0.01"
      value={crop[field]}
      defaultValue={field === "width" || field === "height" ? 1 : 0}
      onKeyDown={stopKeyPropagation}
      onCommit={value => onPatch({ crop: { [field]: value } })}
    />
  </label>)}
</div>;

const isAnimatedSource = source => source.kind === MEDIA_STREAM_KINDS.CAMERA
  || (source.kind === MEDIA_STREAM_KINDS.MEDIA && (
    source.media.mediaType === "video"
    || source.media.mediaType === "audio"
    || isGifMediaSource(source)
  ));

const SourceTransportControls = ({ source, onPatch }) => {
  const isCamera = source.kind === MEDIA_STREAM_KINDS.CAMERA;
  const canSetRate = !isCamera && source.media.mediaType !== "audio" && isAnimatedSource(source);
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
      <NumericInput min="-8" max="8" step="0.1" value={source.media.playbackRate} defaultValue={1} onKeyDown={stopKeyPropagation} onCommit={playbackRate => onPatch({ media: { playbackRate } })} />
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

const MediaClipRecorder = ({ source, onCreate, onPatch, onPrepareCapture, timeContext, transportLoopEnabled = false, transportLoopStart = 0, transportLoopEnd = 0 }) => {
  const [format, setFormat] = useState(MEDIA_CLIP_FORMATS.GIF);
  const [durationValue, setDurationValue] = useState("5 s");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [durationMode, setDurationMode] = useState("duration");
  const [gifBackground, setGifBackground] = useState("theme");
  const [recording, setRecording] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [lastClip, setLastClip] = useState(null);
  const recorderRef = useRef(null);
  const isCanvas = source?.kind === MEDIA_STREAM_KINDS.CANVAS;
  const isAudio = source?.media?.mediaType === "audio";
  const canRecordAudio = !isCanvas && (isAudio || source?.media?.mediaType === "video");
  const canRecordAlpha = !isAudio;
  const loopDurationSeconds = Math.max(0, Number(transportLoopEnd) - Number(transportLoopStart));
  const hasUsableLoop = transportLoopEnabled && loopDurationSeconds > 0;
  const status = statuses[source?.id] || null;
  const options = isAudio
    ? [{ value: MEDIA_CLIP_FORMATS.AUDIO, label: "Audio" }]
    : [
        { value: MEDIA_CLIP_FORMATS.GIF, label: "GIF" },
        { value: MEDIA_CLIP_FORMATS.MP4, label: "MP4" },
        ...(canRecordAlpha ? [{ value: MEDIA_CLIP_FORMATS.ALPHA, label: "WebM · alpha" }] : []),
        ...(canRecordAudio ? [{ value: MEDIA_CLIP_FORMATS.AUDIO, label: "Audio" }] : []),
      ];

  useEffect(() => {
    setFormat(isAudio ? MEDIA_CLIP_FORMATS.AUDIO : MEDIA_CLIP_FORMATS.GIF);
    setDurationValue("5 s");
    setDurationSeconds(5);
    setDurationMode("duration");
    setGifBackground("theme");
  }, [isAudio, source?.id]);

  useEffect(() => () => recorderRef.current?.stop(), []);

  const stop = () => recorderRef.current?.stop();

  const downloadClip = () => {
    if (!lastClip?.blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(lastClip.blob);
    triggerMediaDownload(url, lastClip.filename, { revoke: true });
  };

  const record = async () => {
    if (recording || !source) return;
    const effectiveDurationSeconds = durationMode === "loop" ? loopDurationSeconds : durationSeconds;
    if (durationMode === "loop" && !hasUsableLoop) {
      setStatuses(previous => ({ ...previous, [source.id]: { kind: "error", message: "Enable a transport loop with a positive range before recording the current loop." } }));
      return;
    }
    const durationMs = Math.max(durationMode === "loop" ? 100 : 1000, Math.min(30000, (Number(effectiveDurationSeconds) || 5) * 1000));
    const isVisualCapture = format !== MEDIA_CLIP_FORMATS.AUDIO;
    const changesCanvasBackground = source.kind === MEDIA_STREAM_KINDS.CANVAS
      && (format === MEDIA_CLIP_FORMATS.GIF || format === MEDIA_CLIP_FORMATS.ALPHA);
    // Canvas sources normally keep a single published frame until they are
    // connected to a live scene object. A recording needs a fresh frame on
    // every tick; temporarily enabling the source's live mode gives both
    // MediaRecorder and the GIF sampler a real video sequence to consume.
    const changesCanvasLive = source.kind === MEDIA_STREAM_KINDS.CANVAS
      && isVisualCapture
      && source.canvas?.live !== true;
    const changesCanvasCapture = changesCanvasBackground || changesCanvasLive;
    const captureBackground = format === MEDIA_CLIP_FORMATS.ALPHA ? "transparent" : gifBackground;
    const originalCanvasBackground = source.canvas?.background || "theme";
    const originalCanvasLive = source.canvas?.live === true;
    setRecording(true);
    setStatuses(previous => ({ ...previous, [source.id]: { kind: "info", message: `Recording ${format === MEDIA_CLIP_FORMATS.ALPHA ? "WebM alpha" : format.toUpperCase()}…` } }));
    let session = null;
    let restoreTransport = null;
    try {
      if (durationMode === "loop" && onPrepareCapture) {
        restoreTransport = await onPrepareCapture({ start: Number(transportLoopStart) || 0, durationMs });
      }
      if (changesCanvasCapture) {
        const canvasPatch = {};
        if (changesCanvasBackground) canvasPatch.background = captureBackground;
        if (changesCanvasLive) canvasPatch.live = true;
        onPatch?.({ canvas: canvasPatch });
        // CanvasMediaSource restarts its capture effect when these settings
        // change. Give the first frame and live capture timer time to publish
        // before GIF sampling or MediaRecorder starts.
        await new Promise(resolve => {
          if (typeof requestAnimationFrame !== "function") {
            setTimeout(resolve, 50);
            return;
          }
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      }
      const runtime = await waitForMediaRuntime(source.id, { visual: format !== MEDIA_CLIP_FORMATS.AUDIO });
      session = format === MEDIA_CLIP_FORMATS.GIF
        ? createGifClipRecorder({ canvas: runtime.element, durationMs, fps: source.output?.fps || 15, transparent: captureBackground === "transparent" })
        : createMediaRecorderClip({ stream: runtime.stream?.(), format, durationMs });
      recorderRef.current = session;
      const result = await session.promise;
      const stem = String(source.name || "clip").replace(/\.[^./]+$/, "") || "clip";
      const filename = `${stem}-clip-${Date.now()}.${result.extension}`;
      const file = typeof File === "function"
        ? new File([result.blob], filename, { type: result.mimeType })
        : result.blob;
      const mediaType = result.format === MEDIA_CLIP_FORMATS.AUDIO
        ? "audio"
        : result.extension === "gif" ? "image" : "video";
      const created = onCreate(MEDIA_STREAM_KINDS.MEDIA, {
        name: filename,
        media: { fileName: filename, mediaType, muted: mediaType !== "audio" },
      }, file);
      setLastClip({ blob: result.blob, filename, mimeType: result.mimeType, sourceId: created?.id || source.id });
      const resultStatus = {
        kind: "success",
        message: result.fallback
          ? `Saved ${filename} as a new source (the requested codec is unavailable; browser fallback is WebM).`
          : `Saved ${filename} as a new source.`,
      };
      setStatuses(previous => ({ ...previous, [created?.id || source.id]: resultStatus }));
    } catch (error) {
      setStatuses(previous => ({ ...previous, [source.id]: { kind: "error", message: error?.message || "Media recording failed." } }));
    } finally {
      recorderRef.current = null;
      setRecording(false);
      if (changesCanvasCapture) {
        const canvasPatch = {};
        if (changesCanvasBackground && originalCanvasBackground !== captureBackground) {
          canvasPatch.background = originalCanvasBackground;
        }
        if (changesCanvasLive && !originalCanvasLive) canvasPatch.live = false;
        if (Object.keys(canvasPatch).length) onPatch?.({ canvas: canvasPatch });
      }
      restoreTransport?.();
    }
  };

  if (!source) return null;
  return <div className="media-stream-recorder" role="group" aria-label="Media clip recorder">
    <div className="media-stream-recorder-title">Record clip</div>
    <div className="media-stream-recorder-controls">
      <label className="media-stream-panel-field">
        <span>Format</span>
        <select aria-label="Record format" value={format} disabled={recording} onChange={event => setFormat(event.target.value)}>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {source.kind === MEDIA_STREAM_KINDS.CANVAS && format === MEDIA_CLIP_FORMATS.GIF && <label className="media-stream-panel-field">
        <span>Capture background</span>
        <select aria-label="GIF background" value={gifBackground} disabled={recording} onChange={event => setGifBackground(event.target.value)}>
          <option value="theme">Theme</option>
          <option value="transparent">Transparent</option>
        </select>
      </label>}
      {source.kind === MEDIA_STREAM_KINDS.CANVAS && format === MEDIA_CLIP_FORMATS.ALPHA && <label className="media-stream-panel-field">
        <span>Capture background</span>
        <input aria-label="Capture background" value="Transparent" readOnly />
      </label>}
      <label className="media-stream-panel-field">
        <span>Range</span>
        <select aria-label="Capture range" value={durationMode} disabled={recording} onChange={event => setDurationMode(event.target.value)}>
          <option value="duration">Duration</option>
          <option value="loop" disabled={!hasUsableLoop}>Current loop</option>
        </select>
      </label>
      {durationMode === "duration" && <label className="media-stream-panel-field">
        <span>Duration</span>
        <TimeValueInput aria-label="Capture duration" value={durationValue} context={timeContext} defaultValue="5 s" minSeconds={1} disabled={recording} onKeyDown={stopKeyPropagation} onChange={(next, seconds) => { setDurationValue(next); setDurationSeconds(Math.min(30, Math.max(1, seconds))); }} />
      </label>}
      {durationMode === "loop" && <div className="media-stream-panel-note media-stream-recorder-range-note">{hasUsableLoop ? `Current loop · ${loopDurationSeconds.toFixed(2)} s` : "No active loop"}</div>}
    </div>
    <div className="media-stream-recorder-actions">
      <button type="button" className="iannix-flat-button" disabled={recording ? false : !source.enabled} onClick={recording ? stop : record}>
        {recording ? "Stop recording" : "Record clip"}
      </button>
      <button type="button" className="iannix-flat-button" disabled={!lastClip || lastClip.sourceId !== source.id} onClick={downloadClip}>Download clip</button>
    </div>
    {status && <StatusLine status={status} />}
    <div className="media-stream-panel-note">The finished clip is added to Sources. MP4 includes source audio when available; WebM alpha preserves transparent video.</div>
  </div>;
};

const useSelectedSource = (sources, controlledId, onControlledChange) => {
  const [localSelectedId, setLocalSelectedId] = useState("");
  const isControlled = controlledId !== undefined;
  const selectedId = isControlled ? (controlledId || "") : localSelectedId;
  const setSelectedId = id => {
    setLocalSelectedId(id);
    onControlledChange?.(id);
  };
  useEffect(() => {
    if (!sources.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (selectedId && !sources.some(source => source.id === selectedId)) setSelectedId("");
    else if (!isControlled && !selectedId) setSelectedId(sources[0].id);
  }, [isControlled, selectedId, sources]);
  return [sources.find(source => source.id === selectedId) || null, setSelectedId];
};

export function MediaInputPanel({ sources, canvasTargets = [], selectedCanvasTarget, activeSourceId, onActiveSourceChange, onCreate, onPatch, onCreatePreview, onAssignPreview, onPickCanvasTarget, onChooseFile, onDelete, onPrepareCapture, timeContext, transportLoopEnabled, transportLoopStart, transportLoopEnd }) {
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
  const addCanvasSource = () => {
    const source = onCreate(MEDIA_STREAM_KINDS.CANVAS, { name: "Canvas capture" });
    if (source?.id) setSelectedId(source.id);
  };
  const downloadSource = source => {
    const url = getMediaSessionFileUrl(source?.id);
    triggerMediaDownload(url, source.media?.fileName || source.name || "clip");
  };

  return <div className="media-stream-panel">
    <div className="media-stream-panel-source-header">
      <span>Sources</span>
      <span className="media-stream-panel-source-actions">
        <button type="button" className="iannix-flat-button media-stream-panel-add-source" onClick={addSource} aria-label="Add media source" title="Add media source">+</button>
        <button type="button" className="iannix-flat-button media-stream-panel-add-source" onClick={addCanvasSource} aria-label="Add canvas source" title="Add canvas source">⌗</button>
      </span>
    </div>
    <input ref={fileRef} type="file" hidden accept="image/*,video/*,audio/*,.gif" onChange={event => {
      const file = event.target.files?.[0];
      if (file) onChooseFile(file, selected?.id);
      event.target.value = "";
    }} />
    <SourceList sources={sources} selectedId={selected?.id} empty="No image inputs yet." onSelect={setSelectedId} onDelete={onDelete} onDownload={downloadSource} />
    {!selected && <div className="media-stream-panel-note">Catalog sources stay dormant until selected or connected to an enabled scene object. Press Escape to clear selection.</div>}
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
                    <option value={CANVAS_CAPTURE_TARGET_FRAME_ALL}>Frame all</option>
                    {canvasTargets.map(element => <option key={element.id} value={element.id}>{objectBoundsTargetLabel(element)} · {element.id.slice(0, 6)}</option>)}
                  </select>
                  <button type="button" className="iannix-flat-button media-stream-panel-icon-button" onClick={() => onPickCanvasTarget?.(selected.id)} aria-label="Pick canvas object" title="Pick a frame or rectangle (Option-I)">⌖</button>
                </div>
              </label>
              <label className="media-stream-panel-check" {...infoProps("Live capture", "Continuously capture the target at the configured stream FPS. Turn this off for an event-driven static capture whenever the target changes.")}>
                <input type="checkbox" checked={selected.canvas.live} onChange={event => onPatch(selected.id, { canvas: { live: event.target.checked } })} />
                <span>Live</span>
              </label>
              <div className="media-stream-panel-note">Choose a frame or rectangle, or capture the full scene with <strong>Frame all</strong>. Captures follow the board theme; static capture reads the area when needed. Enable Live only for continuous action.</div>
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
              {(selected.media.mediaType === "video" || selected.media.mediaType === "audio") ? <label className="media-stream-panel-check">
                <input type="checkbox" checked={selected.media.muted} onChange={event => onPatch(selected.id, { media: { muted: event.target.checked } })} />
                <span>Muted</span>
              </label> : null}
            </>}
            {selected.media.fileName && <div className="media-stream-panel-note">Local file: {selected.media.fileName}. Choose it again after reloading the page.</div>}
          </>}
    </SourceDetail>}
    <MediaClipRecorder source={selected} onCreate={onCreate} onPatch={patch => onPatch(selected.id, patch)} onPrepareCapture={onPrepareCapture} timeContext={timeContext} transportLoopEnabled={transportLoopEnabled} transportLoopStart={transportLoopStart} transportLoopEnd={transportLoopEnd} />
  </div>;
}

export function HolisticPanel({ elements, sources, selectedElementIds, onCreate, onPatch, onSelect, onSnapshot, onSnapshotPng, onSnapshotArt }) {
  const processors = useMemo(() => elements.filter(element => (
    isMediaStreamElement(element)
    && normalizeMediaStreamConfig(element.customData.underscoresMediaStream).kind === MEDIA_STREAM_KINDS.HOLISTIC
  )), [elements]);
  const artistic = useMemo(() => elements.filter(element => (
    isMediaStreamElement(element)
    && normalizeMediaStreamConfig(element.customData.underscoresMediaStream).kind === MEDIA_STREAM_KINDS.UNICURSAL
  )), [elements]);
  const objects = [...processors, ...artistic];
  const selected = objects.find(element => selectedElementIds?.[element.id]) || objects[0] || null;
  const config = selected ? normalizeMediaStreamConfig(selected.customData.underscoresMediaStream) : null;
  const status = useMediaStatus(selected?.id);
  const defaultSourceId = sources[0]?.id || "";
  const faceGroupEntries = Object.entries(FACE_DISPLAY_GROUPS);
  const allFaceGroupsEnabled = config && config.holistic.showFace && faceGroupEntries.every(([id]) => config.holistic.faceGroups[id]);
  const selectedHolistic = config?.kind === MEDIA_STREAM_KINDS.HOLISTIC;
  const defaultProcessorId = processors[0]?.id || "";

  return <div className="media-stream-panel">
    <div className="media-stream-panel-toolbar">
      <button type="button" className="iannix-flat-button" disabled={!defaultSourceId} onClick={() => onCreate(MEDIA_STREAM_KINDS.HOLISTIC, { holistic: { sourceId: defaultSourceId } })}>Add Holistic object</button>
      <button type="button" className="iannix-flat-button" disabled={!defaultProcessorId} onClick={() => onCreate(MEDIA_STREAM_KINDS.UNICURSAL, { unicursal: { sourceId: defaultProcessorId } })}>Add Unicursal</button>
      {selectedHolistic && <><button type="button" className="iannix-flat-button" onClick={() => onSnapshot(selected.id)}>Snapshot landmarks</button><button type="button" className="iannix-flat-button" onClick={() => onSnapshotPng(selected.id)} title="Capture the current Holistic view as a static PNG at the same canvas transform">Snapshot PNG</button></>}
    </div>
    {!sources.length && <div className="media-stream-panel-note">Create a camera or media input first.</div>}
    <ProcessorList elements={objects} selectedElementIds={selectedElementIds} onSelect={onSelect} />
    {config?.kind === MEDIA_STREAM_KINDS.UNICURSAL && <UnicursalDetail element={selected} config={config} processors={processors} onPatch={onPatch} onSnapshot={onSnapshotArt} />}
    {selectedHolistic && <div className="media-stream-panel-detail">
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
      <div className="media-stream-overlay-groups" role="group" aria-label="Holistic overlay groups">
        <OverlayToggle
          label="Source feed"
          checked={config.holistic.showSource}
          onChange={checked => onPatch(selected.id, { holistic: { showSource: checked } })}
        />
        <div className="media-stream-overlay-subgroup" role="group" aria-label="Pose overlay groups">
          <div className="media-stream-overlay-subgroup-title">Pose</div>
          {[['body', 'Pose · body', 'poseBody'], ['head', 'Pose · head', 'poseHead'], ['leftHand', 'Pose · L hand', 'poseLeftHand'], ['rightHand', 'Pose · R hand', 'poseRightHand']].map(([group, label, color]) => <OverlayToggle
            key={group}
            label={label}
            checked={config.holistic.poseGroups[group]}
            color={config.holistic.colors[color]}
            onChange={checked => onPatch(selected.id, { holistic: { showPose: true, poseGroups: { [group]: checked } } })}
            onColorChange={value => onPatch(selected.id, { holistic: { colors: { [color]: value } } })}
          />)}
        </div>
        <div className="media-stream-overlay-subgroup" role="group" aria-label="Hand overlay groups">
          <div className="media-stream-overlay-subgroup-title">Hands</div>
          <OverlayToggle
            label="L hand"
            checked={config.holistic.showLeftHand}
            color={config.holistic.colors.leftHand}
            onChange={checked => onPatch(selected.id, { holistic: { showHands: true, showLeftHand: checked } })}
            onColorChange={value => onPatch(selected.id, { holistic: { colors: { leftHand: value } } })}
          />
          <OverlayToggle
            label="R hand"
            checked={config.holistic.showRightHand}
            color={config.holistic.colors.rightHand}
            onChange={checked => onPatch(selected.id, { holistic: { showHands: true, showRightHand: checked } })}
            onColorChange={value => onPatch(selected.id, { holistic: { colors: { rightHand: value } } })}
          />
          <OverlayToggle
            label="Swap L / R"
            title="Swap the semantic left/right hand labels without changing the image."
            checked={config.holistic.swapHandedness}
            onChange={checked => onPatch(selected.id, { holistic: { swapHandedness: checked } })}
          />
        </div>
      </div>
      <OverlayToggle
        label="Refine face + iris"
        checked={config.holistic.refineFaceLandmarks}
        onChange={checked => onPatch(selected.id, { holistic: { refineFaceLandmarks: checked } })}
      />
      <details className="media-stream-face-filter" open>
        <summary>Face points <input type="color" value={config.holistic.colors.face} aria-label="Face points color" title="Face points color" onClick={event => event.stopPropagation()} onChange={event => onPatch(selected.id, { holistic: { colors: { face: event.target.value } } })} /></summary>
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
      <div className="media-stream-panel-style-row">
        <label className="media-stream-panel-field">
          <span>Point size</span>
          <NumericInput min="1" max="20" step="0.5" value={config.holistic.pointSize} defaultValue={3} onKeyDown={stopKeyPropagation} onCommit={pointSize => onPatch(selected.id, { holistic: { pointSize } })} />
        </label>
        <label className="media-stream-panel-field">
          <span>Line thickness</span>
          <NumericInput min="0.5" max="12" step="0.5" value={config.holistic.lineThickness} defaultValue={2} onKeyDown={stopKeyPropagation} onCommit={lineThickness => onPatch(selected.id, { holistic: { lineThickness } })} />
        </label>
      </div>
      <label className="media-stream-panel-field">
        <span>Model</span>
        <select value={config.holistic.modelComplexity} onChange={event => onPatch(selected.id, { holistic: { modelComplexity: Number(event.target.value) } })}>
          <option value="0">Lite</option>
          <option value="1">Full</option>
          <option value="2">Heavy</option>
        </select>
      </label>
      <label className="media-stream-panel-field" {...infoProps("Processing FPS", "Limit MediaPipe inference and landmark publication independently from the input stream. Lower rates reduce CPU use while keeping the latest pose visible.")}>
        <span>Processing FPS</span>
        <select value={config.holistic.processingFps} onChange={event => onPatch(selected.id, { holistic: { processingFps: Number(event.target.value) } })}>
          {HOLISTIC_PROCESSING_FPS_OPTIONS.map(fps => <option key={fps} value={fps}>{fps}</option>)}
        </select>
      </label>
      <OverlayToggle
        label="Performance mode"
        title="Protect canvas cadence by capping MediaPipe inference at 8 FPS and visually interpolating completed landmarks at up to 30 FPS. Turn this off to use the selected Processing FPS directly."
        checked={config.holistic.performanceMode}
        onChange={checked => onPatch(selected.id, { holistic: { performanceMode: checked } })}
      />
      <div className="media-stream-panel-note">MediaPipe consumes the source&apos;s processed output. The source feed toggle affects only this Holistic view.</div>
      <StatusLine status={status} />
    </div>}
  </div>;
}
