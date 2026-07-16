import { useEffect, useRef, useState } from "react";
import { parseGenericCommandSlash } from "./commandSystem.js";

const MAX_VISIBLE_EVENTS = 500;

const eventReplayText = event => {
  if (event.name === "command.before" && event.detail?.id) {
    return `/command ${event.detail.id} ${JSON.stringify(event.detail.args || {})}`;
  }
  return JSON.stringify({ name: event.name, source: event.source, detail: event.detail });
};

const eventDetailText = event => {
  try {
    return JSON.stringify(event.detail);
  } catch {
    return "[unserializable event detail]";
  }
};

export default function EventConsole({ eventBus, commandRegistry, transportTime = 0 }) {
  const [events, setEvents] = useState(() => eventBus.recent(MAX_VISIBLE_EVENTS));
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [pollFrequency, setPollFrequency] = useState(250);
  const outputRef = useRef(null);
  const clearedAtRef = useRef(-Infinity);

  useEffect(() => {
    if (!loggingEnabled) return undefined;
    const poll = () => {
      const next = eventBus.recent(MAX_VISIBLE_EVENTS).filter(event => event.time > clearedAtRef.current);
      setEvents(previous => {
        if (previous.length === next.length && previous.at(-1)?.id === next.at(-1)?.id) return previous;
        return next;
      });
    };
    poll();
    const interval = window.setInterval(poll, pollFrequency);
    return () => window.clearInterval(interval);
  }, [eventBus, loggingEnabled, pollFrequency]);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [events]);

  const runInput = async () => {
    const source = input.trim();
    if (!source) return;
    try {
      if (source.startsWith("/command")) {
        const parsed = parseGenericCommandSlash(source, commandRegistry.list().map(command => command.id));
        if (!parsed || parsed.error) throw new Error(parsed?.error || "Invalid command invocation.");
        await commandRegistry.execute(parsed.id, parsed.args, { source: "console", transportTime });
      } else {
        const event = JSON.parse(source);
        if (event.name === "command.before" && event.detail?.id) {
          await commandRegistry.execute(event.detail.id, event.detail.args || {}, { source: "console", transportTime });
        } else if (event.id) {
          await commandRegistry.execute(event.id, event.args || {}, { source: "console", transportTime });
        } else if (event.name) {
          eventBus.emit(event.name, event.detail || {}, { source: "console-replay" });
        } else {
          throw new Error("Expected a /command invocation or event JSON with name or id.");
        }
      }
      setStatus("Executed");
      setInput("");
    } catch (error) {
      setStatus(error.message || "Could not execute console input.");
    }
  };

  const copyEvent = async event => {
    try {
      await navigator.clipboard.writeText(eventReplayText(event));
      setStatus("Copied replay input");
    } catch {
      setStatus("Copy failed");
    }
  };

  return (
    <div className="event-console">
      <div className="event-console-toolbar">
        <span>{events.length} events</span>
        <div className="event-console-toolbar-controls">
          <label>
            <input type="checkbox" checked={loggingEnabled} onChange={event => setLoggingEnabled(event.target.checked)} />
            <span>Log</span>
          </label>
          <label>
            <span>Poll</span>
            <select value={pollFrequency} onChange={event => setPollFrequency(Number(event.target.value))} disabled={!loggingEnabled}>
              <option value={50}>50 ms</option>
              <option value={100}>100 ms</option>
              <option value={250}>250 ms</option>
              <option value={500}>500 ms</option>
              <option value={1000}>1 s</option>
            </select>
          </label>
          <button type="button" onClick={() => {
            clearedAtRef.current = performance.now();
            setEvents([]);
          }}>Clear</button>
        </div>
      </div>
      <div className="event-console-output" ref={outputRef} role="log" aria-live="off">
        {events.length === 0 ? <div className="event-console-empty">Events will appear here.</div> : events.map(event => (
          <div className="event-console-row" key={event.id}>
            <button type="button" className="event-console-copy" onClick={() => copyEvent(event)} title="Copy replay input">⧉</button>
            <span className="event-console-time">{(event.time / 1000).toFixed(3)}</span>
            <span className="event-console-source">[{event.source}]</span>
            <span className="event-console-name">{event.name}</span>
            <span className="event-console-detail">{eventDetailText(event)}</span>
          </div>
        ))}
      </div>
      <div className="event-console-input-row">
        <span className="event-console-prompt">&gt;</span>
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              runInput();
            }
          }}
          placeholder="Paste /command … or event JSON"
          aria-label="Console input"
          rows={2}
        />
        <button type="button" onClick={runInput}>Run</button>
      </div>
      <div className={`event-console-status ${status && status !== "Executed" && !status.startsWith("Copied") ? "error" : ""}`}>{status}</div>
    </div>
  );
}
