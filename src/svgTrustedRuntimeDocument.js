const escapeHtmlAttribute = value => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("\"", "&quot;")
  .replaceAll("<", "&lt;");

export const buildTrustedSvgRuntimeDocument = (source, policy, token) => {
  const network = policy?.allowNetwork === true;
  const csp = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    `img-src data: blob:${network ? " https:" : ""}`,
    `media-src data: blob:${network ? " https:" : ""}`,
    `connect-src ${network ? "https: wss:" : "'none'"}`,
    "font-src data:",
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
  ].join("; ");
  const bridge = `<script>
  (() => {
    const token = ${JSON.stringify(token)};
    const allowedEvents = new Set(["log", "cue", "midi"]);
    window.drawerator = Object.freeze({
      emit(type, payload) {
        if (!allowedEvents.has(type)) return;
        parent.postMessage({ draweratorSvgRuntime: token, type, payload }, "*");
      }
    });
    addEventListener("message", event => {
      const message = event.data;
      if (!message || message.draweratorSvgRuntime !== token) return;
      const svg = document.querySelector("svg");
      if (message.type === "seek" && svg) {
        const seconds = Math.max(0, Number(message.seconds) || 0);
        svg.pauseAnimations?.();
        svg.setCurrentTime?.(seconds);
        svg.getAnimations?.({ subtree: true }).forEach(animation => {
          try { animation.pause(); animation.currentTime = seconds * 1000; } catch {}
        });
      }
    });
    parent.postMessage({ draweratorSvgRuntime: token, type: "ready" }, "*");
  })();
  </script>`;
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}"><style>html,body,svg{width:100%;height:100%;margin:0;overflow:hidden}body{color:inherit}</style>${bridge}</head><body>${String(source || "")}</body></html>`;
};
