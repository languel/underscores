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

const mouseAction = event => {
  const button = typeof event?.button === "number"
    ? ({ 0: "left", 1: "middle", 2: "right" }[event.button] || "")
    : String(event?.button || "").toLowerCase();
  const detail = String(event?.detail || "").toLowerCase();
  if (!button && ["up", "down", "left", "right"].includes(detail)) return "scroll";
  if (button === "left" || button === "right") return button;
  return "middle";
};

const MouseGlyph = ({ event, compact = false }) => {
  const action = mouseAction(event);
  return (
    <svg
      className={`underscores-screencast-input-mouse-glyph is-${action}${compact ? " is-compact" : ""}`}
      viewBox="0 0 24 26"
      fill="none"
      aria-hidden="true"
    >
      {action === "left" ? <path className="underscores-screencast-input-mouse-button-fill" d="M4 10V9a8 8 0 0 1 8-8v9Z" /> : null}
      {action === "right" ? <path className="underscores-screencast-input-mouse-button-fill" d="M12 1a8 8 0 0 1 8 8v1h-8Z" /> : null}
      <rect x="4" y="1" width="16" height="24" rx="8" />
      <path d="M12 1v9M4.5 10h15" />
      {action === "scroll" ? <path d="M12 4.5v11" className="underscores-screencast-input-mouse-wheel" /> : null}
    </svg>
  );
};

const HandToolGlyph = ({ compact = false }) => (
  <svg className={`underscores-screencast-input-hand-glyph${compact ? " is-compact" : ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7.2 13.7V8.4a1.15 1.15 0 0 1 2.3 0v3.1V6.6a1.15 1.15 0 0 1 2.3 0v4.9V7.8a1.15 1.15 0 0 1 2.3 0v4.1V9.3a1.15 1.15 0 0 1 2.3 0v5.1c0 3.3-2.2 5.5-5.2 5.5h-.3c-2.1 0-3.8-1-4.8-2.8L4.8 14a1.2 1.2 0 0 1 2.4-.3Z" />
  </svg>
);

const ToolGlyph = ({ tool, compact = false }) => tool === "hand"
  ? <HandToolGlyph compact={compact} />
  : <span className={`underscores-screencast-input-tool-glyph${compact ? " is-compact" : ""}`} aria-hidden="true">{screencastToolIcon(tool)}</span>;

const KeyboardGlyph = ({ event, compact = false }) => (
  <svg
    className={`underscores-screencast-input-key-glyph${compact ? " is-compact" : ""}`}
    viewBox="0 0 24 18"
    fill="none"
    title={compact ? undefined : keyChord(event)}
    aria-label={compact ? "Keyboard input" : `Key ${keyChord(event)}`}
    role="img"
  >
    <rect x="1.5" y="2.5" width="21" height="13" rx="2" />
    <path d="M5 6h1M8 6h1M11 6h1M14 6h1M17 6h1M5 9h1M8 9h1M11 9h1M14 9h1M17 9h1M5 12h7M14 12h5" />
  </svg>
);

const EventGlyph = ({ event, activeTool, compact = false }) => {
  if (event?.kind === "pointer") return <MouseGlyph event={event} compact={compact} />;
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
            ? <>
              <strong className="underscores-screencast-input-current-label">{currentValue}</strong>
              {currentDetail ? <code>{currentDetail}</code> : null}
            </>
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
