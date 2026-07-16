import { memo } from "react";

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

const EditableValue = ({ value, onChange }) => {
  if (typeof value === "boolean") return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
  if (typeof value === "number") return <input type="number" defaultValue={value} onBlur={event => {
    const next = Number(event.target.value);
    if (Number.isFinite(next) && next !== value) onChange(next);
  }} />;
  if (typeof value === "string") return <input type="text" defaultValue={value} onBlur={event => {
    if (event.target.value !== value) onChange(event.target.value);
  }} />;
  return <code>{primitiveText(value)}</code>;
};

const PropertyNode = ({ name, value, depth = 0, path = [], onChange }) => {
  const nested = value && typeof value === "object";
  if (!nested) {
    const editable = canEditPath(path) && ["boolean", "number", "string"].includes(typeof value);
    return <div className={`properties-row ${editable ? "editable" : "readonly"}`}><span>{name}</span>{editable
      ? <EditableValue key={`${typeof value}-${value}`} value={value} onChange={next => onChange(path, next)} />
      : <code>{primitiveText(value)}</code>}</div>;
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return (
    <details className="properties-group" open={depth < 1}>
      <summary><span>{name}</span><small>{Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`}</small></summary>
      <div className="properties-children">
        {entries.map(([key, item]) => <PropertyNode key={key} name={String(key)} value={item} depth={depth + 1} path={[...path, key]} onChange={onChange} />)}
      </div>
    </details>
  );
};

const PropertiesPanel = memo(function PropertiesPanel({ elements = [], onChange }) {
  if (!elements.length) return <div className="scene-panel-empty">Select an object to inspect its properties.</div>;
  return (
    <div className="properties-panel">
      {elements.map(element => (
        <section className="properties-object" key={element.id}>
          <div className="properties-object-heading">
            <strong>{element.customData?.iannix?.label || element.type}</strong>
            <code>{element.id}</code>
          </div>
          <PropertyNode name="object" value={element} onChange={(path, value) => onChange(element.id, path, value)} />
        </section>
      ))}
    </div>
  );
});

export default PropertiesPanel;
