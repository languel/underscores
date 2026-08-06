import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTimelineTicks, formatTimelinePosition, snapTimelineTime } from "./transport.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const snapLevelFromPointer = event => event.metaKey ? (event.shiftKey ? "minor" : "major") : null;

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
  const zoomRef = useRef(null);
  const dragRef = useRef(null);
  const safeDuration = Math.max(0.001, duration);
  const previousDurationRef = useRef(safeDuration);
  const [trackWidth, setTrackWidth] = useState(768);
  const [viewRange, setViewRange] = useState(() => ({ start: 0, end: safeDuration }));
  const viewStart = clamp(viewRange.start, 0, safeDuration);
  const viewEnd = clamp(Math.max(viewStart + Number.EPSILON, viewRange.end), 0, safeDuration);
  const viewDuration = Math.max(Number.EPSILON, viewEnd - viewStart);
  const options = useMemo(() => ({ fps, tempo, signature }), [fps, tempo, signature]);
  const ticks = useMemo(() => createTimelineTicks(safeDuration, 12, {
    mode: displayMode,
    fps,
    tempo,
    signature,
    rangeStart: viewStart,
    rangeEnd: viewEnd,
    pixelWidth: trackWidth,
  }), [displayMode, fps, safeDuration, signature, tempo, trackWidth, viewEnd, viewStart]);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return undefined;
    const updateWidth = () => setTrackWidth(Math.max(1, node.getBoundingClientRect().width));
    updateWidth();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateWidth) : null;
    observer?.observe(node);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    const previousDuration = previousDurationRef.current;
    previousDurationRef.current = safeDuration;
    setViewRange(previous => {
      const wasFit = previous.start <= 1e-9 && Math.abs(previous.end - previousDuration) <= Math.max(1e-9, previousDuration * 1e-6);
      if (wasFit) return { start: 0, end: safeDuration };
      const width = Math.min(safeDuration, Math.max(1 / Math.max(1, fps), previous.end - previous.start));
      const start = clamp(previous.start, 0, Math.max(0, safeDuration - width));
      return { start, end: start + width };
    });
  }, [fps, safeDuration]);
  const interactionRef = useRef(null);
  interactionRef.current = {
    fps,
    displayMode,
    loopEnd,
    loopStart,
    onLoopChange,
    onSeek,
    onSeekCommit,
    safeDuration,
    signature,
    tempo,
    viewEnd,
    viewStart,
  };

  const timeFromPointer = useCallback(clientX => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return clamp(viewStart + (clientX - rect.left) / rect.width * viewDuration, viewStart, viewEnd);
  }, [viewDuration, viewEnd, viewStart]);

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
      if (drag.kind.startsWith("zoom-")) {
        const rect = zoomRef.current?.getBoundingClientRect();
        if (!rect?.width) return;
        const delta = (event.clientX - drag.clientX) / rect.width * currentDuration;
        const minimumWidth = Math.max(1 / Math.max(1, currentFps), currentDuration / 1000);
        if (drag.kind === "zoom-pan") {
          const width = drag.end - drag.start;
          const start = clamp(drag.start + delta, 0, Math.max(0, currentDuration - width));
          setViewRange({ start, end: start + width });
        } else if (drag.kind === "zoom-start") {
          setViewRange({ start: clamp(drag.start + delta, 0, drag.end - minimumWidth), end: drag.end });
        } else if (drag.kind === "zoom-end") {
          setViewRange({ start: drag.start, end: clamp(drag.end + delta, drag.start + minimumWidth, currentDuration) });
        }
        return;
      }
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect?.width) return;
      const currentViewStart = interactionRef.current.viewStart;
      const currentViewEnd = interactionRef.current.viewEnd;
      const currentViewDuration = currentViewEnd - currentViewStart;
      const rawTime = clamp(currentViewStart + (event.clientX - rect.left) / rect.width * currentViewDuration, currentViewStart, currentViewEnd);
      // The playhead has a generous label-sized target. Preserve where within
      // that target it was grabbed so the marker does not jump under the
      // pointer before the user begins dragging.
      const offsetTime = drag.kind === "playhead" ? (drag.playheadOffset || 0) : 0;
      const offsetRawTime = clamp(rawTime + offsetTime, currentViewStart, currentViewEnd);
      const snapLevel = snapLevelFromPointer(event);
      const time = snapLevel && drag.kind !== "loop-range"
        ? snapTimelineTime(offsetRawTime, currentDuration, interactionRef.current.displayMode, interactionRef.current, snapLevel)
        : offsetRawTime;
      if (drag.kind === "playhead") {
        drag.time = time;
        seek(time);
      } else if (drag.kind === "loop-start") {
        changeLoop(Math.min(time, currentLoopEnd - 1 / currentFps), currentLoopEnd);
      } else if (drag.kind === "loop-end") {
        changeLoop(currentLoopStart, Math.max(time, currentLoopStart + 1 / currentFps));
      } else if (drag.kind === "loop-range") {
        const width = drag.end - drag.start;
        const rawStart = clamp(time - drag.offset, 0, Math.max(0, currentDuration - width));
        const nextStart = snapLevel
          ? clamp(snapTimelineTime(rawStart, currentDuration, interactionRef.current.displayMode, interactionRef.current, snapLevel), 0, Math.max(0, currentDuration - width))
          : rawStart;
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

  const fitWholeTimeline = useCallback(() => setViewRange({ start: 0, end: safeDuration }), [safeDuration]);
  const fitLoop = useCallback(() => {
    if (loopEnd <= loopStart) return;
    const minimumWidth = Math.max(1 / Math.max(1, fps), safeDuration / 1000);
    const start = clamp(loopStart, 0, Math.max(0, safeDuration - minimumWidth));
    const end = clamp(loopEnd, start + minimumWidth, safeDuration);
    setViewRange({
      start,
      end,
    });
  }, [fps, loopEnd, loopStart, safeDuration]);
  const beginZoomDrag = (event, kind) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.metaKey) {
      event.preventDefault();
      fitWholeTimeline();
      return;
    }
    if (event.altKey) {
      event.preventDefault();
      fitLoop();
      return;
    }
    beginDrag(event, {
      kind,
      clientX: event.clientX,
      start: viewStart,
      end: viewEnd,
    });
  };

  const startPlayheadDrag = event => {
    if (event.button !== 0) return;
    const rawTime = timeFromPointer(event.clientX);
    const snapLevel = snapLevelFromPointer(event);
    const time = snapLevel ? snapTimelineTime(rawTime, safeDuration, displayMode, options, snapLevel) : rawTime;
    if (event.shiftKey) {
      onLoopEnabledChange(true);
      onLoopChange(time, Math.min(safeDuration, time + Math.max(1 / fps, safeDuration * 0.01)));
      beginDrag(event, { kind: "loop-end" });
      return;
    }
    onSeek(time);
    beginDrag(event, { kind: "playhead", time });
  };

  const grabExistingPlayhead = event => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const rawTime = timeFromPointer(event.clientX);
    beginDrag(event, {
      kind: "playhead",
      time: currentTime,
      // The hit target intentionally extends over the frame label, which is
      // offset to the right of the line. Holding this offset keeps a label
      // drag anchored to the current playhead until it is moved.
      playheadOffset: currentTime - rawTime,
    });
  };

  const percentInView = time => (time - viewStart) / viewDuration * 100;
  const playheadVisible = currentTime >= viewStart && currentTime <= viewEnd;
  const playheadPercent = percentInView(currentTime);
  const visibleLoopStart = clamp(loopStart, viewStart, viewEnd);
  const visibleLoopEnd = clamp(loopEnd, viewStart, viewEnd);
  const loopVisible = loopEnabled && visibleLoopEnd > visibleLoopStart;
  const loopStartPercent = percentInView(visibleLoopStart);
  const loopEndPercent = percentInView(visibleLoopEnd);
  const zoomStartPercent = viewStart / safeDuration * 100;
  const zoomEndPercent = viewEnd / safeDuration * 100;
  return (
    <div className="iannix-timeline" aria-label="Score timeline">
      <div className="iannix-timeline-ruler" aria-hidden="true">
        {ticks.map(tick => (
          <div className={`iannix-timeline-tick ${tick.major ? "major" : "minor"}`} key={tick.time} style={{ left: `${tick.percent}%` }}>
            {tick.showLabel !== false ? <span>{formatTimelinePosition(tick.time, displayMode, options)}</span> : null}
          </div>
        ))}
      </div>
      <div
        ref={trackRef}
        className="iannix-timeline-track"
        onPointerDown={startPlayheadDrag}
        title="Drag to seek · Command-drag snaps units · Command-Shift snaps subunits · Shift-drag marks a loop"
      >
        {ticks.map(tick => <i className={`iannix-timeline-gridline ${tick.major ? "major" : "minor"}`} key={tick.time} style={{ left: `${tick.percent}%` }} />)}
        <div className="iannix-timeline-key-lane" aria-label="Object automation keyframes">
          {automationKeys.filter(key => key.time >= viewStart && key.time <= viewEnd).map(key => <i key={`${key.elementId}-${key.path}-${key.id}`} className="iannix-timeline-key" style={{ left: `${percentInView(key.time)}%` }} title={`${key.path} · ${formatTimelinePosition(key.time, displayMode, options)}`} />)}
        </div>
        {loopVisible ? (
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
            {loopStart >= viewStart && loopStart <= viewEnd ? <button
                type="button"
                className="iannix-timeline-loop-handle start"
                style={{ left: `${percentInView(loopStart)}%` }}
                onPointerDown={event => {
                  event.stopPropagation();
                  beginDrag(event, { kind: "loop-start" });
                }}
                aria-label="Set loop start"
                title={`Loop start ${formatTimelinePosition(loopStart, displayMode, options)}`}
              /> : null}
            {loopEnd >= viewStart && loopEnd <= viewEnd ? <button
                type="button"
                className="iannix-timeline-loop-handle end"
                style={{ left: `${percentInView(loopEnd)}%` }}
                onPointerDown={event => {
                  event.stopPropagation();
                  beginDrag(event, { kind: "loop-end" });
                }}
                aria-label="Set loop end"
                title={`Loop end ${formatTimelinePosition(loopEnd, displayMode, options)}`}
              /> : null}
          </>
        ) : null}
        {playheadVisible ? <>
          <div className="iannix-timeline-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true">
            <span>{formatTimelinePosition(currentTime, "frame", options)}</span>
          </div>
          <button
            type="button"
            className="iannix-timeline-playhead-hitbox"
            style={{ left: `${playheadPercent}%` }}
            onPointerDown={grabExistingPlayhead}
            aria-label={`Drag playhead at ${formatTimelinePosition(currentTime, "frame", options)}`}
            title="Drag playhead"
          />
        </> : null}
      </div>
      <div
        ref={zoomRef}
        className="iannix-timeline-zoom"
        role="group"
        aria-label="Timeline zoom window"
        title="Drag to pan · Drag edges to zoom · Command-click fits score · Option-click fits loop"
        onPointerDown={event => {
          if (event.metaKey || event.altKey) beginZoomDrag(event, "zoom-pan");
        }}
      >
        <div
          className="iannix-timeline-zoom-window"
          style={{ left: `${zoomStartPercent}%`, width: `${Math.max(0.2, zoomEndPercent - zoomStartPercent)}%` }}
          onPointerDown={event => beginZoomDrag(event, "zoom-pan")}
        >
          <button type="button" className="iannix-timeline-zoom-handle start" aria-label="Resize timeline view from start" onPointerDown={event => beginZoomDrag(event, "zoom-start")} />
          <button type="button" className="iannix-timeline-zoom-handle end" aria-label="Resize timeline view from end" onPointerDown={event => beginZoomDrag(event, "zoom-end")} />
        </div>
      </div>
    </div>
  );
});

export default TransportTimeline;
