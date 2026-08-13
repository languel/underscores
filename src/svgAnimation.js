import * as cssTree from "css-tree";
import { parseSvgDocument } from "./svgDocumentModel.js";

const SMIL_ELEMENTS = new Set(["animate", "set", "animatetransform", "animatemotion"]);

export const parseSvgClockValue = (value, fallback = 0) => {
  const source = String(value ?? "").trim();
  if (!source) return fallback;
  if (source === "indefinite") return Infinity;
  const numeric = Number.parseFloat(source);
  if (/ms$/i.test(source)) return numeric / 1000;
  if (/min$/i.test(source)) return numeric * 60;
  if (/h$/i.test(source)) return numeric * 3600;
  if (/s$/i.test(source) || /^[-+]?(?:\d*\.)?\d+$/.test(source)) return numeric;
  const parts = source.split(":").map(Number);
  if (parts.length >= 2 && parts.every(Number.isFinite)) {
    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
  }
  return fallback;
};

const splitCssList = value => String(value || "").split(",").map(item => item.trim()).filter(Boolean);

const collectCssAnimations = (document, lanes) => {
  const keyframes = new Map();
  document.styles.forEach(style => {
    if (!style.valid || !style.ast) return;
    cssTree.walk(style.ast, {
      visit: "Atrule",
      enter(node) {
        if (String(node.name).toLowerCase() !== "keyframes") return;
        const name = node.prelude ? cssTree.generate(node.prelude).trim() : "";
        const frames = [];
        cssTree.walk(node.block, {
          visit: "Rule",
          enter(rule) {
            const offsetSource = rule.prelude ? cssTree.generate(rule.prelude) : "";
            const offsets = splitCssList(offsetSource).map(offset => (
              offset.toLowerCase() === "from" ? 0
                : offset.toLowerCase() === "to" ? 1
                  : Number.parseFloat(offset) / 100
            )).filter(Number.isFinite);
            const declarations = {};
            cssTree.walk(rule.block, {
              visit: "Declaration",
              enter(declaration) {
                declarations[declaration.property] = cssTree.generate(declaration.value);
              },
            });
            offsets.forEach(offset => frames.push({ offset, declarations }));
          },
        });
        keyframes.set(name, frames.sort((a, b) => a.offset - b.offset));
      },
    });

    cssTree.walk(style.ast, {
      visit: "Rule",
      enter(rule) {
        if (!rule.prelude || !rule.block) return;
        const selector = cssTree.generate(rule.prelude).trim();
        const declarations = {};
        cssTree.walk(rule.block, {
          visit: "Declaration",
          enter(declaration) {
            declarations[declaration.property] = cssTree.generate(declaration.value);
          },
        });
        const names = splitCssList(declarations["animation-name"]);
        const shorthand = splitCssList(declarations.animation);
        const resolvedNames = names.length ? names : shorthand.map(value => value.split(/\s+/).find(token => keyframes.has(token))).filter(Boolean);
        resolvedNames.forEach((name, index) => {
          const durations = splitCssList(declarations["animation-duration"]);
          const delays = splitCssList(declarations["animation-delay"]);
          const iterations = splitCssList(declarations["animation-iteration-count"]);
          lanes.push({
            id: `css:${style.nodeIndex}:${selector}:${name}:${index}`,
            kind: "css",
            nodeId: null,
            styleNodeIndex: style.nodeIndex,
            selector,
            property: "css-animation",
            name,
            begin: parseSvgClockValue(delays[index % Math.max(1, delays.length)], 0),
            duration: parseSvgClockValue(durations[index % Math.max(1, durations.length)], 0),
            repeatCount: iterations[index % Math.max(1, iterations.length)] || "1",
            keyframes: keyframes.get(name) || [],
            sourceRange: [style.start, style.end],
          });
        });
      },
    });
  });
};

const collectSmilAnimations = (document, lanes) => {
  const byIndex = new Map(document.nodes.map(node => [node.index, node]));
  document.nodes.filter(node => SMIL_ELEMENTS.has(node.localName.toLowerCase())).forEach(node => {
    const parent = byIndex.get(node.parentIndex);
    const href = node.attributes.href || node.attributes["xlink:href"] || "";
    const targetId = href.startsWith("#") ? href.slice(1) : parent?.underscoresId || parent?.id || null;
    const values = String(node.attributes.values || "").split(";").map(value => value.trim()).filter(Boolean);
    const keyTimes = String(node.attributes.keyTimes || "").split(";").map(Number).filter(Number.isFinite);
    lanes.push({
      id: `smil:${node.underscoresId || node.index}`,
      kind: "smil",
      nodeId: targetId,
      animationNodeId: node.underscoresId || null,
      animationNodeIndex: node.index,
      property: node.attributes.attributeName || (node.localName.toLowerCase() === "animatemotion" ? "motion" : ""),
      begin: parseSvgClockValue(node.attributes.begin, 0),
      duration: parseSvgClockValue(node.attributes.dur, 0),
      end: parseSvgClockValue(node.attributes.end, null),
      repeatCount: node.attributes.repeatCount || "1",
      fill: node.attributes.fill || "remove",
      additive: node.attributes.additive || "replace",
      accumulate: node.attributes.accumulate || "none",
      calcMode: node.attributes.calcMode || "linear",
      keySplines: node.attributes.keySplines || "",
      keyframes: values.map((value, index) => ({
        offset: keyTimes[index] ?? (values.length > 1 ? index / (values.length - 1) : 0),
        value,
      })),
      sourceRange: [node.start, node.end],
    });
  });
};

const collectLooomAnimations = (document, lanes) => {
  const byIndex = new Map(document.nodes.map(node => [node.index, node]));
  document.nodes.filter(node => (
    node.localName.toLowerCase() === "g"
    && String(node.attributes.class || "").split(/\s+/).includes("thread")
  )).forEach(thread => {
    const frames = thread.children
      .map(index => byIndex.get(index))
      .filter(node => String(node?.attributes?.class || "").split(/\s+/).includes("frame"));
    if (!frames.length) return;
    const style = thread.attributes.style || "";
    const variables = Object.fromEntries(style.split(";").map(declaration => {
      const index = declaration.indexOf(":");
      return index > 0 ? [declaration.slice(0, index).trim(), declaration.slice(index + 1).trim()] : ["", ""];
    }).filter(([name]) => name.startsWith("--")));
    const speed = Math.max(0.001, Number(variables["--speed"]) || 12);
    lanes.push({
      id: `looom:${thread.underscoresId || thread.id || thread.index}`,
      kind: "looom",
      nodeId: thread.underscoresId || thread.id || null,
      nodeIndex: thread.index,
      property: "frame",
      begin: (Number(variables["--timeOffset"]) || 0) / speed,
      duration: frames.length / speed,
      repeatCount: "indefinite",
      speed,
      playMode: Number(variables["--playMode"]) || 0,
      latched: Number(variables["--latched"]) || 0,
      masked: Number(variables["--masked"]) || 0,
      blendMode: Number(variables["--blendMode"]) || 0,
      pressureEnabled: Number(variables["--pressureEnabled"]) || 0,
      keyframes: frames.map((frame, index) => ({
        offset: frames.length > 1 ? index / frames.length : 0,
        nodeId: frame.underscoresId || frame.id || null,
        nodeIndex: frame.index,
      })),
      sourceRange: [thread.start, thread.end],
    });
  });
};

export const buildSvgTimingGraph = sourceValue => {
  const document = parseSvgDocument(sourceValue);
  if (!document.valid) return { valid: false, error: document.error, duration: 0, lanes: [] };
  const lanes = [];
  collectSmilAnimations(document, lanes);
  collectCssAnimations(document, lanes);
  collectLooomAnimations(document, lanes);
  const duration = lanes.reduce((maximum, lane) => {
    if (!Number.isFinite(lane.duration)) return maximum;
    return Math.max(maximum, Math.max(0, lane.begin || 0) + Math.max(0, lane.duration || 0));
  }, 0);
  return { valid: true, error: "", duration, lanes };
};
