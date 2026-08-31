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
