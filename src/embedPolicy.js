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
  display: "presentation",
  allowInteraction: false,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
  css: "",
});

const nonNegativeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

const hostMatches = (hostname, candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`);

export const getEmbedProvider = (value) => {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS)) {
      if (hosts.some(candidate => hostMatches(host, candidate))) return provider;
    }
    return "custom";
  } catch {
    return "invalid";
  }
};

export const sanitizeEmbedURL = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

export const isAllowedEmbedURL = value => Boolean(sanitizeEmbedURL(value));

export const normalizeEmbedPolicy = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...DEFAULT_EMBED_POLICY,
    ...source,
    enabled: source.enabled !== false,
    display: EMBED_DISPLAY_MODES.some(([mode]) => mode === source.display) ? source.display : DEFAULT_EMBED_POLICY.display,
    allowInteraction: source.allowInteraction === true,
    cropTop: nonNegativeNumber(source.cropTop),
    cropRight: nonNegativeNumber(source.cropRight),
    cropBottom: nonNegativeNumber(source.cropBottom),
    cropLeft: nonNegativeNumber(source.cropLeft),
    css: typeof source.css === "string" ? source.css : "",
  };
};

export const shouldRenderEmbed = (policy, presentationMode) => {
  const normalized = normalizeEmbedPolicy(policy);
  if (!normalized.enabled || normalized.display === "never") return false;
  return normalized.display === "always" || Boolean(presentationMode);
};

export const embedPolicyForElement = element => normalizeEmbedPolicy(element?.customData?.draweratorEmbed);
