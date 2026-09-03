import React, { useEffect, useRef, useState } from "react";
import {
  clampScreencastPosition,
  readScreencastPosition,
  screencastToolIcon,
  screencastToolLabel,
  writeScreencastPosition,
} from "./screencastInput.js";

const MAX_VISIBLE_EVENTS = 4;

const KEY_DISPLAY_LABELS = Object.freeze({
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  Delete: "⌦",
});

const keyChord = event => {
  const chord = String(event?.detail || "").split(" · ")[0] || "Key";
  return chord.replace(/Arrow(?:Down|Left|Right|Up)|Delete/g, key => KEY_DISPLAY_LABELS[key] || key);
};

const MouseGlyph = ({ compact = false }) => (
  <svg
    className={`underscores-screencast-input-mouse-glyph${compact ? " is-compact" : ""}`}
    viewBox="0 0 24 30"
    fill="none"
    aria-hidden="true"
  >
    <rect x="3.5" y="1.5" width="17" height="27" rx="8.5" />
    <path d="M12 2v8.5M4 11.5h16" />
    <path d="M12 4.5v4" className="underscores-screencast-input-mouse-wheel" />
  </svg>
);

const HandToolGlyph = ({ compact = false }) => (
  <svg className={`underscores-screencast-input-hand-glyph${compact ? " is-compact" : ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7.2 13.7V8.4a1.15 1.15 0 0 1 2.3 0v3.1V6.6a1.15 1.15 0 0 1 2.3 0v4.9V7.8a1.15 1.15 0 0 1 2.3 0v4.1V9.3a1.15 1.15 0 0 1 2.3 0v5.1c0 3.3-2.2 5.5-5.2 5.5h-.3c-2.1 0-3.8-1-4.8-2.8L4.8 14a1.2 1.2 0 0 1 2.4-.3Z" />
  </svg>
);

const ToolGlyph = ({ tool, compact = false }) => tool === "hand"
  ? <HandToolGlyph compact={compact} />
  : <span className={`underscores-screencast-input-tool-glyph${compact ? " is-compact" : ""}`} aria-hidden="true">{screencastToolIcon(tool)}</span>;

const KeyboardGlyph = ({ event, compact = false }) => (
  <kbd
    className={`underscores-screencast-input-key-glyph${compact ? " is-compact" : ""}`}
    title={compact ? undefined : keyChord(event)}
    aria-label={compact ? "Keyboard input" : `Key ${keyChord(event)}`}
  >{compact ? "⌨" : keyChord(event)}</kbd>
);

const EventGlyph = ({ event, activeTool, compact = false }) => {
  if (event?.kind === "pointer") return <MouseGlyph compact={compact} />;
  if (event?.kind === "key") return <KeyboardGlyph event={event} compact={compact} />;
  if (event?.kind === "tool") {
    return <ToolGlyph tool={event.tool} compact={compact} />;
  }
  return event ? <span className="underscores-screencast-input-tool-glyph" aria-hidden="true">{event.icon || "•"}</span> : <ToolGlyph tool={activeTool} compact={compact} />;
};

const eventValue = event => {
  if (!event) return "Ready";
  if (event.kind === "key") {
    const key = keyChord(event);
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
        <span className={`underscores-screencast-input-current-icon${currentEvent?.kind === "key" ? " is-key" : ""}`}>
          {currentEvent ? <EventGlyph event={currentEvent} activeTool={activeTool} /> : null}
        </span>
        <span className="underscores-screencast-input-current">
          {currentEvent?.kind === "key"
            ? (currentDetail ? <strong className="underscores-screencast-input-current-label">{currentDetail}</strong> : null)
            : <>
              <strong className="underscores-screencast-input-current-label">{currentValue}</strong>
              {currentDetail ? <code>{currentDetail}</code> : null}
            </>}
        </span>
        {currentEvent?.kind !== "tool" ? <span className="underscores-screencast-input-active-tool" title={`Active tool: ${screencastToolLabel(activeTool)}`} aria-label={`Active tool: ${screencastToolLabel(activeTool)}`}>
          <ToolGlyph tool={activeTool} />
        </span> : null}
        <button type="button" onClick={onClose} aria-label="Close screencast input" title="Close screencast input">×</button>
      </header>
      {!minimal && visibleEvents.length > 0 && <div className="underscores-screencast-input-events" aria-live="polite">
        {visibleEvents.map(event => (
          <div className={`underscores-screencast-input-event is-${event.kind || "input"}`} key={event.id}>
            <span className="underscores-screencast-input-event-icon"><EventGlyph event={event} activeTool={activeTool} compact /></span>
            <span className="underscores-screencast-input-event-label">{eventValue(event)}</span>
            {eventDetail(event) ? <code>{eventDetail(event)}</code> : null}
          </div>
        ))}
      </div>}
    </aside>
  );
}
