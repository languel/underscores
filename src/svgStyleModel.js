import * as cssTree from "css-tree";
import { applySvgSourcePatches, parseSvgDocument, prepareSvgForStructuredEditing } from "./svgDocumentModel.js";

const presentationProperties = new Set([
  "color", "display", "visibility", "opacity",
  "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "font-family", "font-size", "font-style", "font-weight", "text-anchor",
  "clip-path", "mask", "filter", "marker-start", "marker-mid", "marker-end",
]);

const parseInlineStyle = value => {
  const declarations = {};
  try {
    const ast = cssTree.parse(String(value || ""), { context: "declarationList", parseCustomProperty: true });
    cssTree.walk(ast, {
      visit: "Declaration",
      enter(declaration) {
        declarations[declaration.property] = cssTree.generate(declaration.value);
      },
    });
  } catch {
    // Keep malformed inline style source-editable without inventing values.
  }
  return declarations;
};

const simpleSelectorMatches = (selector, node) => String(selector || "").split(",").some(candidate => {
  const value = candidate.trim();
  if (!value || /[\s>+~:[\]]/.test(value)) return false;
  const id = value.match(/#([\w-]+)/)?.[1];
  const classes = [...value.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
  const tag = value.match(/^[A-Za-z][\w-]*/)?.[0];
  const nodeClasses = String(node.attributes.class || "").split(/\s+/);
  return (!id || node.id === id)
    && (!tag || node.localName.toLowerCase() === tag.toLowerCase())
    && classes.every(className => nodeClasses.includes(className));
});

const browserSelectorMatches = (source, node, selector) => {
  if (typeof DOMParser === "undefined") return simpleSelectorMatches(selector, node);
  try {
    const dom = new DOMParser().parseFromString(source, "image/svg+xml");
    const candidate = [...dom.querySelectorAll("*")][node.index];
    return Boolean(candidate?.matches(selector));
  } catch {
    return simpleSelectorMatches(selector, node);
  }
};

export const getSvgNodeStyleCascade = (sourceValue, nodeReference) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  const node = Number.isInteger(nodeReference)
    ? document.nodes[nodeReference]
    : document.nodeByDraweratorId.get(String(nodeReference || ""));
  if (!document.valid || !node) return { valid: false, error: document.error || "SVG node was not found.", presentation: {}, inline: {}, matchedRules: [] };
  const presentation = Object.fromEntries(Object.entries(node.attributes).filter(([name]) => presentationProperties.has(name.toLowerCase())));
  const inline = parseInlineStyle(node.attributes.style);
  const matchedRules = [];
  document.styles.forEach(style => {
    if (!style.valid || !style.ast) return;
    cssTree.walk(style.ast, {
      visit: "Rule",
      enter(rule) {
        if (!rule.prelude || !rule.block) return;
        const selector = cssTree.generate(rule.prelude).trim();
        if (!browserSelectorMatches(source, node, selector)) return;
        const declarations = {};
        cssTree.walk(rule.block, {
          visit: "Declaration",
          enter(declaration) {
            declarations[declaration.property] = cssTree.generate(declaration.value);
          },
        });
        matchedRules.push({
          styleNodeIndex: style.nodeIndex,
          selector,
          declarations,
          sourceRange: rule.loc
            ? [style.start + rule.loc.start.offset, style.start + rule.loc.end.offset]
            : [style.start, style.end],
        });
      },
    });
  });
  return { valid: true, error: "", presentation, inline, matchedRules };
};

export const patchSvgStyleDeclaration = (sourceValue, styleNodeReference, selectorValue, propertyValue, value) => {
  const source = String(sourceValue || "");
  const document = parseSvgDocument(source);
  if (!document.valid) throw new Error(document.error || "Cannot edit an invalid SVG document.");
  const styleNode = Number.isInteger(styleNodeReference)
    ? document.nodes[styleNodeReference]
    : document.nodeByDraweratorId.get(String(styleNodeReference || ""));
  if (!styleNode || styleNode.localName.toLowerCase() !== "style") throw new Error("SVG style node was not found.");
  const style = document.styles.find(candidate => candidate.nodeIndex === styleNode.index);
  if (!style?.valid) throw new Error(style?.error || "SVG stylesheet is invalid.");
  const selector = String(selectorValue || "").trim();
  const property = String(propertyValue || "").trim();
  let targetRule = null;
  let targetDeclaration = null;
  cssTree.walk(style.ast, {
    visit: "Rule",
    enter(rule) {
      if (targetRule || !rule.prelude || cssTree.generate(rule.prelude).trim() !== selector) return;
      targetRule = rule;
      cssTree.walk(rule.block, {
        visit: "Declaration",
        enter(declaration) {
          if (declaration.property === property) targetDeclaration = declaration;
        },
      });
    },
  });
  if (!targetRule) throw new Error("Matched SVG style rule was not found.");
  if (targetDeclaration?.value?.loc) {
    return applySvgSourcePatches(source, [{
      start: style.start + targetDeclaration.value.loc.start.offset,
      end: style.start + targetDeclaration.value.loc.end.offset,
      text: String(value ?? ""),
    }]);
  }
  if (!targetRule.block?.loc) throw new Error("Matched SVG style rule has no editable source range.");
  return applySvgSourcePatches(source, [{
    start: style.start + targetRule.block.loc.end.offset - 1,
    end: style.start + targetRule.block.loc.end.offset - 1,
    text: ` ${property}: ${String(value ?? "")};`,
  }]);
};

export const updateStructuredSvgStyleDeclaration = (sourceValue, styleNodeIndex, selector, property, value) => {
  const prepared = prepareSvgForStructuredEditing(sourceValue);
  if (prepared.error) return String(sourceValue || "");
  const styleNode = prepared.document.nodes[styleNodeIndex];
  try {
    return patchSvgStyleDeclaration(prepared.source, styleNode?.draweratorId || styleNodeIndex, selector, property, value);
  } catch {
    return String(sourceValue || "");
  }
};
