const PROVIDER_HOSTS = Object.freeze({
  youtube: ["youtube.com", "www.youtube.com", "youtu.be", "www.youtube-nocookie.com"],
  vimeo: ["vimeo.com", "player.vimeo.com"],
  figma: ["figma.com", "www.figma.com"],
  googleSlides: ["docs.google.com", "drive.google.com"],
});

export const EMBED_DISPLAY_MODES = Object.freeze([
  ["presentation", "Presentation only"],
  ["always", "Always"],
  ["never", "Never"],
]);

export const DEFAULT_EMBED_POLICY = Object.freeze({
  enabled: true,
  // Embeds are active in the normal authoring canvas by default. Users can
  // still opt an instance out with `enabled: false`, or choose Presentation
  // only / Never in Properties when a scene needs an explicit visibility gate.
  display: "always",
  // Web embeds receive input by default. Set `allowInteraction: false` on an
  // instance when the canvas should retain ownership for selection/transform.
  allowInteraction: true,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
  css: "",
  reloadNonce: 0,
});

const nonNegativeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

const hostMatches = (hostname, candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`);

export const getEmbedProvider = (value) => {
  try {
    const url = new URL(sanitizeEmbedURL(value));
    const host = url.hostname.toLowerCase();
    for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS)) {
      if (hosts.some(candidate => hostMatches(host, candidate))) return provider;
    }
    return "custom";
  } catch {
    return "invalid";
  }
};

const looksLikeBareWebHost = value => {
  if (!value || /\s/.test(value) || value.startsWith("/") || value.startsWith("#")) return false;
  const possibleScheme = /^[a-z][a-z\d+.-]*:/i.exec(value);
  if (possibleScheme && !/^\d+(?:[/?#]|$)/.test(value.slice(possibleScheme[0].length))) return false;
  const host = value.split(/[/?#]/, 1)[0].replace(/:\d+$/, "");
  return host === "localhost"
    || host === "127.0.0.1"
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
    || host.includes(".");
};

/**
 * Resolve a user-facing web embed value to a safe absolute HTTP(S) URL.
 * Bare domains are intentionally treated as HTTPS; other schemes are not
 * accepted because an embeddable iframe must never become a script/document
 * navigation escape hatch.
 */
export const sanitizeEmbedURL = (value) => {
  try {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const candidate = raw.startsWith("//")
      ? `https:${raw}`
      : /^https?:\/\//i.test(raw)
        ? raw
        : /^[a-z][a-z\d+.-]*:/i.test(raw) && !looksLikeBareWebHost(raw)
          ? ""
          : (looksLikeBareWebHost(raw) ? `https://${raw}` : "");
    if (!candidate) return "";
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

export const isAllowedEmbedURL = value => Boolean(sanitizeEmbedURL(value));

const decodeDroppedText = value => String(value || "")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

/** Extract the first web URL from a browser link or dragged text payload. */
export const extractDroppedEmbedURL = dataTransfer => {
  if (!dataTransfer) return "";
  const candidates = [];
  const add = value => {
    const text = decodeDroppedText(value).trim();
    if (text) candidates.push(text);
  };
  const uriList = dataTransfer.getData?.("text/uri-list") || "";
  uriList.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) add(trimmed);
  });
  const html = dataTransfer.getData?.("text/html") || "";
  const href = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  if (href) add(href);
  const plain = dataTransfer.getData?.("text/plain") || "";
  plain.split(/\r?\n/).forEach(line => {
    const match = line.match(/(?:https?:\/\/|\/\/|www\.)[^\s<>"']+/i);
    // Do not interpret arbitrary dragged text (or a filename such as
    // `image.gif`) as a hostname. Browser address-bar drags expose the URL
    // through this field with an explicit protocol or `www.` prefix.
    if (match) add(match[0]);
  });
  for (const candidate of candidates) {
    const normalized = sanitizeEmbedURL(candidate.replace(/[),.;]+$/, ""));
    if (normalized) return normalized;
  }
  return "";
};

export const normalizeEmbedPolicy = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_EMBED_POLICY,
    ...source,
    enabled: source.enabled !== false,
    display: EMBED_DISPLAY_MODES.some(([mode]) => mode === source.display) ? source.display : DEFAULT_EMBED_POLICY.display,
    allowInteraction: source.allowInteraction !== false,
    cropTop: nonNegativeNumber(source.cropTop),
    cropRight: nonNegativeNumber(source.cropRight),
    cropBottom: nonNegativeNumber(source.cropBottom),
    cropLeft: nonNegativeNumber(source.cropLeft),
    css: typeof source.css === "string" ? source.css : "",
    reloadNonce: nonNegativeNumber(source.reloadNonce),
  };
};

export const shouldRenderEmbed = (policy, presentationMode) => {
  const normalized = normalizeEmbedPolicy(policy);
  if (!normalized.enabled || normalized.display === "never") return false;
  return normalized.display === "always" || Boolean(presentationMode);
};

export const embedPolicyForElement = element => normalizeEmbedPolicy(element?.customData?.underscoresEmbed);
