import { memo } from "react";

const PrimitiveEditor = ({ value, onChange }) => {
  if (typeof value === "boolean") {
    return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
  }
  if (typeof value === "number") {
    return <input type="number" defaultValue={value} onBlur={event => {
      const next = Number(event.currentTarget.value);
      if (Number.isFinite(next) && next !== value) onChange(next);
    }} />;
  }
  if (typeof value === "string") {
    return <input type="text" defaultValue={value} onBlur={event => {
      if (event.currentTarget.value !== value) onChange(event.currentTarget.value);
    }} />;
  }
  return <code>{value === null ? "null" : String(value)}</code>;
};

const DataNode = ({ name, value, path = [], depth = 0, onChange }) => {
  const nested = value && typeof value === "object";
  if (!nested) {
    return (
      <div className="iannix-data-row">
        <span>{name}</span>
        <PrimitiveEditor value={value} onChange={next => onChange(path, next)} />
      </div>
    );
  }
  const entries = Object.entries(value);
  return (
    <details className="iannix-data-group" open={depth < 1}>
      <summary><span>{name}</span><small>{`{${entries.length}}`}</small></summary>
      <div>
        {entries.map(([key, item]) => (
          <DataNode key={key} name={key} value={item} path={[...path, key]} depth={depth + 1} onChange={onChange} />
        ))}
      </div>
    </details>
  );
};

const IannixDataPanel = memo(function IannixDataPanel({ elements = [], onChange }) {
  if (!elements.length) return <div className="scene-panel-empty">Select an IanniX object to edit its data.</div>;
  return (
    <div className="iannix-data-panel">
      {elements.map(element => (
        <div className="iannix-data-object" key={element.id}>
          <div className="iannix-data-object-heading">
            <strong>{element.customData?.iannix?.label || element.type}</strong>
            <code>{element.id}</code>
          </div>
          <DataNode name="iannix" value={element.customData?.iannix || {}} onChange={(path, value) => onChange(element.id, path, value)} />
        </div>
      ))}
    </div>
  );
});

export default IannixDataPanel;
