import { renderMarkdownWithMath } from "./livecodePresentation.js";

// Tool calls are part of the assistant protocol, not part of the user's
// visible conversation. Keep them in the raw transcript for copying and
// replay, but remove them from the rendered assistant bubble.
const COMPLETE_COMMAND_TAG = /<underscores-command\b[^>]*>[\s\S]*?<\/underscores-command\s*>/gi;
const OPEN_COMMAND_TAG = /<underscores-command\b[\s\S]*$/i;
const COMMAND_PLACEHOLDER = /(<underscores-command\b[^>]*>[\s\S]*?<\/underscores-command\s*>)[ \t]*(?:\r?\n[ \t]*)+undefined(?=\s*(?:\r?\n|$))/gi;
const ACTION_PLACEHOLDER_LINE = /(^|\n)[ \t]*(?:undefined|null)[ \t]*(?=\n[ \t]*(?:<underscores-command\b|```(?:json|javascript|js)?\s*\{|\{[ \t]*["']action["']\s*:))/gi;
const BARE_PLACEHOLDER_LINE = /(^|\n)[ \t]*(?:undefined|null)[ \t]*(?=\n|$)/gi;

const isStructuredAction = value => {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.action !== "string" || !value.action.trim()) return false;
  if (Object.prototype.hasOwnProperty.call(value, "payload")) {
    return Boolean(value.payload && typeof value.payload === "object" && !Array.isArray(value.payload));
  }
  // A few local models flatten the compatibility envelope. The executor
  // accepts that shape, so hide it from the visible conversation too.
  return true;
};

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
  // `undefined`. It is an implementation artifact, not part of the answer.
  // Remove standalone placeholder lines while preserving inline prose such as
  // "the value is undefined" and code that uses the identifier in an
  // expression. This also handles a placeholder that Markdown folded into a
  // list before the action envelope was stripped.
  text = text.replace(ACTION_PLACEHOLDER_LINE, "$1").replace(BARE_PLACEHOLDER_LINE, "$1");
  text = text.replace(COMMAND_PLACEHOLDER, "");
  text = stripStructuredActionBlocks(text)
    .replace(COMPLETE_COMMAND_TAG, "")
    .replace(OPEN_COMMAND_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
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
