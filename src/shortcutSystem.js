export const SHORTCUT_STORAGE_KEY = "underscores_shortcuts_v1";

export const SHORTCUT_ACTIONS = Object.freeze([
  { id: "tool-select", label: "Selection tool", defaultBinding: "KeyV" },
  { id: "tool-freedraw", label: "Free draw tool", defaultBinding: "KeyP" },
  { id: "tool-line", label: "Line / path tool", defaultBinding: "KeyL" },
  { id: "tool-hand", label: "Hand / pan tool", defaultBinding: "KeyH" },
  { id: "object.eyedropper", label: "Object eyedropper", defaultBinding: "Alt+KeyI" },
  { id: "transport.play.toggle", label: "Play / pause score", defaultBinding: "Space" },
  { id: "transport.jump.start", commandId: "transport.jump.start", label: "Jump to timeline / loop start", defaultBinding: "Shift+ArrowLeft" },
  { id: "transport.jump.end", commandId: "transport.jump.end", label: "Jump to timeline / loop end", defaultBinding: "Shift+ArrowRight" },
  { id: "command.palette.toggle", label: "Command palette", defaultBinding: "Mod+Slash" },
  { id: "workspace.reset.defaults", commandId: "workspace.reset.defaults", label: "Reset workspace to defaults", defaultBinding: "Ctrl+Alt+Shift+KeyD" },
  { id: "iannix.command.clear", commandId: "iannix.command.clear", label: "Clear scene", defaultBinding: "Ctrl+Shift+Backspace" },
  { id: "grid.visible.toggle", commandId: "grid.visible.toggle", label: "Grid visibility", defaultBinding: "Mod+Shift+Quote" },
  { id: "grid.snap.toggle", label: "Grid snapping", defaultBinding: "Mod+Alt+Quote" },
  { id: "panel-grid", label: "Grid panel", defaultBinding: "Ctrl+Alt+KeyG" },
  { id: "panel-transport", label: "Timeline panel", defaultBinding: "Ctrl+Alt+KeyT" },
  { id: "panel-settings", label: "Settings panel", defaultBinding: "Mod+Comma" },
  { id: "panel-chat", label: "AI panel", defaultBinding: "Ctrl+Alt+KeyA" },
  { id: "panel-properties.open", label: "Open Properties panel", defaultBinding: "Mod+Alt+KeyP" },
  { id: "physics.toolbar.toggle", commandId: "physics.toolbar.toggle", label: "Physics toolbar", defaultBinding: "Ctrl+Alt+KeyP" },
  { id: "dock.left.toggle", label: "Left dock collapse", defaultBinding: "Mod+KeyB" },
  { id: "dock.right.toggle", label: "Right dock collapse", defaultBinding: "Mod+Alt+KeyB" },
  { id: "dock.bottom.toggle", commandId: "dock.bottom.toggle", label: "Bottom dock collapse", defaultBinding: "Mod+Shift+KeyB" },
  { id: "mods.script.open", label: "Script panel", defaultBinding: "Ctrl+Alt+KeyB" },
  { id: "history.record.toggle", label: "Session recording", defaultBinding: "Ctrl+Alt+KeyR" },
  { id: "toggle-theme", commandId: "toggle-theme", label: "Light / dark theme", defaultBinding: "Alt+Shift+KeyD" },
  { id: "toggle-transparency", commandId: "toggle-transparency", label: "Canvas transparency", defaultBinding: "Mod+Shift+Digit0" },
  { id: "toggle-satori", commandId: "toggle-satori", label: "Satori mode", defaultBinding: "Mod+Ctrl+KeyZ" },
  { id: "presentation.toggle", commandId: "presentation.toggle", label: "Presentation mode", defaultBinding: "Mod+Ctrl+KeyP" },
  { id: "view.frameAll", commandId: "view.frameAll", label: "Frame all objects", defaultBinding: "Home" },
  { id: "view.frameSelected", commandId: "view.frameSelected", label: "Frame selection", defaultBinding: "Shift+Home" },
  { id: "modpen.toggle", label: "Mod Pen", defaultBinding: "Shift+KeyP" },
  { id: "brush.apply.selected", label: "Apply brush to selection", defaultBinding: "Ctrl+Shift+KeyP" },
  { id: "geometry.roundness.toggle", label: "Sharp / round corners", defaultBinding: "Shift+KeyR" },
  { id: "scene.group", commandId: "scene.group", label: "Group selected scene objects", defaultBinding: "Mod+KeyG" },
  { id: "scene.ungroup", commandId: "scene.ungroup", label: "Ungroup selected scene objects", defaultBinding: "Mod+Shift+KeyG" },
  { id: "stroke.width.decrease", label: "Decrease stroke width", defaultBinding: "BracketLeft" },
  { id: "stroke.width.increase", label: "Increase stroke width", defaultBinding: "BracketRight" },
  { id: "stroke.width.decreaseFine", label: "Decrease stroke width finely", defaultBinding: "Shift+BracketLeft" },
  { id: "stroke.width.increaseFine", label: "Increase stroke width finely", defaultBinding: "Shift+BracketRight" },
]);

export const DEFAULT_SHORTCUTS = Object.freeze(Object.fromEntries(
  SHORTCUT_ACTIONS.map(action => [action.id, action.defaultBinding])
));

const MODIFIER_CODES = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);
const usesAppleModifiers = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

export const normalizeShortcutBindings = value => {
  const source = value && typeof value === "object" ? value : {};
  // Mod+Shift+G used to be the Grid panel default. Reserve the conventional
  // binding for Ungroup without overriding a user who has explicitly already
  // assigned an ungroup shortcut.
  const migrated = source["panel-grid"] === "Mod+Shift+KeyG" && source["scene.ungroup"] === undefined
    ? { ...source, "panel-grid": "Ctrl+Alt+KeyG" }
    : source;
  return Object.fromEntries(SHORTCUT_ACTIONS.map(action => [
    action.id,
    typeof migrated[action.id] === "string" ? migrated[action.id] : action.defaultBinding,
  ]));
};

export const shortcutFromEvent = event => {
  if (!event?.code || MODIFIER_CODES.has(event.code)) return null;
  const parts = [];
  if (event.metaKey) parts.push("Mod");
  if (event.ctrlKey) parts.push(usesAppleModifiers() ? "Ctrl" : event.metaKey ? "Ctrl" : "Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.code);
  return parts.join("+");
};

export const shortcutMatchesEvent = (binding, event) => Boolean(binding) && shortcutFromEvent(event) === binding;

export const shortcutLabel = binding => {
  if (!binding) return "Unassigned";
  const isMac = usesAppleModifiers();
  return binding.split("+").map(part => {
    if (part === "Mod") return isMac ? "⌘" : "Ctrl";
    if (part === "Alt") return isMac ? "⌥" : "Alt";
    if (part === "Shift") return "⇧";
    if (part === "Ctrl") return isMac ? "⌃" : "Ctrl";
    if (part === "Quote") return "\"";
    if (part === "Slash") return "/";
    if (part === "Comma") return ",";
    if (part === "Space") return "Space";
    if (part === "BracketLeft") return "[";
    if (part === "BracketRight") return "]";
    if (part.startsWith("Key")) return part.slice(3);
    if (part.startsWith("Digit")) return part.slice(5);
    return part;
  }).join(isMac ? "" : "+");
};

export const findShortcutAction = (bindings, event) => SHORTCUT_ACTIONS.find(action =>
  shortcutMatchesEvent(bindings?.[action.id], event)
) || null;
