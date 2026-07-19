export const SHORTCUT_STORAGE_KEY = "drawerator_shortcuts_v1";

export const SHORTCUT_ACTIONS = Object.freeze([
  { id: "tool-select", label: "Selection tool", defaultBinding: "KeyV" },
  { id: "tool-freedraw", label: "Free draw tool", defaultBinding: "KeyP" },
  { id: "tool-line", label: "Line / path tool", defaultBinding: "KeyL" },
  { id: "grid.visible.toggle", commandId: "grid.visible.toggle", label: "Grid visibility", defaultBinding: "Mod+Shift+Quote" },
  { id: "grid.snap.toggle", label: "Grid snapping", defaultBinding: "Mod+Alt+Quote" },
  { id: "panel-grid", label: "Grid panel", defaultBinding: "Mod+Shift+KeyG" },
]);

export const DEFAULT_SHORTCUTS = Object.freeze(Object.fromEntries(
  SHORTCUT_ACTIONS.map(action => [action.id, action.defaultBinding])
));

const MODIFIER_CODES = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

export const normalizeShortcutBindings = value => {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(SHORTCUT_ACTIONS.map(action => [
    action.id,
    typeof source[action.id] === "string" ? source[action.id] : action.defaultBinding,
  ]));
};

export const shortcutFromEvent = event => {
  if (!event?.code || MODIFIER_CODES.has(event.code)) return null;
  const parts = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.code);
  return parts.join("+");
};

export const shortcutMatchesEvent = (binding, event) => Boolean(binding) && shortcutFromEvent(event) === binding;

export const shortcutLabel = binding => {
  if (!binding) return "Unassigned";
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
  return binding.split("+").map(part => {
    if (part === "Mod") return isMac ? "⌘" : "Ctrl";
    if (part === "Alt") return isMac ? "⌥" : "Alt";
    if (part === "Shift") return "⇧";
    if (part === "Quote") return "\"";
    if (part.startsWith("Key")) return part.slice(3);
    if (part.startsWith("Digit")) return part.slice(5);
    return part;
  }).join(isMac ? "" : "+");
};

export const findShortcutAction = (bindings, event) => SHORTCUT_ACTIONS.find(action =>
  shortcutMatchesEvent(bindings?.[action.id], event)
) || null;
