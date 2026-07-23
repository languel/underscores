import { memo, useEffect, useMemo, useRef, useState } from "react";

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

const pathMatches = (path, query) => {
  if (!query?.needle) return true;
  const segments = path.map(segment => String(segment).toLowerCase());
  const fullPath = segments.join(".");
  if (query.exactOnly) return segments.includes(query.needle) || fullPath === query.needle;
  return segments.some(segment => segment.includes(query.needle)) || fullPath.includes(query.needle);
};

const nodeMatches = (value, path, query) => {
  if (value === null || typeof value !== "object") return pathMatches(path, query);
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

const PropertyNode = ({ name, value, depth = 0, path = [], query, onChange }) => {
  const nested = value !== null && typeof value === "object";
  if (!nested) {
    if (!pathMatches(path, query)) return null;
    const editable = canEditPath(path) && (Boolean(enumOptionsForPath(path)) || ["boolean", "number", "string"].includes(typeof value));
    return <div className={`properties-row ${editable ? "editable" : "readonly"}`}><span>{name}</span>{editable
      ? <EditableValue value={value} path={path} onChange={next => onChange(path, next)} />
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
        {visibleEntries.map(([key, item]) => <PropertyNode key={key} name={String(key)} value={item} depth={depth + 1} path={[...path, key]} query={query} onChange={onChange} />)}
      </div>
    </details>
  );
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
    count + collectLeafPaths(element).filter(path => pathMatches(path, query)).length
  ), 0), [elements, query]);

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
          const elementMatchCount = collectLeafPaths(element).filter(path => pathMatches(path, query)).length;
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
              <PropertyNode name="object" value={element} query={query} onChange={(path, value) => onChange(element.id, path, value)} />
            </section>
          );
        }) : <div className="scene-panel-empty compact">No matching properties.</div>}
      </div>
    </div>
  );
});

export default PropertiesPanel;
