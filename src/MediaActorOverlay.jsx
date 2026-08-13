export default function MediaActorOverlay({ appState, traces = [], strokes = [], markers = [], channelDebug = [] }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const width = Math.max(1, Number(appState?.width) || window.innerWidth);
  const height = Math.max(1, Number(appState?.height) || window.innerHeight);
  const pathFor = points => points.map((point, index) => {
    const pointX = Array.isArray(point) ? point[0] : point.x;
    const pointY = Array.isArray(point) ? point[1] : point.y;
    const x = (pointX + scrollX) * zoom;
    const y = (pointY + scrollY) * zoom;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  if (!traces.length && !strokes.length && !markers.length && !channelDebug.length) return null;
  return <svg className="underscore-media-actor-overlay" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    {traces.map(trace => trace.points.length > 1 && <path
      key={trace.id}
      className="underscore-media-actor-trace"
      d={pathFor(trace.points)}
      style={{ stroke: trace.color || "#52d5ff" }}
    />)}
    {strokes.flatMap(stroke => {
      const paths = Array.isArray(stroke.paths) && stroke.paths.length ? stroke.paths : [stroke.points];
      return paths.filter(points => points?.length > 1).map((points, index) => <path
        key={`${stroke.id}-${index}`}
        className="underscore-media-actor-stroke"
        d={pathFor(points)}
        style={{
          stroke: stroke.color || "#52d5ff",
          strokeWidth: Math.max(1, Number(stroke.strokeWidth) || 2) * zoom,
          opacity: Math.max(0, Math.min(1, (Number(stroke.opacity) || 100) / 100)),
        }}
      />);
    })}
    {markers.map(marker => <circle
      key={marker.id}
      className="underscore-media-actor-marker"
      cx={(marker.point.x + scrollX) * zoom}
      cy={(marker.point.y + scrollY) * zoom}
      r={6}
      style={{ stroke: marker.color || "#52d5ff" }}
    />)}
    {channelDebug.map(debug => {
      const color = debug.gate?.open ? "var(--underscore-accent-color, #52d5ff)" : "var(--color-secondary, #8b929e)";
      const label = [debug.name, debug.showGate ? (debug.gate?.open ? "gate open" : "gate closed") : "", debug.showValues && debug.point ? `${debug.point.x.toFixed(2)}, ${debug.point.y.toFixed(2)}` : ""].filter(Boolean).join(" · ");
      if (!debug.point) return null;
      return <g key={debug.id} className={`underscore-brush-channel-debug ${debug.gate?.open ? "is-open" : "is-closed"}`} style={{ color }}>
        {debug.showTrail && debug.trail?.length > 1 && <path className="underscore-brush-channel-debug-trail" d={pathFor(debug.trail)} />}
        <circle className="underscore-brush-channel-debug-ring" cx={(debug.point.x + scrollX) * zoom} cy={(debug.point.y + scrollY) * zoom} r={8} />
        {label && <text className="underscore-brush-channel-debug-label" x={(debug.point.x + scrollX) * zoom + 12} y={(debug.point.y + scrollY) * zoom - 10}>{label}</text>}
      </g>;
    })}
  </svg>;
}
