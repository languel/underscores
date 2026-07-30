export default function MediaActorOverlay({ appState, traces = [], strokes = [], markers = [] }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const width = Math.max(1, Number(appState?.width) || window.innerWidth);
  const height = Math.max(1, Number(appState?.height) || window.innerHeight);
  const pathFor = points => points.map((point, index) => {
    const x = (point.x + scrollX) * zoom;
    const y = (point.y + scrollY) * zoom;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  if (!traces.length && !strokes.length && !markers.length) return null;
  return <svg className="drawerator-media-actor-overlay" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {traces.map(trace => trace.points.length > 1 && <path
      key={trace.id}
      className="drawerator-media-actor-trace"
      d={pathFor(trace.points)}
      style={{ stroke: trace.color || "#52d5ff" }}
    />)}
    {strokes.map(stroke => stroke.points.length > 1 && <path
      key={stroke.id}
      className="drawerator-media-actor-stroke"
      d={pathFor(stroke.points)}
      style={{
        stroke: stroke.color || "#52d5ff",
        strokeWidth: Math.max(1, Number(stroke.strokeWidth) || 2) * zoom,
        opacity: Math.max(0, Math.min(1, (Number(stroke.opacity) || 100) / 100)),
      }}
    />)}
    {markers.map(marker => <circle
      key={marker.id}
      className="drawerator-media-actor-marker"
      cx={(marker.point.x + scrollX) * zoom}
      cy={(marker.point.y + scrollY) * zoom}
      r={6}
      style={{ stroke: marker.color || "#52d5ff" }}
    />)}
  </svg>;
}
