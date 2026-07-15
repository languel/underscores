import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { createTimelineTicks, formatTimelinePosition } from "./transport.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const TransportTimeline = memo(function TransportTimeline({
  duration,
  currentTime,
  displayMode,
  fps,
  tempo,
  signature,
  loopEnabled,
  loopStart,
  loopEnd,
  onSeek,
  onLoopEnabledChange,
  onLoopChange,
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const safeDuration = Math.max(0.001, duration);
  const options = useMemo(() => ({ fps, tempo, signature }), [fps, tempo, signature]);
  const ticks = useMemo(() => createTimelineTicks(safeDuration, 12), [safeDuration]);

  const timeFromPointer = useCallback(clientX => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return clamp((clientX - rect.left) / rect.width * safeDuration, 0, safeDuration);
  }, [safeDuration]);

  useEffect(() => {
    const handleMove = event => {
      const drag = dragRef.current;
      if (!drag) return;
      const time = timeFromPointer(event.clientX);
      if (drag.kind === "playhead") {
        onSeek(time);
      } else if (drag.kind === "loop-start") {
        onLoopChange(Math.min(time, loopEnd - 1 / fps), loopEnd);
      } else if (drag.kind === "loop-end") {
        onLoopChange(loopStart, Math.max(time, loopStart + 1 / fps));
      } else if (drag.kind === "loop-range") {
        const width = drag.end - drag.start;
        const nextStart = clamp(time - drag.offset, 0, Math.max(0, safeDuration - width));
        onLoopChange(nextStart, nextStart + width);
      }
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [fps, loopEnd, loopStart, onLoopChange, onSeek, safeDuration, timeFromPointer]);

  const startPlayheadDrag = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const time = timeFromPointer(event.clientX);
    if (event.shiftKey) {
      onLoopEnabledChange(true);
      onLoopChange(time, Math.min(safeDuration, time + Math.max(1 / fps, safeDuration * 0.01)));
      dragRef.current = { kind: "loop-end" };
      return;
    }
    onSeek(time);
    dragRef.current = { kind: "playhead" };
  };

  const playheadPercent = clamp(currentTime / safeDuration * 100, 0, 100);
  const loopStartPercent = clamp(loopStart / safeDuration * 100, 0, 100);
  const loopEndPercent = clamp(loopEnd / safeDuration * 100, 0, 100);

  return (
    <div className="iannix-timeline" aria-label="Score timeline">
      <div className="iannix-timeline-ruler" aria-hidden="true">
        {ticks.map(tick => (
          <div className="iannix-timeline-tick" key={tick.percent} style={{ left: `${tick.percent}%` }}>
            <span>{formatTimelinePosition(tick.time, displayMode, options)}</span>
          </div>
        ))}
      </div>
      <div
        ref={trackRef}
        className="iannix-timeline-track"
        onPointerDown={startPlayheadDrag}
        title="Drag to seek · Shift-drag to mark a loop"
      >
        {ticks.map(tick => <i className="iannix-timeline-gridline" key={tick.percent} style={{ left: `${tick.percent}%` }} />)}
        {loopEnabled ? (
          <>
            <button
              type="button"
              className="iannix-timeline-loop-range"
              style={{ left: `${loopStartPercent}%`, width: `${Math.max(0, loopEndPercent - loopStartPercent)}%` }}
              onPointerDown={event => {
                event.stopPropagation();
                const time = timeFromPointer(event.clientX);
                dragRef.current = { kind: "loop-range", start: loopStart, end: loopEnd, offset: time - loopStart };
              }}
              aria-label="Move loop range"
              title="Drag loop range"
            />
            <button
              type="button"
              className="iannix-timeline-loop-handle start"
              style={{ left: `${loopStartPercent}%` }}
              onPointerDown={event => {
                event.stopPropagation();
                dragRef.current = { kind: "loop-start" };
              }}
              aria-label="Set loop start"
              title={`Loop start ${formatTimelinePosition(loopStart, displayMode, options)}`}
            />
            <button
              type="button"
              className="iannix-timeline-loop-handle end"
              style={{ left: `${loopEndPercent}%` }}
              onPointerDown={event => {
                event.stopPropagation();
                dragRef.current = { kind: "loop-end" };
              }}
              aria-label="Set loop end"
              title={`Loop end ${formatTimelinePosition(loopEnd, displayMode, options)}`}
            />
          </>
        ) : null}
        <div className="iannix-timeline-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true">
          <span>{formatTimelinePosition(currentTime, "frame", options)}</span>
        </div>
      </div>
    </div>
  );
});

export default TransportTimeline;
