export const elementObjectRef = elementId => ({
  kind: "element",
  elementId: String(elementId || ""),
});

export const svgNodeObjectRef = (elementId, nodeId, subpathId = null) => ({
  kind: "svg-node",
  elementId: String(elementId || ""),
  nodeId: String(nodeId || ""),
  ...(subpathId === null || subpathId === undefined ? {} : { subpathId: String(subpathId) }),
});

export const normalizeDraweratorObjectRef = value => {
  if (typeof value === "string") return value ? elementObjectRef(value) : null;
  if (!value || typeof value !== "object") return null;
  const elementId = String(value.elementId || "");
  if (!elementId) return null;
  if (value.kind === "svg-node") {
    const nodeId = String(value.nodeId || "");
    return nodeId ? svgNodeObjectRef(elementId, nodeId, value.subpathId) : null;
  }
  return elementObjectRef(elementId);
};

export const draweratorObjectRefKey = value => {
  const ref = normalizeDraweratorObjectRef(value);
  if (!ref) return "";
  return ref.kind === "element"
    ? `element:${ref.elementId}`
    : `svg-node:${ref.elementId}:${ref.nodeId}:${ref.subpathId || ""}`;
};

export const sameDraweratorObjectRef = (left, right) => (
  draweratorObjectRefKey(left) === draweratorObjectRefKey(right)
);

export const migrateLegacyCurveReference = cursorValue => {
  const cursor = cursorValue && typeof cursorValue === "object" ? cursorValue : {};
  const curveRef = normalizeDraweratorObjectRef(cursor.curveRef)
    || (cursor.curveId ? elementObjectRef(cursor.curveId) : null);
  return {
    ...cursor,
    curveId: curveRef?.kind === "element" ? curveRef.elementId : cursor.curveId || null,
    curveRef,
  };
};
