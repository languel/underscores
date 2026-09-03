// Documentation's table of contents order. Getting started leads, then the
// three areas a new reader needs most, then the remaining systems.
export const DOCUMENTATION_SECTIONS = Object.freeze([
  "Getting started",
  "Workspace",
  "Livecode",
  "Scripting",
  "Physics",
  "Timeline",
  "Score",
  "Media",
  "Systems",
  "Workflow",
]);

export const documentationTopicSection = topic => {
  const id = String(topic?.id || "");
  if (id.startsWith("start-")) return "Getting started";
  if (id.startsWith("livecode-") || id === "script-parameters" || id === "panel-script") return "Livecode";
  if (id.startsWith("timeline-") || id === "panel-timeline") return "Timeline";
  if (id.startsWith("physics-") || id === "panel-physics") return "Physics";
  if (id === "workspace-interface") return "Workspace";
  if (id === "score" || id === "panel-score") return "Score";
  if (id === "media-streams" || id === "panel-media" || id === "panel-inputs" || id === "panel-holistic" || id === "panel-mapping") return "Media";
  if (id === "panel-outliner" || id === "panel-playlist" || id === "panel-properties" || id === "panel-settings" || id === "panel-info" || id === "panel-documentation" || id === "panel-grid") return "Workspace";
  if (id === "panel-brush" || id === "panel-synth" || id === "panel-mixer") return "Systems";
  if (id === "panel-multiplayer" || id === "panel-assistant" || id === "panel-history" || id === "panel-walkthrough" || id === "panel-console") return "Workflow";
  return "Scripting";
};

export const normalizeDocumentationFontSize = value => {
  if (value === null || value === undefined || String(value).trim() === "") return 12;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(10, Math.min(24, Math.round(numeric))) : 12;
};

const searchableText = entry => [
  entry.title,
  entry.category,
  entry.keywords,
  entry.body,
  entry.summary,
  ...(entry.tags || []),
].filter(Boolean).join(" ").toLowerCase();

export const filterDocumentationEntries = (entries, query) => {
  const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;
  return entries.filter(entry => {
    const haystack = searchableText(entry);
    return terms.every(term => haystack.includes(term));
  });
};
