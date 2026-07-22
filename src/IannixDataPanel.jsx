import { memo, useEffect, useRef } from "react";
import { normalizeIannixData } from "./iannixEngine.js";
import { getBulkIannixEditorValue, getSharedPrimitiveValue } from "./iannixBulkEdit.js";
import { infoProps } from "./uiInfo.js";

const roleName = (role, count) => {
  const name = `${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  return count === 1 ? name : `${name}s`;
};

const MixedCheckbox = ({ value, mixed, onChange, label }) => {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={inputRef}
      aria-label={label}
      aria-checked={mixed ? "mixed" : value}
      type="checkbox"
      checked={!mixed && Boolean(value)}
      onChange={event => onChange(event.target.checked)}
    />
  );
};

const PrimitiveEditor = ({ name, value, mixed, onChange, isLabelTemplate = false, labelTemplatePlaceholder = "${n}" }) => {
  const editedRef = useRef(false);
  useEffect(() => {
    editedRef.current = false;
  }, [mixed, value]);
  if (typeof value === "boolean") {
    return <MixedCheckbox label={name} value={value} mixed={mixed} onChange={onChange} />;
  }
  if (typeof value === "number") {
    return (
      <input
        key={`${value}:${mixed}`}
        aria-label={name}
        type="number"
        defaultValue={mixed ? "" : value}
        placeholder={mixed ? "Mixed" : ""}
        onBlur={event => {
          if (!event.currentTarget.value.trim()) return;
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next) && (mixed || next !== value)) onChange(next);
        }}
      />
    );
  }
  if (typeof value === "string") {
    return (
      <input
        key={`${value}:${mixed}:${isLabelTemplate}`}
        aria-label={isLabelTemplate ? "Label template" : name}
        type="text"
        defaultValue={mixed ? "" : value}
        placeholder={isLabelTemplate ? labelTemplatePlaceholder : mixed ? "Mixed" : ""}
        onChange={() => { editedRef.current = true; }}
        onBlur={event => {
          if (editedRef.current && (mixed || event.currentTarget.value !== value)) onChange(event.currentTarget.value);
        }}
      />
    );
  }
  return <code>{value === null ? "null" : String(value)}</code>;
};

const DataNode = ({ name, values, path = [], depth = 0, onChange, bulk, labelTemplatePlaceholder }) => {
  const value = values[0];
  const nested = value && typeof value === "object";
  if (!nested) {
    const shared = getSharedPrimitiveValue(values);
    const labelTemplate = bulk && path.length === 1 && path[0] === "label";
    return (
      <div className="iannix-data-row">
        <span>{labelTemplate ? "label template" : name}</span>
        <PrimitiveEditor
          name={name}
          value={shared.value}
          mixed={shared.mixed}
          isLabelTemplate={labelTemplate}
          labelTemplatePlaceholder={labelTemplatePlaceholder}
          onChange={next => onChange(path, next)}
        />
      </div>
    );
  }
  const entries = Object.keys(value);
  return (
    <details className="iannix-data-group" open={depth < 1}>
      <summary><span>{name}</span><small>{`{${entries.length}}`}</small></summary>
      <div>
        {entries.map(key => (
          <DataNode
            key={key}
            name={key}
            values={values.map(item => item?.[key])}
            path={[...path, key]}
            depth={depth + 1}
            onChange={onChange}
            bulk={bulk}
            labelTemplatePlaceholder={labelTemplatePlaceholder}
          />
        ))}
      </div>
    </details>
  );
};

const IannixDataPanel = memo(function IannixDataPanel({ elements = [], onChange }) {
  const iannixElements = elements
    .map(element => ({ element, data: normalizeIannixData(element.customData?.iannix) }))
    .filter(item => item.data.role);
  if (!iannixElements.length) return <div className="scene-panel-empty">Select an IanniX object to edit its data.</div>;

  const roles = new Set(iannixElements.map(item => item.data.role));
  if (roles.size !== 1) {
    return <div className="scene-panel-empty">Bulk editing requires selected IanniX objects with the same role.</div>;
  }

  const role = iannixElements[0].data.role;
  const elementIds = iannixElements.map(item => item.element.id);
  const values = iannixElements.map(item => getBulkIannixEditorValue(item.data, role));
  const bulk = values.length > 1;
  const excludedCount = elements.length - iannixElements.length;

  return (
    <div className="iannix-data-panel">
      <div className="iannix-data-object-heading iannix-data-bulk-heading">
        <strong>{bulk ? `${values.length} ${roleName(role, values.length)}` : (iannixElements[0].data.label || roleName(role, 1))}</strong>
        <code>{bulk ? "shared properties" : iannixElements[0].element.id}</code>
      </div>
      {bulk ? <span tabIndex={0} className="iannix-info-anchor" {...infoProps("Bulk score editing", `Mixed fields are blank. Use \${n} in the label template for 1-based numbering.${excludedCount > 0 ? ` ${excludedCount} non-IanniX object${excludedCount === 1 ? " was" : "s were"} excluded.` : ""}`)}>ⓘ</span> : null}
      <DataNode
        name="iannix"
        values={values}
        bulk={bulk}
        labelTemplatePlaceholder={`${role}_${"${n}"}`}
        onChange={(path, value) => onChange(elementIds, path, value)}
      />
    </div>
  );
});

export default IannixDataPanel;
