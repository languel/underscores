const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parsePercent = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : null;
};

const parseNumber = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseBoolean = value => {
  if (/^(?:on|true|yes)$/i.test(value)) return true;
  if (/^(?:off|false|no)$/i.test(value)) return false;
  return null;
};

const BLEND_MODES = new Set([
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light", "difference",
  "exclusion", "hue", "saturation", "color", "luminosity",
]);

const parseObjectPatch = text => {
  const numeric = text.match(/^(?:set\s+)?(x|y|width|height|angle|roughness)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
  if (numeric) {
    const value = parseNumber(numeric[2]);
    return value === null ? null : { kind: "objectPatch", property: numeric[1].toLowerCase(), patch: { [numeric[1].toLowerCase()]: value } };
  }

  const strokeWidth = text.match(/^(?:set\s+)?stroke(?:\s*[-_ ]*\s*width)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))$/i);
  if (strokeWidth) {
    const value = parseNumber(strokeWidth[1]);
    return value === null ? null : { kind: "objectPatch", property: "strokeWidth", patch: { strokeWidth: Math.max(0, value) } };
  }

  const locked = text.match(/^(?:set\s+)?(?:lock(?:ed)?|locked)\s+(on|off|true|false|yes|no)$/i);
  if (locked) {
    const value = parseBoolean(locked[1]);
    return value === null ? null : { kind: "objectPatch", property: "locked", patch: { locked: value } };
  }
  if (/^(?:unlock)$/i.test(text)) return { kind: "objectPatch", property: "locked", patch: { locked: false } };

  const style = text.match(/^(?:set\s+)?(fill|stroke)\s+style\s+(solid|hachure|cross-hatch|dashed|dotted)$/i);
  if (style) {
    const key = style[1].toLowerCase() === "fill" ? "fillStyle" : "strokeStyle";
    return { kind: "objectPatch", property: key, patch: { [key]: style[2].toLowerCase() } };
  }

  const color = text.match(/^(?:set\s+)?(background\s+color|fill\s+color|stroke|fill|background|color)\s+(.+)$/i);
  if (color) {
    const property = color[1].toLowerCase().replace(/\s+/g, "") === "stroke" || color[1].toLowerCase() === "color"
      ? "strokeColor"
      : "backgroundColor";
    return { kind: "objectPatch", property, patch: { [property]: color[2].trim() } };
  }

  return null;
};

/**
 * Parse the small, deterministic command vocabulary used by the presentation
 * command field. Anything outside this deliberately conservative set is sent
 * to the assistant, where it can use the selected object's full context.
 */
export const parseContextCommand = input => {
  const text = String(input || "").trim().replace(/\s+/g, " ");
  if (!text) return null;

  const opacity = text.match(/^(?:set\s+)?opacity\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/i);
  if (opacity) {
    const value = parsePercent(opacity[1]);
    return value === null ? null : { kind: "opacity", value };
  }

  const volume = text.match(/^(?:set\s+)?volume\s+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/i);
  if (volume) {
    const value = parsePercent(volume[1]);
    return value === null ? null : { kind: "volume", value: value / 100 };
  }

  const clock = text.match(/^(?:set\s+)?clock\s+(free|linked|toggle)$/i);
  if (clock) return { kind: "clock", value: clock[1].toLowerCase() };

  const blend = text.match(/^(?:set\s+)?blend\s+([a-z-]+)$/i);
  if (blend && BLEND_MODES.has(blend[1].toLowerCase())) return { kind: "blend", value: blend[1].toLowerCase() };

  if (/^(?:toggle\s+)?loop$/i.test(text) || /^loop\s+toggle$/i.test(text)) {
    return { kind: "loop", value: "toggle" };
  }
  const loop = text.match(/^loop\s+(on|off|true|false)$/i);
  if (loop) return { kind: "loop", value: /^(?:on|true)$/i.test(loop[1]) };

  if (/^(?:play|start|resume)$/i.test(text)) return { kind: "play" };
  if (/^(?:pause|stop)$/i.test(text)) return { kind: "pause" };
  if (/^(?:mute)$/i.test(text)) return { kind: "mute", value: true };
  if (/^(?:unmute|sound\s+on)$/i.test(text)) return { kind: "mute", value: false };

  const transportLoop = text.match(/^transport\s+loop\s+(.+)$/i);
  if (transportLoop) return { kind: "transportLoop", duration: transportLoop[1].trim() };

  return parseObjectPatch(text);
};
