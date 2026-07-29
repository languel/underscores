import { normalizeP5Frame, resolveP5SourceMode } from "./p5Frame.js";
import { normalizePlayCoreFrame, validatePlayCoreSource } from "./playCoreFrame.js";
import { LIVECODE_KINDS, normalizeLivecodeNode } from "./livecodeNode.js";

// The registry is deliberately declarative.  A node's model never contains a
// renderer instance: adapters receive its canonical source/configuration and
// may be mounted, stopped, or replaced without changing scene data.
const syntaxValidation = source => {
  try {
    // p5 supports both global callbacks and instance callbacks. Parsing is
    // enough here; the existing p5 host remains responsible for reporting
    // runtime errors and restoring the last working sketch.
    new Function(String(source || "")); // eslint-disable-line no-new-func
    return { valid: true, error: "" };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const LIVECODE_ADAPTERS = Object.freeze({
  [LIVECODE_KINDS.p5]: Object.freeze({
    id: LIVECODE_KINDS.p5,
    runtime: "p5",
    validate: syntaxValidation,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      return normalizeP5Frame({
        source: node.source,
        parameters: node.parameters,
        mode: node.runtime.settings?.mode || "auto",
        fps: node.runtime.settings?.fps || 60,
        transparent: node.runtime.settings?.transparent !== false,
        autoplay: true,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
      });
    },
  }),
  [LIVECODE_KINDS.playcore]: Object.freeze({
    id: LIVECODE_KINDS.playcore,
    runtime: "playcore",
    validate: validatePlayCoreSource,
    makeRuntimeConfig: rawNode => {
      const node = normalizeLivecodeNode(rawNode);
      return normalizePlayCoreFrame({
        source: node.source,
        parameters: node.parameters,
        fps: node.runtime.settings?.fps || 30,
        allowInteraction: node.runtime.settings?.allowInteraction !== false,
        reloadNonce: node.revision,
      });
    },
  }),
  [LIVECODE_KINDS.strudel]: Object.freeze({
    id: LIVECODE_KINDS.strudel,
    runtime: "strudel",
    validate: source => String(source || "").trim()
      ? { valid: true, error: "" }
      : { valid: false, error: "Enter a Strudel pattern before running this node." },
    makeRuntimeConfig: rawNode => normalizeLivecodeNode(rawNode),
  }),
  [LIVECODE_KINDS.markdown]: Object.freeze({ id: LIVECODE_KINDS.markdown, runtime: "presentation", validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.latex]: Object.freeze({ id: LIVECODE_KINDS.latex, runtime: "presentation", validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.html]: Object.freeze({ id: LIVECODE_KINDS.html, runtime: "presentation", validate: () => ({ valid: true, error: "" }) }),
  [LIVECODE_KINDS.orca]: Object.freeze({
    id: LIVECODE_KINDS.orca,
    runtime: "orca",
    validate: source => String(source || "").includes("\u0000")
      ? { valid: false, error: "Orca grid source cannot contain null characters." }
      : { valid: true, error: "" },
    makeRuntimeConfig: rawNode => normalizeLivecodeNode(rawNode),
  }),
});

export const getLivecodeAdapter = rawNode => (
  LIVECODE_ADAPTERS[normalizeLivecodeNode(rawNode).kind] || LIVECODE_ADAPTERS[LIVECODE_KINDS.strudel]
);

export const validateLivecodeNode = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  return getLivecodeAdapter(node).validate(node.source, node);
};

export const getLivecodeRuntimeConfig = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  return getLivecodeAdapter(node).makeRuntimeConfig?.(node) || null;
};

export const hasNativeLivecodeRuntime = rawNode => {
  const runtime = getLivecodeAdapter(rawNode).runtime;
  return runtime === "p5" || runtime === "playcore" || runtime === "strudel" || runtime === "orca";
};

export const isLivecodeNodeRunnable = rawNode => {
  const node = normalizeLivecodeNode(rawNode);
  return node.runtime.enabled && node.runtime.running && hasNativeLivecodeRuntime(node);
};

export const describeLivecodeRuntime = rawNode => {
  const adapter = getLivecodeAdapter(rawNode);
  if (adapter.runtime === "p5") return "Bundled p5 runtime";
  if (adapter.runtime === "playcore") return "Bundled Play Core runtime";
  if (adapter.runtime === "strudel") return "Shared native Strudel scheduler";
  if (adapter.runtime === "orca") return "Native Orca grid and Drawerator MIDI routing";
  if (adapter.runtime === "presentation") return "Presentation renderer arrives in the presentation phase.";
  return "Native runtime arrives in a later phase.";
};

// Kept as an exported assertion to make the chosen source mode observable in
// unit tests without duplicating p5's legacy/global detection rules.
export const getLivecodeP5SourceMode = rawNode => resolveP5SourceMode(getLivecodeRuntimeConfig(rawNode));
