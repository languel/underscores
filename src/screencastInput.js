export const SCREENCAST_INPUT_STORAGE_KEY = "underscores_screencast_input";
export const SCREENCAST_INPUT_POSITION_KEY = "underscores_screencast_input_position_v1";
export const SCREENCAST_INPUT_MINIMAL_KEY = "underscores_screencast_input_minimal";

const TOOL_LABELS = Object.freeze({
  selection: "Select",
  freedraw: "Pencil",
  line: "Line",
  arrow: "Arrow",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  diamond: "Diamond",
  frame: "Frame",
  embeddable: "Embed",
  image: "Image",
  text: "Text",
  eraser: "Eraser",
  hand: "Hand",
  laser: "Laser",
  custom: "Brush",
});

const TOOL_ICONS = Object.freeze({
  selection: "↖",
  freedraw: "✎",
  line: "╱",
  arrow: "➤",
  rectangle: "□",
  ellipse: "○",
  diamond: "◇",
  frame: "▣",
  embeddable: "▧",
  image: "▧",
  text: "T",
  eraser: "⌫",
  hand: "↔",
  laser: "⌁",
  custom: "✦",
});

export const screencastToolLabel = tool => TOOL_LABELS[tool] || (tool ? String(tool).replace(/[-_]/g, " ").replace(/\b\w/g, char => char.toUpperCase()) : "Select");
export const screencastToolIcon = tool => TOOL_ICONS[tool] || "•";

export const formatScreencastModifiers = event => {
  if (!event) return "";
  const modifiers = [];
  if (event.metaKey || event.meta) modifiers.push("⌘");
  if (event.ctrlKey || event.ctrl) modifiers.push("⌃");
  if (event.altKey || event.alt) modifiers.push("⌥");
  if (event.shiftKey || event.shift) modifiers.push("⇧");
  return modifiers.join("");
};

export const screencastModifierState = event => ({
  alt: Boolean(event?.altKey || event?.alt),
  ctrl: Boolean(event?.ctrlKey || event?.ctrl),
  meta: Boolean(event?.metaKey || event?.meta),
  shift: Boolean(event?.shiftKey || event?.shift),
});

export const isScreencastModifierKey = event => [
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "OS",
  "Shift",
].includes(event?.key);

export const formatScreencastKey = event => {
  if (!event) return "";
  const modifiers = formatScreencastModifiers(event);
  const key = event.key === " " ? "Space" : event.key === "Escape" ? "Esc" : event.key === "Backspace" ? "⌫" : event.key === "Enter" ? "↵" : event.key === "Tab" ? "Tab" : event.key;
  return `${modifiers}${String(key || event.code || "Key")}`;
};

export const clampScreencastPosition = (position, viewport = {}, size = {}) => {
  const width = Math.max(1, Number(viewport.width) || 0);
  const height = Math.max(1, Number(viewport.height) || 0);
  const overlayWidth = Math.max(1, Number(size.width) || 220);
  const overlayHeight = Math.max(1, Number(size.height) || 110);
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(width - overlayWidth - margin, Number(position?.x) || margin)),
    y: Math.max(margin, Math.min(height - overlayHeight - margin, Number(position?.y) || margin)),
  };
};

export const readScreencastPosition = () => {
  if (typeof window === "undefined") return { x: 12, y: 12 };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCREENCAST_INPUT_POSITION_KEY) || "null");
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {
    // Fall through to the unobtrusive lower-right default.
  }
  return {
    x: Math.max(8, window.innerWidth - 232),
    y: Math.max(8, window.innerHeight - 132),
  };
};

export const writeScreencastPosition = position => {
  try {
    window.localStorage.setItem(SCREENCAST_INPUT_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Storage is optional; dragging remains local for private sessions.
  }
};
