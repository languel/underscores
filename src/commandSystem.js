const cloneValue = value => {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const matchesPattern = (pattern, eventName) => {
  if (pattern === "*" || pattern === eventName) return true;
  if (pattern.endsWith(".*")) return eventName.startsWith(pattern.slice(0, -1));
  return false;
};

export class UnderscoreEventBus {
  constructor({ maxEvents = 1000, now = () => performance.now() } = {}) {
    this.maxEvents = maxEvents;
    this.now = now;
    this.listeners = new Map();
    this.events = [];
  }

  emit(name, detail = {}, metadata = {}) {
    const event = Object.freeze({
      id: metadata.id || crypto.randomUUID(),
      name,
      time: metadata.time ?? this.now(),
      source: metadata.source || "app",
      detail: cloneValue(detail),
    });
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
    for (const [pattern, listeners] of this.listeners) {
      if (!matchesPattern(pattern, name)) continue;
      for (const listener of listeners) listener(event);
    }
    return event;
  }

  subscribe(pattern, listener) {
    if (typeof pattern === "function") {
      listener = pattern;
      pattern = "*";
    }
    const listeners = this.listeners.get(pattern) || new Set();
    listeners.add(listener);
    this.listeners.set(pattern, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(pattern);
    };
  }

  recent(limit = 100) {
    return this.events.slice(-Math.max(0, limit));
  }
}

const validateCommand = command => {
  if (!command || typeof command !== "object") throw new Error("Command must be an object.");
  if (!command.id || typeof command.id !== "string") throw new Error("Command id is required.");
  if (typeof command.execute !== "function") throw new Error(`Command ${command.id} requires execute().`);
};

const redactSensitiveArgs = (args, sensitiveArgs = []) => {
  const redacted = cloneValue(args);
  for (const path of sensitiveArgs) {
    const segments = String(path).split(".").filter(Boolean);
    let target = redacted;
    for (let index = 0; target && index < segments.length - 1; index += 1) target = target[segments[index]];
    if (target && Object.prototype.hasOwnProperty.call(target, segments.at(-1))) target[segments.at(-1)] = "[REDACTED]";
  }
  return redacted;
};

export const parseGenericCommandSlash = (value, commandIds = []) => {
  const match = /^\/command\s+([^\s]+)(?:\s+([\s\S]+))?$/i.exec(String(value || "").trim());
  if (!match) return null;
  if (!commandIds.includes(match[1])) return { error: `Unknown Underscore command: ${match[1]}` };
  try {
    return { id: match[1], args: match[2] ? JSON.parse(match[2]) : {} };
  } catch (error) {
    return { error: `Invalid command JSON: ${error.message}` };
  }
};

export class UnderscoreCommandRegistry {
  constructor({ eventBus = new UnderscoreEventBus(), contextProvider = () => ({}) } = {}) {
    this.eventBus = eventBus;
    this.contextProvider = contextProvider;
    this.commands = new Map();
    this.listeners = new Set();
  }

  register(command) {
    validateCommand(command);
    const normalized = Object.freeze({
      version: 1,
      title: command.id,
      aliases: [],
      category: "General",
      record: "always",
      sensitiveArgs: [],
      ...command,
    });
    this.commands.set(normalized.id, normalized);
    this.notify();
    return () => {
      if (this.commands.get(normalized.id) === normalized) {
        this.commands.delete(normalized.id);
        this.notify();
      }
    };
  }

  replace(commands) {
    const next = new Map();
    for (const command of commands) {
      validateCommand(command);
      next.set(command.id, Object.freeze({
        version: 1,
        title: command.name || command.id,
        aliases: [],
        category: "General",
        record: "always",
        sensitiveArgs: [],
        ...command,
      }));
    }
    this.commands = next;
    this.notify();
  }

  list() {
    return [...this.commands.values()].map(command => ({
      id: command.id,
      version: command.version,
      title: command.title || command.name,
      name: command.name || command.title,
      aliases: [...(command.aliases || [])],
      category: command.category,
      args: cloneValue(command.args || null),
      record: command.record,
      description: command.description || "",
      ai: cloneValue(command.ai || null),
    }));
  }

  describe(id) {
    const command = this.commands.get(id);
    if (!command) return null;
    return this.list().find(candidate => candidate.id === id) || null;
  }

  find(query) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return this.list();
    return this.list().filter(command => [
      command.id,
      command.title,
      command.category,
      ...(command.aliases || []),
    ].some(value => String(value || "").toLowerCase().includes(normalized)));
  }

  async execute(id, args = {}, options = {}) {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown Underscore command: ${id}`);
    const validatedArgs = command.validate ? command.validate(cloneValue(args)) : cloneValue(args);
    const metadata = {
      invocationId: options.invocationId || crypto.randomUUID(),
      source: options.source || "api",
      record: options.record !== false && command.record !== "never",
      groupId: options.groupId || null,
      transportTime: options.transportTime,
      duration: Math.max(0, Number(options.duration) || 0),
      presentation: command.record === "presentation" || options.presentation === true,
    };
    const recordedArgs = redactSensitiveArgs(validatedArgs, command.sensitiveArgs);
    this.eventBus.emit("command.before", { id, version: command.version, args: recordedArgs, metadata }, metadata);
    try {
      const result = await command.execute(validatedArgs, this.contextProvider(), metadata);
      const detail = { id, version: command.version, args: recordedArgs, metadata, result: cloneValue(result) };
      this.eventBus.emit("command.after", detail, metadata);
      for (const listener of this.listeners) listener(detail);
      return result;
    } catch (error) {
      this.eventBus.emit("command.error", {
        id,
        version: command.version,
        args: recordedArgs,
        metadata,
        message: error?.message || String(error),
      }, metadata);
      throw error;
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeRegistry(listener) {
    this.registryListener = this.registryListener || new Set();
    this.registryListener.add(listener);
    return () => this.registryListener.delete(listener);
  }

  notify() {
    for (const listener of this.registryListener || []) listener(this.list());
  }
}

export const normalizeInputSample = (sample, defaults = {}) => {
  if (!sample || typeof sample !== "object") throw new Error("Input sample must be an object.");
  const sceneX = Number(sample.scene?.x ?? sample.x);
  const sceneY = Number(sample.scene?.y ?? sample.y);
  if (!Number.isFinite(sceneX) || !Number.isFinite(sceneY)) {
    throw new Error("Input sample requires finite scene coordinates.");
  }
  return Object.freeze({
    id: sample.id || crypto.randomUUID(),
    source: sample.source || defaults.source || "pointer",
    deviceId: sample.deviceId || defaults.deviceId || "primary",
    pointerId: sample.pointerId ?? defaults.pointerId ?? 0,
    phase: sample.phase || "move",
    time: Number.isFinite(sample.time) ? sample.time : (defaults.now?.() ?? performance.now()),
    scene: { x: sceneX, y: sceneY },
    pressure: Number.isFinite(sample.pressure) ? sample.pressure : 0.5,
    tiltX: Number.isFinite(sample.tiltX) ? sample.tiltX : 0,
    tiltY: Number.isFinite(sample.tiltY) ? sample.tiltY : 0,
    twist: Number.isFinite(sample.twist) ? sample.twist : 0,
    buttons: Number.isFinite(sample.buttons) ? sample.buttons : 0,
    data: cloneValue(sample.data || null),
  });
};

export class UnderscoreInputBus {
  constructor({ eventBus = new UnderscoreEventBus(), now = () => performance.now() } = {}) {
    this.eventBus = eventBus;
    this.now = now;
    this.adapters = new Map();
  }

  emit(sample) {
    const normalized = normalizeInputSample(sample, { now: this.now });
    this.eventBus.emit(`input.${normalized.source}.${normalized.phase}`, normalized, {
      source: normalized.source,
      time: normalized.time,
    });
    return normalized;
  }

  registerAdapter(adapter) {
    if (!adapter?.id || typeof adapter.start !== "function") {
      throw new Error("Input adapters require id and start(emit).");
    }
    this.unregisterAdapter(adapter.id);
    const stop = adapter.start(sample => this.emit({ ...sample, source: sample.source || adapter.id }));
    this.adapters.set(adapter.id, { adapter, stop: typeof stop === "function" ? stop : null });
    return () => this.unregisterAdapter(adapter.id);
  }

  unregisterAdapter(id) {
    const current = this.adapters.get(id);
    current?.stop?.();
    return this.adapters.delete(id);
  }
}
