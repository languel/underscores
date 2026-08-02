import { useEffect, useRef, useState } from "react";
import { parseGenericCommandSlash } from "./commandSystem.js";
import PerformanceOverlay from "./PerformanceOverlay.jsx";
import { infoProps } from "./uiInfo.js";

const MAX_VISIBLE_EVENTS = 500;
const LOGGING_STORAGE_KEY = "drawerator_console_logging";
const POLL_STORAGE_KEY = "drawerator_console_poll_frequency";
const POLL_FREQUENCIES = [50, 100, 250, 500, 1000];
const EVENT_CATEGORIES = ["command", "history", "input", "media", "brush", "status", "iannix", "physics", "midi", "macro", "transport", "automation", "presentation", "settings", "ai"];
let consoleEventCutoff = -Infinity;

const readStoredLogging = () => {
  try {
    return localStorage.getItem(LOGGING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const readStoredPollFrequency = () => {
  try {
    const value = Number(localStorage.getItem(POLL_STORAGE_KEY));
    return POLL_FREQUENCIES.includes(value) ? value : 250;
  } catch {
    return 250;
  }
};

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

export default function EventConsole({
  eventBus,
  commandRegistry,
  transportTime = 0,
  liveStatus = [],
  showPerformanceMonitor = false,
  onPerformancePlacementChange,
  onPerformanceClose,
}) {
  const initialLoggingRef = useRef(readStoredLogging());
  const [events, setEvents] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [loggingEnabled, setLoggingEnabled] = useState(initialLoggingRef.current);
  const [pollFrequency, setPollFrequency] = useState(readStoredPollFrequency);
  const outputRef = useRef(null);
  const clearedAtRef = useRef(Math.max(consoleEventCutoff, performance.now()));

  useEffect(() => {
    if (!loggingEnabled) return undefined;
    const poll = () => {
      const unseen = eventBus.recent(MAX_VISIBLE_EVENTS).filter(event => event.time > clearedAtRef.current);
      if (!unseen.length) return;
      clearedAtRef.current = Math.max(...unseen.map(event => event.time));
      const accepted = eventFilter === "all"
        ? unseen
        : unseen.filter(event => event.name.split(".")[0] === eventFilter);
      if (accepted.length) setEvents(previous => [...previous, ...accepted].slice(-MAX_VISIBLE_EVENTS));
    };
    poll();
    const interval = window.setInterval(poll, pollFrequency);
    return () => window.clearInterval(interval);
  }, [eventBus, eventFilter, loggingEnabled, pollFrequency]);

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

  const updateLogging = enabled => {
    consoleEventCutoff = performance.now();
    clearedAtRef.current = consoleEventCutoff;
    setEvents([]);
    setLoggingEnabled(enabled);
    localStorage.setItem(LOGGING_STORAGE_KEY, String(enabled));
  };

  const updatePollFrequency = value => {
    const frequency = POLL_FREQUENCIES.includes(value) ? value : 250;
    setPollFrequency(frequency);
    localStorage.setItem(POLL_STORAGE_KEY, String(frequency));
  };

  const clearEvents = () => {
    consoleEventCutoff = performance.now();
    clearedAtRef.current = consoleEventCutoff;
    setEvents([]);
  };

  return (
    <div className="event-console">
      <div className="event-console-live-status" aria-label="Live status" aria-live="off">
        <div className="event-console-live-heading">
          <span>Live</span>
          <small>{liveStatus.length ? `${liveStatus.length} probes` : "No active probes"}</small>
        </div>
        <div className="event-console-live-items">
          {liveStatus.length === 0 ? <span className="event-console-live-empty">Brush channels and adapter states appear here, even when Log is off.</span> : liveStatus.map(item => (
            <div className={`event-console-live-row is-${item.tone || "neutral"}`} key={item.id} title={item.detail}>
              <span className="event-console-live-category">{item.category}</span>
              <strong>{item.label}</strong>
              <span className="event-console-live-state">{item.state}</span>
              <span className="event-console-live-detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>
      {showPerformanceMonitor ? <PerformanceOverlay placement="console" onPlacementChange={onPerformancePlacementChange} onClose={onPerformanceClose} /> : null}
      <div className="event-console-toolbar">
        <span>{events.length} events</span>
        <div className="event-console-toolbar-controls">
          <label {...infoProps("Event type", "Show all captured events or only one event category.")}>
            <span>Type</span>
            <select value={eventFilter} onChange={event => setEventFilter(event.target.value)}>
              <option value="all">All</option>
              {EVENT_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label {...infoProps("Event logging", "Start or stop collecting Drawerator event-bus messages in this console.")}>
            <input type="checkbox" checked={loggingEnabled} onChange={event => updateLogging(event.target.checked)} />
            <span>Log</span>
          </label>
          <label {...infoProps("Polling interval", "How often the console reads newly emitted events. Faster polling updates sooner but performs more UI work.")}>
            <span>Poll</span>
            <select value={pollFrequency} onChange={event => updatePollFrequency(Number(event.target.value))} disabled={!loggingEnabled}>
              <option value={50}>50 ms</option>
              <option value={100}>100 ms</option>
              <option value={250}>250 ms</option>
              <option value={500}>500 ms</option>
              <option value={1000}>1 s</option>
            </select>
          </label>
          <button type="button" onClick={clearEvents}>Clear</button>
        </div>
      </div>
      <div className="event-console-output" ref={outputRef} role="log" aria-live="off">
        {events.length === 0 ? <div className="event-console-empty">{loggingEnabled ? "Events will appear here." : "Event logging is off. Live status remains above."}</div> : events.map(event => (
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
          {...infoProps("Console input", "Run a /command invocation, replay copied event JSON, or emit an event object. Enter runs; Shift+Enter adds a line.")}
        />
        <button type="button" onClick={runInput}>Run</button>
      </div>
      <div className={`event-console-status ${status && status !== "Executed" && !status.startsWith("Copied") ? "error" : ""}`}>{status}</div>
    </div>
  );
}
