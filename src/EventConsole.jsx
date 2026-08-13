import { useEffect, useRef, useState } from "react";
import PerformanceOverlay from "./PerformanceOverlay.jsx";
import { infoProps } from "./uiInfo.js";

const MAX_VISIBLE_EVENTS = 500;
const LOGGING_STORAGE_KEY = "drawerator_console_logging";
const POLL_STORAGE_KEY = "drawerator_console_poll_frequency";
const FILTERS_STORAGE_KEY = "drawerator_console_event_filters";
const POLL_FREQUENCIES = [50, 100, 250, 500, 1000];
const EVENT_CATEGORIES = ["command", "history", "input", "media", "brush", "status", "error", "script", "iannix", "physics", "midi", "macro", "transport", "automation", "presentation", "settings", "ai"];
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

const readStoredEventFilters = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) || "");
    const filters = Array.isArray(parsed)
      ? parsed.filter(filter => filter === "all" || EVENT_CATEGORIES.includes(filter))
      : [];
    return filters.length ? filters : ["all"];
  } catch {
    return ["all"];
  }
};

const eventMatchesFilters = (event, filters) =>
  filters.includes("all") || filters.includes(event.name.split(".")[0]);

const eventFilterSummary = filters => {
  if (filters.includes("all")) return "All";
  if (filters.length === 1) return filters[0];
  return `${filters.length} types`;
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

const exportableEvent = event => ({
  time: event.time,
  timeSeconds: Number((event.time / 1000).toFixed(6)),
  name: event.name,
  source: event.source,
  detail: event.detail,
});

const SendIcon = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

export default function EventConsole({
  eventBus,
  commandRegistry,
  transportTime = 0,
  liveStatus = [],
  showPerformanceMonitor = false,
  onPerformancePlacementChange,
  onPerformanceClose,
  onSlashCommand,
  globalStatus = "",
}) {
  const initialLoggingRef = useRef(readStoredLogging());
  const [events, setEvents] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [eventFilters, setEventFilters] = useState(readStoredEventFilters);
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
      setEvents(previous => [...previous, ...unseen].slice(-MAX_VISIBLE_EVENTS));
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
      if (source.startsWith("/")) {
        const handled = await onSlashCommand?.(source);
        if (!handled) throw new Error("Unknown slash command. Use the command palette to find a command.");
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

  const getLogText = () => JSON.stringify({
    exportedAt: new Date().toISOString(),
    filters: eventFilters,
    events: visibleEvents.map(exportableEvent),
  }, null, 2);

  const copyLog = async () => {
    if (!visibleEvents.length) return;
    try {
      await navigator.clipboard.writeText(getLogText());
      setStatus(`Copied ${visibleEvents.length} log event${visibleEvents.length === 1 ? "" : "s"}`);
    } catch {
      setStatus("Copy failed");
    }
  };

  const exportLog = () => {
    if (!visibleEvents.length) return;
    const blob = new Blob([getLogText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `drawerator-event-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Exported ${visibleEvents.length} log event${visibleEvents.length === 1 ? "" : "s"}`);
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

  const updateEventFilters = next => {
    const filters = next.length ? next : ["all"];
    setEventFilters(filters);
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  };

  const toggleEventFilter = category => {
    if (category === "all") {
      updateEventFilters(["all"]);
      return;
    }
    if (eventFilters.includes("all")) {
      updateEventFilters(EVENT_CATEGORIES.filter(filter => filter !== category));
      return;
    }
    const withoutAll = eventFilters.filter(filter => filter !== "all");
    const next = withoutAll.includes(category)
      ? withoutAll.filter(filter => filter !== category)
      : [...withoutAll, category];
    updateEventFilters(next);
  };

  const visibleEvents = events.filter(event => eventMatchesFilters(event, eventFilters));

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
        <div className={`event-console-global-status${globalStatus ? " has-status" : ""}`} role="status" aria-live="polite" title={globalStatus || undefined}>
          {globalStatus}
        </div>
      </div>
      {showPerformanceMonitor ? <PerformanceOverlay placement="console" onPlacementChange={onPerformancePlacementChange} onClose={onPerformanceClose} /> : null}
      <div className="event-console-toolbar">
        <span>{visibleEvents.length}{visibleEvents.length !== events.length ? ` / ${events.length}` : ""} events</span>
        <div className="event-console-toolbar-controls">
          <details className="event-console-filter-menu" {...infoProps("Event types", "Choose one or more event categories to display. The log keeps recent events while filters change.")}>
            <summary>Types · {eventFilterSummary(eventFilters)}</summary>
            <div className="event-console-filter-options">
              <label>
                <input type="checkbox" checked={eventFilters.includes("all")} onChange={() => toggleEventFilter("all")} />
                <span>All</span>
              </label>
              {EVENT_CATEGORIES.map(category => <label key={category}>
                <input type="checkbox" checked={eventFilters.includes("all") || eventFilters.includes(category)} onChange={() => toggleEventFilter(category)} />
                <span>{category}</span>
              </label>)}
            </div>
          </details>
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
          <button type="button" onClick={copyLog} disabled={!visibleEvents.length} title="Copy visible log as JSON">Copy</button>
          <button type="button" onClick={exportLog} disabled={!visibleEvents.length} title="Export visible log as JSON">Export</button>
          <button type="button" onClick={clearEvents}>Clear</button>
        </div>
      </div>
      <div className="event-console-output" ref={outputRef} role="log" aria-live="off">
        {visibleEvents.length === 0 ? <div className="event-console-empty">{loggingEnabled ? (events.length ? "No captured events match these types." : "Events will appear here.") : "Event logging is off. Live status remains above."}</div> : visibleEvents.map(event => (
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
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              runInput();
            }
          }}
          placeholder="Paste /command or event JSON · Enter to run · Shift+Enter for a new line"
          aria-label="Console input"
          rows={2}
          {...infoProps("Console input", "Run a /command invocation, replay copied event JSON, or emit an event object. Enter runs; Shift+Enter adds a line.")}
        />
        <button type="button" className="event-console-submit" onClick={runInput} title="Run console input (Enter)" aria-label="Run console input"><SendIcon /></button>
      </div>
      <div className={`event-console-status ${status && status !== "Executed" && !status.startsWith("Copied") ? "error" : ""}`}>{status}</div>
    </div>
  );
}
