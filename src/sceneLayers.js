// Excalidraw stores its scene in back-to-front paint order. Underscores keeps
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

const hasObjectData = (element, keys) => {
  if (!element || element.isDeleted) return false;
  const customData = element.customData || {};
  return keys.some(key => customData[key] != null);
};

const CODE_OBJECT_DATA_KEYS = ["underscoresLivecode", "underscoresSvg", "underscoresP5", "p5", "underscoresPlayCore"];
const SCORE_OBJECT_DATA_KEYS = ["score", "iannix", "iannixImport"];
const PHYSICS_OBJECT_DATA_KEYS = ["physics", "underscoresPhysics"];
const OTHER_MANAGED_OBJECT_DATA_KEYS = [
  "underscoresMediaStream",
  "underscoresMediaMap",
  "underscoresEmbed",
];

export const isOutlinerCodeElement = element => hasObjectData(element, CODE_OBJECT_DATA_KEYS);
export const isOutlinerScoreElement = element => hasObjectData(element, SCORE_OBJECT_DATA_KEYS);
export const isOutlinerPhysicsElement = element => hasObjectData(element, PHYSICS_OBJECT_DATA_KEYS);

// Native Excalidraw objects are ordinary drawing primitives without one of the
// dedicated Outliner roles above. Gesture/automation metadata intentionally
// remains native: it enhances a drawing rather than replacing it with a node.
export const isNativeExcalidrawElement = element => {
  if (!element || element.isDeleted) return false;
  return !isOutlinerCodeElement(element)
    && !isOutlinerScoreElement(element)
    && !isOutlinerPhysicsElement(element)
    && !hasObjectData(element, OTHER_MANAGED_OBJECT_DATA_KEYS);
};

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

// Moves leaf elements directly into an existing group. This intentionally
// replaces their current group path: a drag onto a group is an explicit
// reparent operation, rather than an additive membership edit.
export const moveSceneElementsToGroup = (elements = [], elementIds = [], destinationGroupId) => {
  if (!destinationGroupId) return elements;
  const selectedIds = liveElementIds(elements, elementIds);
  if (!selectedIds.size) return elements;
  const destinationMember = elements.find(element => !element?.isDeleted && element.groupIds?.includes(destinationGroupId));
  if (!destinationMember) return elements;
  const destinationPath = destinationMember.groupIds.slice(0, destinationMember.groupIds.lastIndexOf(destinationGroupId) + 1);
  let changed = false;
  const next = elements.map(element => {
    if (!selectedIds.has(element.id)) return element;
    const groupIds = element.groupIds || [];
    if (groupIds.length === destinationPath.length && groupIds.every((id, index) => id === destinationPath[index])) return element;
    changed = true;
    return { ...element, groupIds: [...destinationPath], updated: Date.now() };
  });
  return changed ? next : elements;
};

// Reparents an entire Excalidraw group while retaining the group's nested
// descendants. Group IDs are authored hierarchy identifiers, so moving the
// group means rewriting the shared prefix of every member, not merely moving
// one leaf out of its current group.
export const moveSceneGroupToParent = (elements = [], groupId, destinationGroupId = null) => {
  if (!groupId || groupId === destinationGroupId) return elements;
  const members = elements.filter(element => !element?.isDeleted && element.groupIds?.includes(groupId));
  if (!members.length) return elements;
  // A parent cannot be one of this group's descendants.
  if (destinationGroupId && members.some(element => {
    const groupIndex = element.groupIds.lastIndexOf(groupId);
    return element.groupIds.slice(groupIndex + 1).includes(destinationGroupId);
  })) return elements;

  let destinationPath = [];
  if (destinationGroupId) {
    const destinationMember = elements.find(element => !element?.isDeleted && element.groupIds?.includes(destinationGroupId));
    if (!destinationMember) return elements;
    destinationPath = destinationMember.groupIds.slice(0, destinationMember.groupIds.lastIndexOf(destinationGroupId) + 1);
  }
  let changed = false;
  const next = elements.map(element => {
    const groupIds = element.groupIds || [];
    const groupIndex = groupIds.lastIndexOf(groupId);
    if (groupIndex < 0) return element;
    const rewritten = [...destinationPath, ...groupIds.slice(groupIndex)];
    if (rewritten.length === groupIds.length && rewritten.every((id, index) => id === groupIds[index])) return element;
    changed = true;
    return { ...element, groupIds: rewritten, updated: Date.now() };
  });
  return changed ? next : elements;
};

export const renameSceneGroup = (elements = [], groupId, label = "") => {
  if (!groupId) return elements;
  const normalizedLabel = String(label || "").trim();
  let changed = false;
  const next = elements.map(element => {
    if (element?.isDeleted || !element?.groupIds?.includes(groupId)) return element;
    const labels = { ...(element.customData?.underscoresGroupLabels || {}) };
    if (normalizedLabel) labels[groupId] = normalizedLabel;
    else delete labels[groupId];
    changed = true;
    const customData = { ...(element.customData || {}) };
    if (Object.keys(labels).length) customData.underscoresGroupLabels = labels;
    else delete customData.underscoresGroupLabels;
    return {
      ...element,
      customData,
      version: (element.version || 0) + 1,
      versionNonce: Math.floor(Math.random() * 0x7fffffff),
      updated: Date.now(),
    };
  });
  return changed ? next : elements;
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
  const ensureGroup = (groupId, parent, element) => {
    const node = ensureNode(
      `canvas:${parent.id || "root"}:${groupId}`,
      { kind: "group", id: groupId, label: "", children: [] },
      parent,
    );
    if (!node.label) node.label = String(element?.customData?.underscoresGroupLabels?.[groupId] || "").trim();
    return node;
  };
  const getScore = element => {
    const imported = element?.customData?.iannixImport;
    const scoreId = String(imported?.scoreId || "").trim();
    if (!scoreId) return null;
    return {
      id: scoreId,
      label: String(imported.scoreLabel || imported.source || "Score").trim() || "Score",
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
    for (const groupId of element.groupIds || []) parent = ensureGroup(groupId, parent, element);
    parent.children.push({ kind: "element", element });
  }
  return root;
};
