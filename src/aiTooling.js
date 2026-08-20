import { buildRelevantScriptAuthoringGuide } from "./scriptAuthoring.js";

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

const LIVE_CODE_PARAMETER_GUIDE = [
  "Livecode parameter contract:",
  "- `@param` is an authored source annotation, not a command by itself. Declare it on its own line comment, for example `// @param maxlines = 100 (1..500, step: 1)`, then use the value in the source.",
  "- In trusted p5, Play Core, and Strudel code, read declared values through `__.params.<name>` (for example `Number(__.params.maxlines ?? 100)`). There is no implicit global `parameters` object; do not write `parameters.maxlines` unless the source explicitly creates that variable.",
  "- Supported declarations include numeric values with optional ranges/steps, `(string)`, `(color)`, `(boolean)`, `(json)`, and `(object)`/`(canvas)`/`(element)` references.",
  "- The `parameters` object in `livecode.node.update` only overrides persisted values for declarations that already exist in the source; it does not create an @param control. When asked to expose a value, update the source with the annotation and use `__.params`, and include a parameters override only when a non-default persisted value is requested.",
  "- Never claim that a parameter was exposed unless the updated source visibly contains both the `// @param` declaration and a matching `__.params.<name>` read. An empty `parameters: {}` object does not create a parameter; omit it unless setting a non-default value for an existing declaration.",
].join("\n");

const normalizeStructuredAction = value => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = typeof value.action === "string" ? value.action.trim() : "";
  if (!id) return null;

  // The documented compatibility envelope is { action, payload }, but some
  // OpenAI-compatible local models emit the action arguments beside `action`
  // instead. Accept that harmless variant as well so a valid command is not
  // rendered as prose (or silently lost) solely because of envelope shape.
  if (Object.prototype.hasOwnProperty.call(value, "payload")) {
    if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return null;
    return { id, args: clone(value.payload) };
  }
  const args = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "action" && key !== "id"));
  return { id, args: clone(args) };
};

/**
 * Local models sometimes return the same action envelope as a fenced JSON
 * block instead of the documented XML tag. Keep that response compatible
 * with the command executor without interpreting arbitrary prose/code as an
 * action: only a complete JSON object with an explicit action is accepted;
 * the preferred payload envelope is validated, with a flat local-model
 * compatibility shape normalized as well.
 */
export const parseStructuredActionBlocks = text => {
  const calls = [];
  const expression = /```(?:json|javascript|js)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = expression.exec(String(text || ""))) !== null) {
    try {
      const call = normalizeStructuredAction(JSON.parse(match[1].trim()));
      if (call) calls.push({ ...call, error: null });
    } catch {
      // Ordinary Markdown code fences are not action envelopes.
    }
  }
  return calls;
};

/**
 * Parse Underscores command tags without interpreting any other model output.
 * Keeping this pure makes malformed model responses visible to the chat log
 * instead of failing the rest of an assistant turn.
 */
export const parseUnderscoresCommandTags = text => {
  const tags = [];
  // Accept harmless attribute/whitespace variation from local models while
  // keeping the command id explicit. The visible chat uses the same broad
  // tag shape so a command cannot accidentally leak into the transcript just
  // because a provider chose single quotes or added an attribute.
  const expression = /<underscores-command\b[^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/underscores-command\s*>/gi;
  let match;
  while ((match = expression.exec(String(text || ""))) !== null) {
    const id = match[1] || match[2];
    const source = match[3].trim();
    try {
      tags.push({ id, args: source ? JSON.parse(source) : {}, error: null });
    } catch (error) {
      tags.push({ id, args: null, error: `Invalid command JSON: ${error.message}` });
    }
  }
  // Accept the structured JSON envelope emitted by some OpenAI-compatible
  // local servers/models when they decline to follow the XML-tag protocol.
  // Prefer the XML protocol whenever it is present so mixed prose/examples
  // cannot introduce a second, out-of-order execution path.
  return tags.length > 0 ? tags : parseStructuredActionBlocks(text);
};

/** Return only the intentionally curated command subset that an AI can call. */
export const buildAICommandCatalog = commands => (commands || [])
  .filter(command => command?.ai?.expose === true)
  .map(command => ({
    id: command.id,
    description: command.ai.description || command.description || command.name || command.title || command.id,
    args: clone(command.args || {}),
    example: clone(command.ai.example || null),
  }));

/**
 * Models only receive a curated catalog, but enforce that boundary again at
 * execution time. This prevents an otherwise valid registry command from
 * becoming callable merely because a model guessed its stable id.
 */
export const isAICommandAllowed = (id, commands) => (commands || []).some(command => (
  command?.id === id && command?.ai?.expose === true
));

export const buildAIAutomationGuide = (commands, options = {}) => {
  const catalog = buildAICommandCatalog(commands);
  const scriptGuide = buildRelevantScriptAuthoringGuide(options.prompt);
  return [
    "Underscores automation",
    "Use only <underscores-command id=\"stable.id\">JSON</underscores-command> tags for actions. If the model cannot emit XML, a single fenced JSON object with {\"action\":\"stable.id\",\"payload\":{...}} is accepted as a compatibility envelope. Keep command arguments inside payload; a flat {\"action\":\"stable.id\", ...args} envelope is tolerated for compatibility but is not preferred.",
    "The command body must be valid JSON. For multiline source/code values, JSON-escape it exactly as JSON.stringify would: use \\n for newlines, \\\" for quotes, and \\\\ for backslashes. Never put raw multiline text or raw unescaped double quotes inside a JSON string.",
    "Never emit a bare undefined or null as a response placeholder. After an action tag, continue with a short human-readable summary.",
    "In @selection JSON, a codeHost field identifies a code-capable object even when its Excalidraw type is rectangle; inspect its source, kind, parameters, runtime, and elementId before describing it as a plain shape.",
    "Explain or transform code in Markdown fences outside the action tag; keep the action payload compact and machine-valid. If editing a Livecode node, use livecode.node.update with the elementId from scene context and an escaped source string.",
    LIVE_CODE_PARAMETER_GUIDE,
    "Commands run in the order written. Use high-level scene.create.objects and scene.patch.objects; do not construct raw Excalidraw snapshots.",
    "For visual drawing, use scene.create.objects (rectangle, ellipse, diamond, line, or freedraw), then scene.patch.objects, score.roles.assign, script.brush.apply, or automation.keyframes.set as needed.",
    "Never request, expose, or alter credentials, API keys, tokens, provider endpoints, local storage, or browser permissions.",
    "Give a brief explanation before action tags. If an action needs an object id, use the id from scene context or give a new object an explicit id.",
    scriptGuide,
    `Available actions: ${JSON.stringify(catalog)}`,
  ].filter(Boolean).join("\n");
};
