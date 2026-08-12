import { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { normalizeLivecodeNode } from "./livecodeNode.js";
import { buildHtmlSandboxDocument, getMarkdownSourceBlocks, renderLatex, renderMarkdownWithMath, validateMarkdownSource } from "./livecodePresentation.js";

const runtimeSnapshot = (element, node, scriptRuntimeRef) => {
  const appearance = scriptRuntimeRef.current?.getAppearance?.() || {};
  return Object.freeze({
    element: { id: element.id, width: element.width, height: element.height },
    node: { id: node.nodeId, kind: node.kind, parameters: node.parameters },
    transport: { time: scriptRuntimeRef.current?.getTime?.() || 0 },
    theme: appearance,
  });
};

function HtmlPresentation({ element, node, scriptRuntimeRef }) {
  const iframeRef = useRef(null);
  const token = useMemo(() => `drawerator-livecode-${node.nodeId}`, [node.nodeId]);
  const appearance = scriptRuntimeRef.current?.getAppearance?.() || {};
  const appearanceTheme = appearance.theme;
  const appearanceForeground = appearance.colors?.foreground?.css || appearance.currentColor;
  const appearanceCanvas = appearance.colors?.canvas?.css;
  const source = useMemo(
    () => buildHtmlSandboxDocument({
      source: node.source,
      token,
      appearance: {
        theme: appearanceTheme,
        currentColor: appearanceForeground,
        colors: { foreground: { css: appearanceForeground }, canvas: { css: appearanceCanvas } },
      },
    }),
    [node.source, token, appearanceTheme, appearanceForeground, appearanceCanvas],
  );
  useEffect(() => {
    const receive = event => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data?.draweratorLivecode || data.token !== token || data.type !== "ready") return;
      event.source?.postMessage({
        draweratorLivecode: true,
        token,
        type: "bridge",
        snapshot: runtimeSnapshot(element, node, scriptRuntimeRef),
      }, "*");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [element, node, scriptRuntimeRef, token]);
  return <iframe
    ref={iframeRef}
    className="livecode-html-frame"
    title="Sandboxed Livecode HTML"
    sandbox="allow-scripts"
    srcDoc={source}
  />;
}

function MarkdownPresentation({ node, editable = false, documentEditing = false, onActivate, onPatch, onCommit }) {
  const blocks = useMemo(() => getMarkdownSourceBlocks(node.source), [node.source]);
  const [editingBlock, setEditingBlock] = useState(null);
  const [error, setError] = useState("");
  const committingRef = useRef(false);
  const sourceRef = useRef(node.source);
  sourceRef.current = node.source;

  const beginEdit = index => {
    const currentSource = sourceRef.current;
    const currentBlocks = getMarkdownSourceBlocks(currentSource);
    const block = currentBlocks[index];
    if (!block) return;
    const body = block.source.trimEnd();
    setEditingBlock({
      ...block,
      index,
      draft: body,
      trailing: block.source.slice(body.length),
      originalSource: currentSource,
    });
    committingRef.current = false;
    setError("");
  };

  const beginAppend = () => {
    const currentSource = sourceRef.current;
    const currentBlocks = getMarkdownSourceBlocks(currentSource);
    const appending = Boolean(currentSource);
    const separator = !currentSource || currentSource.endsWith("\n\n")
      ? ""
      : currentSource.endsWith("\n") ? "\n" : "\n\n";
    setEditingBlock({
      index: appending ? currentBlocks.length : 0,
      start: currentSource.length,
      end: currentSource.length,
      source: "",
      draft: "",
      prefix: separator,
      trailing: "",
      type: "paragraph",
      depth: null,
      append: appending,
      originalSource: currentSource,
    });
    committingRef.current = false;
    setError("");
  };

  const commit = () => {
    if (!editingBlock || committingRef.current) return;
    const validation = validateMarkdownSource(editingBlock.draft);
    if (!validation.valid) {
      setError(validation.error || "Markdown is incomplete.");
      return;
    }
    committingRef.current = true;
    const source = `${editingBlock.originalSource.slice(0, editingBlock.start)}${editingBlock.prefix || ""}${editingBlock.draft}${editingBlock.trailing}${editingBlock.originalSource.slice(editingBlock.end)}`;
    if (source === editingBlock.originalSource) {
      setEditingBlock(null);
      setError("");
      return;
    }
    sourceRef.current = source;
    onPatch?.({ source });
    onCommit?.();
    setEditingBlock(null);
    setError("");
  };
  return <article
    className={`livecode-markdown ${editable ? "editable" : ""} ${documentEditing ? "document-editing" : ""}`}
    onClick={event => {
      if (!editable || !documentEditing || event.target.closest?.("textarea")) return;
      const lastBlock = [...event.currentTarget.querySelectorAll(":scope > .livecode-markdown-block")].at(-1);
      if (!lastBlock || event.clientY > lastBlock.getBoundingClientRect().bottom) {
        event.preventDefault();
        event.stopPropagation();
        beginAppend();
        return;
      }
      const target = event.target.closest?.("[data-markdown-block]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      beginEdit(Number(target.dataset.markdownBlock));
    }}
    onDoubleClick={event => {
      if (!editable) return;
      const target = event.target.closest?.("[data-markdown-block]");
      if (!target) return;
      const block = blocks[Number(target.dataset.markdownBlock)];
      if (!block) return;
      event.preventDefault();
      event.stopPropagation();
      // Preserve modifier-aware canvas gestures when Markdown owns the
      // double-click event for its block editor. The overlay turns this event
      // into the same authored view change used by code/output nodes.
      onActivate?.(event);
      beginEdit(Number(target.dataset.markdownBlock));
    }}
  >{(editingBlock?.append ? [...blocks, {
    start: node.source.length,
    end: node.source.length,
    source: "",
    type: "paragraph",
    depth: null,
  }] : blocks).map((block, index) => editingBlock?.index === index ? <div
    className={`livecode-markdown-block editing type-${editingBlock.type || "paragraph"} ${editingBlock.depth ? `depth-${editingBlock.depth}` : ""}`}
    key={`${block.start}-editor`}
    onPointerDown={event => event.stopPropagation()}
  ><textarea
    value={editingBlock.draft}
    rows={Math.max(1, editingBlock.draft.split("\n").length)}
    onChange={event => {
      setEditingBlock(current => ({ ...current, draft: event.target.value }));
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
    }}
    onFocus={event => {
      event.target.style.height = "auto";
      event.target.style.height = `${event.target.scrollHeight}px`;
    }}
    onBlur={commit}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setEditingBlock(null);
        setError("");
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        commit();
      }
    }}
    aria-label="Edit Markdown block"
    autoFocus
  />{error && <span className="livecode-markdown-block-error" role="status">{error}</span>}</div> : <div
    className={`livecode-markdown-block type-${block.type || "paragraph"} ${block.depth ? `depth-${block.depth}` : ""}`}
    data-markdown-block={index}
    key={`${block.start}-${block.end}`}
    dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(block.source) }}
  />)}</article>;
}

export default function LivecodePresentation({ element, node: rawNode, scriptRuntimeRef, editable = false, documentEditing = false, onActivate, onPatch, onCommit }) {
  const node = normalizeLivecodeNode(rawNode);
  if (node.kind === "markdown") return <MarkdownPresentation node={node} editable={editable} documentEditing={documentEditing} onActivate={onActivate} onPatch={onPatch} onCommit={onCommit} />;
  if (node.kind === "latex") return <div className="livecode-latex" dangerouslySetInnerHTML={{ __html: renderLatex(node.source) }} />;
  if (node.kind === "html") return <HtmlPresentation element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} />;
  return null;
}
