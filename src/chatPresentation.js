import { renderMarkdownWithMath } from "./livecodePresentation.js";

// Tool calls are part of the assistant protocol, not part of the user's
// visible conversation. Keep them in the raw transcript for copying and
// replay, but remove them from the rendered assistant bubble.
const COMPLETE_COMMAND_TAG = /<underscores-command\b[^>]*>[\s\S]*?<\/underscores-command\s*>/gi;
const OPEN_COMMAND_TAG = /<underscores-command\b[\s\S]*$/i;
const COMMAND_PLACEHOLDER = /(<underscores-command\b[^>]*>[\s\S]*?<\/underscores-command\s*>)[ \t]*(?:\r?\n[ \t]*)+undefined(?=\s*(?:\r?\n|$))/gi;

const isStructuredAction = value => (
  value
  && typeof value === "object"
  && typeof value.action === "string"
  && value.action.trim()
  && value.payload
  && typeof value.payload === "object"
  && !Array.isArray(value.payload)
);

const stripStructuredActionBlocks = source => String(source || "").replace(
  /```(?:json|javascript|js)?\s*([\s\S]*?)```/gi,
  (block, body) => {
    try {
      return isStructuredAction(JSON.parse(body.trim())) ? "" : block;
    } catch {
      return block;
    }
  },
);

export const stripAssistantCommandTags = source => {
  let text = String(source || "");
  // Some local models append the return value of an action as a bare
  // `undefined`. It is an implementation artifact, not part of the answer;
  // remove it only when it directly follows a command tag.
  text = text.replace(COMMAND_PLACEHOLDER, "");
  return stripStructuredActionBlocks(text)
    .replace(COMPLETE_COMMAND_TAG, "")
    .replace(OPEN_COMMAND_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const renderChatMessage = ({ source, role = "assistant" } = {}) => {
  const text = role === "assistant" ? stripAssistantCommandTags(source) : String(source || "");
  if (!text) return "";
  try {
    return renderMarkdownWithMath(text, { chatActions: true });
  } catch {
    // Streaming Markdown can be temporarily incomplete. Preserve the text
    // rather than making the whole chat bubble disappear while it settles.
    return text.replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }
};
