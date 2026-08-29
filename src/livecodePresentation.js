import { marked } from "marked";
import katex from "katex";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

// Markdown stays deliberately local and conservative. Raw HTML is removed,
// event handlers are stripped, and only ordinary href protocols remain.
export const sanitizeMarkdownHtml = value => String(value || "")
  .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button)[^>]*>/gi, "")
  .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/\s(?:href|src)\s*=\s*(["'])\s*(?:javascript|data):[^"']*\1/gi, "");

const mathToken = index => `UNDERSCORES_MATH_TOKEN_${index}_END`;

const CODE_LANGUAGE_ALIASES = Object.freeze({
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  python3: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  text: "text",
  plaintext: "text",
});

const CODE_KEYWORDS = Object.freeze({
  javascript: new Set("as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof let new of package private protected public return set static super switch this throw try typeof undefined var void while with yield true false null NaN".split(" ")),
  typescript: new Set("as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface keyof let module namespace new of package private protected public readonly return set static super switch this throw try typeof type undefined var void while with yield true false null NaN".split(" ")),
  python: new Set("and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield True False None self".split(" ")),
  shell: new Set("alias bg bind break case cd command compgen continue declare do done elif else enable eval exec exit export false fi for function getopts hash if in jobs kill local readonly return select set shift source then time trap true type ulimit umask unset until while do done".split(" ")),
  yaml: new Set("true false null yes no on off".split(" ")),
  json: new Set("true false null".split(" ")),
  glsl: new Set("attribute bool break bvec2 bvec3 bvec4 case catch ceil const continue discard do dvec2 dvec3 dvec4 else false flat float for if in int ivec2 ivec3 ivec4 layout mat2 mat3 mat4 mix normalize out patch precision return sampler2D smoothstep struct switch texture this true uint uniform unsigned varying vec2 vec3 vec4 void while".split(" ")),
});

const CODE_BUILTINS = Object.freeze({
  javascript: new Set("Array Boolean Date Error JSON Math Number Object Promise RegExp Set String Symbol console document window".split(" ")),
  typescript: new Set("Array Boolean Date Error JSON Math Number Object Promise RegExp Set String Symbol console document window".split(" ")),
  python: new Set("abs all any bool dict enumerate float int len list map max min open print range set str sum tuple zip".split(" ")),
  shell: new Set("echo printf read test pwd cd mkdir rm cp mv".split(" ")),
  glsl: new Set("abs clamp cos cross dot length max min mix normalize pow sin smoothstep texture".split(" ")),
});

const normalizeCodeLanguage = value => {
  const raw = String(value || "").trim().toLowerCase().replace(/^language-/, "").split(/[\s,{]/, 1)[0];
  return CODE_LANGUAGE_ALIASES[raw] || raw || "text";
};

const codeTokenClass = (token, language) => {
  if (/^\s+$/.test(token)) return "";
  if (/^(?:\/\/|#(?![0-9a-f]{3,8}\b)|<!--)/i.test(token) || /^\/\*/.test(token)) return "comment";
  if (/^(?:["'`])/.test(token)) return "string";
  if (/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?n?$/i.test(token)) return "number";
  if (/^[A-Za-z_$][\w$]*$/.test(token)) {
    if (CODE_KEYWORDS[language]?.has(token)) return "keyword";
    if (CODE_BUILTINS[language]?.has(token)) return "builtin";
  }
  return "";
};

// A small, dependency-free preview highlighter. CodeMirror handles the
// editable source; this keeps rendered Markdown portable and avoids executing
// or injecting arbitrary code from a fenced block.
export const highlightMarkdownCode = (source, language) => {
  const normalized = normalizeCodeLanguage(language);
  if (normalized === "text" || normalized === "markdown") return escapeHtml(source);
  const supportsHashComments = ["python", "shell", "yaml"].includes(normalized);
  const tokenPattern = new RegExp([
    `(?:\\/\\*[\\s\\S]*?\\*\\/)`,
    `(?:\\/\\/[^\\n]*)`,
    ...(supportsHashComments ? [`(?:#[^\\n]*)`] : []),
    `(?:<!--[\\s\\S]*?-->)`,
    `(?:"(?:\\\\[\\s\\S]|[^"\\\\])*"|'(?:\\\\[\\s\\S]|[^'\\\\])*'|\\x60(?:\\\\[\\s\\S]|[^\\x60\\\\])*\\x60)`,
    `(?:\\b(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?n?\\b)`,
    `(?:[A-Za-z_$][\\w$]*)`,
    `(?:\\s+)`,
    `(?:.)`,
  ].join("|"), "g");
  return Array.from(String(source || "").matchAll(tokenPattern), match => {
    const token = match[0];
    const className = codeTokenClass(token, normalized);
    const escaped = escapeHtml(token);
    return className ? `<span class="livecode-code-${className}">${escaped}</span>` : escaped;
  }).join("");
};

const encodeChatBlockSource = value => encodeURIComponent(String(value ?? ""));

const chatBlockActionsPlaceholder = source => (
  `<span class="chat-markdown-block-actions" data-chat-block-source="${encodeChatBlockSource(source)}"></span>`
);

const wrapChatMarkdownBlock = (html, source, className = "") => (
  `<div class="chat-markdown-block ${className}" data-chat-block-source="${encodeChatBlockSource(source)}">${chatBlockActionsPlaceholder(source)}${html}</div>`
);

const renderChatBlockActions = encodedSource => {
  const escapedSource = String(encodedSource || "");
  return `<div class="chat-markdown-block-actions" data-chat-block-actions="${escapedSource}">
    <button type="button" class="chat-block-action" data-chat-action="copy" data-chat-block-source="${escapedSource}" aria-label="Copy block">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
    </button>
  </div>`;
};

export const renderMarkdownWithMath = (source, options = {}) => {
  const chatActions = options?.chatActions === true;
  const formulas = [];
  const tokenized = String(source || "")
    .replace(/\$\$([\s\S]+?)\$\$/g, (sourceMatch, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, source: sourceMatch, displayMode: true });
      return token;
    })
    .replace(/\\\[([\s\S]+?)\\\]/g, (sourceMatch, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, source: sourceMatch, displayMode: true });
      return token;
    })
    .replace(/\\\(([\s\S]+?)\\\)/g, (sourceMatch, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, source: sourceMatch, displayMode: false });
      return token;
    })
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (sourceMatch, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, source: sourceMatch, displayMode: false });
      return token;
    });
  const restoreMathTokens = value => formulas.reduce(
    (restored, formula) => restored.replaceAll(formula.token, formula.source),
    String(value ?? ""),
  );
  const renderer = new marked.Renderer();
  renderer.html = () => "";
  renderer.code = ({ text, lang }) => {
    const language = normalizeCodeLanguage(lang);
    const languageClass = language === "text" ? "" : ` language-${escapeHtml(language)}`;
    const code = `<pre class="livecode-markdown-code-block"><code class="${languageClass.trim()}">${highlightMarkdownCode(text, language)}</code></pre>`;
    return chatActions ? wrapChatMarkdownBlock(code, restoreMathTokens(text), "chat-markdown-code-block") : code;
  };
  if (chatActions) {
    renderer.paragraph = ({ text, raw }) => wrapChatMarkdownBlock(`<p>${text}</p>`, restoreMathTokens(raw ?? text), "chat-markdown-text-block");
    renderer.heading = ({ text, depth, raw }) => wrapChatMarkdownBlock(`<h${depth}>${text}</h${depth}>`, restoreMathTokens(raw ?? text), "chat-markdown-text-block");
    renderer.list = ({ body, ordered, start, raw }) => {
      const tag = ordered ? "ol" : "ul";
      const startAttribute = ordered && start !== undefined && start !== 1 ? ` start="${Number(start) || 1}"` : "";
      return wrapChatMarkdownBlock(`<${tag}${startAttribute}>${body}</${tag}>`, restoreMathTokens(raw ?? body), "chat-markdown-text-block");
    };
  }
  let html = marked.parse(tokenized, { async: false, renderer, gfm: true, breaks: false });
  formulas.forEach(({ token, expression, displayMode }) => {
    let rendered;
    try {
      rendered = katex.renderToString(expression, { displayMode, throwOnError: false, strict: "ignore" });
    } catch {
      rendered = `<code class="livecode-latex-error">${escapeHtml(expression)}</code>`;
    }
    html = html.replaceAll(token, rendered);
  });
  html = sanitizeMarkdownHtml(html);
  if (chatActions) {
    html = html.replace(
      /<span class="chat-markdown-block-actions" data-chat-block-source="([^"]*)"><\/span>/g,
      (_match, encodedSource) => renderChatBlockActions(encodedSource),
    );
  }
  return html;
};

// Marked retains the exact source text for each block token. Keep those raw
// ranges so the rendered Markdown surface can edit one block without
// rewriting or reformatting the rest of the document.
export const getMarkdownSourceBlocks = source => {
  const text = String(source || "");
  if (!text) return [{ start: 0, end: 0, source: "" }];
  let tokens;
  try {
    tokens = marked.lexer(text, { gfm: true });
  } catch {
    return [{ start: 0, end: text.length, source: text }];
  }
  const blocks = [];
  let cursor = 0;
  for (const token of tokens) {
    const raw = typeof token.raw === "string" ? token.raw : "";
    if (!raw) continue;
    const start = cursor;
    cursor += raw.length;
    if (token.type === "space" && blocks.length) {
      const previous = blocks[blocks.length - 1];
      previous.end = cursor;
      previous.source += raw;
      continue;
    }
    blocks.push({
      start,
      end: cursor,
      source: raw,
      type: token.type || "paragraph",
      depth: token.type === "heading" ? Number(token.depth) || 1 : null,
    });
  }
  if (!blocks.length || cursor !== text.length) return [{ start: 0, end: text.length, source: text }];
  return blocks;
};

export const validateMarkdownSource = source => {
  try {
    renderMarkdownWithMath(source);
    return { valid: true, error: "" };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export const renderLatex = source => {
  const text = String(source || "");
  const delimiter = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$([^$\n]+?)\$/g;
  let html = "";
  let cursor = 0;
  let match;
  const renderText = value => escapeHtml(value).replace(/\n/g, "<br>");
  const renderExpression = (expression, displayMode) => {
    try {
      return katex.renderToString(expression, { displayMode, throwOnError: false, strict: "ignore" });
    } catch {
      return `<code class="livecode-latex-error">${escapeHtml(expression)}</code>`;
    }
  };

  while ((match = delimiter.exec(text))) {
    html += renderText(text.slice(cursor, match.index));
    const displayMode = match[1] !== undefined || match[2] !== undefined;
    html += renderExpression(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "", displayMode);
    cursor = match.index + match[0].length;
  }
  return html + renderText(text.slice(cursor));
};

const safeCssValue = value => String(value || "").replace(/[;{}<>]/g, "");

export const buildHtmlSandboxDocument = ({ source, token, appearance = {} }) => {
  const foreground = safeCssValue(appearance.colors?.foreground?.css || appearance.currentColor || "#202428");
  const canvas = safeCssValue(appearance.colors?.canvas?.css || (appearance.theme === "dark" ? "#121212" : "#ffffff"));
  const colorScheme = appearance.theme === "dark" ? "dark" : "light";
  return `<!doctype html>
<html><head><meta charset="utf-8"><base target="_blank">
<style>:root{color-scheme:${colorScheme};color:${foreground};background:${canvas}}html,body{box-sizing:border-box;width:100%;min-height:100%;margin:0}body{overflow:auto;color:inherit;background:inherit}</style>
</head><body>
<script>
  (() => {
    const token = ${JSON.stringify(token)};
    const send = (type, detail = {}) => parent.postMessage({ underscoresLivecode: true, token, type, detail }, "*");
    window.__ = Object.freeze({
      post: (type, detail) => send(type, detail),
      onMessage: listener => window.addEventListener("message", event => {
        const data = event.data;
        if (data && data.underscoresLivecode && data.token === token && data.type === "bridge") listener(data.snapshot);
      }),
    });
    send("ready");
  })();
</script>
${String(source || "")}
</body></html>`;
};
