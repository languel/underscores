import { parseSvgDocument } from "./svgDocumentModel.js";
import { parseSvgPathCollection } from "./svgPathGeometry.js";

const clampPosition = (value, length) => Math.max(0, Math.min(
  length,
  Number.isFinite(Number(value)) ? Number(value) : 0,
));

const nodeForReference = (document, selection) => {
  if (selection?.nodeId) {
    const byStableId = document.nodes.find(node => node.underscoreId === selection.nodeId);
    if (byStableId) return byStableId;
  }
  return Number.isInteger(selection?.nodeIndex)
    ? document.nodes[selection.nodeIndex] || null
    : null;
};

const getSubpathSourceRange = (source, node, subpathIndex) => {
  if (
    node?.localName?.toLowerCase() !== "path"
    || !Number.isInteger(subpathIndex)
  ) return null;
  const dRange = node.attributeRanges?.d
    || Object.values(node.attributeRanges || {}).find(range => range.name?.toLowerCase() === "d");
  if (!dRange || dRange.valueEnd < dRange.valueStart) return null;
  const authoredPath = source.slice(dRange.valueStart, dRange.valueEnd);
  const subpath = parseSvgPathCollection(authoredPath).subpaths[subpathIndex];
  if (!subpath) return null;
  return {
    from: dRange.valueStart + subpath.start,
    to: dRange.valueStart + subpath.end,
  };
};

export const getSvgSourceRangeForSelection = (sourceValue, selection) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) return null;
  const node = nodeForReference(document, selection);
  if (!node) return null;
  const subpathRange = getSubpathSourceRange(source, node, selection?.subpathIndex);
  return subpathRange || {
    from: Math.max(0, node.start),
    to: Math.max(node.start, node.end),
  };
};

export const getSvgSelectionAtSourcePosition = (sourceValue, positionValue) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) return null;
  const position = clampPosition(positionValue, source.length);
  const candidates = document.nodes
    .filter(node => node.start <= position && position <= node.end)
    .sort((a, b) => b.depth - a.depth || (a.end - a.start) - (b.end - b.start));
  const node = candidates[0] || null;
  if (!node) return null;

  const selection = {
    nodeIndex: node.index,
    ...(node.underscoreId ? { nodeId: node.underscoreId } : {}),
  };
  const dRange = node.attributeRanges?.d
    || Object.values(node.attributeRanges || {}).find(range => range.name?.toLowerCase() === "d");
  if (
    node.localName?.toLowerCase() === "path"
    && dRange
    && dRange.valueStart <= position
    && position <= dRange.valueEnd
  ) {
    const authoredPath = source.slice(dRange.valueStart, dRange.valueEnd);
    const localPosition = position - dRange.valueStart;
    const subpath = parseSvgPathCollection(authoredPath).subpaths.find(candidate => (
      candidate.start <= localPosition && localPosition <= candidate.end
    ));
    if (subpath) selection.subpathIndex = subpath.index;
  }
  return selection;
};
