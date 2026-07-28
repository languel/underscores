import { useEffect, useMemo, useRef } from "react";
import { buildTrustedSvgRuntimeDocument } from "./svgTrustedRuntimeDocument.js";

export default function SvgTrustedRuntime({ source, policy, time = 0, color = "currentColor", onRuntimeEvent }) {
  const iframeRef = useRef(null);
  const tokenRef = useRef(
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  );
  const token = tokenRef.current;
  const allowNetwork = policy?.allowNetwork === true;
  const srcDoc = useMemo(
    () => buildTrustedSvgRuntimeDocument(source, { allowNetwork }, token),
    [source, allowNetwork, token],
  );

  useEffect(() => {
    const listener = event => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.draweratorSvgRuntime !== token) return;
      if (["log", "cue", "midi", "ready"].includes(message.type)) onRuntimeEvent?.(message);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [token, onRuntimeEvent]);

  useEffect(() => {
    if (policy?.clock === "free") return;
    iframeRef.current?.contentWindow?.postMessage({
      draweratorSvgRuntime: token,
      type: "seek",
      seconds: Math.max(0, Number(time) || 0),
    }, "*");
  }, [policy?.clock, time, token]);

  return (
    <iframe
      ref={iframeRef}
      className="drawerator-svg-trusted-frame"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      title="Trusted SVG runtime"
      style={{ color }}
    />
  );
}
