import { useEffect, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";
import { normalizeLivecodeNode } from "./livecodeNode.js";
import { buildHtmlSandboxDocument, renderLatex, renderMarkdownWithMath } from "./livecodePresentation.js";

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
  const source = useMemo(() => buildHtmlSandboxDocument({ source: node.source, token }), [node.source, token]);
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

export default function LivecodePresentation({ element, node: rawNode, scriptRuntimeRef }) {
  const node = normalizeLivecodeNode(rawNode);
  if (node.kind === "markdown") return <article className="livecode-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(node.source) }} />;
  if (node.kind === "latex") return <div className="livecode-latex" dangerouslySetInnerHTML={{ __html: renderLatex(node.source) }} />;
  if (node.kind === "html") return <HtmlPresentation element={element} node={node} scriptRuntimeRef={scriptRuntimeRef} />;
  return null;
}
