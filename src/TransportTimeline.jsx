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
  onSeekCommit = onSeek,
  onLoopEnabledChange,
  onLoopChange,
  automationKeys = [],
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const safeDuration = Math.max(0.001, duration);
  const options = useMemo(() => ({ fps, tempo, signature }), [fps, tempo, signature]);
  const ticks = useMemo(() => createTimelineTicks(safeDuration, 12), [safeDuration]);
  const interactionRef = useRef(null);
  interactionRef.current = {
    fps,
    loopEnd,
    loopStart,
    onLoopChange,
    onSeek,
    onSeekCommit,
    safeDuration,
  };

  const timeFromPointer = useCallback(clientX => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return clamp((clientX - rect.left) / rect.width * safeDuration, 0, safeDuration);
  }, [safeDuration]);

  useEffect(() => {
    const releaseDrag = event => {
      const drag = dragRef.current;
      if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;
      if (drag.kind === "playhead" && Number.isFinite(drag.time)) {
        interactionRef.current.onSeekCommit(drag.time);
      }
      try {
        if (drag.captureTarget?.hasPointerCapture?.(drag.pointerId)) {
          drag.captureTarget.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Pointer capture may already be released by the browser.
      }
      dragRef.current = null;
    };
    const handleMove = event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const {
        fps: currentFps,
        loopEnd: currentLoopEnd,
        loopStart: currentLoopStart,
        onLoopChange: changeLoop,
        onSeek: seek,
        safeDuration: currentDuration,
      } = interactionRef.current;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect?.width) return;
      const time = clamp((event.clientX - rect.left) / rect.width * currentDuration, 0, currentDuration);
      if (drag.kind === "playhead") {
        drag.time = time;
        seek(time);
      } else if (drag.kind === "loop-start") {
        changeLoop(Math.min(time, currentLoopEnd - 1 / currentFps), currentLoopEnd);
      } else if (drag.kind === "loop-end") {
        changeLoop(currentLoopStart, Math.max(time, currentLoopStart + 1 / currentFps));
      } else if (drag.kind === "loop-range") {
        const width = drag.end - drag.start;
        const nextStart = clamp(time - drag.offset, 0, Math.max(0, currentDuration - width));
        changeLoop(nextStart, nextStart + width);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") releaseDrag();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", releaseDrag);
    window.addEventListener("pointercancel", releaseDrag);
    window.addEventListener("blur", releaseDrag);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", releaseDrag);
      window.removeEventListener("pointercancel", releaseDrag);
      window.removeEventListener("blur", releaseDrag);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const beginDrag = (event, drag) => {
    if (event.button !== 0) return false;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      ...drag,
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
    };
    return true;
  };

  const startPlayheadDrag = event => {
    if (event.button !== 0) return;
    const time = timeFromPointer(event.clientX);
    if (event.shiftKey) {
      onLoopEnabledChange(true);
      onLoopChange(time, Math.min(safeDuration, time + Math.max(1 / fps, safeDuration * 0.01)));
      beginDrag(event, { kind: "loop-end" });
      return;
    }
    onSeek(time);
    beginDrag(event, { kind: "playhead", time });
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
        <div className="iannix-timeline-key-lane" aria-label="Object automation keyframes">
          {automationKeys.map(key => <i key={`${key.elementId}-${key.path}-${key.id}`} className="iannix-timeline-key" style={{ left: `${clamp(key.time / safeDuration * 100, 0, 100)}%` }} title={`${key.path} · ${formatTimelinePosition(key.time, displayMode, options)}`} />)}
        </div>
        {loopEnabled ? (
          <>
            <button
              type="button"
              className="iannix-timeline-loop-range"
              style={{ left: `${loopStartPercent}%`, width: `${Math.max(0, loopEndPercent - loopStartPercent)}%` }}
              onPointerDown={event => {
                event.stopPropagation();
                const time = timeFromPointer(event.clientX);
                beginDrag(event, { kind: "loop-range", start: loopStart, end: loopEnd, offset: time - loopStart });
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
                beginDrag(event, { kind: "loop-start" });
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
                beginDrag(event, { kind: "loop-end" });
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
