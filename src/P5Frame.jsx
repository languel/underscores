import { useEffect, useRef, useState } from "react";
import BundledP5 from "p5";
import { compileClassicP5Source, normalizeP5Frame, resolveP5SourceMode } from "./p5Frame.js";

const loadedCdnRuntimes = new Map();

const loadP5Runtime = async config => {
  if (config.runtime !== "cdn") return BundledP5;
  const url = config.cdnUrl;
  if (!loadedCdnRuntimes.has(url)) {
    loadedCdnRuntimes.set(url, new Promise((resolve, reject) => {
      const existing = Array.from(document.querySelectorAll("script[data-drawerator-p5-cdn]"))
        .find(candidate => candidate.dataset.draweratorP5Cdn === url);
      if (existing && window.p5) return resolve(window.p5);
      const script = existing || document.createElement("script");
      script.dataset.draweratorP5Cdn = url;
      script.src = url;
      script.async = true;
      script.onload = () => window.p5 ? resolve(window.p5) : reject(new Error("The CDN did not expose window.p5."));
      script.onerror = () => reject(new Error(`Could not load p5 from ${url}.`));
      if (!existing) document.head.appendChild(script);
    }));
  }
  return loadedCdnRuntimes.get(url);
};

export default function P5Frame({ element, config: rawConfig }) {
  const hostRef = useRef(null);
  const [error, setError] = useState("");
  const config = normalizeP5Frame(rawConfig);

  useEffect(() => {
    let disposed = false;
    let instance = null;
    let observer = null;
    setError("");

    const start = async () => {
      try {
        const P5 = await loadP5Runtime(config);
        if (disposed || !hostRef.current) return;
        const host = hostRef.current;
        const drawerator = {
          element: { id: element.id, width: element.width, height: element.height },
          frame: config,
          get time() { return Number(window.drawerator?.transport?.getTime?.() || 0); },
          api: window.drawerator,
        };
        const sketch = p => {
          const reportError = reason => {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            p.noLoop?.();
          };
          try {
            // Deliberately trusted: this editor is for the local author and has
            // full page access, mirroring Drawerator's trusted IanniX scripts.
            const callbacks = resolveP5SourceMode(config) === "global"
              ? compileClassicP5Source(p, drawerator, config.source)
              : (new Function("p", "drawerator", `${config.source}\nreturn { preload: p.preload, setup: p.setup, draw: p.draw };`)(p, drawerator) || {});
            if (typeof callbacks.preload === "function") p.preload = callbacks.preload;
            if (typeof callbacks.setup === "function") p.setup = callbacks.setup;
            if (typeof callbacks.draw === "function") p.draw = callbacks.draw;
          } catch (reason) {
            reportError(reason);
            return;
          }
          const authoredSetup = p.setup;
          p.setup = () => {
            try {
              if (typeof authoredSetup === "function") authoredSetup();
              if (!p.canvas) p.createCanvas(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
              p.frameRate(config.fps);
              if (!config.autoplay) p.noLoop();
            } catch (reason) { reportError(reason); }
          };
          const authoredDraw = p.draw;
          if (typeof authoredDraw === "function") {
            p.draw = () => { try { authoredDraw(); } catch (reason) { reportError(reason); } };
          }
        };
        instance = new P5(sketch, host);
        observer = new ResizeObserver(() => {
          if (!instance?.resizeCanvas) return;
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          if (instance.width !== width || instance.height !== height) instance.resizeCanvas(width, height);
        });
        observer.observe(host);
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void start();
    return () => {
      disposed = true;
      observer?.disconnect();
      instance?.remove?.();
    };
  }, [config.allowInteraction, config.autoplay, config.cdnUrl, config.fps, config.mode, config.reloadNonce, config.runtime, config.source, element.height, element.id, element.width]);

  return <div className={`drawerator-p5-frame ${config.allowInteraction ? "drawerator-p5-interactive" : ""}`}>
    <div ref={hostRef} className="drawerator-p5-host" style={{ pointerEvents: config.allowInteraction ? "auto" : "none" }} />
    {error ? <div className="drawerator-p5-error" role="alert">p5 error: {error}</div> : null}
  </div>;
}
