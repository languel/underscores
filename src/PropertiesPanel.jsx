import { memo, useEffect, useMemo, useRef, useState } from "react";
import { EMBED_DISPLAY_MODES, embedPolicyForElement, getEmbedProvider } from "./embedPolicy.js";
import { DEFAULT_P5_CDN_URL, isP5FrameElement, normalizeP5Frame, resolveP5SourceMode } from "./p5Frame.js";

const READ_ONLY_KEYS = new Set([
  "id", "type", "width", "height", "version", "versionNonce", "updated", "index", "seed",
  "points", "pressures", "originalPoints", "boundElements", "groupIds", "frameId", "containerId",
  "startBinding", "endBinding", "isDeleted", "excalidrawVersion", "lastWidth", "lastHeight",
]);

const primitiveText = value => {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
};

const canEditPath = path => !path.some(segment => READ_ONLY_KEYS.has(String(segment)));

const readPath = (value, path) => path.reduce((current, segment) => (
  current != null && Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined
), value);

const isSharedEditablePath = (elements, path) => {
  if (elements.length < 2 || !canEditPath(path)) return false;
  const values = elements.map(element => readPath(element, path));
  if (values.some(value => value === undefined)) return false;
  const types = new Set(values.map(value => typeof value));
  return types.size === 1 && (["boolean", "number", "string"].includes(values[0]) || Boolean(enumOptionsForPath(path)));
};

const enumOptionsForPath = path => {
  const key = String(path.at(-1) || "");
  const joined = path.map(String).join(".");
  if (joined === "customData.iannix.role") return [
    [null, "None"], ["curve", "Curve"], ["cursor", "Cursor"], ["trigger", "Trigger"],
  ];
  if (joined === "customData.iannix.time.loopMode") return [
    ["once", "Once / hold"], ["loop", "Loop"], ["pingPong", "Ping-pong"],
  ];
  if (joined === "customData.iannix.time.startMode") return [["manual", "Manual"], ["curve", "Curve"]];
  if (joined === "customData.iannix.time.durationMode") return [
    ["geometry", "Geometry"], ["manual", "Manual"], ["curve", "Curve"], ["ratio", "Ratio"],
  ];
  if (joined === "customData.iannix.gridBinding.metric") return [
    ["auto", "Auto"], ["xSpan", "X span"], ["ySpan", "Y span"], ["arcLength", "Arc length"], ["manhattan", "Manhattan"],
  ];
  if (joined === "customData.iannix.trigger.behavior") return [["pulse", "Pulse"], ["glissando", "Continuous glissando"]];
  if (joined === "customData.iannix.trigger.midiBaseSource") return [["cursor", "Cursor"], ["curve", "Curve"]];
  if (key === "strokeStyle") return [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];
  if (key === "fillStyle") return [["hachure", "Hachure"], ["cross-hatch", "Cross-hatch"], ["solid", "Solid"], ["zigzag", "Zigzag"]];
  if (key === "textAlign") return [["left", "Left"], ["center", "Center"], ["right", "Right"]];
  if (key === "verticalAlign") return [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]];
  return null;
};

const collectLeafPaths = (value, path = []) => {
  if (value === null || typeof value !== "object") return [path];
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.flatMap(([key, item]) => collectLeafPaths(item, [...path, key]));
};

const collectLeafEntries = (value, path = []) => {
  if (value === null || typeof value !== "object") return [{ path, value }];
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.flatMap(([key, item]) => collectLeafEntries(item, [...path, key]));
};

const pathMatches = (path, query) => {
  if (!query?.needle) return true;
  const segments = path.map(segment => String(segment).toLowerCase());
  const fullPath = segments.join(".");
  if (query.exactOnly) return segments.includes(query.needle) || fullPath === query.needle;
  return segments.some(segment => segment.includes(query.needle)) || fullPath.includes(query.needle);
};

const leafMatches = (value, path, query) => {
  if (pathMatches(path, query)) return true;
  // A non-field query is also useful for retained imported metadata such as
  // customData.iannixImport.group = "lines". Exact field-name filtering keeps
  // its existing narrow behaviour once a field name is recognised.
  return Boolean(query?.needle && !query.exactOnly && String(value ?? "").toLowerCase().includes(query.needle));
};

const nodeMatches = (value, path, query) => {
  if (value === null || typeof value !== "object") return leafMatches(value, path, query);
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.some(([key, item]) => nodeMatches(item, [...path, key], query));
};

const EditableValue = ({ value, path, onChange }) => {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => value == null ? "" : String(value));
  useEffect(() => {
    if (typeof document === "undefined" || document.activeElement !== inputRef.current) {
      setDraft(value == null ? "" : String(value));
    }
  }, [value]);
  const enumOptions = enumOptionsForPath(path);
  if (enumOptions) return (
    <select value={value ?? ""} onChange={event => {
      const option = enumOptions.find(([candidate]) => String(candidate ?? "") === event.target.value);
      if (option) onChange(option[0]);
    }}>
      {enumOptions.map(([optionValue, label]) => <option key={String(optionValue ?? "none")} value={optionValue ?? ""}>{label}</option>)}
    </select>
  );
  if (typeof value === "boolean") return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
  if (typeof value === "number") return <input ref={inputRef} type="number" value={draft} onChange={event => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const next = Number(nextDraft);
    if (nextDraft.trim() && Number.isFinite(next) && next !== value) onChange(next);
  }} onBlur={() => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) setDraft(String(value));
  }} />;
  if (typeof value === "string") return <input ref={inputRef} type="text" value={draft} onChange={event => {
    const next = event.target.value;
    setDraft(next);
    if (next !== value) onChange(next);
  }} />;
  return <code>{primitiveText(value)}</code>;
};

const PropertyNode = ({ name, value, depth = 0, path = [], query, onChange, isSharedPath }) => {
  const nested = value !== null && typeof value === "object";
  if (!nested) {
    if (!leafMatches(value, path, query)) return null;
    const editable = canEditPath(path) && (Boolean(enumOptionsForPath(path)) || ["boolean", "number", "string"].includes(typeof value));
    return <div className={`properties-row ${editable ? "editable" : "readonly"}`}><span>{name}</span>{editable
      ? <EditableValue value={value} path={path} onChange={next => onChange(path, next, isSharedPath?.(path))} />
      : <code>{primitiveText(value)}</code>}</div>;
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  const visibleEntries = query?.needle
    ? entries.filter(([key, item]) => nodeMatches(item, [...path, key], query))
    : entries;
  if (!visibleEntries.length) return null;
  return (
    <details className="properties-group" open={query?.needle ? true : depth < 1}>
      <summary><span>{name}</span><small>{Array.isArray(value) ? `[${visibleEntries.length}]` : `{${visibleEntries.length}}`}</small></summary>
      <div className="properties-children">
        {visibleEntries.map(([key, item]) => <PropertyNode key={key} name={String(key)} value={item} depth={depth + 1} path={[...path, key]} query={query} onChange={onChange} isSharedPath={isSharedPath} />)}
      </div>
    </details>
  );
};

const EmbedControls = ({ element, query, onChange }) => {
  if (element?.type !== "embeddable" || isP5FrameElement(element)) return null;
  const policy = embedPolicyForElement(element);
  const matches = name => !query?.needle || ["embed", "link", "url", "provider", "enabled", "display", "interaction", "crop", "css", "reload", name].some(value => value.includes(query.needle));
  if (query?.needle && !matches("embed")) return null;
  const preventCanvasDeletion = event => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.stopPropagation();
    // Excalidraw also has native document-level keyboard listeners. Stopping
    // the underlying event prevents its canvas delete shortcut from seeing
    // keystrokes intended to edit this URL.
    event.nativeEvent?.stopImmediatePropagation?.();
  };
  return (
    <details className="properties-group properties-embed-group" open>
      <summary><span>embed</span><small>{getEmbedProvider(element.link)}</small></summary>
      <div className="properties-children">
        {matches("link") && <div className="properties-row editable"><span>url</span><input className="properties-embed-url" type="url" value={element.link || ""} onKeyDown={preventCanvasDeletion} onKeyUp={preventCanvasDeletion} onChange={event => onChange(["link"], event.target.value)} /></div>}
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>content</span><button type="button" className="iannix-flat-button" onClick={() => onChange(["customData", "draweratorEmbed", "reloadNonce"], Date.now())}>Reload embed</button></div>}
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={policy.enabled} onChange={event => onChange(["customData", "draweratorEmbed", "enabled"], event.target.checked)} /></div>}
        {matches("display") && <div className="properties-row editable"><span>display</span><select value={policy.display} onChange={event => onChange(["customData", "draweratorEmbed", "display"], event.target.value)}>{EMBED_DISPLAY_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={policy.allowInteraction} onChange={event => onChange(["customData", "draweratorEmbed", "allowInteraction"], event.target.checked)} /></div>}
        {matches("crop") && [["cropTop", "crop top"], ["cropRight", "crop right"], ["cropBottom", "crop bottom"], ["cropLeft", "crop left"]].map(([key, label]) => <div className="properties-row editable" key={key}><span>{label} px</span><input type="number" min="0" step="1" value={policy[key]} onChange={event => onChange(["customData", "draweratorEmbed", key], Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)} /></div>)}
        {matches("css") && <div className="properties-row properties-embed-css editable"><span>inject CSS</span><textarea value={policy.css} onChange={event => onChange(["customData", "draweratorEmbed", "css"], event.target.value)} placeholder="body { margin: 0; }" /></div>}
        {!query?.needle && <p className="properties-embed-note">HTTP(S) only. “Presentation only” embeds appear when Live presentation mode is enabled. Interact passes mouse input to the page; turn it off to select or transform the embed. Crop hides fixed page chrome. CSS is injected only into same-origin embeds—browser security prevents it for external sites such as p5.js.</p>}
      </div>
    </details>
  );
};

const P5FrameControls = ({ element, query, onChange }) => {
  if (!isP5FrameElement(element)) return null;
  const frame = normalizeP5Frame(element.customData?.draweratorP5);
  const matches = name => !query?.needle || ["p5", "sketch", "mode", "classic", "global", "runtime", "cdn", "autoplay", "fps", "transparent", "interaction", "reload", "source", name]
    .some(value => value.includes(query.needle));
  if (query?.needle && !matches("p5")) return null;
  const stopCanvasKeys = event => {
    event.stopPropagation();
    if (["Delete", "Backspace", "Escape"].includes(event.key)) event.nativeEvent?.stopImmediatePropagation?.();
  };
  const update = patch => onChange(["customData", "draweratorP5"], normalizeP5Frame({ ...frame, ...patch }));
  return (
    <details className="properties-group properties-p5-group" open>
      <summary><span>p5 sketch</span><small>{resolveP5SourceMode(frame)} · {frame.runtime}</small></summary>
      <div className="properties-children">
        {matches("mode") && <div className="properties-row editable"><span>source mode</span><select value={frame.mode} onChange={event => update({ mode: event.target.value })}><option value="auto">Auto detect</option><option value="instance">Instance mode (p.*)</option><option value="global">Classic global mode</option></select></div>}
        {matches("runtime") && <div className="properties-row editable"><span>runtime</span><select value={frame.runtime} onChange={event => update({ runtime: event.target.value })}><option value="bundled">Bundled p5</option><option value="cdn">CDN URL</option></select></div>}
        {frame.runtime === "cdn" && matches("cdn") && <div className="properties-row editable"><span>cdn url</span><input type="url" value={frame.cdnUrl || DEFAULT_P5_CDN_URL} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ cdnUrl: event.target.value })} /></div>}
        {matches("autoplay") && <div className="properties-row editable"><span>autoplay</span><input type="checkbox" checked={frame.autoplay} onChange={event => update({ autoplay: event.target.checked })} /></div>}
        {matches("fps") && <div className="properties-row editable"><span>fps</span><input type="number" min="1" max="120" step="1" value={frame.fps} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ fps: event.target.valueAsNumber })} /></div>}
        {matches("transparent") && <div className="properties-row editable"><span>transparent</span><input type="checkbox" checked={frame.transparent} onChange={event => update({ transparent: event.target.checked })} /></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={frame.allowInteraction} onChange={event => update({ allowInteraction: event.target.checked })} /></div>}
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>preview</span><button type="button" className="iannix-flat-button" onClick={() => update({ reloadNonce: Date.now() })}>Reload sketch</button></div>}
        {matches("source") && <div className="properties-row properties-p5-source editable"><span>source</span><textarea value={frame.source} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ source: event.target.value })} spellCheck="false" /></div>}
        {!query?.needle && <p className="properties-p5-note">Trusted local code: this sketch runs directly in Drawerator with full page access. Use only scripts you trust. Bundled p5 is included with Drawerator; CDN mode loads a compatible runtime from the URL above.</p>}
      </div>
    </details>
  );
};

const embedMatchesQuery = (element, query) => {
  if (element?.type !== "embeddable") return false;
  if (!query?.needle) return true;
  return ["embed", "link", "url", "provider", "enabled", "display", "interaction", "crop", "css", "reload"]
    .some(value => value.includes(query.needle));
};

const p5MatchesQuery = (element, query) => {
  if (!isP5FrameElement(element)) return false;
  if (!query?.needle) return true;
  return ["p5", "sketch", "mode", "classic", "global", "runtime", "cdn", "autoplay", "fps", "transparent", "interaction", "reload", "source"]
    .some(value => value.includes(query.needle));
};

const PropertiesPanel = memo(function PropertiesPanel({ elements = [], onChange, onRename }) {
  const [filter, setFilter] = useState("");
  const [activeObjectId, setActiveObjectId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const editingRef = useRef(null);
  const query = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return { needle: "", exactOnly: false };
    const paths = elements.flatMap(element => collectLeafPaths(element));
    const exactOnly = paths.some(path => {
      const segments = path.map(segment => String(segment).toLowerCase());
      return segments.includes(needle) || segments.join(".") === needle;
    });
    return { needle, exactOnly };
  }, [elements, filter]);
  const matchingFieldCount = useMemo(() => elements.reduce((count, element) => (
    count
      + collectLeafEntries(element).filter(entry => leafMatches(entry.value, entry.path, query)).length
      + (embedMatchesQuery(element, query) ? 4 : 0)
      + (p5MatchesQuery(element, query) ? 6 : 0)
  ), 0), [elements, query]);
  const sharedPath = path => isSharedEditablePath(elements, path);

  const beginRename = element => {
    setActiveObjectId(element.id);
    setEditingId(element.id);
    setEditingValue(element.customData?.iannix?.label || "");
    requestAnimationFrame(() => editingRef.current?.focus());
  };

  const finishRename = (element, commit = true) => {
    if (commit) onRename?.(element.id, editingValue.trim());
    setEditingId(null);
  };

  const handleKeyDown = event => {
    if (event.key !== "F2" || editingId) return;
    const element = elements.find(item => item.id === activeObjectId) || elements[0];
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    beginRename(element);
  };

  if (!elements.length) return <div className="scene-panel-empty">Select an object to inspect its properties.</div>;
  return (
    <div className="properties-panel" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="properties-toolbar">
        <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter properties" aria-label="Filter object properties" />
        <span title={`${matchingFieldCount} matching fields`}>{matchingFieldCount}</span>
      </div>
      <div className="properties-list">
        {matchingFieldCount ? elements.map(element => {
          const elementMatchCount = collectLeafEntries(element).filter(entry => leafMatches(entry.value, entry.path, query)).length
            + (embedMatchesQuery(element, query) ? 4 : 0)
            + (p5MatchesQuery(element, query) ? 6 : 0);
          if (!elementMatchCount) return null;
          const label = element.customData?.iannix?.label;
          return (
            <section className="properties-object" key={element.id} onMouseDown={() => setActiveObjectId(element.id)}>
              <div className="properties-object-heading" onDoubleClick={() => beginRename(element)} title="Press F2 to edit the score label">
                <span className={`outliner-type type-${element.type}`}>{element.type.slice(0, 1).toUpperCase()}</span>
                <div className="properties-object-name">
                  {editingId === element.id ? (
                    <input ref={editingRef} className="outliner-label-input" value={editingValue} placeholder={element.id} onChange={event => setEditingValue(event.target.value)} onBlur={() => finishRename(element)} onKeyDown={event => {
                      if (event.key === "Enter") { event.preventDefault(); finishRename(element); }
                      if (event.key === "Escape") { event.preventDefault(); finishRename(element, false); }
                    }} aria-label={`Rename ${element.id}`} />
                  ) : <strong>{label || element.id}</strong>}
                  <code>{element.type}{label ? ` · ${element.id}` : ""}</code>
                </div>
              </div>
              <P5FrameControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <EmbedControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <PropertyNode
                name="object"
                value={element}
                query={query}
                isSharedPath={sharedPath}
                onChange={(path, value, shared) => onChange(shared ? elements.map(item => item.id) : [element.id], path, value)}
              />
            </section>
          );
        }) : <div className="scene-panel-empty compact">No matching properties.</div>}
      </div>
    </div>
  );
});

export default PropertiesPanel;
