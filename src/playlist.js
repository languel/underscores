import { createTimeValue } from "./timeValue.js";

const PLAYLIST_VERSION = 1;
export const PLAYLIST_TRIGGER_TYPES = Object.freeze(["manual", "command", "miniscript", "js"]);

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clampDuration = value => Math.max(0.1, Math.min(3600, finite(value, 5)));
const makeId = () => `playlist_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
const normalizeDurationValue = (value, fallback = 5) => {
  const next = createTimeValue(value ?? `${fallback} s`, fallback);
  return { ...next, fallbackSeconds: clampDuration(next.fallbackSeconds) };
};

export const createPlaylistState = (value = {}) => {
  const source = value && typeof value === "object" ? value : {};
  const defaultDurationValue = normalizeDurationValue(source.defaultDurationValue, source.defaultDuration);
  const items = Array.isArray(source.items) ? source.items.map(item => {
    const durationValue = normalizeDurationValue(item?.durationValue, item?.duration);
    return {
    id: String(item?.id || makeId()),
    elementIds: [...new Set((Array.isArray(item?.elementIds) ? item.elementIds : item?.elementId ? [item.elementId] : []).map(String))],
    triggerTargetId: typeof item?.triggerTargetId === "string"
      ? item.triggerTargetId.slice(0, 240)
      : typeof item?.targetId === "string" ? item.targetId.slice(0, 240) : "",
    label: item?.label ? String(item.label) : "",
    duration: clampDuration(durationValue.fallbackSeconds),
    durationValue,
    transition: item?.transition === "fade" ? "fade" : "cut",
    enabled: item?.enabled !== false,
    armed: item?.armed === true,
    trigger: PLAYLIST_TRIGGER_TYPES.includes(item?.trigger) || item?.trigger === "event" || item?.trigger === "script" || item?.trigger === "srt" ? item.trigger : "manual",
    triggerSource: typeof item?.triggerSource === "string" ? item.triggerSource.slice(0, 12000) : "",
    };
  }) : [];
  const activeIndex = Math.max(0, Math.min(items.length - 1, Math.floor(finite(source.activeIndex, 0)))) || 0;
  return {
    version: PLAYLIST_VERSION,
    defaultDuration: clampDuration(defaultDurationValue.fallbackSeconds),
    defaultDurationValue,
    loop: source.loop === true,
    items,
    activeIndex,
  };
};

export const createPlaylistItem = ({ elementIds = [], label = "", duration = 5, durationValue = null, transition = "cut", enabled = true, armed = false, trigger = "manual", triggerSource = "", triggerTargetId = "" } = {}) => createPlaylistState({
  defaultDuration: duration,
  defaultDurationValue: durationValue || `${duration} s`,
  items: [{ id: makeId(), elementIds, label, duration, durationValue: durationValue || `${duration} s`, transition, enabled, armed, trigger, triggerSource, triggerTargetId }],
}).items[0];

export const movePlaylistItem = (items, fromIndex, toIndex) => {
  const source = Array.isArray(items) ? items : [];
  const from = Math.max(0, Math.min(source.length - 1, Math.floor(Number(fromIndex))));
  const to = Math.max(0, Math.min(source.length - 1, Math.floor(Number(toIndex))));
  if (!source.length || from === to || !Number.isFinite(from) || !Number.isFinite(to)) return source;
  const next = [...source];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const playlistItemLabel = (item, elements = []) => {
  const targets = (item?.elementIds || []).map(id => (elements || []).find(element => element.id === id)).filter(Boolean);
  if (item?.label) return item.label;
  if (targets.length === 1) return targets[0].label || targets[0].id;
  if (targets.length > 1) return `${targets.length} objects`;
  return item?.elementIds?.length ? "Missing object" : "Empty playlist row";
};

export const getPlaylistItemElements = (item, elements = []) => {
  const ids = new Set(item?.elementIds || []);
  return (elements || []).filter(element => ids.has(element.id) && !element.isDeleted);
};
