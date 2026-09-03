import React, { useEffect, useRef, useState } from "react";
import {
  clampScreencastPosition,
  readScreencastPosition,
  screencastToolIcon,
  screencastToolLabel,
  writeScreencastPosition,
} from "./screencastInput.js";

const MAX_VISIBLE_EVENTS = 6;

const eventIcon = (event, activeTool) => event?.kind === "key"
  ? "⌨"
  : event?.kind === "pointer"
    ? "🖱︎"
    : event?.kind === "tool"
      ? screencastToolIcon(event.tool)
      : event?.icon || (event ? "•" : screencastToolIcon(activeTool));

const eventValue = event => {
  if (!event) return "Ready";
  if (event.kind === "key") {
    const key = String(event.detail || "").split(" · ")[0];
    if (key) return key;
  }
  if (event.kind === "tool") return event.detail || screencastToolLabel(event.tool);
  const label = String(event.label || "Event");
  const separator = label.lastIndexOf(" · ");
  return separator >= 0 ? label.slice(separator + 3) : label;
};

const eventDetail = event => {
  if (!event?.detail) return "";
  if (event.kind === "key") return String(event.detail).split(" · ").slice(1).join(" · ");
  if (event.kind === "tool") return "";
  return String(event.detail);
};

export default function ScreencastInputOverlay({ events = [], activeTool = "selection", minimal = false, onClose }) {
  const [position, setPosition] = useState(readScreencastPosition);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const overlayRef = useRef(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    const clamp = () => {
      const bounds = overlayRef.current?.getBoundingClientRect?.();
      setPosition(previous => {
        const nextPosition = clampScreencastPosition(previous, { width: window.innerWidth, height: window.innerHeight }, bounds);
        positionRef.current = nextPosition;
        return nextPosition;
      });
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  useEffect(() => {
    if (!dragging) return undefined;
    const move = event => {
      const drag = dragRef.current;
      if (!drag) return;
      const bounds = overlayRef.current?.getBoundingClientRect?.();
      const nextPosition = clampScreencastPosition({ x: drag.x + event.clientX - drag.clientX, y: drag.y + event.clientY - drag.clientY }, { width: window.innerWidth, height: window.innerHeight }, bounds);
      positionRef.current = nextPosition;
      setPosition(nextPosition);
    };
    const end = () => {
      setDragging(false);
      dragRef.current = null;
      writeScreencastPosition(positionRef.current);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
    };
  }, [dragging]);

  const beginDrag = event => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, x: positionRef.current.x, y: positionRef.current.y };
    setDragging(true);
  };

  const currentEvent = events.at(-1) || null;
  const visibleEvents = events.slice(-(MAX_VISIBLE_EVENTS + 1), -1);
  const currentValue = eventValue(currentEvent);
  const currentDetail = eventDetail(currentEvent);
  return (
    <aside
      ref={overlayRef}
      className={`underscores-screencast-input${minimal ? " is-minimal" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      aria-label={minimal ? "Screencast input (minimal)" : "Screencast input"}
      data-screencast-input
    >
      <header className="underscores-screencast-input-header" onPointerDown={beginDrag} title="Drag to reposition screencast input">
        <span className="underscores-screencast-input-current-icon" aria-hidden="true">{eventIcon(currentEvent, activeTool)}</span>
        <span className="underscores-screencast-input-current">
          <strong className="underscores-screencast-input-current-label">{currentValue}</strong>
          {currentDetail ? <code>{currentDetail}</code> : null}
        </span>
        {currentEvent?.kind !== "tool" ? <span className="underscores-screencast-input-active-tool" title={`Active tool: ${screencastToolLabel(activeTool)}`}>
          <span aria-hidden="true">{screencastToolIcon(activeTool)}</span>
          <span>{screencastToolLabel(activeTool)}</span>
        </span> : null}
        <button type="button" onClick={onClose} aria-label="Close screencast input" title="Close screencast input">×</button>
      </header>
      {!minimal && <div className="underscores-screencast-input-events" aria-live="polite">
        {visibleEvents.length === 0 ? <span className="underscores-screencast-input-empty">Waiting for input…</span> : visibleEvents.map(event => (
          <div className={`underscores-screencast-input-event is-${event.kind || "input"}`} key={event.id}>
            <span className="underscores-screencast-input-event-icon" aria-hidden="true">{eventIcon(event, activeTool)}</span>
            <span className="underscores-screencast-input-event-label">{eventValue(event)}</span>
            {eventDetail(event) ? <code>{eventDetail(event)}</code> : null}
          </div>
        ))}
      </div>}
    </aside>
  );
}
