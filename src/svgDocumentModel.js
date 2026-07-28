import * as cssTree from "css-tree";
import { SaxesParser } from "saxes";

export const SVG_DOCUMENT_SCHEMA_VERSION = 2;
export const SVG_NODE_ID_ATTRIBUTE = "data-drawerator-id";
export const SVG_METADATA_ATTRIBUTE = "data-drawerator";
export const SVG_METADATA_VERSION = "v1";

const ADDRESSABLE_SVG_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "switch", "a",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textpath", "image", "foreignobject",
  "lineargradient", "radialgradient", "stop", "pattern",
  "clippath", "mask", "marker", "filter",
  "style",
  "animate", "set", "animatetransform", "animatemotion", "mpath",
]);

const finiteInteger = value => Number.isInteger(value) && value >= 0;

const stableHash = value => {
  let hash = 2166136261;
  const source = String(value || "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const createSvgDocumentId = source => `svg-document-${stableHash(source)}`;

export const createSvgNodeId = () => {
  if (globalThis.crypto?.randomUUID) return `svg-node-${globalThis.crypto.randomUUID()}`;
  return `svg-node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeSvgRuntimePolicy = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    clock: raw.clock === "free" ? "free" : "transport",
    trustedScripts: raw.trustedScripts === true,
    allowNetwork: raw.allowNetwork === true,
    allowForeignObjectInteraction: raw.allowForeignObjectInteraction === true,
  };
};

const decodeXmlEntities = value => String(value || "")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const escapeXmlText = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const escapeXmlAttribute = (value, quote = "\"") => {
  let escaped = String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  escaped = quote === "'" ? escaped.replaceAll("'", "&apos;") : escaped.replaceAll("\"", "&quot;");
  return escaped;
};

const scanOpenTagAttributes = (source, start, end) => {
  const ranges = {};
  let index = start + 1;
  while (index < end && /\s/.test(source[index])) index += 1;
  while (index < end && !/[\s/>]/.test(source[index])) index += 1;

  while (index < end) {
    const fullStart = index;
    while (index < end && /\s/.test(source[index])) index += 1;
    if (index >= end || source[index] === ">" || source[index] === "/") break;

    const nameStart = index;
    while (index < end && !/[\s=/>]/.test(source[index])) index += 1;
    const nameEnd = index;
    const name = source.slice(nameStart, nameEnd);
    while (index < end && /\s/.test(source[index])) index += 1;

    let valueStart = index;
    let valueEnd = index;
    let quote = "";
    if (source[index] === "=") {
      index += 1;
      while (index < end && /\s/.test(source[index])) index += 1;
      quote = source[index] === "\"" || source[index] === "'" ? source[index] : "";
      if (quote) {
        index += 1;
        valueStart = index;
        while (index < end && source[index] !== quote) index += 1;
        valueEnd = index;
        if (source[index] === quote) index += 1;
      } else {
        valueStart = index;
        while (index < end && !/[\s/>]/.test(source[index])) index += 1;
        valueEnd = index;
      }
    }

    ranges[name] = {
      name,
      fullStart,
      fullEnd: index,
      nameStart,
      nameEnd,
      valueStart,
      valueEnd,
      quote,
    };
  }
  return ranges;
};

const cssModelForNode = (node, source) => {
  const cssSource = source.slice(node.openEnd, node.closeStart ?? node.end);
  try {
    return {
      nodeIndex: node.index,
      source: cssSource,
      start: node.openEnd,
      end: node.closeStart ?? node.end,
      ast: cssTree.parse(cssSource, {
        context: "stylesheet",
        positions: true,
        parseCustomProperty: true,
      }),
      valid: true,
      error: "",
    };
  } catch (error) {
    return {
      nodeIndex: node.index,
      source: cssSource,
      start: node.openEnd,
      end: node.closeStart ?? node.end,
      ast: null,
      valid: false,
      error: error?.message || "Invalid CSS stylesheet.",
    };
  }
};

export const parseSvgDocument = sourceValue => {
  const source = String(sourceValue || "");
  const nodes = [];
  const stack = [];
  let pendingOpenStart = -1;
  let parserError = null;

  try {
    const parser = new SaxesParser({ xmlns: true, position: true });
    parser.on("opentagstart", () => {
      pendingOpenStart = source.lastIndexOf("<", Math.max(0, parser.position - 1));
    });
    parser.on("opentag", tag => {
      const parentIndex = stack.at(-1) ?? null;
      const attributes = {};
      const attributeNamespaces = {};
      Object.values(tag.attributes || {}).forEach(attribute => {
        attributes[attribute.name] = attribute.value;
        attributeNamespaces[attribute.name] = {
          localName: attribute.local,
          prefix: attribute.prefix || "",
          namespaceURI: attribute.uri || "",
        };
      });
      const index = nodes.length;
      const node = {
        index,
        tag: tag.name,
        localName: tag.local || tag.name,
        prefix: tag.prefix || "",
        namespaceURI: tag.uri || "",
        depth: stack.length,
        parentIndex,
        attributes,
        attributeNamespaces,
        attributeRanges: scanOpenTagAttributes(source, pendingOpenStart, parser.position),
        id: attributes.id || "",
        draweratorId: attributes[SVG_NODE_ID_ATTRIBUTE] || "",
        label: `${tag.name}${attributes.id ? `#${attributes.id}` : ""}`,
        start: pendingOpenStart,
        openEnd: parser.position,
        closeStart: tag.isSelfClosing ? parser.position : null,
        end: tag.isSelfClosing ? parser.position : null,
        selfClosing: tag.isSelfClosing,
        children: [],
        textContent: "",
        addressable: ADDRESSABLE_SVG_ELEMENTS.has(String(tag.local || tag.name).toLowerCase()),
      };
      nodes.push(node);
      if (Number.isInteger(parentIndex)) nodes[parentIndex].children.push(index);
      if (!tag.isSelfClosing) stack.push(index);
      pendingOpenStart = -1;
    });
    parser.on("text", text => {
      const current = nodes[stack.at(-1)];
      if (current) current.textContent += text;
    });
    parser.on("cdata", text => {
      const current = nodes[stack.at(-1)];
      if (current) current.textContent += text;
    });
    parser.on("closetag", tag => {
      if (tag.isSelfClosing) return;
      const index = stack.pop();
      const node = nodes[index];
      if (!node) return;
      node.closeStart = source.lastIndexOf("</", Math.max(0, parser.position - 1));
      node.end = parser.position;
    });
    parser.on("error", error => {
      parserError = error;
    });
    parser.write(source).close();
  } catch (error) {
    parserError = error;
  }

  const root = nodes.find(node => node.parentIndex === null);
  const valid = !parserError
    && root?.localName?.toLowerCase() === "svg"
    && Number.isInteger(root.end);
  const nodeByDraweratorId = new Map(nodes
    .filter(node => node.draweratorId)
    .map(node => [node.draweratorId, node]));
  const duplicateDraweratorIds = nodes
    .filter(node => node.draweratorId)
    .filter((node, index, values) => values.findIndex(candidate => candidate.draweratorId === node.draweratorId) !== index)
    .map(node => node.draweratorId);
  const styles = nodes
    .filter(node => node.localName.toLowerCase() === "style" && !node.selfClosing)
    .map(node => cssModelForNode(node, source));

  return {
    version: SVG_DOCUMENT_SCHEMA_VERSION,
    source,
    valid,
    error: parserError?.message || (!root ? "Source must contain an SVG root element." : !valid ? "Source must contain one complete SVG document." : ""),
    nodes,
    rootIndex: root?.index ?? null,
    root,
    styles,
    nodeByDraweratorId,
    duplicateDraweratorIds: [...new Set(duplicateDraweratorIds)],
  };
};

export const applySvgSourcePatches = (sourceValue, patchesValue) => {
  const source = String(sourceValue || "");
  const patches = (patchesValue || [])
    .map(patch => ({
      start: Number(patch.start),
      end: Number(patch.end),
      text: String(patch.text ?? ""),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  patches.forEach((patch, index) => {
    if (!finiteInteger(patch.start) || !finiteInteger(patch.end) || patch.end < patch.start || patch.end > source.length) {
      throw new Error("SVG source patch is outside the document.");
    }
    if (index > 0 && patch.start < patches[index - 1].end) {
      throw new Error("SVG source patches overlap.");
    }
  });

  let next = source;
  for (let index = patches.length - 1; index >= 0; index -= 1) {
    const patch = patches[index];
    next = `${next.slice(0, patch.start)}${patch.text}${next.slice(patch.end)}`;
  }
  return next;
};

const resolveNode = (document, nodeReference) => {
  if (Number.isInteger(nodeReference)) return document.nodes[nodeReference] || null;
  const nodeId = typeof nodeReference === "string"
    ? nodeReference
    : nodeReference?.nodeId || nodeReference?.draweratorId;
  return nodeId ? document.nodeByDraweratorId.get(nodeId) || null : null;
};

export const patchSvgNodeAttribute = (sourceValue, nodeReference, nameValue, value) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const node = resolveNode(document, nodeReference);
  const name = String(nameValue || "").trim();
  if (!node) throw new Error("SVG node was not found.");
  if (!/^[A-Za-z_][:\w.-]*$/.test(name)) throw new Error("SVG attribute name is invalid.");

  const range = node.attributeRanges[name]
    || Object.values(node.attributeRanges).find(candidate => candidate.name.toLowerCase() === name.toLowerCase());
  if (value === "" || value === null || value === undefined) {
    return range
      ? applySvgSourcePatches(source, [{ start: range.fullStart, end: range.fullEnd, text: "" }])
      : source;
  }
  if (range) {
    const quote = range.quote || "\"";
    const text = escapeXmlAttribute(value, quote);
    if (range.quote) {
      return applySvgSourcePatches(source, [{ start: range.valueStart, end: range.valueEnd, text }]);
    }
    return applySvgSourcePatches(source, [{
      start: range.valueStart,
      end: range.valueEnd,
      text: `${quote}${text}${quote}`,
    }]);
  }
  const openSource = source.slice(node.start, node.openEnd);
  const closeOffset = /\/\s*>$/.test(openSource)
    ? openSource.search(/\/\s*>$/)
    : openSource.lastIndexOf(">");
  return applySvgSourcePatches(source, [{
    start: node.start + closeOffset,
    end: node.start + closeOffset,
    text: ` ${name}="${escapeXmlAttribute(value)}"`,
  }]);
};

export const patchSvgNodeText = (sourceValue, nodeReference, textValue) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const node = resolveNode(document, nodeReference);
  if (!node) throw new Error("SVG node was not found.");
  if (node.selfClosing || !finiteInteger(node.closeStart)) throw new Error("A self-closing SVG node cannot contain text.");
  return applySvgSourcePatches(source, [{
    start: node.openEnd,
    end: node.closeStart,
    text: escapeXmlText(textValue),
  }]);
};

export const insertSvgNode = (sourceValue, parentReference, markupValue, beforeReference = null) => {
  const source = String(sourceValue || "");
  const markup = String(markupValue || "").trim();
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const parent = resolveNode(document, parentReference);
  if (!parent) throw new Error("SVG parent cannot contain child nodes.");
  const fragment = parseSvgDocument(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`);
  if (!markup || !fragment.valid || fragment.root.children.length !== 1) throw new Error("Insert exactly one valid SVG node.");
  if (parent.selfClosing) {
    if (beforeReference !== null) throw new Error("A self-closing SVG parent has no insertion anchor.");
    const openSource = source.slice(parent.start, parent.openEnd);
    const closeOffset = openSource.search(/\/\s*>$/);
    if (closeOffset < 0) throw new Error("SVG parent cannot contain child nodes.");
    return applySvgSourcePatches(source, [{
      start: parent.start + closeOffset,
      end: parent.openEnd,
      text: `>${markup}</${parent.tag}>`,
    }]);
  }
  if (!finiteInteger(parent.closeStart)) throw new Error("SVG parent cannot contain child nodes.");
  const before = beforeReference === null ? null : resolveNode(document, beforeReference);
  if (before && before.parentIndex !== parent.index) throw new Error("The insertion anchor is not a child of the target parent.");
  const insertion = before?.start ?? parent.closeStart;
  return applySvgSourcePatches(source, [{ start: insertion, end: insertion, text: markup }]);
};

export const deleteSvgNode = (sourceValue, nodeReference) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const node = resolveNode(document, nodeReference);
  if (!node) throw new Error("SVG node was not found.");
  if (node.index === document.rootIndex) throw new Error("The SVG root cannot be deleted.");
  return applySvgSourcePatches(source, [{ start: node.start, end: node.end, text: "" }]);
};

export const reparentSvgNode = (sourceValue, nodeReference, parentReference, beforeReference = null) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const node = resolveNode(document, nodeReference);
  const parent = resolveNode(document, parentReference);
  if (!node || !parent) throw new Error("SVG node or target parent was not found.");
  if (node.index === document.rootIndex) throw new Error("The SVG root cannot be reparented.");
  let ancestor = parent;
  while (ancestor) {
    if (ancestor.index === node.index) throw new Error("An SVG node cannot be moved into itself.");
    ancestor = Number.isInteger(ancestor.parentIndex) ? document.nodes[ancestor.parentIndex] : null;
  }
  const markup = source.slice(node.start, node.end);
  const withoutNode = deleteSvgNode(source, node.draweratorId || node.index);
  const nextDocument = parseSvgDocument(withoutNode);
  const nextParent = parent.draweratorId
    ? nextDocument.nodeByDraweratorId.get(parent.draweratorId)
    : nextDocument.nodes.find(candidate => candidate.tag === parent.tag && candidate.start <= parent.start);
  const beforeId = beforeReference === null
    ? null
    : (resolveNode(document, beforeReference)?.draweratorId || null);
  return insertSvgNode(withoutNode, nextParent?.draweratorId || nextParent?.index, markup, beforeId);
};

const metadataNodeFromDocument = document => document.nodes.find(node => (
  node.localName.toLowerCase() === "metadata"
  && node.attributes[SVG_METADATA_ATTRIBUTE] === SVG_METADATA_VERSION
));

const emptySvgMetadata = () => ({ version: 1, nodes: {} });

export const readSvgDraweratorMetadata = sourceValue => {
  const document = parseSvgDocument(sourceValue);
  if (!document.valid) return { ...emptySvgMetadata(), valid: false, error: document.error };
  const node = metadataNodeFromDocument(document);
  if (!node) return { ...emptySvgMetadata(), valid: true, error: "", nodeIndex: null };
  try {
    const parsed = JSON.parse(decodeXmlEntities(node.textContent.trim() || "{}"));
    return {
      version: 1,
      nodes: parsed?.nodes && typeof parsed.nodes === "object" ? parsed.nodes : {},
      valid: true,
      error: "",
      nodeIndex: node.index,
    };
  } catch (error) {
    return {
      ...emptySvgMetadata(),
      valid: false,
      error: error?.message || "Drawerator SVG metadata is invalid JSON.",
      nodeIndex: node.index,
    };
  }
};

export const writeSvgDraweratorMetadata = (sourceValue, metadataValue) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const metadata = {
    version: 1,
    nodes: metadataValue?.nodes && typeof metadataValue.nodes === "object" ? metadataValue.nodes : {},
  };
  const serialized = escapeXmlText(JSON.stringify(metadata));
  const node = metadataNodeFromDocument(document);
  if (node) {
    if (node.selfClosing) {
      return applySvgSourcePatches(source, [{
        start: node.start,
        end: node.end,
        text: `<metadata ${SVG_METADATA_ATTRIBUTE}="${SVG_METADATA_VERSION}">${serialized}</metadata>`,
      }]);
    }
    return applySvgSourcePatches(source, [{
      start: node.openEnd,
      end: node.closeStart,
      text: serialized,
    }]);
  }

  const root = document.root;
  if (!root || !finiteInteger(root.closeStart)) throw new Error("SVG root must have a closing tag.");
  const hasMultilineChildren = source.slice(root.openEnd, root.closeStart).includes("\n");
  const insertion = hasMultilineChildren
    ? `\n  <metadata ${SVG_METADATA_ATTRIBUTE}="${SVG_METADATA_VERSION}">${serialized}</metadata>`
    : `<metadata ${SVG_METADATA_ATTRIBUTE}="${SVG_METADATA_VERSION}">${serialized}</metadata>`;
  return applySvgSourcePatches(source, [{
    start: root.closeStart,
    end: root.closeStart,
    text: insertion,
  }]);
};

export const ensureSvgNodeIdentities = (
  sourceValue,
  { createId = createSvgNodeId, includeRoot = true } = {},
) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) return { source, changed: false, assigned: [], error: document.error };
  const used = new Set(document.nodes.map(node => node.draweratorId).filter(Boolean));
  const assigned = [];
  const patches = [];

  document.nodes.forEach(node => {
    if (!node.addressable || (!includeRoot && node.index === document.rootIndex) || node.draweratorId) return;
    let nodeId = String(createId(node) || "").trim();
    while (!nodeId || used.has(nodeId)) nodeId = String(createId(node) || "").trim();
    used.add(nodeId);
    const openSource = source.slice(node.start, node.openEnd);
    const closeOffset = /\/\s*>$/.test(openSource)
      ? openSource.search(/\/\s*>$/)
      : openSource.lastIndexOf(">");
    patches.push({
      start: node.start + closeOffset,
      end: node.start + closeOffset,
      text: ` ${SVG_NODE_ID_ATTRIBUTE}="${escapeXmlAttribute(nodeId)}"`,
    });
    assigned.push({ nodeIndex: node.index, nodeId, tag: node.tag });
  });

  const nextSource = applySvgSourcePatches(source, patches);
  return {
    source: nextSource,
    changed: nextSource !== source,
    assigned,
    error: "",
  };
};

export const prepareSvgForStructuredEditing = (
  sourceValue,
  { createId = createSvgNodeId } = {},
) => {
  const identified = ensureSvgNodeIdentities(sourceValue, { createId });
  if (identified.error) return identified;
  const metadata = readSvgDraweratorMetadata(identified.source);
  const source = metadata.nodeIndex === null
    ? writeSvgDraweratorMetadata(identified.source, metadata)
    : identified.source;
  return {
    source,
    changed: source !== String(sourceValue || ""),
    assigned: identified.assigned,
    metadata: readSvgDraweratorMetadata(source),
    document: parseSvgDocument(source),
    error: "",
  };
};

export const updateSvgNodeData = (sourceValue, nodeId, updater) => {
  const prepared = prepareSvgForStructuredEditing(sourceValue);
  if (prepared.error) throw new Error(prepared.error);
  if (!prepared.document.nodeByDraweratorId.has(nodeId)) throw new Error("SVG node was not found.");
  const metadata = prepared.metadata;
  const current = structuredClone(metadata.nodes[nodeId] || {});
  const nextValue = typeof updater === "function" ? updater(current) : updater;
  const nodes = { ...metadata.nodes };
  if (nextValue === null || nextValue === undefined) delete nodes[nodeId];
  else nodes[nodeId] = structuredClone(nextValue);
  return writeSvgDraweratorMetadata(prepared.source, { version: 1, nodes });
};

export const buildSvgMetadataMirror = (sourceValue, sourceRevision = 0) => {
  const metadata = readSvgDraweratorMetadata(sourceValue);
  return {
    version: 1,
    sourceRevision: Math.max(0, Number(sourceRevision) || 0),
    valid: metadata.valid,
    error: metadata.error || "",
    nodes: structuredClone(metadata.nodes || {}),
  };
};
