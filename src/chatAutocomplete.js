export const CHAT_CONTEXT_SUGGESTIONS = Object.freeze([
  { name: "@selection", description: "Selected elements and code fields (JSON)", trigger: "@" },
  { name: "@selection-as-svg", description: "Selected elements (SVG)", trigger: "@" },
  { name: "@selection-as-png", description: "Selected elements (PNG)", trigger: "@" },
  { name: "@canvas", description: "Entire canvas (JSON)", trigger: "@" },
  { name: "@canvas-as-svg", description: "Entire canvas (SVG)", trigger: "@" },
  { name: "@canvas-as-png", description: "Entire canvas (PNG)", trigger: "@" },
  { name: "@livecode", description: "Livecode node source and runtime state", trigger: "@" },
  { name: "@score", description: "Current score and transport state", trigger: "@" },
  { name: "@mermaid", description: "Create Mermaid diagrams", trigger: "@" },
  { name: "@manim", description: "Math animation script", trigger: "@" },
  { name: "@imagegen", description: "Generate images/illustrations", trigger: "@" },
]);

const commandSlashAliases = command => {
  const aliases = Array.isArray(command?.aliases) ? command.aliases : [];
  const slashAliases = aliases
    .map(alias => String(alias || "").trim())
    .filter(alias => alias.startsWith("/") && alias.length > 1);
  if (slashAliases.length) return slashAliases;
  const id = String(command?.id || "").trim();
  return id ? [`/${id}`] : [];
};

export const buildChatAutocompleteSuggestions = (commands = []) => {
  const suggestions = [...CHAT_CONTEXT_SUGGESTIONS];
  const seenCommands = new Set();
  for (const command of Array.isArray(commands) ? commands : []) {
    const description = String(command?.description || command?.name || command?.title || command?.category || "Command");
    for (const alias of commandSlashAliases(command)) {
      const key = alias.toLowerCase();
      if (seenCommands.has(key)) continue;
      seenCommands.add(key);
      suggestions.push({
        name: alias,
        description,
        trigger: "/",
        commandId: command?.id || null,
      });
    }
  }
  return suggestions;
};

export const getChatAutocompleteToken = (value, cursor = String(value || "").length) => {
  const source = String(value || "");
  const position = Math.max(0, Math.min(Number(cursor) || 0, source.length));
  const beforeCursor = source.slice(0, position);
  const slashMatch = beforeCursor.match(/(^|\s)(\/[^\n]*)$/);
  if (slashMatch) {
    const token = slashMatch[2];
    return {
      trigger: "/",
      query: token.slice(1),
      start: position - token.length,
      end: position,
    };
  }
  const mentionMatch = beforeCursor.match(/(^|\s)(@[^\s@/]*)$/);
  if (!mentionMatch) return null;
  const token = mentionMatch[2];
  return {
    trigger: "@",
    query: token.slice(1),
    start: position - token.length,
    end: position,
  };
};

export const filterChatAutocompleteSuggestions = (token, suggestions = []) => {
  if (!token) return [];
  const query = String(token.query || "").toLowerCase();
  return (Array.isArray(suggestions) ? suggestions : [])
    .filter(suggestion => suggestion?.trigger === token.trigger)
    .filter(suggestion => String(suggestion.name || "").slice(1).toLowerCase().includes(query));
};

export const resizeChatInput = (element, minHeight = 36, maxHeight = 150) => {
  if (!element) return;
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${Math.max(minHeight, nextHeight)}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
};
