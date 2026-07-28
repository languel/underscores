import {
  applySvgSourcePatches,
  deleteSvgNode,
  insertSvgNode,
  parseSvgDocument,
  patchSvgNodeAttribute,
  prepareSvgForStructuredEditing,
  reparentSvgNode,
  updateSvgNodeData,
} from "./svgDocumentModel.js";
import { buildSvgTimingGraph } from "./svgAnimation.js";
import { patchSvgStyleDeclaration } from "./svgStyleModel.js";

const staleRevisionError = (expected, actual) => {
  const error = new Error(`Stale SVG revision: expected ${expected}, received ${actual}.`);
  error.code = "SVG_STALE_REVISION";
  return error;
};

const requireRevision = (state, revision) => {
  if (Number(revision) !== Number(state.revision)) throw staleRevisionError(state.revision, revision);
};

const result = (state, source, changedNodeIds = []) => ({
  ...state,
  source,
  revision: source === state.source ? state.revision : state.revision + 1,
  changedNodeIds,
  document: parseSvgDocument(source),
});

export const executeSvgStructuredCommand = (stateValue, command, args = {}) => {
  const state = {
    source: String(stateValue?.source || ""),
    revision: Math.max(0, Number(stateValue?.revision) || 0),
  };
  if (command === "svg.document.get") return result(state, state.source);
  if (command === "svg.document.validate") {
    const document = parseSvgDocument(state.source);
    return { ...state, valid: document.valid, error: document.error, document };
  }
  if (command === "svg.node.list") {
    const document = parseSvgDocument(state.source);
    return { ...state, nodes: document.nodes, document };
  }
  if (command === "svg.animation.list") {
    return { ...state, timing: buildSvgTimingGraph(state.source) };
  }

  requireRevision(state, args.revision);
  if (command === "svg.document.patch") {
    const source = applySvgSourcePatches(state.source, args.patches || []);
    const document = parseSvgDocument(source);
    if (!document.valid) throw new Error(document.error || "SVG source patch produced an invalid document.");
    return result(state, source);
  }
  const prepared = prepareSvgForStructuredEditing(state.source);
  if (prepared.error) throw new Error(prepared.error);
  const node = args.nodeId ? prepared.document.nodeByDraweratorId.get(args.nodeId) : null;

  if (command === "svg.node.patch") {
    if (!node) throw new Error("SVG node was not found.");
    let source = prepared.source;
    Object.entries(args.attributes || {}).forEach(([name, value]) => {
      source = patchSvgNodeAttribute(source, args.nodeId, name, value);
    });
    return result(state, source, [args.nodeId]);
  }
  if (command === "svg.geometry.patchPath") {
    if (!node || node.localName.toLowerCase() !== "path") throw new Error("SVG path node was not found.");
    return result(state, patchSvgNodeAttribute(prepared.source, args.nodeId, "d", args.d), [args.nodeId]);
  }
  if (command === "svg.node.create") {
    const source = insertSvgNode(prepared.source, args.parentId || prepared.document.root.draweratorId, args.markup, args.beforeId);
    return result(state, source);
  }
  if (command === "svg.node.delete") {
    if (!node) throw new Error("SVG node was not found.");
    return result(state, deleteSvgNode(prepared.source, args.nodeId), [args.nodeId]);
  }
  if (command === "svg.node.reparent") {
    if (!node) throw new Error("SVG node was not found.");
    return result(state, reparentSvgNode(prepared.source, args.nodeId, args.parentId, args.beforeId), [args.nodeId]);
  }
  if (command === "svg.binding.attach") {
    if (!node) throw new Error("SVG node was not found.");
    const source = updateSvgNodeData(prepared.source, args.nodeId, current => ({
      ...current,
      bindings: [...(current.bindings || []).filter(binding => binding.id !== args.binding?.id), args.binding],
    }));
    return result(state, source, [args.nodeId]);
  }
  if (command === "svg.binding.detach") {
    if (!node) throw new Error("SVG node was not found.");
    const source = updateSvgNodeData(prepared.source, args.nodeId, current => ({
      ...current,
      bindings: (current.bindings || []).filter(binding => binding.id !== args.bindingId),
    }));
    return result(state, source, [args.nodeId]);
  }
  if (command === "svg.style.patchRule") {
    const source = patchSvgStyleDeclaration(
      prepared.source,
      args.styleNodeId ?? args.styleNodeIndex,
      args.selector,
      args.property,
      args.value,
    );
    return result(state, source, [String(args.styleNodeId || "")].filter(Boolean));
  }
  if (command === "svg.animation.upsert") {
    if (args.animationNodeId) {
      const animationNode = prepared.document.nodeByDraweratorId.get(args.animationNodeId);
      if (!animationNode || !["animate", "set", "animatetransform", "animatemotion"].includes(animationNode.localName.toLowerCase())) {
        throw new Error("SVG animation node was not found.");
      }
      let source = prepared.source;
      Object.entries(args.attributes || {}).forEach(([name, value]) => {
        source = patchSvgNodeAttribute(source, args.animationNodeId, name, value);
      });
      return result(state, source, [args.animationNodeId]);
    }
    const parentId = args.parentId || prepared.document.root.draweratorId;
    const tag = ["animate", "set", "animateTransform", "animateMotion"].includes(args.tag)
      ? args.tag
      : "animate";
    const attributes = Object.entries(args.attributes || {})
      .map(([name, value]) => ` ${name}="${String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;")}"`)
      .join("");
    return result(state, insertSvgNode(prepared.source, parentId, `<${tag}${attributes}/>`));
  }
  if (command === "svg.animation.delete") {
    const animationNode = prepared.document.nodeByDraweratorId.get(args.animationNodeId);
    if (!animationNode || !["animate", "set", "animatetransform", "animatemotion"].includes(animationNode.localName.toLowerCase())) {
      throw new Error("SVG animation node was not found.");
    }
    return result(state, deleteSvgNode(prepared.source, args.animationNodeId), [args.animationNodeId]);
  }
  throw new Error(`Unknown SVG command: ${command}`);
};
