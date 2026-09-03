import { existsSync, readFileSync } from "node:fs";

const unquote = value => {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

// Deployment gates run in Node before Vite starts, so Vite's built-in .env
// loading is not available to them. Read only the named acknowledgement from
// local env files; never evaluate the file or print its contents.
export const readLocalEnv = (name, fallback = "") => {
  if (process.env[name] !== undefined) return process.env[name];
  for (const path of [".env.local", ".env"]) {
    if (!existsSync(path)) continue;
    try {
      const line = readFileSync(path, "utf8")
        .split(/\r?\n/)
        .find(entry => entry.trim().startsWith(`${name}=`));
      if (line) return unquote(line.slice(line.indexOf("=") + 1));
    } catch {
      // An unreadable local env file should leave the gate blocked.
    }
  }
  return fallback;
};
