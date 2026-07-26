const IANNIX_COMMANDS = Object.freeze([
  "add", "clear", "setpointat", "setsmoothpointat", "setpointslines", "setpointsellipse",
  "setequation", "setequationparam", "setequationnbpoints", "setequationpoints", "setpos",
  "setcurve", "setspeed", "setboundssource", "setboundstarget", "setsize", "setwidth",
  "setgroup", "setlabel", "setname", "setactive", "setcolor", "setcolorhue", "setcoloractive",
  "setoffset", "settriggeroff", "setmessage", "setpattern", "center", "zoom", "rotate",
]);

const FORBIDDEN_RUNTIME_REFERENCES = /\b(?:Date|document|window|fetch|XMLHttpRequest|localStorage|sessionStorage|navigator|process|require|importScripts)\b/;

const preview = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 96);

/**
 * A deliberately small JavaScript formatter for AI-authored scripts. It is
 * not a parser or a replacement for a full code formatter: it only makes
 * statement boundaries and blocks legible without changing tokens. In
 * particular, semicolons inside `for (...)` headers and every kind of string
 * are left alone.
 */
export const formatAIScriptSource = source => {
  const text = String(source || "").trim();
  if (!text) return "";

  let output = "";
  let indent = 0;
  let parens = 0;
  let state = "code";
  let escaped = false;
  let atLineStart = true;
  const indentText = () => "  ".repeat(Math.max(0, indent));
  const write = value => {
    if (atLineStart && value !== "\n") {
      output += indentText();
      atLineStart = false;
    }
    output += value;
  };
  const newline = () => {
    output = output.replace(/[ \t]+$/, "");
    if (!output.endsWith("\n")) output += "\n";
    atLineStart = true;
  };
  const nextNonWhitespace = from => {
    for (let index = from; index < text.length; index += 1) {
      if (!/\s/.test(text[index])) return text[index];
    }
    return "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (state === "line-comment") {
      write(char);
      if (char === "\n") {
        state = "code";
        atLineStart = true;
      }
      continue;
    }
    if (state === "block-comment") {
      write(char);
      if (char === "*" && next === "/") {
        write(next);
        index += 1;
        state = "code";
      }
      continue;
    }
    if (state !== "code") {
      write(char);
      if (char === "\n") atLineStart = true;
      if (!escaped && char === state) state = "code";
      escaped = !escaped && char === "\\";
      if (char !== "\\") escaped = false;
      continue;
    }

    if (char === "/" && next === "/") {
      write("//");
      index += 1;
      state = "line-comment";
      continue;
    }
    if (char === "/" && next === "*") {
      write("/*");
      index += 1;
      state = "block-comment";
      continue;
    }
    if (["'", '"', "`"].includes(char)) {
      write(char);
      state = char;
      escaped = false;
      continue;
    }
    if (char === "(") {
      parens += 1;
      write(char);
      continue;
    }
    if (char === ")") {
      parens = Math.max(0, parens - 1);
      write(char);
      continue;
    }
    if (char === "{") {
      write(char);
      indent += 1;
      newline();
      continue;
    }
    if (char === "}") {
      if (!atLineStart) newline();
      indent = Math.max(0, indent - 1);
      write(char);
      const following = nextNonWhitespace(index + 1);
      if (following && ![";", ",", ")", "]"].includes(following)) newline();
      continue;
    }
    if (char === ";") {
      write(char);
      if (parens === 0) newline();
      continue;
    }
    if (char === "\n") {
      newline();
      continue;
    }
    if (/\s/.test(char) && atLineStart) continue;
    write(char);
  }

  return output.replace(/[ \t]+\n/g, "\n").trim();
};

const RUN_LITERAL_PATTERN = /\brun\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`)/g;

const collectLiteralRunCalls = source => {
  const calls = [];
  let match;
  const text = String(source || "");
  while ((match = RUN_LITERAL_PATTERN.exec(text)) !== null) {
    const commandSource = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\\([\\"'`])/g, "$1");
    const command = commandSource.trim().match(/^([a-zA-Z][\w-]*)/)?.[1]?.toLowerCase();
    if (command) calls.push({ command, commandSource });
  }
  return calls;
};

const collectStaticCommandUsageErrors = source => {
  const errors = [];
  const staticStringCalls = String(source || "").matchAll(/\brun\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)/g);
  for (const match of staticStringCalls) {
    const commandText = (match[1] ?? match[2] ?? "").replace(/\\([\\"'])/g, "$1").trim();
    const tokens = commandText.split(/\s+/);
    const command = tokens[0]?.toLowerCase();
    if (command === "setpointsellipse" && tokens.length > 4) {
      errors.push("setPointsEllipse uses only radii: position the curve first with setPos, then call setPointsEllipse current radiusX radiusY.");
    }
    if (["setsize", "setwidth"].includes(command) && tokens.length > 3) {
      errors.push(`${tokens[0]} accepts one numeric size or width value after its target.`);
    }
  }
  return [...new Set(errors)];
};

const compileIannixRuntimeShape = source => {
  // This mirrors the runtime's function envelope but does not invoke it. AI
  // scripts are stored only after a syntax/lifecycle preflight; execution
  // remains an explicit separate user/AI run command.
  new Function(
    "scope", "run", "ask", "title", "load", "loadJSON", "sessionTime", "Math",
    "PI", "TWO_PI", "HALF_PI", "THIRD_PI", "QUARTER_PI", "random", "range", "rangeMid",
    "norm", "map", "linexp", "constrain", "abs", "acos", "asin", "atan", "atan2", "ceil",
    "cos", "exp", "floor", "log", "min", "max", "pow", "round", "sin", "sqrt", "tan",
    `with (scope) {\n${String(source || "")}\n` +
      "if (typeof askUserForParameters === 'function') askUserForParameters();\n" +
      "if (typeof makeWithScript === 'function') makeWithScript();\n" +
      "if (typeof madeThroughGUI === 'function') madeThroughGUI();\n}",
  );
};

export const validateAIIannixSource = source => {
  const text = String(source || "").trim();
  const errors = [];
  const warnings = [];
  if (!text) errors.push("IanniX source is required.");
  const forbiddenReference = text.match(FORBIDDEN_RUNTIME_REFERENCES)?.[0];
  if (forbiddenReference) {
    errors.push(`AI IanniX scripts may not use ${forbiddenReference}, browser, storage, network, clock, or module globals. Use the documented deterministic helpers instead.`);
  }
  try {
    if (text) compileIannixRuntimeShape(text);
  } catch (error) {
    errors.push(`IanniX source does not compile: ${error?.message || "syntax error"}`);
  }
  const literalCalls = collectLiteralRunCalls(text);
  const commands = [...new Set(literalCalls.map(call => call.command))];
  const runCallCount = (text.match(/\brun\s*\(/g) || []).length;
  const literalRunCallCount = literalCalls.length;
  if (!/\b(?:function\s+makeWithScript|function\s+madeThroughGUI)\s*\(/.test(text)) {
    errors.push("AI IanniX score scripts must define makeWithScript() or madeThroughGUI().");
  }
  if (!/\brun\s*\(/.test(text)) {
    errors.push("AI IanniX score scripts must create or configure score objects through run(\"…\") commands.");
  }
  const unsupported = commands.filter(command => !IANNIX_COMMANDS.includes(command));
  if (unsupported.length) errors.push(`Unsupported IanniX command${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`);
  if (runCallCount > literalRunCallCount) {
    errors.push("Each AI run() call must begin with a literal supported IanniX command, for example run(\"add curve orbit\") or run(`setPointAt current ${index} ${x} ${y}`).");
  }
  errors.push(...collectStaticCommandUsageErrors(text));
  return { valid: errors.length === 0, errors, warnings, commands, sourcePreview: preview(text) };
};

export const validateAIBrushSource = source => {
  const text = String(source || "").trim();
  const errors = [];
  if (!text) errors.push("Brush source is required.");
  const forbiddenReference = text.match(FORBIDDEN_RUNTIME_REFERENCES)?.[0];
  if (forbiddenReference) {
    errors.push(`AI brush scripts may not use ${forbiddenReference}, browser, storage, network, clock, or module globals. Use points and Drawerator globals only.`);
  }
  try {
    if (text) new Function(`return (${text})`);
  } catch (error) {
    errors.push(`Brush source does not compile: ${error?.message || "syntax error"}`);
  }
  const signature = /(?:\(\s*points\s*(?:,\s*globals\s*)?\)|function\s*\(\s*points\s*(?:,\s*globals\s*)?\))\s*(?:=>)?/;
  if (!signature.test(text)) errors.push("Brush source must define a function whose first argument is points (optionally followed by globals).");
  if (/=>\s*\{/.test(text) && !/\breturn\b/.test(text)) errors.push("Block-style brush functions must return an array of drawable point tracks.");
  return { valid: errors.length === 0, errors, warnings: [], sourcePreview: preview(text) };
};

export const SCRIPT_AUTHORING_GUIDES = Object.freeze({
  iannix: [
    "Drawerator IanniX-compatible script contract:",
    "- Author JavaScript lifecycle functions, not a generic geometry-returning program. Put score creation in function makeWithScript() (or madeThroughGUI()).",
    "- Create and configure score objects only with run(\"IanniX command…\"). Every run call must begin with a literal supported command; dynamic numeric values are fine after that, e.g. run(\"setPointAt current \" + index + \" \" + x + \" \" + y) or run(`setPointAt current ${index} ${x} ${y}`).",
    "- Write readable source: put each statement after a semicolon on its own line, indent blocks with two spaces, and never compress an entire script into one line. Drawerator will also format saved AI scripts.",
    "- Coordinates are IanniX model units, not canvas pixels. For geometry requested near the default visible canvas center, ALWAYS first use run(\"setPos current 12 -8 0\") and keep local point coordinates or radii roughly within -12..12. Never use screen-sized values such as 480 or 960 unless the user explicitly asks for a large/off-screen score.",
    "- Exact minimal working pattern (placed visibly near the canvas center at Drawerator's default import scale):\nfunction makeWithScript() {\n  run(\"clear\");\n  run(\"add curve orbit\");\n  run(\"setPos current 12 -8 0\");\n  run(\"setPointAt current 0 0 0\");\n  run(\"setPointAt current 1 8 0\");\n  run(\"setColor current 201 205 210 255\");\n  run(\"setWidth current 2\");\n  run(\"add cursor traveler\");\n  run(\"setCurve current lastCurve\");\n  run(\"setSpeed current 80\");\n}",
    "- Give every generated curve an explicit readable style unless the user asks for a hairline: run(\"setColor current 201 205 210 255\") and run(\"setWidth current 2\") after creating its points. Use brighter colors or widths 3–4 for primary visual material.",
    "- setPointsEllipse takes radii only: first run(\"setPos current centerX centerY\"), then run(\"setPointsEllipse current radiusX radiusY\"). It does not take center coordinates. setSize and setWidth each take one number.",
    "- Supported command families: add curve|cursor|trigger, clear, setPointAt, setPointsLines, setPointsEllipse, setEquation, setPos, setCurve, setSpeed, setPattern, setMessage, setColor, setLabel, setActive, setSize/setWidth, plus bare center, zoom, and rotate commands. Do not write presentation center/zoom/rotate.",
    "- Optional parameters use ask(category, label, variableName, defaultValue) inside askUserForParameters().",
    "- Use supplied deterministic helpers such as sin, cos, PI, random, range, map, and sessionTime. Never use Date, DOM APIs, network APIs, storage, module imports, or a top-level return value to create score geometry.",
    "- Put only valid source in the source field of script.iannix.create or script.iannix.update. Do not run it unless the user asks to execute it.",
  ].join("\n"),
  brush: [
    "Drawerator Brush / modifier script contract:",
    "- Source must be a JavaScript function with signature (points, globals) => tracks.",
    "- points is the source path. Return an array of drawable tracks, for example (points, globals) => [points]. Each track is an array of numeric [x, y] points.",
    "- Declare editable numeric parameters with // @param name = default (min..max, step: increment).",
    "- Write readable source: put each statement after a semicolon on its own line and indent blocks with two spaces. Drawerator formats saved AI scripts too.",
    "- Use points and supplied globals only. Never use Date, DOM APIs, network APIs, storage, or module imports.",
    "- Use script.brush.create/update to save, then script.brush.apply with selected or explicit line/freedraw element ids to attach the brush as a modifier.",
  ].join("\n"),
});

export const getRelevantScriptGuideTypes = prompt => {
  const text = String(prompt || "").toLowerCase();
  const types = [];
  if (/\biannix\b|\bscore script\b|\bscore\b/.test(text)) types.push("iannix");
  if (/\bbrush\b|\bmodifier\b|\bfreehand\b/.test(text)) types.push("brush");
  return types;
};

export const buildRelevantScriptAuthoringGuide = prompt => {
  const types = getRelevantScriptGuideTypes(prompt);
  if (!types.length) {
    return /\bscript\b/i.test(String(prompt || ""))
      ? "If the user asks for a script without naming IanniX or Brush / modifier, ask which script type they want before creating it."
      : "";
  }
  return types.map(type => SCRIPT_AUTHORING_GUIDES[type]).join("\n\n");
};

export const IANNIX_SUPPORTED_COMMANDS = IANNIX_COMMANDS;
