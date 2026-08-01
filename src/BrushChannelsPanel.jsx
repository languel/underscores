import { useEffect, useMemo, useState } from "react";
import { BRUSH_DESTINATIONS, normalizeBrushChannel } from "./brushChannelRuntime.js";
import { objectBoundsTargetLabel } from "./mediaStream.js";

const channelSourceLabel = stream => `${stream.name} · ${stream.kind}`;

const formatNumber = value => Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "—";

const RangeControls = ({ label, range, onChange }) => <div className="brush-channel-range">
  <span>{label}</span>
  <input aria-label={`${label} minimum`} type="number" step="0.01" value={range.min} onChange={event => onChange({ min: event.target.value, auto: false })} />
  <input aria-label={`${label} maximum`} type="number" step="0.01" value={range.max} onChange={event => onChange({ max: event.target.value, auto: false })} />
  <input aria-label={`${label} scale`} type="number" step="0.01" value={range.scale} onChange={event => onChange({ scale: event.target.value })} title={`${label} scale`} />
  <input aria-label={`${label} offset`} type="number" step="0.01" value={range.offset} onChange={event => onChange({ offset: event.target.value })} title={`${label} offset`} />
  <label title={`Invert ${label}`}><input type="checkbox" checked={range.invert} onChange={event => onChange({ invert: event.target.checked })} />Inv</label>
  <label title={`Clamp ${label} to its range`}><input type="checkbox" checked={range.clamp} onChange={event => onChange({ clamp: event.target.checked })} />Clamp</label>
</div>;

export default function BrushChannelsPanel({ channels, streams, channelStatus = {}, canvasTargets = [], onAdd, onPatch, onRemove, onReorder }) {
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(() => channels.find(channel => channel.id === selectedId) || channels[0] || null, [channels, selectedId]);
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  const spatial = streams.filter(stream => stream.kind === "space" || stream.capabilities?.includes("space"));
  // A brush needs a held state, not a one-shot transition. Gate processors
  // publish value streams for this; their sibling edge events are intended for
  // resets, generators, and later automation.
  const gates = streams.filter(stream => stream.kind === "value" || stream.capabilities?.includes("value"));
  const scalars = streams.filter(stream => ["value", "event", "time"].includes(stream.kind) || stream.capabilities?.some(capability => ["value", "event", "time"].includes(capability)));
  const patch = update => selected && onPatch(selected.id, update);
  const status = selected ? channelStatus[selected.id] : null;
  return <div className="brush-channels-panel">
    <div className="media-stream-panel-source-header"><span>Channels</span><button type="button" className="iannix-flat-button media-stream-panel-add-source" onClick={() => onAdd(normalizeBrushChannel({ name: `Channel ${channels.length + 1}`, spatialStreamId: spatial[0]?.id || "", destination: { kind: "viewport" } }))} aria-label="Add brush channel">+</button></div>
    <div className="input-streams-panel-list">
      {channels.map((channel, index) => <div key={channel.id} className={`input-streams-panel-row ${channel.id === selected?.id ? "is-selected" : ""}`}>
        <button type="button" className="input-streams-panel-select" onClick={() => setSelectedId(channel.id)}><span className="input-stream-kind-icon">✎</span><span>{channel.name}</span><small>{channel.enabled ? "armed" : "off"}</small></button>
        {!channel.nativePointer && <button type="button" className="input-streams-panel-delete" onClick={() => onRemove(channel.id)} title="Remove channel" aria-label={`Remove ${channel.name}`}>×</button>}
        <button type="button" className="input-streams-panel-delete" disabled={index === 0} onClick={() => onReorder(channel.id, -1)} title="Move channel earlier" aria-label="Move channel earlier">↑</button>
        <button type="button" className="input-streams-panel-delete" disabled={index === channels.length - 1} onClick={() => onReorder(channel.id, 1)} title="Move channel later" aria-label="Move channel later">↓</button>
      </div>)}
    </div>
    {selected && <div className="input-streams-panel-detail">
      <label className="media-stream-panel-field"><span>Name</span><input value={selected.name} onChange={event => patch({ name: event.target.value })} /></label>
      <label className="media-stream-panel-check"><input type="checkbox" checked={selected.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span>Armed</span></label>
      {selected.nativePointer ? <div className="media-stream-panel-note">Native pointer channel preserves the normal mouse, pen, and touch drawing path.</div> : <>
        <label className="media-stream-panel-field"><span>Position</span><select value={selected.spatialStreamId} onChange={event => patch({ spatialStreamId: event.target.value })}><option value="">Choose a space stream</option>{spatial.map(stream => <option key={stream.id} value={stream.id}>{channelSourceLabel(stream)}</option>)}</select></label>
        <label className="media-stream-panel-field"><span>Gate</span><select value={selected.gateStreamId} onChange={event => patch({ gateStreamId: event.target.value })}><option value="">Always on</option>{gates.map(stream => <option key={stream.id} value={stream.id}>{channelSourceLabel(stream)}</option>)}</select></label>
        {selected.gateStreamId && <div className="input-streams-processor-values"><label><span>Gate test</span><select value={selected.gate.comparator} onChange={event => patch({ gate: { ...selected.gate, comparator: event.target.value } })}><option value="active">Active</option><option value="above">Above</option><option value="below">Below</option></select></label><label><span>Threshold</span><input type="number" step="0.01" value={selected.gate.threshold} onChange={event => patch({ gate: { ...selected.gate, threshold: event.target.value } })} /></label></div>}
        <label className="media-stream-panel-field"><span>Pressure</span><select value={selected.pressureStreamId} onChange={event => patch({ pressureStreamId: event.target.value })}><option value="">Position pressure</option>{scalars.map(stream => <option key={stream.id} value={stream.id}>{channelSourceLabel(stream)}</option>)}</select></label>
        <RangeControls label="X range" range={selected.range.x} onChange={range => patch({ range: { ...selected.range, x: { ...selected.range.x, ...range } } })} />
        <RangeControls label="Y range" range={selected.range.y} onChange={range => patch({ range: { ...selected.range, y: { ...selected.range.y, ...range } } })} />
        {selected.pressureStreamId && <RangeControls label="Pressure" range={selected.range.pressure} onChange={range => patch({ range: { ...selected.range, pressure: { ...selected.range.pressure, ...range } } })} />}
        <label className="media-stream-panel-field"><span>Destination</span><select value={selected.destination.kind} onChange={event => patch({ destination: { ...selected.destination, kind: event.target.value } })}><option value={BRUSH_DESTINATIONS.SCENE}>Scene passthrough</option><option value={BRUSH_DESTINATIONS.VIEWPORT}>Frozen viewport</option><option value={BRUSH_DESTINATIONS.TARGET}>Object bounds</option></select></label>
        {selected.destination.kind === BRUSH_DESTINATIONS.TARGET && <label className="media-stream-panel-field"><span>Object</span><select value={selected.destination.targetId} onChange={event => patch({ destination: { ...selected.destination, targetId: event.target.value } })}><option value="">Choose rectangle or frame</option>{canvasTargets.map(target => <option key={target.id} value={target.id}>{objectBoundsTargetLabel(target)} · {target.id.slice(0, 6)}</option>)}</select></label>}
        <section className="brush-channel-debug" aria-label="Channel debug display">
          <div className="brush-channel-debug-header"><span>Debug display</span><label title="Draw this channel's mapped position on the canvas"><input type="checkbox" checked={selected.debug.overlay} onChange={event => patch({ debug: { ...selected.debug, overlay: event.target.checked } })} />Canvas</label></div>
          <div className="brush-channel-debug-options">
            <label title="Show mapped coordinates beside the canvas marker"><input type="checkbox" checked={selected.debug.values} onChange={event => patch({ debug: { ...selected.debug, values: event.target.checked } })} />Values</label>
            <label title="Show whether the held gate is open"><input type="checkbox" checked={selected.debug.gate} onChange={event => patch({ debug: { ...selected.debug, gate: event.target.checked } })} />Gate</label>
            <label title="Show the latest mapped positions"><input type="checkbox" checked={selected.debug.trail} onChange={event => patch({ debug: { ...selected.debug, trail: event.target.checked } })} />Trail</label>
          </div>
          <div className="brush-channel-live-status" aria-live="polite">
            <span className={status?.source?.available ? "is-live" : "is-waiting"}>Source {status?.source?.available ? "live" : "waiting"}</span>
            <span className={status?.gate?.open ? "is-open" : "is-closed"}>Gate {status?.gate?.open ? "open" : "closed"}</span>
            <span>XY {status?.point ? `${formatNumber(status.point.x)}, ${formatNumber(status.point.y)}` : "—"}</span>
            <span>Pressure {formatNumber(status?.pressure?.value)}</span>
          </div>
        </section>
      </>}
    </div>}
  </div>;
}
