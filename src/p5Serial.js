export const P5_SERIAL_EVENT_NAMES = Object.freeze(["connect", "disconnect", "data", "error"]);

const decodeChunk = value => {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return new TextDecoder().decode(value);
  } catch {
    return "";
  }
};

const encodeChunk = value => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new TextEncoder().encode(String(value ?? ""));
};

// A tiny Web Serial wrapper for a single p5 frame. Browser permission remains
// deliberately user-initiated: sketches must call requestPort() from a mouse
// or keyboard callback before a browser will reveal a device.
export const createP5SerialBridge = ({ serialApi = globalThis.navigator?.serial, onEvent } = {}) => {
  const listeners = new Map(P5_SERIAL_EVENT_NAMES.map(type => [type, new Set()]));
  let activePort = null;
  let activeReader = null;
  let reading = null;
  let disposed = false;

  const emit = (type, detail = {}) => {
    const event = { type, ...detail };
    listeners.get(type)?.forEach(listener => {
      try { listener(event); } catch { /* a sketch listener must not break its siblings */ }
    });
    try { onEvent?.(event); } catch { /* p5 reports callback errors at the host */ }
    return event;
  };

  const stopReading = async () => {
    const reader = activeReader;
    activeReader = null;
    try { await reader?.cancel?.(); } catch { /* a disconnected port cannot be cancelled */ }
    try { await reading; } catch { /* the read loop already reported genuine failures */ }
    reading = null;
  };

  const beginReading = port => {
    if (!port?.readable || reading) return;
    reading = (async () => {
      const reader = port.readable.getReader();
      activeReader = reader;
      try {
        while (!disposed && activePort === port) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value !== undefined) emit("data", { port, data: value, text: decodeChunk(value) });
        }
      } catch (error) {
        if (!disposed && activePort === port) emit("error", { port, error });
      } finally {
        if (activeReader === reader) activeReader = null;
        try { reader.releaseLock(); } catch { /* port already released the stream */ }
      }
    })();
  };

  const connect = async (port, options = {}) => {
    if (!port) throw new Error("Choose a serial port first.");
    if (activePort && activePort !== port) await bridge.disconnect();
    activePort = port;
    if (!port.readable && typeof port.open === "function") {
      const baudRate = Math.max(1, Number(options.baudRate) || 9600);
      await port.open({ ...options, baudRate });
    }
    emit("connect", { port });
    beginReading(port);
    return port;
  };

  const nativeConnect = event => emit("connect", { port: event.port, native: true });
  const nativeDisconnect = event => {
    const port = event.port;
    emit("disconnect", { port, native: true });
    if (port === activePort) {
      activePort = null;
      void stopReading();
    }
  };
  serialApi?.addEventListener?.("connect", nativeConnect);
  serialApi?.addEventListener?.("disconnect", nativeDisconnect);

  const bridge = {
    get supported() { return Boolean(serialApi?.requestPort); },
    get port() { return activePort; },
    on(type, listener) {
      if (!listeners.has(type) || typeof listener !== "function") return () => {};
      listeners.get(type).add(listener);
      return () => listeners.get(type)?.delete(listener);
    },
    off(type, listener) { listeners.get(type)?.delete(listener); },
    async getPorts() {
      if (!serialApi?.getPorts) return [];
      return serialApi.getPorts();
    },
    async requestPort(options = {}) {
      if (!serialApi?.requestPort) throw new Error("Web Serial is unavailable in this browser.");
      const { filters, ...openOptions } = options || {};
      const port = await serialApi.requestPort(filters ? { filters } : undefined);
      return connect(port, openOptions);
    },
    connect,
    async write(value) {
      if (!activePort?.writable) throw new Error("Open a serial port before writing.");
      const writer = activePort.writable.getWriter();
      try {
        await writer.write(encodeChunk(value));
      } finally {
        writer.releaseLock();
      }
    },
    async disconnect({ close = true } = {}) {
      const port = activePort;
      activePort = null;
      await stopReading();
      if (close) {
        try { await port?.close?.(); } catch { /* physical disconnect already closed it */ }
      }
      if (port) emit("disconnect", { port });
    },
    dispose() {
      disposed = true;
      serialApi?.removeEventListener?.("connect", nativeConnect);
      serialApi?.removeEventListener?.("disconnect", nativeDisconnect);
      void bridge.disconnect();
      listeners.forEach(set => set.clear());
    },
  };

  return bridge;
};
