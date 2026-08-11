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

const mathToken = index => `DRAWERATOR_MATH_TOKEN_${index}_END`;

export const renderMarkdownWithMath = source => {
  const formulas = [];
  const tokenized = String(source || "")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, displayMode: true });
      return token;
    })
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (_match, expression) => {
      const token = mathToken(formulas.length);
      formulas.push({ token, expression, displayMode: false });
      return token;
    });
  const renderer = new marked.Renderer();
  renderer.html = () => "";
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
  return sanitizeMarkdownHtml(html);
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
    const send = (type, detail = {}) => parent.postMessage({ draweratorLivecode: true, token, type, detail }, "*");
    window.drawerator = Object.freeze({
      post: (type, detail) => send(type, detail),
      onMessage: listener => window.addEventListener("message", event => {
        const data = event.data;
        if (data && data.draweratorLivecode && data.token === token && data.type === "bridge") listener(data.snapshot);
      }),
    });
    send("ready");
  })();
</script>
${String(source || "")}
</body></html>`;
};
