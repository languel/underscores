const STYLE_COMMANDS = Object.freeze({
  roughness: "geometry.roughness.set",
  sharp: "geometry.roundness.sharp",
  round: "geometry.roundness.round",
  roundness: "geometry.roundness.set",
});

export const normalizeRoughnessValue = value => {
  const next = Number(value);
  if (!Number.isInteger(next) || next < 0 || next > 2) {
    throw new Error("Roughness must be 0, 1, or 2.");
  }
  return next;
};

export const normalizeRoundnessValue = value => {
  const next = typeof value === "boolean" ? (value ? 1 : 0) : Number(value);
  if (next !== 0 && next !== 1) {
    throw new Error("Roundness must be 0 (sharp) or 1 (round).");
  }
  return next;
};

export const parseDrawingStyleSlash = value => {
  const input = String(value || "").trim();
  if (/^\/sharp$/i.test(input)) return { id: STYLE_COMMANDS.sharp, args: { value: 0 } };
  if (/^\/round$/i.test(input)) return { id: STYLE_COMMANDS.round, args: { value: 1 } };

  let match = /^\/roughness\s+([012])$/i.exec(input);
  if (match) return { id: STYLE_COMMANDS.roughness, args: { value: Number(match[1]) } };

  match = /^\/roundness\s+([01])$/i.exec(input);
  if (match) return { id: STYLE_COMMANDS.roundness, args: { value: Number(match[1]) } };
  return null;
};
