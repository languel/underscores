import { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { isLivecodeAutoUpdateEnabled, normalizeLivecodeNode, resolveLivecodeRuntimeNode } from "./livecodeNode.js";
import { buildHtmlSandboxDocument, getMarkdownSlides, getMarkdownSourceBlocks, renderLatex, renderMarkdownWithMath, validateMarkdownSource } from "./livecodePresentation.js";
import { resumeSvgDocument, sanitizeSvgForInertRender, seekSvgDocument } from "./svgRuntime.js";

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
  const token = useMemo(() => `underscores-livecode-${node.nodeId}`, [node.nodeId]);
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
      if (!data?.underscoresLivecode || data.token !== token || data.type !== "ready") return;
      event.source?.postMessage({
        underscoresLivecode: true,
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

function MarkdownPresentation({ node, runtimeNode = node, editable = false, documentEditing = false, onActivate, onPatch, onCommit }) {
  const displaySource = editable && documentEditing ? node.source : runtimeNode.source;
  const blocks = useMemo(() => getMarkdownSourceBlocks(displaySource), [displaySource]);
  const slides = useMemo(() => getMarkdownSlides(displaySource), [displaySource]);
  const slideshowActive = node.view === "slideshow" && !documentEditing;
  const [slideIndex, setSlideIndex] = useState(0);
  const [editingBlock, setEditingBlock] = useState(null);
  const [error, setError] = useState("");
  const committingRef = useRef(false);
  const sourceRef = useRef(node.source);
  sourceRef.current = node.source;

  useEffect(() => {
    setSlideIndex(current => slideshowActive ? Math.min(current, Math.max(0, slides.length - 1)) : 0);
  }, [displaySource, slideshowActive, slides.length]);

  const handleSlideshowKeyDown = event => {
    if (!slideshowActive) return;
    const lastIndex = Math.max(0, slides.length - 1);
    let nextIndex = null;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, slideIndex - 1);
    if (event.key === "ArrowRight") nextIndex = Math.min(lastIndex, slideIndex + 1);
    if (event.key === "ArrowUp") nextIndex = 0;
    if (event.key === "ArrowDown") nextIndex = lastIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    setSlideIndex(nextIndex);
  };

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

  const commit = (explicitEvaluation = false) => {
    if (!editingBlock || committingRef.current) return;
    const validation = validateMarkdownSource(editingBlock.draft);
    if (!validation.valid) {
      setError(validation.error || "Markdown is incomplete.");
      return;
    }
    committingRef.current = true;
    const source = `${editingBlock.originalSource.slice(0, editingBlock.start)}${editingBlock.prefix || ""}${editingBlock.draft}${editingBlock.trailing}${editingBlock.originalSource.slice(editingBlock.end)}`;
    const shouldEvaluate = explicitEvaluation && !isLivecodeAutoUpdateEnabled(node);
    if (source === editingBlock.originalSource && !(shouldEvaluate && runtimeNode.source !== source)) {
      setEditingBlock(null);
      setError("");
      return;
    }
    sourceRef.current = source;
    const runtimePatch = shouldEvaluate
      ? {
        evaluatedSource: source,
        evaluationRevision: Math.max(0, Number(node.runtime.settings?.evaluationRevision) || 0) + 1,
      }
      : null;
    onPatch?.({ source, ...(runtimePatch ? { runtime: { settings: runtimePatch } } : {}) });
    onCommit?.();
    setEditingBlock(null);
    setError("");
  };
  return <article
    className={`livecode-markdown ${editable ? "editable" : ""} ${documentEditing ? "document-editing" : ""}${slideshowActive ? " slideshow-active" : ""}`}
    role={slideshowActive ? "group" : undefined}
    aria-label={slideshowActive ? `Markdown slideshow, slide ${slideIndex + 1} of ${slides.length}` : undefined}
    data-markdown-slideshow={slideshowActive ? "true" : undefined}
    tabIndex={slideshowActive ? 0 : undefined}
    onPointerDown={event => {
      if (slideshowActive) event.currentTarget.focus();
    }}
    onKeyDown={handleSlideshowKeyDown}
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
  >{slideshowActive ? <div className="livecode-markdown-slideshow">
    <div className="livecode-markdown-slide" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(slides[slideIndex] || "") }} />
    <div className="livecode-markdown-slideshow-status" aria-live="polite">{slideIndex + 1} / {slides.length}</div>
  </div> : (editingBlock?.append ? [...blocks, {
    start: displaySource.length,
    end: displaySource.length,
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
        commit(true);
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

function SvgPresentation({ node, scriptRuntimeRef, transport }) {
  const hostRef = useRef(null);
  const source = useMemo(() => sanitizeSvgForInertRender(node.source), [node.source]);
  const clock = node.runtime.transportMode;
  const transportTime = Number(transport?.time);
  const time = Number.isFinite(transportTime)
    ? Math.max(0, transportTime)
    : Number(scriptRuntimeRef.current?.getTime?.()) || 0;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    host.innerHTML = source;
    return undefined;
  }, [source]);
  useEffect(() => {
    if (clock === "free") resumeSvgDocument(hostRef.current);
  }, [clock, source]);
  useEffect(() => {
    if (clock !== "free") seekSvgDocument(hostRef.current, time);
  }, [clock, source, time]);
  return <div ref={hostRef} className="livecode-svg" aria-label="Livecode SVG output" />;
}

export default function LivecodePresentation({ element, node: rawNode, scriptRuntimeRef, transport, editable = false, documentEditing = false, onActivate, onPatch, onCommit }) {
  const node = normalizeLivecodeNode(rawNode);
  const runtimeNode = resolveLivecodeRuntimeNode(node);
  if (node.kind === "markdown") return <MarkdownPresentation node={node} runtimeNode={runtimeNode} editable={editable} documentEditing={documentEditing} onActivate={onActivate} onPatch={onPatch} onCommit={onCommit} />;
  if (node.kind === "latex") return <div className="livecode-latex" dangerouslySetInnerHTML={{ __html: renderLatex(runtimeNode.source) }} />;
  if (node.kind === "html") return <HtmlPresentation element={element} node={runtimeNode} scriptRuntimeRef={scriptRuntimeRef} />;
  if (node.kind === "svg") return <SvgPresentation node={runtimeNode} scriptRuntimeRef={scriptRuntimeRef} transport={transport} />;
  return null;
}
