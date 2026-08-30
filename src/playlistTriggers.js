import { findExactCommand, parseGenericCommandSlash } from "./commandSystem.js";

const MAX_PLAYLIST_SCRIPT_LENGTH = 12000;
const blockedScriptTokens = /\b(?:globalThis|window|document|location|navigator|fetch|WebSocket|Worker|import|eval|Function|constructor|prototype|__proto__)\b/;

const commandVariants = command => [
  command?.id,
  command?.name,
  command?.title,
  ...(Array.isArray(command?.aliases) ? command.aliases : []),
].filter(Boolean);

const parseJsonArgs = value => {
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Arguments must be a JSON object.");
    return parsed;
  } catch (error) {
    return { __error: `Invalid playlist trigger JSON: ${error.message}` };
  }
};

/**
 * Resolve a persisted Playlist command/miniscript without invoking it.
 * The longest command id/name/alias wins, which lets `/frame all` and
 * `transport.seek {"seconds":2}` share the same command catalog.
 */
export const parsePlaylistCommand = (value, commands = []) => {
  const input = String(value || "").trim();
  if (!input) return null;
  const bridgeCall = /^__\.api\.commands\.execute\(\s*(["'])([^"']+)\1(?:\s*,\s*([\s\S]+?))?\s*\)$/i.exec(input);
  if (bridgeCall) {
    const args = parseJsonArgs(bridgeCall[3]);
    if (args.__error) return { error: args.__error };
    const command = commands.find(candidate => candidate.id === bridgeCall[2]);
    return command ? { id: command.id, args } : { error: `Unknown Underscores command: ${bridgeCall[2]}` };
  }
  const generic = parseGenericCommandSlash(input, commands.map(command => command.id));
  if (generic) return generic.error ? generic : { id: generic.id, args: generic.args || {} };
  const exact = findExactCommand(input, commands);
  if (exact) return { id: exact.id, args: {} };
  const candidates = commands.flatMap(command => commandVariants(command).map(variant => ({ command, variant: String(variant).trim().replace(/^\/+/, "") })))
    .filter(candidate => candidate.variant)
    .sort((left, right) => right.variant.length - left.variant.length);
  const normalized = input.replace(/^\/+/, "");
  const match = candidates.find(candidate => normalized.toLowerCase().startsWith(`${candidate.variant.toLowerCase()} `));
  if (!match) return null;
  const args = parseJsonArgs(normalized.slice(match.variant.length));
  if (args.__error) return { error: args.__error };
  return { id: match.command.id, args };
};

/**
 * Add the row's resolved Livecode target to command arguments when the
 * trigger did not provide an explicit target itself. Explicit elementId and
 * targetId arguments always win, so a row can still address another object.
 */
export const applyPlaylistTargetArgs = (args = {}, target = null) => {
  const next = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
  if (target?.id && next.elementId == null && next.targetId == null) next.elementId = target.id;
  return next;
};

/**
 * Run a trusted one-line Playlist JavaScript source against the public `__`
 * bridge. Playlist scripts are authored board code; obvious page/global escape
 * hatches are rejected so persisted/shared rows stay on the same API seam.
 */
export const executePlaylistJavaScript = async (source, bridge) => {
  const script = String(source || "").trim();
  if (!script) throw new Error("Playlist JavaScript trigger is empty.");
  if (script.length > MAX_PLAYLIST_SCRIPT_LENGTH) throw new Error(`Playlist JavaScript trigger is limited to ${MAX_PLAYLIST_SCRIPT_LENGTH} characters.`);
  if (blockedScriptTokens.test(script)) throw new Error("Playlist JavaScript may only use the trusted __ bridge.");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction("__", `"use strict"; return (async () => {\n${script}\n})();`);
  return run(bridge);
};

export const playlistTriggerPlaceholder = trigger => {
  if (trigger === "command") return "playlist.next or command-id {\"arg\":1}";
  if (trigger === "miniscript") return "/command playlist.next {} or /frame all";
  if (trigger === "js" || trigger === "script") return "const target = __.api.playlist.getTarget(); …";
  return "";
};
