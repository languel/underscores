// Excalidraw stores its scene in back-to-front paint order. Drawerator keeps
// that array as the single source of truth for native canvas, Outliner, and
// overlay layer ordering.
export const getSceneLayerElements = (elements = []) => (
  Array.isArray(elements) ? elements.filter(element => element && !element.isDeleted) : []
);

// The Outliner reads naturally from front to back, while the scene array paints
// from back to front.
export const getOutlinerLayerElements = (elements = []) => (
  [...getSceneLayerElements(elements)].reverse()
);

export const reorderSceneElements = (
  elements = [],
  movedId,
  anchorId,
  placement = "front",
) => {
  if (!Array.isArray(elements) || !movedId || !anchorId || movedId === anchorId) {
    return elements;
  }

  const movedIndex = elements.findIndex(element => element?.id === movedId);
  const hasAnchor = elements.some(element => element?.id === anchorId);
  if (movedIndex < 0 || !hasAnchor) return elements;

  const next = [...elements];
  const [moved] = next.splice(movedIndex, 1);
  const nextAnchorIndex = next.findIndex(element => element?.id === anchorId);
  if (nextAnchorIndex < 0) return elements;

  // In the reverse Outliner view, dropping above means in front and dropping
  // below means behind. The scene array itself is back-to-front.
  next.splice(placement === "back" ? nextAnchorIndex : nextAnchorIndex + 1, 0, moved);

  return next.every((element, index) => element === elements[index]) ? elements : next;
};

const liveElementIds = (elements, elementIds) => new Set(
  (elementIds || []).filter(id => elements.some(element => element?.id === id && !element.isDeleted)),
);

export const groupSceneElements = (elements = [], elementIds = [], groupId) => {
  const selectedIds = liveElementIds(elements, elementIds);
  if (selectedIds.size < 2 || !groupId) return { elements, groupId: null };
  const nextElements = elements.map(element => {
    if (!selectedIds.has(element.id) || element.groupIds?.includes(groupId)) return element;
    return {
      ...element,
      groupIds: [...(element.groupIds || []), groupId],
      updated: Date.now(),
    };
  });
  return { elements: nextElements, groupId };
};

export const ungroupSceneElements = (elements = [], elementIds = []) => {
  const selectedIds = liveElementIds(elements, elementIds);
  const selected = elements.filter(element => selectedIds.has(element.id));
  if (!selected.length) return { elements, groupId: null };
  const sharedGroupIds = selected
    .map(element => element.groupIds || [])
    .reduce((shared, groupIds) => shared.filter(groupId => groupIds.includes(groupId)));
  const groupId = sharedGroupIds.at(-1) || selected[0].groupIds?.at(-1) || null;
  if (!groupId) return { elements, groupId: null };
  return {
    elements: elements.map(element => (
      element.groupIds?.includes(groupId)
        ? { ...element, groupIds: element.groupIds.filter(id => id !== groupId), updated: Date.now() }
        : element
    )),
    groupId,
  };
};

export const moveSceneElementsToGroupParent = (elements = [], elementIds = [], destinationGroupId = null) => {
  const selectedIds = liveElementIds(elements, elementIds);
  let changed = false;
  const nextElements = elements.map(element => {
    if (!selectedIds.has(element.id)) return element;
    const groupIds = element.groupIds || [];
    const currentGroupId = groupIds.at(-1) || null;
    if (!currentGroupId || currentGroupId === destinationGroupId) return element;
    changed = true;
    return { ...element, groupIds: groupIds.slice(0, -1), updated: Date.now() };
  });
  return changed ? nextElements : elements;
};

export const buildSceneGroupTree = (elements = [], { outlinerOrder = false } = {}) => {
  const root = { kind: "root", children: [] };
  const groupNodes = new Map();
  const ensureNode = (key, node, parent) => {
    const existing = groupNodes.get(key);
    if (existing) return existing;
    parent.children.push(node);
    groupNodes.set(key, node);
    return node;
  };
  const ensureGroup = (groupId, parent) => ensureNode(
    `canvas:${parent.id || "root"}:${groupId}`,
    { kind: "group", id: groupId, children: [] },
    parent,
  );
  const getScore = element => {
    const imported = element?.customData?.iannixImport;
    const scoreId = String(imported?.scoreId || "").trim();
    if (!scoreId) return null;
    return {
      id: scoreId,
      label: String(imported.scoreLabel || imported.source || "IanniX score").trim() || "IanniX score",
      group: String(imported.group || "").trim(),
    };
  };

  for (const element of outlinerOrder ? elements : getOutlinerLayerElements(elements)) {
    let parent = root;
    const score = getScore(element);
    if (score) {
      parent = ensureNode(
        `score:${score.id}`,
        { kind: "score", id: score.id, label: score.label, children: [] },
        parent,
      );
      if (score.group) {
        parent = ensureNode(
          `iannix:${score.id}:${score.group}`,
          { kind: "iannix-group", id: score.group, scoreId: score.id, children: [] },
          parent,
        );
      }
    }
    for (const groupId of element.groupIds || []) parent = ensureGroup(groupId, parent);
    parent.children.push({ kind: "element", element });
  }
  return root;
};
