import { useEffect, useMemo, useRef, useState } from "react";
import {
  listMediaFeatureDefinitions,
  resolveMediaFeatureDefinition,
} from "./mediaLandmarkOntology.js";
import {
  createMediaBinding,
  isMediaStreamElement,
  MEDIA_BINDING_TYPES,
  MEDIA_STREAM_KINDS,
  normalizeMediaStreamConfig,
} from "./mediaStream.js";
import {
  getMediaSemanticFrame,
  subscribeMediaSemanticFrame,
} from "./mediaStreamRuntime.js";
import MediaVisualFeaturePicker from "./MediaVisualFeaturePicker.jsx";
import NumericInput from "./NumericInput.jsx";
import { getScoreData } from "./iannixEngine.js";

const stopKeyPropagation = event => event.stopPropagation();

const processorElements = elements => (elements || []).filter(element => (
  isMediaStreamElement(element)
  && normalizeMediaStreamConfig(element.customData.draweratorMediaStream).kind === MEDIA_STREAM_KINDS.HOLISTIC
));

const objectLabel = element => (
  getScoreData(element)?.label
  || element.customData?.label
  || `${element.type} ${String(element.id).slice(0, 6)}`
);

const formatPoint = (point, digits) => (
  point
    ? [point.x, point.y, point.z]
      .filter(value => value !== undefined && value !== null)
      .map(value => Number(value).toFixed(digits))
      .join(", ")
    : "—"
);

const FeatureValue = ({ feature, allSpaces = false }) => {
  if (!feature) return <span className="media-mapping-value is-missing">Unknown feature</span>;
  if (!feature.available) return <span className="media-mapping-value is-missing">Unavailable</span>;
  if (feature.kind === "gesture") {
    return <span className={`media-mapping-value ${feature.active ? "is-active" : ""}`}>
      {feature.active ? "active" : "open"} · {Number(feature.value).toFixed(3)}
    </span>;
  }
  if (allSpaces) {
    return <span className="media-mapping-value media-mapping-space-values">
      <span>normalized {formatPoint(feature.normalized, 3)}</span>
      <span>local {formatPoint(feature.local, 1)}</span>
      <span>scene {formatPoint(feature.scene, 1)}</span>
      {feature.confidence !== null && feature.confidence !== undefined
        ? <span>confidence {(feature.confidence * 100).toFixed(0)}%</span>
        : null}
    </span>;
  }
  return <span className="media-mapping-value">
    scene {formatPoint(feature.scene, 1)}
    {feature.confidence !== null && feature.confidence !== undefined ? ` · ${(feature.confidence * 100).toFixed(0)}%` : ""}
  </span>;
};

const FeatureBrowser = ({ query, onQuery, selectedIds, focusFeatureId, onSelect, frame }) => {
  const featureRefs = useRef(new Map());
  const definitions = useMemo(() => {
    const listed = listMediaFeatureDefinitions(query).slice(0, 180);
    const focused = resolveMediaFeatureDefinition(focusFeatureId);
    return focused && !listed.some(definition => definition.id === focused.id) ? [focused, ...listed] : listed;
  }, [focusFeatureId, query]);
  const groups = useMemo(() => {
    const result = new Map();
    definitions.forEach(definition => {
      const groupId = definition.id.split(".")[0];
      const group = result.get(groupId) || [];
      group.push(definition);
      result.set(groupId, group);
    });
    return [...result.entries()];
  }, [definitions]);
  useEffect(() => {
    if (!focusFeatureId) return;
    featureRefs.current.get(focusFeatureId)?.scrollIntoView({ block: "nearest" });
  }, [focusFeatureId, definitions]);
  return <section className="media-mapping-section">
    <h3>Features</h3>
    <input
      className="media-mapping-search"
      value={query}
      placeholder="Search pose, hand, face.468…"
      onKeyDown={stopKeyPropagation}
      onChange={event => onQuery(event.target.value)}
    />
    <div className="media-mapping-feature-list" role="listbox" aria-label="MediaPipe semantic features">
      {groups.map(([groupId, group]) => <div className="media-mapping-feature-group" role="group" aria-label={groupId.replaceAll("_", " ")} key={groupId}>
        <div className="media-mapping-feature-group-label">{groupId.replaceAll("_", " ")}</div>
        {group.map(definition => {
          const snapshot = frame?.feature?.(definition.id);
          return <button
            key={definition.id}
            type="button"
            role="option"
            aria-selected={selectedIds.includes(definition.id)}
            className={`media-mapping-feature ${selectedIds.includes(definition.id) ? "is-selected" : ""}`}
            ref={node => {
              if (node) featureRefs.current.set(definition.id, node);
              else featureRefs.current.delete(definition.id);
            }}
            onClick={event => onSelect(definition.id, event, definitions)}
          >
            <span>{definition.id}</span>
            <small>{snapshot?.available ? "live" : definition.kind}</small>
          </button>;
        })}
      </div>)}
      {!definitions.length && <div className="media-stream-panel-empty">No matching feature.</div>}
    </div>
  </section>;
};

const BindingEditor = ({
  binding,
  elements,
  frame,
  onUpdate,
  onDuplicate,
  onDelete,
  onInspect,
}) => {
  const targetMissing = binding.type === MEDIA_BINDING_TYPES.DRIVE_POSITION
    && !elements.some(element => element.id === binding.targetElementId && !element.isDeleted);
  const featureMissing = !resolveMediaFeatureDefinition(binding.featureId);
  const targetOptions = elements.filter(element => !element.isDeleted && !isMediaStreamElement(element));
  return <details className="media-mapping-binding" open>
    <summary>
      <span>{binding.name}</span>
      <small>{binding.type}</small>
    </summary>
    <div className="media-mapping-binding-body">
      <label className="media-stream-panel-check">
        <input type="checkbox" checked={binding.enabled} onChange={event => onUpdate({ enabled: event.target.checked })} />
        <span>Enabled</span>
      </label>
      <label className="media-stream-panel-field">
        <span>Name</span>
        <input value={binding.name} onKeyDown={stopKeyPropagation} onChange={event => onUpdate({ name: event.target.value })} />
      </label>
      <label className="media-stream-panel-field">
        <span>Driver feature</span>
        <input
          value={binding.featureId}
          className={featureMissing ? "is-invalid" : ""}
          onKeyDown={stopKeyPropagation}
          onFocus={() => onInspect(binding.featureId)}
          onChange={event => onUpdate({ featureId: event.target.value })}
        />
      </label>
      <FeatureValue feature={frame?.feature?.(binding.featureId)} />
      {binding.type === MEDIA_BINDING_TYPES.DRIVE_POSITION ? <>
        <label className="media-stream-panel-field">
          <span>Target object</span>
          <select value={binding.targetElementId} onChange={event => onUpdate({ targetElementId: event.target.value })}>
            <option value="">Choose target</option>
            {targetOptions.map(element => <option key={element.id} value={element.id}>{objectLabel(element)}</option>)}
          </select>
        </label>
        <label className="media-stream-panel-field">
          <span>Target anchor</span>
          <select value={binding.anchor} onChange={event => onUpdate({ anchor: event.target.value })}>
            {["center", "top-left", "top", "bottom", "left", "right"].map(anchor => <option key={anchor} value={anchor}>{anchor}</option>)}
          </select>
        </label>
        <div className="media-mapping-pair">
          <label><span>Offset X</span><NumericInput value={binding.offset.x} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={x => onUpdate({ offset: { x } })} /></label>
          <label><span>Offset Y</span><NumericInput value={binding.offset.y} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={y => onUpdate({ offset: { y } })} /></label>
        </div>
      </> : <>
        <label className="media-stream-panel-field">
          <span>Gate feature</span>
          <input
            value={binding.gate.featureId}
            onKeyDown={stopKeyPropagation}
            onFocus={() => onInspect(binding.gate.featureId)}
            onChange={event => onUpdate({ gate: { featureId: event.target.value } })}
          />
        </label>
        <div className="media-mapping-pair">
          <label><span>Gate</span><select value={binding.gate.comparator} onChange={event => onUpdate({ gate: { comparator: event.target.value } })}>
            <option value="active">Active</option>
            <option value="above">Above</option>
            <option value="below">Below</option>
          </select></label>
          <label><span>Threshold</span><NumericInput step="0.01" value={binding.gate.threshold} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={threshold => onUpdate({ gate: { threshold } })} /></label>
        </div>
        <div className="media-mapping-pair">
          <label><span>Width</span><NumericInput min="1" max="32" value={binding.style.strokeWidth} defaultValue={1} onKeyDown={stopKeyPropagation} onCommit={strokeWidth => onUpdate({ style: { strokeWidth } })} /></label>
          <label><span>Color</span><input type="color" value={binding.style.strokeColor || "#52d5ff"} onChange={event => onUpdate({ style: { strokeColor: event.target.value } })} /></label>
        </div>
      </>}
      <div className="media-mapping-pair">
        <label><span>Smoothing ms</span><NumericInput min="0" max="1000" value={binding.signal.smoothingMs} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={smoothingMs => onUpdate({ signal: { smoothingMs } })} /></label>
        <label><span>Grace ms</span><NumericInput min="0" max="5000" value={binding.signal.missingGraceMs} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={missingGraceMs => onUpdate({ signal: { missingGraceMs } })} /></label>
      </div>
      <label className="media-stream-panel-field">
        <span>Minimum confidence</span>
        <NumericInput min="0" max="1" step="0.05" value={binding.signal.confidenceMin} defaultValue={0} onKeyDown={stopKeyPropagation} onCommit={confidenceMin => onUpdate({ signal: { confidenceMin } })} />
      </label>
      <div className="media-mapping-pair is-checks">
        <label className="media-stream-panel-check"><input type="checkbox" checked={binding.visualize} onChange={event => onUpdate({ visualize: event.target.checked })} /><span>Highlight</span></label>
        <label className="media-stream-panel-check"><input type="checkbox" checked={binding.trace} onChange={event => onUpdate({ trace: event.target.checked })} /><span>Trace</span></label>
      </div>
      {(targetMissing || featureMissing) && <div className="media-stream-panel-status is-error">
        {targetMissing ? "Target object is missing. " : ""}{featureMissing ? "Driver feature is unknown." : ""}
      </div>}
      <div className="media-stream-panel-toolbar">
        <button type="button" className="iannix-flat-button" onClick={() => onInspect(binding.featureId)}>Test</button>
        <button type="button" className="iannix-flat-button" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="iannix-flat-button" onClick={onDelete}>Delete</button>
      </div>
    </div>
  </details>;
};

export default function MediaMappingPanel({
  elements,
  selectedElementIds,
  actorsArmed,
  onArm,
  onCreateBinding,
  onUpdateBinding,
  onDuplicateBinding,
  onDeleteBinding,
  onCreateMap,
  inspected,
  onInspect,
}) {
  const processors = useMemo(() => processorElements(elements), [elements]);
  const selectedCanvasProcessor = processors.find(element => selectedElementIds?.[element.id]);
  const [processorId, setProcessorId] = useState("");
  const [query, setQuery] = useState("");
  const [featureIds, setFeatureIds] = useState([]);
  const [, setRuntimeNonce] = useState(0);
  const activeId = selectedCanvasProcessor?.id || (processors.some(element => element.id === processorId) ? processorId : processors[0]?.id || "");
  const processor = processors.find(element => element.id === activeId) || null;
  const config = processor ? normalizeMediaStreamConfig(processor.customData.draweratorMediaStream) : null;
  const frame = processor ? getMediaSemanticFrame(processor.id) : null;
  const targetElement = elements.find(element => selectedElementIds?.[element.id] && !isMediaStreamElement(element) && !element.isDeleted)
    || elements.find(element => !element.isDeleted && !isMediaStreamElement(element));

  useEffect(() => {
    if (!activeId) return undefined;
    return subscribeMediaSemanticFrame(activeId, () => setRuntimeNonce(value => value + 1));
  }, [activeId]);

  useEffect(() => {
    if (inspected?.streamId === activeId && (inspected.featureIds?.length || inspected.featureId)) {
      setFeatureIds(inspected.featureIds?.length ? inspected.featureIds : [inspected.featureId]);
    }
  }, [activeId, inspected]);

  const inspect = (nextFeatureId, event = null, visibleDefinitions = []) => {
    setFeatureIds(previous => {
      const currentIndex = visibleDefinitions.findIndex(definition => definition.id === nextFeatureId);
      const anchorIndex = visibleDefinitions.findIndex(definition => definition.id === previous[0]);
      let next;
      if (event?.shiftKey && currentIndex >= 0 && anchorIndex >= 0) {
        const start = Math.min(currentIndex, anchorIndex);
        const end = Math.max(currentIndex, anchorIndex);
        next = visibleDefinitions.slice(start, end + 1).map(definition => definition.id);
      } else if (event?.metaKey || event?.ctrlKey) {
        next = previous.includes(nextFeatureId)
          ? previous.filter(id => id !== nextFeatureId)
          : [...previous, nextFeatureId];
      } else if (previous.length === 1 && previous[0] === nextFeatureId) {
        next = [];
      } else {
        next = [nextFeatureId];
      }
      onInspect?.({ streamId: activeId, featureIds: next, featureId: next[next.length - 1] || "" });
      return next;
    });
  };
  const inspectMany = (nextFeatureIds, event = null) => {
    setFeatureIds(previous => {
      const additive = Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
      const next = additive
        ? [...new Set([...previous, ...nextFeatureIds])]
        : [...new Set(nextFeatureIds)];
      onInspect?.({ streamId: activeId, featureIds: next, featureId: next[next.length - 1] || "" });
      return next;
    });
  };
  const featureId = featureIds[featureIds.length - 1] || "";

  return <div className="media-stream-panel media-mapping-panel">
    <div className="media-mapping-arm">
      <div>
        <strong>Media actors</strong>
        <small>{actorsArmed ? "Live independently of transport" : "Drivers and drawing are paused"}</small>
      </div>
      <button type="button" className={`iannix-flat-button ${actorsArmed ? "is-active" : ""}`} onClick={() => onArm(!actorsArmed)}>
        {actorsArmed ? "Armed" : "Disarmed"}
      </button>
    </div>
    <label className="media-stream-panel-field">
      <span>Holistic stream</span>
      <select value={activeId} onChange={event => setProcessorId(event.target.value)}>
        {!processors.length && <option value="">No Holistic processors</option>}
        {processors.map(element => {
          const item = normalizeMediaStreamConfig(element.customData.draweratorMediaStream);
          return <option key={element.id} value={element.id}>{item.name}</option>;
        })}
      </select>
    </label>
    {processor && <>
      <div className={`media-mapping-stream-status ${frame?.available ? "is-live" : ""}`}>
        <span>{frame?.available ? "Live" : "Waiting for landmarks"}</span>
        <small>{frame?.available ? `${Math.round(Math.max(0, performance.now() - frame.updatedAt))} ms ago` : processor.id.slice(0, 8)}</small>
      </div>
      <details className="media-visual-feature-picker-details" open>
        <summary>Visual picker <button type="button" className="iannix-flat-button" onClick={event => { event.preventDefault(); onCreateMap?.(activeId); }}>Open on canvas</button></summary>
        <MediaVisualFeaturePicker selectedIds={featureIds} focusFeatureId={featureId} onSelect={inspect} onSelectMany={inspectMany} />
      </details>
      <FeatureBrowser query={query} onQuery={setQuery} selectedIds={featureIds} focusFeatureId={featureId} onSelect={inspect} frame={frame} />
      {featureId && <div className="media-mapping-inspector">
        <code>{featureId}</code>
        <FeatureValue feature={frame?.feature?.(featureId)} allSpaces />
      </div>}
      <section className="media-mapping-section">
        <div className="media-mapping-section-heading">
          <h3>Bindings</h3>
          <div className="media-stream-panel-toolbar">
            <button
              type="button"
              className="iannix-flat-button"
              disabled={!targetElement || !featureId}
              onClick={() => onCreateBinding(processor.id, createMediaBinding(MEDIA_BINDING_TYPES.DRIVE_POSITION, {
                featureId,
                targetElementId: targetElement?.id || "",
              }))}
            >Drive selected</button>
            <button
              type="button"
              className="iannix-flat-button"
              onClick={() => onCreateBinding(processor.id, createMediaBinding(MEDIA_BINDING_TYPES.FREEDRAW_ACTOR))}
            >Add pinch pen</button>
          </div>
        </div>
        {!config.bindings.length && <div className="media-stream-panel-empty">No actor bindings yet.</div>}
        {config.bindings.map(binding => <BindingEditor
          key={binding.id}
          binding={binding}
          elements={elements}
          frame={frame}
          onUpdate={patch => onUpdateBinding(processor.id, binding.id, patch)}
          onDuplicate={() => onDuplicateBinding(processor.id, binding.id)}
          onDelete={() => onDeleteBinding(processor.id, binding.id)}
          onInspect={inspect}
        />)}
      </section>
    </>}
  </div>;
}
