import { useEffect, useMemo, useState } from "react";
import NumericInput from "./NumericInput.jsx";
import { HELP_TOPICS } from "./helpTopics.js";
import { DOCUMENTATION_SECTIONS, documentationTopicSection, filterDocumentationEntries, normalizeDocumentationFontSize } from "./documentationPanelModel.js";

const DOCUMENTATION_FONT_SIZE_KEY = "underscores_documentation_font_size";

const topicEntries = HELP_TOPICS.map(topic => ({ ...topic, type: "reference", category: "Reference", section: documentationTopicSection(topic) }));

const entryBody = entry => entry.body || entry.summary || "";

const DOCUMENTATION_LIVECODE_KINDS = Object.freeze({
  "script-p5": "p5",
  "script-glsl": "shader",
  "script-play-core": "playcore",
  "script-orca": "orca",
  "script-strudel": "strudel",
  "script-manim": "manim",
  "script-three": "three",
  "script-markdown": "markdown",
  "script-latex": "latex",
  "script-html": "html",
  "script-tixy": "tixy",
  "script-svg": "svg",
});

const DocumentationActionIcon = ({ type }) => {
  const paths = {
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5H5v11h3" /></>,
    add: <><path d="M12 5v14M5 12h14" /></>,
  };
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
};

const DocumentationCodeBlock = ({ source, entry, onCreateLivecode }) => {
  const [copyState, setCopyState] = useState("ready");
  const kind = DOCUMENTATION_LIVECODE_KINDS[entry?.sourceId || entry?.id];
  const copy = async () => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await globalThis.navigator.clipboard.writeText(source);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };
  const copyLabel = copyState === "copied" ? "Copied example to the clipboard" : copyState === "unavailable" ? "Clipboard unavailable" : "Copy example to the clipboard";
  return (
    <div className="documentation-code-block">
      <pre><code>{source}</code></pre>
      <div className="documentation-code-actions">
        <button type="button" className="documentation-code-action" onClick={() => void copy()} title={copyLabel} aria-label={copyLabel}><DocumentationActionIcon type="copy" /></button>
        {kind && <button
          type="button"
          className="documentation-code-action"
          onClick={() => onCreateLivecode?.({ kind, source, name: `${entry.title} example` })}
          title="Create a Livecode node from this example"
          aria-label="Create a Livecode node from this example"
        ><DocumentationActionIcon type="add" /></button>}
      </div>
    </div>
  );
};

export default function DocumentationPanel({
  helpCatalog = [],
  horizontal = false,
  gettingStartedId,
  request = null,
  onStartWalkthrough,
  onInsertHelp,
  onCreateLivecode,
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(() => gettingStartedId ? `patch:${gettingStartedId}` : topicEntries[0]?.id || "");
  const [fontSize, setFontSize] = useState(() => {
    try {
      return normalizeDocumentationFontSize(localStorage.getItem(DOCUMENTATION_FONT_SIZE_KEY));
    } catch {
      return 12;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DOCUMENTATION_FONT_SIZE_KEY, String(fontSize));
    } catch {
      // Documentation remains usable when local storage is unavailable.
    }
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty("--underscores-documentation-font-size", `${fontSize}px`);
  }, [fontSize]);

  const patchEntries = useMemo(() => helpCatalog.map(item => ({
    ...item,
    id: `patch:${item.id}`,
    sourceId: item.id,
    type: "patch",
  })), [helpCatalog]);
  const allEntries = useMemo(() => [...topicEntries, ...patchEntries], [patchEntries]);
  const matches = useMemo(() => filterDocumentationEntries(allEntries, query), [allEntries, query]);
  const referenceMatches = matches.filter(entry => entry.type === "reference");
  const patchMatches = matches.filter(entry => entry.type === "patch");
  const selectedEntry = matches.find(entry => entry.id === selectedId) || matches[0] || null;
  const gettingStarted = patchEntries.find(entry => entry.sourceId === gettingStartedId) || patchEntries[0] || null;

  useEffect(() => {
    if (!request) return;
    if (request.query !== undefined) setQuery(String(request.query || ""));
    if (request.entryId) {
      const requestedId = String(request.entryId);
      setSelectedId(allEntries.some(entry => entry.id === requestedId)
        ? requestedId
        : allEntries.some(entry => entry.id === `patch:${requestedId}`) ? `patch:${requestedId}` : requestedId);
    }
  }, [allEntries, request]);

  const selectEntry = id => setSelectedId(id);
  const startEntry = entry => {
    if (entry?.walkthroughId) onStartWalkthrough?.(entry.walkthroughId, { stepId: entry.stepId });
  };

  const referenceSections = DOCUMENTATION_SECTIONS
    .map(section => ({ section, entries: referenceMatches.filter(entry => entry.section === section) }))
    .filter(group => group.entries.length > 0);
  const patchSections = [...new Set(patchMatches.map(entry => entry.category || "Help"))]
    .map(section => ({ section, entries: patchMatches.filter(entry => (entry.category || "Help") === section) }));

  return (
    <div
      className={`documentation-panel${horizontal ? " horizontal" : ""}`}
      style={{ "--documentation-font-size": `${fontSize}px` }}
    >
      <div className="documentation-panel-toolbar">
        <button
          type="button"
          className="documentation-getting-started"
          disabled={!gettingStarted?.walkthroughId}
          onClick={() => startEntry(gettingStarted)}
          title="Start the guided introduction to Underscores"
        >Getting started</button>
        <label className="documentation-font-size-control" title="Documentation font size">
          <span aria-hidden="true">Aa</span>
          <NumericInput
            min="10"
            max="24"
            step="1"
            value={fontSize}
            defaultValue={12}
            onCommit={value => setFontSize(normalizeDocumentationFontSize(value))}
            aria-label="Documentation font size"
          />
        </label>
      </div>
      <div className="documentation-panel-search">
        <input
          type="search"
          value={query}
          placeholder="Search documentation"
          aria-label="Search documentation"
          onKeyDown={event => event.stopPropagation()}
          onChange={event => setQuery(event.target.value)}
        />
        {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
      </div>
      <div className="documentation-panel-main">
        <nav className="documentation-toc" aria-label="Documentation contents">
          {referenceSections.length > 0 && (
            <section>
              <h3>Reference</h3>
              {referenceSections.map(group => (
                <div className="documentation-toc-subsection" key={group.section}>
                  <h4>{group.section}</h4>
                  {group.entries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      className={selectedEntry?.id === entry.id ? "active" : ""}
                      aria-current={selectedEntry?.id === entry.id ? "page" : undefined}
                      onClick={() => selectEntry(entry.id)}
                    >{entry.title}</button>
                  ))}
                </div>
              ))}
            </section>
          )}
          {patchSections.length > 0 && (
            <section>
              <h3>Help patches</h3>
              {patchSections.map(group => (
                <div className="documentation-toc-subsection" key={group.section}>
                  <h4>{group.section}</h4>
                  {group.entries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      className={selectedEntry?.id === entry.id ? "active" : ""}
                      aria-current={selectedEntry?.id === entry.id ? "page" : undefined}
                      onClick={() => selectEntry(entry.id)}
                    >
                      <span>{entry.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </section>
          )}
          {matches.length === 0 && <p className="documentation-empty">No documentation found.</p>}
        </nav>
        <article className="documentation-article" aria-live="polite">
          {selectedEntry && (
            <>
              <header>
                <small>{selectedEntry.category}</small>
                <h2>{selectedEntry.title}</h2>
              </header>
              <div className="documentation-article-body">
                {entryBody(selectedEntry).split(/\n\n+/).map((paragraph, index) => <p key={`${selectedEntry.id}:${index}`}>{paragraph}</p>)}
              </div>
              {selectedEntry.examples?.length > 0 && (
                <section className="documentation-examples" aria-label="Examples">
                  <h3>Examples</h3>
                  {selectedEntry.examples.map(example => (
                    <DocumentationCodeBlock
                      key={example}
                      source={String(example)}
                      entry={selectedEntry}
                      onCreateLivecode={onCreateLivecode}
                    />
                  ))}
                </section>
              )}
              {selectedEntry.type === "patch" && (
                <footer className="documentation-actions">
                  {selectedEntry.walkthroughId && <button type="button" onClick={() => startEntry(selectedEntry)}>Start walkthrough</button>}
                  {selectedEntry.insertCommand && <button type="button" onClick={() => onInsertHelp?.(selectedEntry)}>Insert patch</button>}
                </footer>
              )}
            </>
          )}
        </article>
      </div>
    </div>
  );
}
