const WEBMCP_SOURCE = "webmcp";
const DEFAULT_MAX_ELEMENTS = 40;
const MAX_CONTEXT_ELEMENTS = 100;
const DEFAULT_MAX_COMMANDS = 120;
const MAX_COMMANDS = 200;
const MAX_SEQUENCE_COMMANDS = 32;
const MAX_RESULT_DEPTH = 5;
const MAX_RESULT_KEYS = 80;
const MAX_RESULT_ARRAY = 100;
const MAX_ARGUMENT_ARRAY = 250;

export const UNDERSCORES_WEBMCP_TOOL_NAMES = Object.freeze([
  "get_score_context",
  "get_underscores_command_catalog",
  "execute_underscores_command",
  "execute_underscores_sequence",
  "get_guided_walkthroughs",
  "control_guided_walkthrough",
  "create_score_objects",
  "patch_score_objects",
  "assign_score_roles",
]);

// WebMCP is a browser-facing capability surface, not a raw escape hatch to
// every JavaScript method on window.__. Keep the policy here explicit so a
// future command cannot become callable merely by adding ai.expose: true.
const BLOCKED_COMMANDS = new Set([
  "excalidraw.commands",
  "excalidraw.file.open",
  "excalidraw.file.save",
  "excalidraw.file.saveAs",
  "excalidraw.file.share",
  "excalidraw.file.exportPng",
  "excalidraw.file.exportPngTheme",
  "excalidraw.file.exportPngTransparent",
  "excalidraw.file.exportSvg",
  "excalidraw.file.exportSvgTheme",
  "excalidraw.file.exportSvgTransparent",
]);

const CONFIRMATION_COMMANDS = new Set([
  "excalidraw.scene.clear",
  "excalidraw.selection.delete",
  "scene.delete",
  "iannix.import.trusted",
  "script.iannix.run",
  "svg.node.delete",
  "svg.animation.delete",
]);

// A few runtime controls are deliberately useful to a browser agent but are
// not part of the embedded assistant's natural-language catalog. Keep this
// second, reviewable list small rather than turning every registry command into
// a WebMCP endpoint.
const WEBMCP_ADDITIONAL_COMMANDS = new Set([
  "physics.play",
  "physics.pause",
  "physics.reset",
  "physics.apply",
  "physics.materialize",
  "transport.seek",
  "transport.jump.start",
  "transport.jump.end",
  "livecode.node.run",
  "livecode.node.stop",
  "history.record.start",
  "history.record.play",
  "history.record.pause",
  "history.record.stop",
  "history.play",
  "history.seek",
  "iannix.import.trusted",
]);

const SENSITIVE_ARGUMENT_KEY = /(?:api.?key|credential|password|secret|token|endpoint|permission|private.?key|room.?id)/i;

const activeRegistrations = new WeakMap();
const registrationStatuses = new WeakMap();

const clone = value => {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const plainObject = value => value && typeof value === "object" && !Array.isArray(value);

const finiteNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const rounded = value => Math.round(finiteNumber(value) * 1000) / 1000;

const optionalRounded = value => Number.isFinite(Number(value)) ? rounded(value) : undefined;

const truncatedText = (value, limit = 500) => {
  if (typeof value !== "string") return undefined;
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
};

const createInvocationId = () => globalThis.crypto?.randomUUID?.()
  || `webmcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const abortError = () => {
  const error = new Error("The WebMCP operation was cancelled.");
  error.name = "AbortError";
  return error;
};

const throwIfAborted = signal => {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError();
};

const getExecutionSignal = execution => execution?.signal || null;

const liveScene = api => {
  const elements = api?.scene?.get?.();
  return Array.isArray(elements) ? elements : [];
};

const sceneRevision = (elements, authoredState = null) => {
  const signature = (elements || [])
    .map(element => [
      String(element?.id || ""),
      finiteNumber(element?.version),
      finiteNumber(element?.versionNonce),
      element?.isDeleted ? 1 : 0,
    ].join(":"))
    .sort()
    .join("|");
  let authoredSignature = "";
  if (authoredState) {
    try { authoredSignature = JSON.stringify(authoredState); } catch { authoredSignature = "[unserializable]"; }
  }
  const combinedSignature = `${signature}|${authoredSignature}`;
  let hash = 2166136261;
  for (let index = 0; index < combinedSignature.length; index += 1) {
    hash ^= combinedSignature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `u1-${elements?.length || 0}-${(hash >>> 0).toString(36)}`;
};

const authoredState = api => {
  try {
    return api?.relations?.get?.() || null;
  } catch {
    return null;
  }
};

const documentRevision = api => sceneRevision(liveScene(api), authoredState(api));

const scoreSummary = element => {
  const score = element?.customData?.score || element?.customData?.iannix;
  if (!plainObject(score)) return null;
  const summary = {
    role: typeof score.role === "string" && score.role ? score.role : null,
    label: truncatedText(score.label, 160) || null,
    active: score.active !== false,
  };
  if (plainObject(score.time)) {
    summary.time = {
      start: optionalRounded(score.time.start),
      duration: optionalRounded(score.time.duration),
      rate: optionalRounded(score.time.rate),
      loopMode: typeof score.time.loopMode === "string" ? score.time.loopMode : undefined,
    };
  }
  if (summary.role === "cursor" && plainObject(score.cursor)) {
    summary.cursor = {
      curveId: typeof score.cursor.curveId === "string" ? score.cursor.curveId : null,
    };
  }
  return summary;
};

const semanticKind = element => {
  const customData = element?.customData || {};
  if (customData.underscoresLivecode) return "livecode";
  if (customData.underscoresP5 || customData.p5) return "p5";
  if (customData.underscoresPlayCore) return "playcore";
  if (customData.underscoresSvg) return "svg";
  if (customData.underscoresMediaStream) return "media-stream";
  return scoreSummary(element)?.role || null;
};

const codeSummary = element => {
  const customData = element?.customData || {};
  const data = customData.underscoresLivecode || customData.underscoresP5 || customData.p5 || customData.underscoresPlayCore;
  if (!plainObject(data)) return null;
  const source = typeof data.source === "string" ? data.source : (typeof data.code === "string" ? data.code : null);
  return {
    kind: typeof data.kind === "string" ? data.kind : (customData.underscoresP5 || customData.p5 ? "p5" : null),
    name: truncatedText(data.name, 160) || null,
    running: data.running !== false,
    enabled: data.enabled !== false,
    source: truncatedText(source, 3000) || null,
    parameters: plainObject(data.parameters) ? safeResultValue(data.parameters) : null,
  };
};

const physicsElementSummary = element => {
  const physics = element?.customData?.physics || element?.customData?.underscoresPhysics;
  if (!plainObject(physics)) return null;
  return {
    role: typeof physics.role === "string" ? physics.role : null,
    systemId: typeof physics.systemId === "string" ? physics.systemId : null,
    bodyType: typeof physics.bodyType === "string" ? physics.bodyType : null,
    constraintKind: typeof physics.constraintKind === "string" ? physics.constraintKind : null,
    collider: plainObject(physics.collider) ? safeResultValue(physics.collider) : null,
  };
};

const demoElementSummary = element => {
  const demo = element?.customData?.underscoresDemo;
  if (!plainObject(demo)) return null;
  return safeResultValue(demo);
};

export const summarizeWebMCPElement = (element, { selected } = {}) => {
  const summary = {
    id: String(element?.id || ""),
    type: String(element?.type || "unknown"),
    x: rounded(element?.x),
    y: rounded(element?.y),
    width: rounded(element?.width),
    height: rounded(element?.height),
    angle: rounded(element?.angle),
    locked: element?.locked === true,
    isDeleted: element?.isDeleted === true,
    version: finiteNumber(element?.version),
  };
  if (typeof selected === "boolean") summary.selected = selected;
  const kind = semanticKind(element);
  const score = scoreSummary(element);
  const code = codeSummary(element);
  const physics = physicsElementSummary(element);
  const demo = demoElementSummary(element);
  if (kind) summary.kind = kind;
  if (score) summary.score = score;
  if (code) summary.code = code;
  if (physics) summary.physics = physics;
  if (demo) summary.demo = demo;
  if (typeof element?.customData?.label === "string" && element.customData.label.trim()) {
    summary.label = truncatedText(element.customData.label.trim(), 160);
  }
  if (typeof element?.text === "string") summary.text = truncatedText(element.text);
  if (typeof element?.strokeColor === "string") summary.strokeColor = element.strokeColor;
  if (typeof element?.backgroundColor === "string") summary.backgroundColor = element.backgroundColor;
  if (Number.isFinite(Number(element?.strokeWidth))) summary.strokeWidth = rounded(element.strokeWidth);
  if (Number.isFinite(Number(element?.opacity))) summary.opacity = rounded(element.opacity);
  if (Array.isArray(element?.points) && element.points.length <= 50) {
    summary.points = element.points.map(point => [rounded(point?.[0]), rounded(point?.[1])]);
  } else if (Array.isArray(element?.points)) {
    summary.pointCount = element.points.length;
  }
  return summary;
};

const selectedIdSet = api => new Set(Object.entries(api?.scene?.getAppState?.()?.selectedElementIds || {})
  .filter(([, selected]) => selected)
  .map(([id]) => id));

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
};

const safeResultValue = (value, depth = 0, seen = new WeakSet()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return typeof value === "string" ? truncatedText(value, 2000) : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") return undefined;
  if (depth >= MAX_RESULT_DEPTH) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_RESULT_ARRAY).map(item => safeResultValue(item, depth + 1, seen));
  }
  const result = {};
  Object.entries(value).slice(0, MAX_RESULT_KEYS).forEach(([key, item]) => {
    if (SENSITIVE_ARGUMENT_KEY.test(key)) return;
    const safe = safeResultValue(item, depth + 1, seen);
    if (safe !== undefined) result[key] = safe;
  });
  return result;
};

const safeArguments = args => {
  if (args === undefined) return {};
  if (!plainObject(args)) throw new Error("Command args must be a JSON object.");
  let serialized;
  try {
    serialized = JSON.stringify(args);
  } catch {
    throw new Error("Command args must be JSON-serializable.");
  }
  if (serialized.length > 100_000) throw new Error("Command args exceed the 100 KB WebMCP limit.");
  const visit = (value, path = "args") => {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARGUMENT_ARRAY) throw new Error(`${path} contains too many items.`);
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!plainObject(value)) return;
    Object.entries(value).forEach(([key, item]) => {
      if (SENSITIVE_ARGUMENT_KEY.test(key)) throw new Error(`Sensitive field ${path}.${key} is not available through WebMCP.`);
      visit(item, `${path}.${key}`);
    });
  };
  visit(args);
  return clone(args);
};

const commandPolicy = id => {
  if (BLOCKED_COMMANDS.has(id)) return "blocked";
  if (CONFIRMATION_COMMANDS.has(id)) return "confirmation-required";
  return "allowed";
};

const isWebMCPCommandExposed = command => command?.ai?.expose === true || WEBMCP_ADDITIONAL_COMMANDS.has(command?.id);

const commandList = api => {
  const commands = api?.commands?.list?.();
  return Array.isArray(commands) ? commands : [];
};

const commandCatalogEntry = command => ({
  id: command.id,
  title: command.title || command.name || command.id,
  category: command.category || "General",
  description: command.ai?.description || command.description || command.name || command.id,
  args: clone(command.args || {}),
  example: clone(command.ai?.example || null),
  policy: commandPolicy(command.id),
  origin: command.ai?.expose === true ? "assistant-allowlist" : "webmcp-runtime-extension",
});

export const buildWebMCPCommandCatalog = ({ api } = {}, args = {}) => {
  const exposed = commandList(api)
    .filter(isWebMCPCommandExposed)
    .map(commandCatalogEntry);
  const policy = args.policy || "callable";
  const filtered = policy === "all"
    ? exposed
    : exposed.filter(command => command.policy !== "blocked");
  const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
  const matching = query
    ? filtered.filter(command => [command.id, command.title, command.category, command.description]
      .some(value => String(value || "").toLowerCase().includes(query)))
    : filtered;
  const maxCommands = boundedInteger(args.maxCommands, DEFAULT_MAX_COMMANDS, 1, MAX_COMMANDS);
  return {
    app: "Underscores",
    apiVersion: finiteNumber(api?.apiVersion),
    totalExposed: exposed.length,
    totalCallable: exposed.filter(command => command.policy !== "blocked").length,
    returnedCommandCount: Math.min(matching.length, maxCommands),
    truncated: matching.length > maxCommands,
    commands: matching.slice(0, maxCommands),
  };
};

const publicApiSurface = api => {
  const describe = (value, prefix = "", depth = 0) => {
    if (!plainObject(value) || depth > 2) return [];
    return Object.entries(value).flatMap(([key, child]) => {
      if (key === "api" || key === "webmcp") return [];
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "function") return [path];
      if (plainObject(child)) return describe(child, path, depth + 1);
      return [];
    });
  };
  return describe(api).sort();
};

const physicsSummary = (api, maxItems = 80) => {
  const physics = api?.physics;
  if (!physics) return null;
  const list = (collection, systemId) => {
    try {
      const values = physics?.[collection]?.list?.(systemId);
      return Array.isArray(values) ? values.slice(0, maxItems).map(value => safeResultValue(value)) : [];
    } catch {
      return [];
    }
  };
  let world = null;
  try { world = safeResultValue(physics.world?.get?.()); } catch { world = null; }
  let systems = [];
  try { systems = (physics.systems?.list?.() || []).slice(0, maxItems).map(value => safeResultValue(value)); } catch { systems = []; }
  return {
    world,
    systems,
    bodies: list("bodies"),
    constraints: list("constraints"),
    populations: list("populations"),
  };
};

const revisionProperty = {
  type: "string",
  description: "Optional revision returned by get_score_context. The edit is rejected if the collaborative score changed since that read.",
};

export const buildWebMCPScoreContext = ({ api, getContext }, args = {}) => {
  const allElements = liveScene(api);
  const revision = documentRevision(api);
  const selectedIds = selectedIdSet(api);
  const requestedIds = Array.isArray(args.elementIds)
    ? new Set(args.elementIds.filter(id => typeof id === "string" && id))
    : null;
  const includeDeleted = args.includeDeleted === true;
  const selectedOnly = args.selectedOnly === true;
  const maxElements = boundedInteger(args.maxElements, DEFAULT_MAX_ELEMENTS, 1, MAX_CONTEXT_ELEMENTS);
  const matches = allElements.filter(element => (
    (includeDeleted || !element?.isDeleted)
    && (!selectedOnly || selectedIds.has(element.id))
    && (!requestedIds?.size || requestedIds.has(element.id))
  ));
  const ordered = [...matches].sort((left, right) => (
    Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id))
  ));
  const context = typeof getContext === "function" ? getContext() : null;
  let collaboration = null;
  try {
    const status = api?.collaboration?.getStatus?.();
    const peers = api?.collaboration?.getPeers?.();
    const peerCount = Array.isArray(peers)
      ? peers.length
      : boundedInteger(status?.peerCount, 0, 0, 10000);
    collaboration = plainObject(status) ? {
      active: status.active === true,
      status: typeof status.status === "string" ? status.status : null,
      initialized: status.initialized === true,
      capacityWarning: status.capacityWarning === true,
      peerCount,
    } : { active: false, status: null, initialized: false, capacityWarning: false, peerCount };
  } catch {
    collaboration = null;
  }
  return {
    app: "Underscores",
    apiVersion: finiteNumber(api?.apiVersion),
    revision,
    transport: plainObject(context?.transport) ? clone(context.transport) : null,
    walkthrough: plainObject(context?.walkthrough) ? clone(context.walkthrough) : null,
    collaboration,
    physics: physicsSummary(api),
    visionHints: {
      geometry: "Element x/y/width/height/angle and points are in scene coordinates; use stable element ids when creating relationships.",
      relationships: "Physics bodies and constraints expose objectRef/endpoint ids. Demo metadata labels rods, bobs, axles, speakers, and timelines for visual grounding.",
      audio: "Collision mappings can target the built-in expressive voice; browser audio may still require a user gesture.",
    },
    scene: {
      liveElementCount: allElements.filter(element => !element?.isDeleted).length,
      tombstoneCount: allElements.filter(element => element?.isDeleted).length,
      matchedElementCount: matches.length,
      returnedElementCount: Math.min(ordered.length, maxElements),
      truncated: ordered.length > maxElements,
      selectedElementIds: [...selectedIds],
      elements: ordered.slice(0, maxElements).map(element => summarizeWebMCPElement(element, {
        selected: selectedIds.has(element.id),
      })),
    },
  };
};

const assertCurrentRevision = (api, expectedRevision) => {
  if (!expectedRevision) return;
  const currentRevision = documentRevision(api);
  if (currentRevision !== expectedRevision) {
    throw new Error(`The score changed since it was inspected. Expected revision ${expectedRevision}, current revision ${currentRevision}. Read get_score_context again before editing.`);
  }
};

const mutationResult = (api, command, result) => {
  const elements = liveScene(api);
  const ids = Array.isArray(result?.elementIds) ? result.elementIds : [];
  const byId = new Map(elements.map(element => [element.id, element]));
  return {
    ok: true,
    command,
    elementIds: ids,
    revision: documentRevision(api),
    elements: ids.map(id => byId.get(id)).filter(Boolean).map(element => summarizeWebMCPElement(element)),
    result: safeResultValue(result),
  };
};

const executeCommand = async ({ api, command, args, execution }) => {
  const signal = getExecutionSignal(execution);
  throwIfAborted(signal);
  const result = await api.commands.execute(command, args, {
    source: WEBMCP_SOURCE,
    record: true,
    invocationId: createInvocationId(),
  });
  throwIfAborted(signal);
  return mutationResult(api, command, result);
};

const resolveWebMCPCommand = (api, id) => {
  const commandId = typeof id === "string" ? id.trim() : "";
  if (!commandId) throw new Error("commandId is required.");
  const command = commandList(api).find(candidate => candidate.id === commandId);
  if (!command || !isWebMCPCommandExposed(command)) {
    throw new Error(`Command ${commandId} is not available through WebMCP. Use get_underscores_command_catalog first.`);
  }
  const policy = commandPolicy(commandId);
  if (policy === "blocked") {
    throw new Error(`Command ${commandId} is intentionally not available through WebMCP.`);
  }
  return { command, policy };
};

const executeExposedCommand = async ({ api, commandId, args = {}, expectedRevision, confirm = false, execution }) => {
  const signal = getExecutionSignal(execution);
  throwIfAborted(signal);
  const { policy } = resolveWebMCPCommand(api, commandId);
  if (policy === "confirmation-required" && confirm !== true) {
    throw new Error(`Command ${commandId} changes or removes authored state. Set confirm: true only when the user explicitly requested this operation.`);
  }
  assertCurrentRevision(api, expectedRevision);
  const validatedArgs = safeArguments(args);
  return executeCommand({ api, command: commandId, args: validatedArgs, execution });
};

const commandExecutionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    commandId: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: "Stable command id from get_underscores_command_catalog, for example physics.system.create or livecode.node.create.",
    },
    args: {
      type: "object",
      description: "JSON arguments matching the catalog entry. Do not include credentials, provider endpoints, room ids, or browser permissions.",
      additionalProperties: true,
    },
    expectedRevision: revisionProperty,
    confirm: {
      type: "boolean",
      description: "Required only for destructive or trusted-script commands, and only when the user explicitly requested that operation.",
      default: false,
    },
  },
  required: ["commandId"],
};

const sequenceItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    commandId: commandExecutionSchema.properties.commandId,
    args: commandExecutionSchema.properties.args,
    confirm: commandExecutionSchema.properties.confirm,
  },
  required: ["commandId"],
};

const pointSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
};

const objectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", maxLength: 96, description: "Stable object id for later edits." },
    type: { type: "string", enum: ["rectangle", "ellipse", "diamond", "line", "freedraw"] },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number", minimum: 1 },
    height: { type: "number", minimum: 1 },
    x2: { type: "number", description: "Line endpoint x coordinate." },
    y2: { type: "number", description: "Line endpoint y coordinate." },
    points: { type: "array", items: pointSchema, minItems: 2, maxItems: 500, description: "Absolute [x,y] points for a freedraw path." },
    strokeColor: { type: "string", maxLength: 80 },
    backgroundColor: { type: "string", maxLength: 80 },
    fillStyle: { type: "string", enum: ["hachure", "cross-hatch", "solid", "zigzag"] },
    strokeWidth: { type: "number", minimum: 1, maximum: 100 },
    strokeStyle: { type: "string", enum: ["solid", "dashed", "dotted"] },
    roughness: { type: "number", minimum: 0, maximum: 10 },
    opacity: { type: "number", minimum: 0, maximum: 100 },
    simulatePressure: { type: "boolean" },
    role: { type: "string", enum: ["curve", "cursor", "trigger"] },
    label: { type: "string", maxLength: 160 },
  },
  required: ["type"],
};

const patchSchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number", minimum: 1 },
    height: { type: "number", minimum: 1 },
    angle: { type: "number" },
    strokeColor: { type: "string", maxLength: 80 },
    backgroundColor: { type: "string", maxLength: 80 },
    fillStyle: { type: "string", enum: ["hachure", "cross-hatch", "solid", "zigzag"] },
    strokeWidth: { type: "number", minimum: 1, maximum: 100 },
    strokeStyle: { type: "string", enum: ["solid", "dashed", "dotted"] },
    roughness: { type: "number", minimum: 0, maximum: 10 },
    opacity: { type: "number", minimum: 0, maximum: 100 },
    locked: { type: "boolean" },
  },
};

const writeAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
  untrustedContentHint: true,
});

export const createUnderscoresWebMCPTools = ({ api, getContext } = {}) => {
  if (!api?.commands?.execute || !api?.scene?.get) {
    throw new Error("WebMCP requires the Underscores commands and scene APIs.");
  }
  const executeSequence = async (args = {}, execution = {}) => {
    const signal = getExecutionSignal(execution);
    throwIfAborted(signal);
    const commands = Array.isArray(args.commands) ? args.commands : [];
    if (!commands.length) throw new Error("commands must contain one or more command calls.");
    if (commands.length > MAX_SEQUENCE_COMMANDS) throw new Error(`A sequence may contain at most ${MAX_SEQUENCE_COMMANDS} commands.`);
    let expectedRevision = args.expectedRevision;
    const stopOnError = args.stopOnError !== false;
    const results = [];
    for (let index = 0; index < commands.length; index += 1) {
      throwIfAborted(signal);
      const item = commands[index];
      try {
        const result = await executeExposedCommand({
          api,
          commandId: item?.commandId,
          args: item?.args || {},
          expectedRevision,
          confirm: item?.confirm === true,
          execution,
        });
        expectedRevision = result.revision;
        results.push({ index, ok: true, ...result });
      } catch (error) {
        const failure = { index, ok: false, commandId: item?.commandId || null, error: error?.message || String(error) };
        results.push(failure);
        if (stopOnError) break;
      }
    }
    const failed = results.filter(result => result.ok === false);
    return {
      ok: failed.length === 0 && results.length === commands.length,
      attempted: results.length,
      completed: results.filter(result => result.ok).length,
      failed: failed.length,
      stoppedOnError: failed.length > 0 && results.length < commands.length,
      results,
      revision: documentRevision(api),
    };
  };
  return [
    {
      name: "get_score_context",
      description: "Inspect the current Underscores collaborative composition before editing it. Returns bounded semantic canvas objects, score roles, selection, transport, peer count, and a revision for conflict-safe follow-up edits.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          selectedOnly: { type: "boolean", description: "Return only selected objects." },
          elementIds: { type: "array", items: { type: "string" }, maxItems: 100, description: "Return only these object ids." },
          maxElements: { type: "integer", minimum: 1, maximum: MAX_CONTEXT_ELEMENTS, default: DEFAULT_MAX_ELEMENTS },
          includeDeleted: { type: "boolean", description: "Include collaboration tombstones. Normally false." },
        },
      },
      annotations: { readOnlyHint: true, openWorldHint: false, untrustedContentHint: true },
      execute: async (args = {}, execution = {}) => {
        throwIfAborted(getExecutionSignal(execution));
        return buildWebMCPScoreContext({ api, getContext }, plainObject(args) ? args : {});
      },
    },
    {
      name: "get_underscores_command_catalog",
      description: "Inspect the existing Underscores assistant command surface before planning an operation. Returns callable physics, livecode, p5, SVG, IanniX, score, transport, arrangement, grid, brush, history, and scene commands with their argument contracts. A small set of runtime controls (play, pause, reset, seek, recording) is added for complete workflows. Commands marked confirmation-required need confirm: true only when the user explicitly requested them; file and export commands remain blocked.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", maxLength: 120, description: "Optional text filter such as physics, livecode, iannix, or transport." },
          policy: { type: "string", enum: ["callable", "all"], default: "callable", description: "Callable hides intentionally blocked file/export commands; all includes them as documentation only." },
          maxCommands: { type: "integer", minimum: 1, maximum: MAX_COMMANDS, default: DEFAULT_MAX_COMMANDS },
        },
      },
      annotations: { readOnlyHint: true, openWorldHint: false, untrustedContentHint: true },
      execute: async (args = {}, execution = {}) => {
        throwIfAborted(getExecutionSignal(execution));
        const catalog = buildWebMCPCommandCatalog({ api }, plainObject(args) ? args : {});
        return {
          ...catalog,
          apiSurface: publicApiSurface(api),
          webmcp: {
            sequenceLimit: MAX_SEQUENCE_COMMANDS,
            expectedRevision: "Use the revision from get_score_context and pass it to the first command or sequence.",
            source: WEBMCP_SOURCE,
          },
        };
      },
    },
    {
      name: "execute_underscores_command",
      description: "Execute one existing, explicitly allowlisted Underscores command through the same command registry used by the embedded assistant. Use get_underscores_command_catalog first, then provide the exact commandId and JSON args. This is the bridge for physics systems, livecode/p5/shader nodes, IanniX scores, keyframes, transport, mappings, history, and scene operations; it is not arbitrary JavaScript execution.",
      inputSchema: commandExecutionSchema,
      annotations: { ...writeAnnotations, destructiveHint: true },
      execute: async (args = {}, execution = {}) => executeExposedCommand({
        api,
        commandId: args.commandId,
        args: args.args || {},
        expectedRevision: args.expectedRevision,
        confirm: args.confirm === true,
        execution,
      }),
    },
    {
      name: "execute_underscores_sequence",
      description: "Execute up to 32 existing Underscores assistant commands in order, preserving command provenance and checking the scene revision between steps. Use this for a composed workflow such as create score geometry, create a physics system, assign bodies/constraints, create a livecode or p5 voice, set timing, and play. A failure never rolls back earlier steps; inspect the returned per-step results.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          commands: { type: "array", minItems: 1, maxItems: MAX_SEQUENCE_COMMANDS, items: sequenceItemSchema },
          expectedRevision: revisionProperty,
          stopOnError: { type: "boolean", default: true, description: "Stop after the first failed step; already completed steps remain applied." },
        },
        required: ["commands"],
      },
      annotations: { ...writeAnnotations, destructiveHint: true },
      execute: executeSequence,
    },
    {
      name: "get_guided_walkthroughs",
      description: "Discover authored guided walkthroughs and inspect the current local playback state. Walkthrough definitions are shared patch state; learner progress and playback remain local.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false, untrustedContentHint: true },
      execute: async (_args = {}, execution = {}) => {
        throwIfAborted(getExecutionSignal(execution));
        return {
          walkthroughs: safeResultValue(api.walkthroughs?.list?.() || []),
          active: safeResultValue(api.walkthroughs?.status?.() || null),
          revision: documentRevision(api),
        };
      },
    },
    {
      name: "control_guided_walkthrough",
      description: "Start or control a local guided walkthrough through the same revisioned command-backed API used by Playlist and the assistant. Stopping may keep results or restore the captured starting patch.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["start", "pause", "resume", "next", "previous", "stop", "set-rate"] },
          id: { type: "string", maxLength: 160 },
          stepId: { type: "string", maxLength: 160 },
          rate: { type: "number", minimum: 0.05, maximum: 100 },
          instant: { type: "boolean" },
          restore: { type: "boolean" },
        },
        required: ["action"],
      },
      annotations: writeAnnotations,
      execute: async (args = {}, execution = {}) => {
        throwIfAborted(getExecutionSignal(execution));
        const surface = api.walkthroughs;
        if (!surface) throw new Error("Guided walkthroughs are not available in this build.");
        if (args.action === "start") return safeResultValue(await surface.start(args.id, { stepId: args.stepId, rate: args.rate, instant: args.instant }));
        if (args.action === "pause") return safeResultValue(surface.pause());
        if (args.action === "resume") return safeResultValue(surface.resume());
        if (args.action === "next") return safeResultValue(await surface.next());
        if (args.action === "previous") return safeResultValue(await surface.previous());
        if (args.action === "stop") return safeResultValue(await surface.stop({ restore: Boolean(args.restore) }));
        return safeResultValue(surface.setRate(args.rate, { instant: Boolean(args.instant) }));
      },
    },
    {
      name: "create_score_objects",
      description: "Create 1 to 50 visible Excalidraw-backed objects in the live Underscores score. Supports rectangles, ellipses, diamonds, lines, and freedraw paths, with optional curve/cursor/trigger roles. Use explicit ids when later tools need to edit the objects.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          objects: { type: "array", items: objectSchema, minItems: 1, maxItems: 50 },
          select: { type: "boolean", default: true },
          expectedRevision: revisionProperty,
        },
        required: ["objects"],
      },
      annotations: writeAnnotations,
      execute: async (args = {}, execution = {}) => {
        assertCurrentRevision(api, args.expectedRevision);
        return executeCommand({ api, command: "scene.create.objects", args: { objects: args.objects, select: args.select }, execution });
      },
    },
    {
      name: "patch_score_objects",
      description: "Move or restyle existing Underscores score objects by stable id. Inspect the score first, then pass its revision to avoid overwriting a collaborator's newer canvas state.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          patches: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", minLength: 1, maxLength: 96 },
                patch: patchSchema,
              },
              required: ["id", "patch"],
            },
          },
          expectedRevision: revisionProperty,
        },
        required: ["patches"],
      },
      annotations: writeAnnotations,
      execute: async (args = {}, execution = {}) => {
        assertCurrentRevision(api, args.expectedRevision);
        return executeCommand({ api, command: "scene.patch.objects", args: { patches: args.patches }, execution });
      },
    },
    {
      name: "assign_score_roles",
      description: "Assign or clear the curve, cursor, or trigger role for existing Underscores objects. Curve objects define paths, cursors perform paths, and triggers respond to cursor intersections.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          elementIds: { type: "array", items: { type: "string", minLength: 1, maxLength: 96 }, minItems: 1, maxItems: 100 },
          role: { type: "string", enum: ["none", "curve", "cursor", "trigger"] },
          label: { type: "string", maxLength: 160 },
          active: { type: "boolean" },
          expectedRevision: revisionProperty,
        },
        required: ["elementIds", "role"],
      },
      annotations: writeAnnotations,
      execute: async (args = {}, execution = {}) => {
        assertCurrentRevision(api, args.expectedRevision);
        return executeCommand({
          api,
          command: "score.roles.assign",
          args: { elementIds: args.elementIds, role: args.role, label: args.label, active: args.active },
          execution,
        });
      },
    },
  ];
};

const copyStatus = status => ({
  supported: status.supported,
  active: status.active,
  tools: [...status.tools],
  errors: [...status.errors],
});

export const getUnderscoresWebMCPStatus = documentRef => {
  const status = documentRef && registrationStatuses.get(documentRef);
  return status
    ? copyStatus(status)
    : { supported: Boolean(documentRef?.modelContext?.registerTool), active: false, tools: [], errors: [] };
};

const dispatchStatus = (documentRef, name, detail) => {
  const view = documentRef?.defaultView;
  if (!view?.dispatchEvent || typeof view.CustomEvent !== "function") return;
  view.dispatchEvent(new view.CustomEvent(name, { detail }));
};

export const registerUnderscoresWebMCP = ({ api, getContext, documentRef = globalThis.document } = {}) => {
  activeRegistrations.get(documentRef)?.dispose?.();
  const modelContext = documentRef?.modelContext;
  const supported = typeof modelContext?.registerTool === "function";
  const status = { supported, active: false, tools: [], errors: [] };
  if (documentRef) registrationStatuses.set(documentRef, status);

  if (!supported) {
    return {
      supported: false,
      ready: Promise.resolve(copyStatus(status)),
      dispose: () => {},
      getStatus: () => copyStatus(status),
    };
  }

  const controller = new AbortController();
  const tools = createUnderscoresWebMCPTools({ api, getContext });
  let disposed = false;
  const ready = Promise.allSettled(tools.map(tool => Promise.resolve().then(() => (
    modelContext.registerTool(tool, { signal: controller.signal })
  )))).then(results => {
    if (disposed) return copyStatus(status);
    status.tools = results
      .map((result, index) => result.status === "fulfilled" ? tools[index].name : null)
      .filter(Boolean);
    status.errors = results
      .map((result, index) => result.status === "rejected"
        ? `${tools[index].name}: ${result.reason?.message || String(result.reason)}`
        : null)
      .filter(Boolean);
    status.active = status.tools.length > 0;
    const snapshot = copyStatus(status);
    dispatchStatus(documentRef, "underscores:webmcp-ready", snapshot);
    return snapshot;
  });

  const registration = {
    supported: true,
    ready,
    getStatus: () => copyStatus(status),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      controller.abort();
      status.active = false;
      status.tools = [];
      if (activeRegistrations.get(documentRef) === registration) activeRegistrations.delete(documentRef);
      dispatchStatus(documentRef, "underscores:webmcp-disposed", copyStatus(status));
    },
  };
  activeRegistrations.set(documentRef, registration);
  return registration;
};
