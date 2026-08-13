import { buildRelevantScriptAuthoringGuide } from "./scriptAuthoring.js";

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

/**
 * Parse Underscores command tags without interpreting any other model output.
 * Keeping this pure makes malformed model responses visible to the chat log
 * instead of failing the rest of an assistant turn.
 */
export const parseUnderscoresCommandTags = text => {
  const tags = [];
  const expression = /<underscores-command\s+id="([^"]+)"\s*>([\s\S]*?)<\/underscores-command>/gi;
  let match;
  while ((match = expression.exec(String(text || ""))) !== null) {
    const id = match[1];
    const source = match[2].trim();
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
    "Commands run in the order written. Use high-level scene.create.objects and scene.patch.objects; do not construct raw Excalidraw snapshots.",
    "For visual drawing, use scene.create.objects (rectangle, ellipse, diamond, line, or freedraw), then scene.patch.objects, score.roles.assign, script.brush.apply, or automation.keyframes.set as needed.",
    "Never request, expose, or alter credentials, API keys, tokens, provider endpoints, local storage, or browser permissions.",
    "Give a brief explanation before action tags. If an action needs an object id, use the id from scene context or give a new object an explicit id.",
    scriptGuide,
    `Available actions: ${JSON.stringify(catalog)}`,
  ].filter(Boolean).join("\n");
};
