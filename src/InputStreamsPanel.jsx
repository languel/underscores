import { useEffect, useMemo, useState } from "react";
import { STREAM_INPUT_SOURCE_TYPES, STREAM_PROCESSOR_TYPES, normalizeInputSource, normalizeStreamProcessor } from "./streamGraph.js";
import { infoProps } from "./uiInfo.js";

const SOURCE_LABELS = Object.freeze({
  pointer: "Pointer / pen",
  keyboard: "Keyboard",
  clock: "Clock",
  mediapipe: "MediaPipe feature",
  iannix: "IanniX map / cursor / trigger",
  midi: "Web MIDI",
  serial: "Web Serial",
  websocket: "WebSocket JSON",
  "osc-websocket": "OSC over WebSocket",
  virtual: "Virtual stream",
});

const StreamIcon = ({ type }) => <span className={`input-stream-kind-icon kind-${type}`} aria-hidden="true">{
  type === "pointer" ? "⌖" : type === "keyboard" ? "⌨" : type === "clock" ? "◷" : type === "mediapipe" ? "◎" : type === "iannix" ? "⌁" : type === "midi" ? "♫" : type === "serial" ? "⇆" : type.includes("websocket") ? "◌" : "∿"
}</span>;

const typeDefault = type => normalizeInputSource({ type, name: SOURCE_LABELS[type] });

const fieldsToText = fields => (fields || []).map(field => `${field.name}=${field.path}`).join(", ");
const textToFields = value => String(value || "").split(",").map(entry => entry.trim()).filter(Boolean).map(entry => {
  const [name, ...path] = entry.split("=");
  return { name: String(name || "").trim(), path: path.join("=").trim() };
}).filter(field => field.name && field.path);

const processorDefaults = (type, sourceId = "") => normalizeStreamProcessor({
  type,
  sourceId,
  name: type === "region" ? "Enter / leave region" : type === "curve-cross" ? "Curve crossing" : "Threshold",
});

export default function InputStreamsPanel({ sources = [], streams = [], processors = [], statusById = {}, onCreate, onPatch, onDelete, onCreateProcessor, onPatchProcessor, onDeleteProcessor, onConnectSerial, onConnectWebSocket, onConnectMidi }) {
  const [selectedId, setSelectedId] = useState("");
  const [selectedProcessorId, setSelectedProcessorId] = useState("");
  const selected = useMemo(() => sources.find(source => source.id === selectedId) || sources[0] || null, [selectedId, sources]);
  const selectedProcessor = useMemo(() => processors.find(processor => processor.id === selectedProcessorId) || processors[0] || null, [processors, selectedProcessorId]);
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(() => { if (selectedProcessor && selectedProcessor.id !== selectedProcessorId) setSelectedProcessorId(selectedProcessor.id); }, [selectedProcessor, selectedProcessorId]);
  const create = () => {
    const source = onCreate?.(typeDefault("virtual"));
    if (source?.id) setSelectedId(source.id);
  };
  const patch = update => selected && onPatch?.(selected.id, update);
  const patchProcessor = update => selectedProcessor && onPatchProcessor?.(selectedProcessor.id, update);
  const addProcessor = type => {
    const sourceId = streams.find(stream => ["space", "value"].includes(stream.kind))?.id || "";
    const processor = onCreateProcessor?.(processorDefaults(type, sourceId));
    if (processor?.id) setSelectedProcessorId(processor.id);
  };
  return <section className="input-streams-panel">
    <div className="media-stream-panel-source-header">
      <span>Signal sources</span>
      <button type="button" className="iannix-flat-button media-stream-panel-add-source" onClick={create} title="Add input stream" aria-label="Add input stream">+</button>
    </div>
    <div className="input-streams-panel-list" role="list">
      {sources.map(source => <div key={source.id} className={`input-streams-panel-row ${source.id === selected?.id ? "is-selected" : ""}`} role="listitem">
        <button type="button" className="input-streams-panel-select" onClick={() => setSelectedId(source.id)}>
          <StreamIcon type={source.type} />
          <span>{source.name}</span>
          <small>{source.kind}</small>
        </button>
        {!(["pointer", "keyboard", "clock"].includes(source.type)) && <button type="button" className="input-streams-panel-delete" onClick={() => onDelete?.(source.id)} aria-label={`Delete ${source.name}`} title={`Delete ${source.name}`}>×</button>}
      </div>)}
    </div>
    {selected && <div className="input-streams-panel-detail">
      <label className="media-stream-panel-field"><span>Name</span><input value={selected.name} onChange={event => patch({ name: event.target.value })} /></label>
      <label className="media-stream-panel-field"><span>Type</span><select value={selected.type} onChange={event => patch({ ...typeDefault(event.target.value), id: selected.id, name: selected.name, streamId: selected.streamId })}>
        {STREAM_INPUT_SOURCE_TYPES.map(type => <option key={type} value={type}>{SOURCE_LABELS[type]}</option>)}
      </select></label>
      <label className="media-stream-panel-field"><span>Frame</span><select value={selected.kind} onChange={event => patch({ kind: event.target.value })}>
        {["space", "time", "value", "event", "image"].map(kind => <option key={kind} value={kind}>{kind}</option>)}
      </select></label>
      {(["serial", "websocket", "osc-websocket", "midi"].includes(selected.type)) && <label className="media-stream-panel-field"><span>Fields</span><input placeholder="x=field0, y=field1" value={fieldsToText(selected.fields)} onChange={event => patch({ fields: textToFields(event.target.value) })} /></label>}
      {(["websocket", "osc-websocket"].includes(selected.type)) && <>
        <label className="media-stream-panel-field"><span>Endpoint</span><input placeholder="wss://…" value={selected.endpoint} onChange={event => patch({ endpoint: event.target.value })} /></label>
        <button type="button" className="iannix-flat-button" onClick={() => onConnectWebSocket?.(selected)}>Connect</button>
        <div className="media-stream-panel-note" {...infoProps("OSC over WebSocket", "Use an external bridge that sends JSON such as { address: '/hand/right', args: [0.2, 0.7] }. Browsers do not receive raw UDP OSC directly.")}>{selected.type === "osc-websocket" ? "External OSC JSON bridge" : "JSON messages"}</div>
      </>}
      {selected.type === "serial" && <>
        <label className="media-stream-panel-field"><span>Format</span><select value={selected.serial.mode} onChange={event => patch({ serial: { ...selected.serial, mode: event.target.value } })}><option value="json-lines">newline JSON</option><option value="delimited">Delimited fields</option></select></label>
        {selected.serial.mode === "delimited" && <label className="media-stream-panel-field"><span>Delimiter</span><input value={selected.serial.delimiter} onChange={event => patch({ serial: { delimiter: event.target.value } })} /></label>}
        <label className="media-stream-panel-field"><span>Baud rate</span><input type="number" min="300" max="4000000" value={selected.serial.baudRate} onChange={event => patch({ serial: { ...selected.serial, baudRate: event.target.value } })} /></label>
        <button type="button" className="iannix-flat-button" onClick={() => onConnectSerial?.(selected)}>Connect serial</button>
      </>}
      {selected.type === "midi" && <button type="button" className="iannix-flat-button" onClick={() => onConnectMidi?.()}>Connect MIDI</button>}
      {selected.type === "mediapipe" && <label className="media-stream-panel-field"><span>Feature</span><input placeholder="left_hand.index_finger_tip" value={selected.featureId} onChange={event => patch({ featureId: event.target.value })} /></label>}
      {selected.type === "iannix" && <label className="media-stream-panel-field"><span>IanniX output</span><select value={selected.streamId} onChange={event => patch({ streamId: event.target.value })}><option value="">Choose map, cursor, or trigger</option>{streams.filter(stream => stream.metadata?.iannix).map(stream => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label>}
      {selected.type === "virtual" && <div className="media-stream-panel-note">Trusted p5, Play Core, Strudel, Brush, and Livecode scripts can create and write this runtime-only stream through <code>__.streams</code>.</div>}
      <label className="media-stream-panel-check"><input type="checkbox" checked={selected.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span>Enabled</span></label>
      {statusById[selected.id]?.message && <div className={`media-stream-panel-status is-${statusById[selected.id].kind || "info"}`}>{statusById[selected.id].message}</div>}
      <div className="input-streams-panel-live" aria-label="Matching live streams">{streams.filter(stream => stream.id === selected.streamId).map(stream => <span key={stream.id}>{stream.available ? "Live" : "Waiting"} · {stream.name}</span>)}</div>
    </div>}
    <div className="media-stream-panel-source-header input-streams-processor-header">
      <span>Derived events</span>
      <span className="input-streams-processor-actions">
        <button type="button" className="iannix-flat-button" onClick={() => addProcessor("threshold")}>Threshold</button>
        <button type="button" className="iannix-flat-button" onClick={() => addProcessor("region")}>Region</button>
        <button type="button" className="iannix-flat-button" onClick={() => addProcessor("curve-cross")}>Cross</button>
      </span>
    </div>
    <div className="input-streams-panel-list" role="list">
      {processors.map(processor => <div key={processor.id} className={`input-streams-panel-row ${processor.id === selectedProcessor?.id ? "is-selected" : ""}`} role="listitem">
        <button type="button" className="input-streams-panel-select" onClick={() => setSelectedProcessorId(processor.id)}><StreamIcon type="virtual" /><span>{processor.name}</span><small>{processor.type}</small></button>
        <button type="button" className="input-streams-panel-delete" onClick={() => onDeleteProcessor?.(processor.id)} title={`Delete ${processor.name}`} aria-label={`Delete ${processor.name}`}>×</button>
      </div>)}
    </div>
    {selectedProcessor && <div className="input-streams-panel-detail input-streams-processor-detail">
      <label className="media-stream-panel-field"><span>Name</span><input value={selectedProcessor.name} onChange={event => patchProcessor({ name: event.target.value })} /></label>
      <label className="media-stream-panel-field"><span>Type</span><select value={selectedProcessor.type} onChange={event => patchProcessor({ type: event.target.value })}>{Object.values(STREAM_PROCESSOR_TYPES).map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="media-stream-panel-field"><span>Source</span><select value={selectedProcessor.sourceId} onChange={event => patchProcessor({ sourceId: event.target.value })}><option value="">Choose a stream</option>{streams.filter(stream => stream.kind !== "image").map(stream => <option key={stream.id} value={stream.id}>{stream.name} · {stream.kind}</option>)}</select></label>
      {selectedProcessor.type === "threshold" && <div className="input-streams-processor-values"><label><span>Rise</span><input type="number" step="0.01" value={selectedProcessor.threshold.rising} onChange={event => patchProcessor({ threshold: { ...selectedProcessor.threshold, rising: event.target.value } })} /></label><label><span>Fall</span><input type="number" step="0.01" value={selectedProcessor.threshold.falling} onChange={event => patchProcessor({ threshold: { ...selectedProcessor.threshold, falling: event.target.value } })} /></label></div>}
      {selectedProcessor.type === "region" && <div className="input-streams-processor-values"><label><span>X</span><input type="number" value={selectedProcessor.region.x} onChange={event => patchProcessor({ region: { ...selectedProcessor.region, x: event.target.value } })} /></label><label><span>Y</span><input type="number" value={selectedProcessor.region.y} onChange={event => patchProcessor({ region: { ...selectedProcessor.region, y: event.target.value } })} /></label><label><span>W</span><input type="number" min="0" value={selectedProcessor.region.width} onChange={event => patchProcessor({ region: { ...selectedProcessor.region, width: event.target.value } })} /></label><label><span>H</span><input type="number" min="0" value={selectedProcessor.region.height} onChange={event => patchProcessor({ region: { ...selectedProcessor.region, height: event.target.value } })} /></label></div>}
      {selectedProcessor.type === "curve-cross" && <label className="media-stream-panel-field"><span>Curve points</span><input placeholder="x,y x,y …" value={(selectedProcessor.curve || []).map(point => `${point.x},${point.y}`).join(" ")} onChange={event => patchProcessor({ curve: event.target.value.trim().split(/\s+/).map(pair => pair.split(",")).map(([x, y]) => ({ x: Number(x), y: Number(y) })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)) })} /></label>}
      <label className="media-stream-panel-check"><input type="checkbox" checked={selectedProcessor.enabled} onChange={event => patchProcessor({ enabled: event.target.checked })} /><span>Enabled</span></label>
    </div>}
    <div className="media-stream-panel-source-header input-streams-processor-header"><span>Live outputs</span></div>
    <div className="input-streams-panel-list" role="list" aria-label="Live stream outputs">
      {streams.filter(stream => stream.virtual || stream.kind === "image" || stream.metadata?.iannix || stream.metadata?.processorId).map(stream => <div key={stream.id} className="input-streams-panel-row" role="listitem">
        <span className="input-streams-panel-select"><StreamIcon type={stream.virtual ? "virtual" : stream.metadata?.iannix ? "iannix" : "websocket"} /><span>{stream.name}</span><small>{stream.available ? "live" : stream.kind}</small></span>
      </div>)}
    </div>
  </section>;
}
