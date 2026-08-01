export const SELECTION_FILTER_STORAGE_KEY = "drawerator_selection_filter_v1";

export const SELECTION_FILTER_ROLES = ["curve", "cursor", "trigger"];

export const DEFAULT_SELECTION_FILTER = Object.freeze({
  anything: true,
  curve: false,
  cursor: false,
  trigger: false,
});

export const normalizeSelectionFilter = value => {
  if (!value || typeof value !== "object" || value.anything === true) {
    return { ...DEFAULT_SELECTION_FILTER };
  }

  const normalized = {
    anything: false,
    curve: value.curve === true,
    cursor: value.cursor === true,
    trigger: value.trigger === true,
  };
  if (!SELECTION_FILTER_ROLES.some(role => normalized[role])) {
    return { ...DEFAULT_SELECTION_FILTER };
  }
  return normalized;
};

export const toggleSelectionFilter = (value, target) => {
  const current = normalizeSelectionFilter(value);
  if (target === "anything") return { ...DEFAULT_SELECTION_FILTER };
  if (!SELECTION_FILTER_ROLES.includes(target)) return current;

  const next = current.anything
    ? { anything: false, curve: false, cursor: false, trigger: false, [target]: true }
    : { ...current, [target]: !current[target] };
  return normalizeSelectionFilter(next);
};

export const getElementSelectionRole = element => {
  const role = element?.customData?.iannix?.role || element?.customData?.score?.role;
  return SELECTION_FILTER_ROLES.includes(role) ? role : null;
};

export const selectionFilterAllowsElement = (value, element) => {
  const filter = normalizeSelectionFilter(value);
  if (filter.anything) return true;
  const role = getElementSelectionRole(element);
  return role !== null && filter[role] === true;
};

export const isInteriorObjectSelectionGesture = event => Boolean(
  event
  && event.button === 0
  && event.metaKey
  && !event.ctrlKey
  && !event.altKey
);

export const filterSelectedElementIds = (elements, selectedElementIds, value) => {
  const selected = selectedElementIds && typeof selectedElementIds === "object"
    ? selectedElementIds
    : {};
  const allowedIds = new Set(
    (elements || [])
      .filter(element => !element?.isDeleted && selectionFilterAllowsElement(value, element))
      .map(element => element.id)
  );
  return Object.fromEntries(
    Object.entries(selected).filter(([id, isSelected]) => isSelected && allowedIds.has(id))
  );
};

export const selectionMapsEqual = (left, right) => {
  const leftIds = Object.keys(left || {}).filter(id => left[id]).sort();
  const rightIds = Object.keys(right || {}).filter(id => right[id]).sort();
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
};
