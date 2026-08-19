import { buildRelevantScriptAuthoringGuide } from "./scriptAuthoring.js";

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

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
  return tags;
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
    "Use only <underscores-command id=\"stable.id\">JSON</underscores-command> tags for actions.",
    "The command body must be valid JSON. For multiline source/code values, JSON-escape it exactly as JSON.stringify would: use \\n for newlines, \\\" for quotes, and \\\\ for backslashes. Never put raw multiline text or raw unescaped double quotes inside a JSON string.",
    "Never emit a bare undefined or null as a response placeholder. After an action tag, continue with a short human-readable summary.",
    "In @selection JSON, a codeHost field identifies a code-capable object even when its Excalidraw type is rectangle; inspect its source, kind, parameters, runtime, and elementId before describing it as a plain shape.",
    "Explain or transform code in Markdown fences outside the action tag; keep the action payload compact and machine-valid. If editing a Livecode node, use livecode.node.update with the elementId from scene context and an escaped source string.",
    "Commands run in the order written. Use high-level scene.create.objects and scene.patch.objects; do not construct raw Excalidraw snapshots.",
    "For visual drawing, use scene.create.objects (rectangle, ellipse, diamond, line, or freedraw), then scene.patch.objects, score.roles.assign, script.brush.apply, or automation.keyframes.set as needed.",
    "Never request, expose, or alter credentials, API keys, tokens, provider endpoints, local storage, or browser permissions.",
    "Give a brief explanation before action tags. If an action needs an object id, use the id from scene context or give a new object an explicit id.",
    scriptGuide,
    `Available actions: ${JSON.stringify(catalog)}`,
  ].filter(Boolean).join("\n");
};
