const SAFE_TARGET = /^(canvas(?:\.selection|\.element:[A-Za-z0-9_-]+)?|app\.commandPalette|editor\.livecode|panel\.[A-Za-z0-9_-]+)$/;

export const isRegisteredWalkthroughTarget = target => SAFE_TARGET.test(String(target || ""));

const virtualRect = (x, y, width = 1, height = 1) => ({
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
  x,
  y,
  width,
  height,
});

export const resolveWalkthroughTarget = (target, {
  documentRef = globalThis.document,
  getCanvasApi = () => null,
  sceneToViewport,
} = {}) => {
  const key = String(target || "");
  if (!isRegisteredWalkthroughTarget(key)) return null;
  if (key === "canvas" || key === "canvas.selection") {
    const element = documentRef?.querySelector?.("#canvas-container, .excalidraw") || null;
    return element ? { key, element } : null;
  }
  if (key === "app.commandPalette") {
    const element = documentRef?.querySelector?.('[role="dialog"] input[placeholder*="command" i], .command-palette input, [data-walkthrough-target="app.commandPalette"]') || null;
    return element ? { key, element } : null;
  }
  if (key === "editor.livecode") {
    const element = documentRef?.querySelector?.('.script-panel-editor .cm-content, .underscores-code-editor .cm-content, [data-walkthrough-target="editor.livecode"]') || null;
    return element ? { key, element } : null;
  }
  if (key.startsWith("panel.")) {
    const id = key.slice(6);
    const element = documentRef?.querySelector?.(`[data-panel-id="${CSS.escape(id)}"], #underscores-panel-${CSS.escape(id)}`) || null;
    return element ? { key, element } : null;
  }
  const elementId = key.slice("canvas.element:".length);
  const api = getCanvasApi?.();
  const element = api?.getSceneElementsIncludingDeleted?.().find(candidate => candidate.id === elementId && !candidate.isDeleted);
  if (!element || typeof sceneToViewport !== "function") return null;
  const appState = api.getAppState?.();
  const point = sceneToViewport({ sceneX: element.x + element.width / 2, sceneY: element.y + element.height / 2 }, appState);
  return point ? { key, rect: virtualRect(point.x, point.y), sceneElement: element } : null;
};

export const performWalkthroughUiAction = async (cue, options = {}) => {
  if (!isRegisteredWalkthroughTarget(cue?.target)) throw new Error(`Unregistered walkthrough target: ${cue?.target || "empty"}.`);
  const resolved = resolveWalkthroughTarget(cue.target, options);
  const element = resolved?.element;
  if (!element) throw new Error(`Walkthrough target is not currently available: ${cue.target}.`);
  if (cue.action === "click") return element.click();
  if (cue.action === "focus") return element.focus();
  if (cue.action === "type") {
    element.focus();
    const value = String(cue.value || "");
    const delay = Math.max(0, Number(cue.typingDelay) || 0);
    if ("value" in element) {
      element.value = "";
      for (const character of value) {
        element.value += character;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      }
      return;
    }
    const selection = element.ownerDocument?.getSelection?.();
    selection?.selectAllChildren?.(element);
    element.ownerDocument?.execCommand?.("delete", false);
    for (const character of value) {
      element.ownerDocument?.execCommand?.("insertText", false, character);
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    }
    return;
  }
  if (cue.action === "shortcut") {
    element.focus();
    const keys = new Set(cue.keys || []);
    const key = [...keys].find(value => !["Meta", "Control", "Alt", "Shift"].includes(value));
    if (!key) throw new Error("A registered shortcut requires a non-modifier key.");
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      metaKey: keys.has("Meta"),
      ctrlKey: keys.has("Control"),
      altKey: keys.has("Alt"),
      shiftKey: keys.has("Shift"),
      bubbles: true,
    }));
  }
};
