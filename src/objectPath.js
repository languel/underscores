// A stable, readable reference for a scene object that can be pasted into
// Livecode parameter fields or scripts. Keep the expression deliberately
// small so it is useful both as documentation and as executable code.
export const objectPathForId = id => {
  const value = String(id ?? "").trim();
  return value ? `__.canvas.get(${JSON.stringify(value)})` : "";
};

export const objectPathForElement = element => objectPathForId(element?.id);

// Accept the canonical path syntax when a value is pasted into an object
// parameter. The returned id is intentionally just the lookup key; the
// canvas API still resolves ids, labels, and groups in one place.
export const objectReferenceFromPath = value => {
  const source = String(value ?? "").trim();
  const match = /^__\.(?:canvas|objects)\.get\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*\)$/.exec(source);
  if (!match) return source;
  if (match[1][0] === '"') {
    try {
      return JSON.parse(match[1]);
    } catch {
      return source;
    }
  }
  return match[1].slice(1, -1).replace(/\\(['\\])/g, "$1");
};
