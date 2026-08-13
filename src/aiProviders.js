const PROVIDERS = Object.freeze({
  ollama: {
    id: "ollama",
    label: "Ollama",
    defaultUrl: "http://localhost:11434",
    credentialLabel: null,
    protocol: "ollama",
    instructions: "Runs locally through Ollama. Start the Ollama service, keep the default URL unless it was configured on another host, then choose an installed chat-capable model. No API key is required.",
  },
  lmstudio: {
    id: "lmstudio",
    label: "LM Studio",
    defaultUrl: "http://localhost:1234",
    credentialLabel: null,
    protocol: "openai",
    instructions: "Runs locally through LM Studio's OpenAI-compatible server. Start the local server in LM Studio and enable network or CORS access if Underscores is opened from another origin. No API key is normally required.",
  },
  "openai-compatible": {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    defaultUrl: "http://localhost:1234",
    credentialLabel: "API key (optional)",
    protocol: "openai",
    instructions: "Uses an OpenAI-compatible REST server. Enter the server base URL without /v1; Underscores adds the model and chat routes. Add a bearer token only when the server requires one.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultUrl: "https://openrouter.ai/api",
    credentialLabel: "OpenRouter API key",
    protocol: "openai",
    instructions: "Uses OpenRouter's model catalog and chat-completions routes. Create a restricted OpenRouter key, then filter the catalog or favorite frequently used model IDs. Availability and pricing vary by model and upstream provider.",
  },
  pratt: {
    id: "pratt",
    label: "Pratt LLM",
    defaultUrl: "https://llm.pratt.edu/v1",
    defaultModel: "pratt-medium-fast",
    manualModels: ["pratt-high", "pratt-medium-fast", "pratt-medium"],
    modelPreference: [
      "pratt-medium-fast",
      "pratt-high",
      "pratt-deepseek-flash",
      "pratt-kimi",
      "pratt-deepseek-pro",
      "pratt-qwen",
      "pratt-grok",
      "pratt-nemo",
      "pratt-tencent",
      "pratt-muse-spark",
    ],
    credentialLabel: "Pratt LLM API key",
    protocol: "openai",
    instructions: "Uses Pratt Institute's OpenAI-compatible LLM service. Pratt students can request an sk-pratt-… key through a OnePratt support ticket. When Underscores's local server has PRATT_LLM_API_KEY, it supplies that credential without exposing it to the browser; an API key entered here takes precedence. Pratt Medium Fast is the recommended interactive default, while Pratt High is the strongest coding/task route.",
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    defaultUrl: "https://integrate.api.nvidia.com",
    credentialLabel: "NVIDIA API key",
    protocol: "openai",
    instructions: "Uses NVIDIA's hosted NIM inference API. Create an NVIDIA API key (nvapi-…) and select a model enabled for serverless inference. NVIDIA does not allow direct cross-origin browser requests, so Underscores uses its same-origin relay when running on localhost. Static deployments need a CORS-capable proxy, a self-hosted NIM endpoint, or OpenRouter for NVIDIA-hosted models.",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultUrl: "https://api.openai.com",
    credentialLabel: "OpenAI API key",
    protocol: "openai",
    instructions: "Uses the official OpenAI model and chat-completions routes. Use a restricted project API key and select a model that supports chat input; account and project limits still apply.",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    defaultUrl: "https://api.anthropic.com",
    credentialLabel: "Anthropic API key",
    protocol: "anthropic",
    instructions: "Uses Anthropic's native Messages API with direct-browser access enabled. Supply a restricted Anthropic API key and select a Claude model available to that key.",
  },
  github: {
    id: "github",
    label: "GitHub Copilot / Models",
    defaultUrl: "https://models.github.ai/inference",
    credentialLabel: "GitHub fine-grained token",
    protocol: "openai",
    instructions: "Uses GitHub Models inference, not a private Copilot subscription endpoint. Create a fine-grained GitHub token with models:read permission, then select a catalog model. Full Copilot SDK sessions require a backend service.",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    defaultUrl: "https://generativelanguage.googleapis.com",
    credentialLabel: "Google API key",
    protocol: "google",
    instructions: "Uses Google's native Gemini generateContent API. Create a Gemini API key in Google AI Studio, ensure the Generative Language API is available, and select a model that supports generateContent.",
  },
});

export const AI_PROVIDER_OPTIONS = Object.freeze(Object.values(PROVIDERS));

export const getAIProvider = provider => PROVIDERS[provider] || PROVIDERS.ollama;

export const getAIProviderManualModels = provider => [...(getAIProvider(provider).manualModels || [])];

export const getAIProviderHelp = provider => {
  const definition = getAIProvider(provider);
  const storageWarning = definition.credentialLabel
    ? " Underscores stores this credential unencrypted in this browser's localStorage. Use a restricted key and remove it on shared computers. Browser CORS policy may still block direct requests."
    : "";
  return `${definition.instructions}${storageWarning}`;
};

export const aiProviderNeedsCredential = (provider, environmentCredentialAvailable = false) => (
  Boolean(getAIProvider(provider).credentialLabel)
  && provider !== "openai-compatible"
  && !(provider === "pratt" && environmentCredentialAvailable)
);

export const normalizeAISettings = value => {
  const source = value && typeof value === "object" ? value : {};
  let provider = PROVIDERS[source.provider] ? source.provider : "ollama";
  if (provider === "openai" && source.url && !/api\.openai\.com/i.test(source.url)) {
    provider = "openai-compatible";
  }
  const definition = getAIProvider(provider);
  const apiKeys = source.apiKeys && typeof source.apiKeys === "object"
    ? { ...source.apiKeys }
    : {};
  if (source.apiKey && !apiKeys[provider]) apiKeys[provider] = String(source.apiKey);
  return {
    provider,
    url: String(source.url || definition.defaultUrl),
    model: String(source.model || definition.defaultModel || ""),
    apiKeys,
  };
};

export const getAIProviderCredential = settings => String(settings?.apiKeys?.[settings?.provider] || "").trim();

export const cleanAIBaseUrl = (url, provider) => {
  const definition = getAIProvider(provider);
  let clean = String(url || definition.defaultUrl).trim().replace(/\/+$/, "");
  if (["openai", "openrouter", "pratt", "nvidia", "anthropic", "lmstudio", "openai-compatible"].includes(provider)) {
    clean = clean.replace(/\/v1$/i, "");
  } else if (provider === "google") {
    clean = clean.replace(/\/v1beta$/i, "");
  }
  return clean;
};

const isLocalBrowserOrigin = origin => {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
};

export const resolveAIRequestBase = (settings, runtimeOrigin = "") => {
  const base = cleanAIBaseUrl(settings.url, settings.provider);
  const isHostedPratt = settings.provider === "pratt"
    && base === cleanAIBaseUrl(PROVIDERS.pratt.defaultUrl, "pratt");
  if (isHostedPratt && isLocalBrowserOrigin(runtimeOrigin)) {
    return `${String(runtimeOrigin).replace(/\/+$/, "")}/api/pratt`;
  }
  const isHostedNvidia = settings.provider === "nvidia"
    && base === cleanAIBaseUrl(PROVIDERS.nvidia.defaultUrl, "nvidia");
  if (isHostedNvidia && isLocalBrowserOrigin(runtimeOrigin)) {
    return `${String(runtimeOrigin).replace(/\/+$/, "")}/api/nvidia`;
  }
  return base;
};

export const aiProviderEnvironmentCredentialApplies = (
  settings,
  runtimeOrigin = "",
  environmentCredentialAvailable = false,
) => Boolean(environmentCredentialAvailable)
  && settings?.provider === "pratt"
  && resolveAIRequestBase(settings, runtimeOrigin) === `${String(runtimeOrigin).replace(/\/+$/, "")}/api/pratt`;

const bearerHeaders = credential => credential ? { Authorization: `Bearer ${credential}` } : {};

const providerHeaders = (settings, { stream = false } = {}) => {
  const provider = settings.provider;
  const credential = getAIProviderCredential(settings);
  const headers = { "Content-Type": "application/json" };
  if (["openai", "openrouter", "pratt", "nvidia", "github", "openai-compatible"].includes(provider)) {
    Object.assign(headers, bearerHeaders(credential));
  }
  if (provider === "openrouter") headers["X-Title"] = "Underscores";
  if (provider === "nvidia" && stream) headers.Accept = "text/event-stream";
  if (provider === "github") {
    headers.Accept = stream ? "text/event-stream" : "application/vnd.github+json";
    headers["X-GitHub-Api-Version"] = "2026-03-10";
  }
  if (provider === "anthropic") {
    headers["x-api-key"] = credential;
    headers["anthropic-version"] = "2023-06-01";
    // Anthropic requires an explicit opt-in for direct browser requests.
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  if (provider === "google") headers["x-goog-api-key"] = credential;
  return headers;
};

export const buildAIModelsRequest = (settings, runtimeOrigin = "") => {
  const provider = settings.provider;
  const base = resolveAIRequestBase(settings, runtimeOrigin);
  if (provider === "ollama") return { url: `${base}/api/tags`, options: {} };
  if (provider === "google") {
    return { url: `${base}/v1beta/models?pageSize=1000`, options: { headers: providerHeaders(settings) } };
  }
  if (provider === "github") {
    const origin = new URL(base).origin;
    return { url: `${origin}/catalog/models`, options: { headers: providerHeaders(settings) } };
  }
  return { url: `${base}/v1/models`, options: { headers: providerHeaders(settings) } };
};

export const parseAIModelList = (provider, payload) => {
  if (provider === "ollama") return (payload?.models || []).map(model => model?.name).filter(Boolean);
  if (provider === "google") {
    return (payload?.models || [])
      .filter(model => !model?.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent"))
      .map(model => String(model?.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }
  const entries = Array.isArray(payload) ? payload : payload?.data || payload?.models || [];
  return entries
    .map(model => model?.id || model?.name || model?.model)
    .filter(Boolean)
    .filter(model => provider !== "pratt" || !/^pratt-(?:embedding|reranker)-/i.test(model));
};

export const filterAIModels = (models, { query = "", favorites = [], favoritesOnly = false } = {}) => {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const favoriteSet = new Set((Array.isArray(favorites) ? favorites : []).map(String));
  return [...new Set((Array.isArray(models) ? models : []).map(String).filter(Boolean))]
    .filter(model => (!favoritesOnly || favoriteSet.has(model)) && (!normalizedQuery || model.toLowerCase().includes(normalizedQuery)))
    .sort((left, right) => Number(favoriteSet.has(right)) - Number(favoriteSet.has(left)) || left.localeCompare(right));
};

export const selectAIModelFromList = (settings, models) => {
  const available = [...new Set((Array.isArray(models) ? models : []).map(String).filter(Boolean))];
  const current = String(settings?.model || "");
  if (available.length === 0) return current;
  const definition = getAIProvider(settings?.provider);
  if (current && (
    current !== definition.defaultModel
    || available.includes(current)
    || definition.manualModels?.includes(current)
  )) return current;
  return (definition.modelPreference || []).find(model => available.includes(model)) || available[0];
};

const dataUrlSource = value => {
  const match = String(value || "").match(/^data:([^;,]+);base64,(.+)$/s);
  return match ? { mediaType: match[1], data: match[2] } : null;
};

const asText = content => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content.filter(part => part?.type === "text").map(part => part.text || "").join("\n");
};

const toAnthropicContent = content => {
  if (!Array.isArray(content)) return asText(content);
  return content.flatMap(part => {
    if (part?.type === "text") return [{ type: "text", text: part.text || "" }];
    if (part?.type === "image_url") {
      const source = dataUrlSource(part.image_url?.url);
      return source ? [{ type: "image", source: { type: "base64", media_type: source.mediaType, data: source.data } }] : [];
    }
    return [];
  });
};

const toGoogleParts = content => {
  if (!Array.isArray(content)) return [{ text: asText(content) }];
  return content.flatMap(part => {
    if (part?.type === "text") return [{ text: part.text || "" }];
    if (part?.type === "image_url") {
      const source = dataUrlSource(part.image_url?.url);
      return source ? [{ inline_data: { mime_type: source.mediaType, data: source.data } }] : [];
    }
    return [];
  });
};

export const buildAIChatRequest = (settings, messages, runtimeOrigin = "") => {
  const provider = settings.provider;
  const base = resolveAIRequestBase(settings, runtimeOrigin);
  const model = settings.model || "default";
  if (provider === "ollama") {
    return {
      url: `${base}/api/chat`,
      options: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, stream: true }) },
      streamFormat: "ollama",
    };
  }
  if (provider === "anthropic") {
    const system = messages.filter(message => message.role === "system").map(message => asText(message.content)).join("\n\n");
    const anthropicMessages = messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: toAnthropicContent(message.content),
    }));
    return {
      url: `${base}/v1/messages`,
      options: { method: "POST", headers: providerHeaders(settings, { stream: true }), body: JSON.stringify({ model, system, messages: anthropicMessages, max_tokens: 4096, stream: true }) },
      streamFormat: "anthropic",
    };
  }
  if (provider === "google") {
    const system = messages.filter(message => message.role === "system").map(message => asText(message.content)).join("\n\n");
    const contents = messages.filter(message => message.role !== "system").map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: toGoogleParts(message.content),
    }));
    return {
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      options: { method: "POST", headers: providerHeaders(settings, { stream: true }), body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents }) },
      streamFormat: "google",
    };
  }
  const path = provider === "github" ? "/chat/completions" : "/v1/chat/completions";
  return {
    url: `${base}${path}`,
    options: { method: "POST", headers: providerHeaders(settings, { stream: true }), body: JSON.stringify({ model, messages, stream: true }) },
    streamFormat: "openai",
  };
};

export const extractAIStreamText = (format, payload) => {
  if (!payload || typeof payload !== "object") return "";
  if (format === "ollama") return payload.message?.content || "";
  if (format === "anthropic") return payload.type === "content_block_delta" ? payload.delta?.text || "" : "";
  if (format === "google") {
    return (payload.candidates?.[0]?.content?.parts || []).map(part => part?.text || "").join("");
  }
  const content = payload.choices?.[0]?.delta?.content;
  if (typeof content === "string") return content;
  return Array.isArray(content) ? content.map(part => part?.text || "").join("") : "";
};

export const readAITextStream = async (response, format, onText) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The provider returned no response stream.");
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = done ? "" : lines.pop() || "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const data = format === "ollama" ? line : line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      try {
        const text = extractAIStreamText(format, JSON.parse(data));
        if (text) {
          fullText += text;
          onText(fullText, text);
        }
      } catch {}
    }
    if (done) break;
  }
  return fullText;
};
