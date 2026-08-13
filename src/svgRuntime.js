const REMOTE_URL = /^(?:https?:)?\/\//i;
const URL_FUNCTION = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi;

const isSafeResourceReference = value => {
  const reference = String(value || "").trim();
  return !reference
    || reference.startsWith("#")
    || reference.startsWith("data:image/");
};

const sanitizeCssResources = value => String(value || "")
  .replace(/@import\s+[^;]+;?/gi, "")
  .replace(URL_FUNCTION, (match, _quote, reference) => (
    isSafeResourceReference(reference) ? match : "none"
  ));

const fallbackSanitize = source => String(source || "")
  .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
  .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
  .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/\s+(?:href|xlink:href)\s*=\s*(["'])(https?:)?\/\/[\s\S]*?\1/gi, "")
  .replace(/@import\s+[^;]+;?/gi, "")
  .replace(URL_FUNCTION, (match, _quote, reference) => (
    isSafeResourceReference(reference) ? match : "none"
  ));

export const sanitizeSvgForInertRender = sourceValue => {
  const source = String(sourceValue || "");
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    return fallbackSanitize(source);
  }
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement?.localName?.toLowerCase() !== "svg") {
    return "";
  }

  let renderIndex = 0;
  [...document.querySelectorAll("*")].forEach(element => {
    element.setAttribute("data-underscores-render-index", String(renderIndex));
    renderIndex += 1;
  });

  document.querySelectorAll("script").forEach(element => element.remove());
  document.querySelectorAll("foreignObject").forEach(element => element.remove());
  document.querySelectorAll("*").forEach(element => {
    [...element.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
      } else if ((name === "href" || name === "xlink:href") && !isSafeResourceReference(attribute.value)) {
        element.removeAttribute(attribute.name);
      } else if (name === "style") {
        element.setAttribute(attribute.name, sanitizeCssResources(attribute.value));
      } else if (REMOTE_URL.test(attribute.value) && ["src", "poster"].includes(name)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  document.querySelectorAll("style").forEach(element => {
    element.textContent = sanitizeCssResources(element.textContent);
  });
  return new XMLSerializer().serializeToString(document.documentElement);
};

export const seekSvgDocument = (root, seconds) => {
  const svg = root?.querySelector?.("svg");
  if (!svg) return { smil: false, animations: 0 };
  const time = Math.max(0, Number(seconds) || 0);
  let smil = false;
  if (typeof svg.pauseAnimations === "function") svg.pauseAnimations();
  if (typeof svg.setCurrentTime === "function") {
    svg.setCurrentTime(time);
    smil = true;
  }
  const animations = typeof svg.getAnimations === "function" ? svg.getAnimations({ subtree: true }) : [];
  animations.forEach(animation => {
    try {
      animation.pause();
      animation.currentTime = time * 1000;
    } catch {
      // A browser may expose an animation before it is seekable.
    }
  });
  return { smil, animations: animations.length };
};

export const resumeSvgDocument = root => {
  const svg = root?.querySelector?.("svg");
  if (!svg) return;
  if (typeof svg.unpauseAnimations === "function") svg.unpauseAnimations();
  if (typeof svg.getAnimations === "function") {
    svg.getAnimations({ subtree: true }).forEach(animation => {
      try {
        animation.play();
      } catch {
        // Leave browser-owned animations alone when they cannot be resumed.
      }
    });
  }
};
