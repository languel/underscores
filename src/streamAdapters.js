import { normalizeInputSource } from "./streamGraph.js";

const deepValue = (value, path = "") => String(path || "").split(".").filter(Boolean).reduce((current, key) => current && typeof current === "object" ? current[key] : undefined, value);

export const parseMidiMessage = (data, time = performance.now()) => {
  const bytes = Array.from(data || []).map(Number);
  const status = bytes[0] || 0;
  const channel = (status & 0x0f) + 1;
  const command = status & 0xf0;
  const value = bytes[2] ?? 0;
  const kind = command === 0x90 && value > 0 ? "noteon"
    : command === 0x80 || (command === 0x90 && value === 0) ? "noteoff"
      : command === 0xb0 ? "cc"
        : command === 0xe0 ? "pitchbend"
          : command === 0xf0 && status === 0xf8 ? "clock" : "message";
  return Object.freeze({ kind, time, channel, status, data1: bytes[1] ?? 0, data2: value, bytes });
};

export const parseSerialRecord = (line, config = {}) => {
  const serial = normalizeInputSource({ type: "serial", serial: config.serial || config }).serial;
  const text = String(line || "").trim();
  if (!text) return null;
  if (serial.mode === "json-lines") {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Serial JSON must be an object.");
    return parsed;
  }
  const fields = text.split(serial.delimiter).map(value => value.trim());
  return Object.fromEntries(fields.map((value, index) => [`field${index}`, Number.isFinite(Number(value)) ? Number(value) : value]));
};

export const parseWebSocketJson = (payload, { osc = false } = {}) => {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") throw new Error("WebSocket payload must be a JSON object.");
  if (osc && typeof parsed.address !== "string") throw new Error("OSC-over-WebSocket JSON requires an address string.");
  return parsed;
};

export const mapAdapterRecordToSample = (record, source) => {
  const config = normalizeInputSource(source);
  const fields = config.fields || [];
  const valueAt = path => path ? deepValue(record, path) : undefined;
  if (config.kind === "space") {
    const xField = fields.find(field => field.name === "x");
    const yField = fields.find(field => field.name === "y");
    const x = Number(valueAt(xField?.path) ?? record?.x);
    const y = Number(valueAt(yField?.path) ?? record?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Mapped space sources need x and y fields.");
    return { kind: "space", x, y, space: record?.space || "scene", pressure: Number(valueAt(fields.find(field => field.name === "pressure")?.path) ?? record?.pressure) || undefined, data: record };
  }
  if (config.kind === "event") return { kind: "event", value: record, data: record };
  if (config.kind === "time") return { kind: "time", value: Number(valueAt(fields[0]?.path) ?? record?.time ?? record), data: record };
  return { kind: "value", value: valueAt(fields[0]?.path) ?? record?.value ?? record, data: record };
};

/** Browser adapters only activate through their explicit UI actions. */
export class BrowserStreamAdapterRuntime {
  constructor({ registry, onStatus = () => {} } = {}) {
    this.registry = registry;
    this.onStatus = onStatus;
    this.connections = new Map();
  }

  async connectWebSocket(source) {
    const config = normalizeInputSource(source);
    if (!/^wss?:\/\//i.test(config.endpoint)) throw new Error("WebSocket endpoints must start with ws:// or wss://.");
    this.disconnect(config.id);
    const socket = new WebSocket(config.endpoint);
    const connection = { type: "websocket", socket, source: config };
    this.connections.set(config.id, connection);
    socket.addEventListener("open", () => this.onStatus(config.id, { kind: "success", message: "Connected." }));
    socket.addEventListener("close", () => this.onStatus(config.id, { kind: "info", message: "Disconnected." }));
    socket.addEventListener("error", () => this.onStatus(config.id, { kind: "error", message: "WebSocket error." }));
    socket.addEventListener("message", event => {
      try {
        const record = parseWebSocketJson(event.data, { osc: config.type === "osc-websocket" });
        const sample = mapAdapterRecordToSample(record, config);
        this.registry.publish(config.streamId, sample, { internal: true });
      } catch (error) {
        this.onStatus(config.id, { kind: "error", message: error.message || "Could not parse message." });
      }
    });
    return socket;
  }

  disconnect(id) {
    const connection = this.connections.get(id);
    if (!connection) return false;
    connection.reader?.cancel?.().catch?.(() => {});
    connection.socket?.close?.();
    this.connections.delete(id);
    return true;
  }

  async connectSerial(source) {
    const config = normalizeInputSource(source);
    if (!navigator.serial?.requestPort) throw new Error("Web Serial is unavailable in this browser.");
    this.disconnect(config.id);
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: config.serial.baudRate });
    const connection = { type: "serial", port, source: config, reader: null };
    this.connections.set(config.id, connection);
    const decoder = new TextDecoder();
    let buffer = "";
    const read = async () => {
      const reader = port.readable?.getReader();
      connection.reader = reader;
      try {
        while (reader) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          lines.forEach(line => {
            try { this.registry.publish(config.streamId, mapAdapterRecordToSample(parseSerialRecord(line, config), config), { internal: true }); }
            catch (error) { this.onStatus(config.id, { kind: "error", message: error.message || "Could not parse serial data." }); }
          });
        }
      } finally {
        reader?.releaseLock?.();
      }
    };
    void read();
    this.onStatus(config.id, { kind: "success", message: "Serial connected." });
    return port;
  }

  dispose() { [...this.connections.keys()].forEach(id => this.disconnect(id)); }
}
