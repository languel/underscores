const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const parsePercent = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : null;
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

  return null;
};

