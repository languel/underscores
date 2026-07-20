export const BULK_IANNIX_ROLE_SECTIONS = Object.freeze({
  curve: ["time", "midi"],
  cursor: ["time", "cursor", "midi"],
  trigger: ["time", "trigger"],
});

export const expandIndexedLabelTemplate = (template, index) => String(template ?? "")
  .replaceAll("${n}", String(index + 1));

export const getBulkIannixEditorValue = (data, role) => {
  const value = {
    active: data.active,
    label: data.label,
  };
  for (const section of BULK_IANNIX_ROLE_SECTIONS[role] || ["time"]) {
    value[section] = data[section];
  }
  return value;
};

export const getSharedPrimitiveValue = values => {
  if (!values?.length) return { mixed: false, value: undefined };
  const first = values[0];
  return {
    mixed: !values.every(value => Object.is(value, first)),
    value: first,
  };
};
