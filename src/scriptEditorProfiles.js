import { snippetCompletion } from "@codemirror/autocomplete";
import { IANNIX_COMMAND_REFERENCE } from "./iannixCommandReference.js";
import { normalizeScriptType } from "./scriptTypes.js";

const completion = (label, detail, type = "variable", boost = 0) => ({
  label,
  detail,
  info: `${detail}. Press Tab or Enter to insert it.`,
  type,
  boost,
});

const snippet = (label, template, detail) => snippetCompletion(template, {
  label,
  detail,
  info: `${detail}. Press Tab or Enter to insert the snippet, then Tab through its fields.`,
  type: "snippet",
  boost: 90,
});

const iannixCommandCompletion = command => ({
  label: command.command,
  detail: command.syntax,
  info: `${command.description}\n\nSyntax: ${command.syntax}\nExample: run("${command.example}")\n\nPress Tab or Enter to insert the command.`,
  type: "keyword",
  boost: 50,
});

const BRUSH_COMPLETIONS = Object.freeze([
  snippet("brush function", "(points, globals) => {\n  ${return [points]};\n}", "Drawerator modifier entry point"),
  snippet("@param", "// @param ${name} = ${1} (${0}..${10}, step: ${1})", "Editable numeric parameter"),
  completion("points", "Source path points", "variable", 80),
  completion("globals", "Brush parameters and runtime globals", "variable", 80),
  completion("canvas", "Drawerator canvas query API", "variable", 70),
  completion("events", "Drawerator event API", "variable", 60),
  completion("transport", "Drawerator transport state", "variable", 60),
  completion("return [points]", "Return the original path as one track", "keyword", 70),
]);

const P5_COMPLETIONS = Object.freeze([
  snippet("setup()", "function setup() {\n  ${createCanvas(windowWidth, windowHeight)};\n}", "Classic p5 setup lifecycle"),
  snippet("draw()", "function draw() {\n  ${background(18)};\n}", "Classic p5 draw lifecycle"),
  snippet("p.setup", "p.setup = () => {\n  ${p.createCanvas(__.element.width, __.element.height)};\n};", "Instance-mode setup lifecycle"),
  snippet("p.draw", "p.draw = () => {\n  ${p.background(18)};\n};", "Instance-mode draw lifecycle"),
  snippet("@param", "// @param ${name} = ${1} (${0}..${10}, step: ${1})", "Editable Drawerator parameter"),
  ...[
    "background", "clear", "circle", "ellipse", "line", "rect", "triangle", "beginShape",
    "vertex", "endShape", "stroke", "strokeWeight", "noStroke", "fill", "noFill", "color",
    "createCanvas", "resizeCanvas", "image", "loadImage", "text", "textSize", "push", "pop",
    "translate", "rotate", "scale", "random", "noise", "map", "constrain", "lerp", "sin", "cos",
    "frameCount", "width", "height", "mouseX", "mouseY", "pmouseX", "pmouseY",
  ].map(label => completion(label, "p5 global", label === label.toUpperCase() ? "constant" : "function")),
  ...[
    "p.background", "p.clear", "p.circle", "p.ellipse", "p.line", "p.rect", "p.stroke",
    "p.strokeWeight", "p.fill", "p.noFill", "p.createCanvas", "p.image", "p.text", "p.push",
    "p.pop", "p.translate", "p.rotate", "p.scale", "p.random", "p.noise", "p.frameCount",
    "p.width", "p.height", "p.mouseX", "p.mouseY",
  ].map(label => completion(label, "p5 instance API", "function")),
  completion("drawerator", "Current p5 frame and Drawerator bridge", "variable", 90),
  completion("__", "Preferred short alias for the current p5 frame bridge", "variable", 95),
  completion("__.canvas", "Live canvas object queries", "property", 85),
  completion("__.params", "Resolved @param values", "property", 85),
  completion("__.transport", "Live transport state", "property", 80),
  completion("drawerator.canvas", "Live canvas object queries", "property", 80),
  completion("drawerator.params", "Resolved @param values", "property", 80),
  completion("drawerator.transport", "Live transport state", "property", 70),
]);

const PLAY_CORE_COMPLETIONS = Object.freeze([
  snippet("settings", "export const settings = { fps: ${30}, cols: ${0}, rows: ${0}, backgroundColor: \"${#101010}\", color: \"${#e8e8e8}\" };", "Play Core renderer settings"),
  snippet("main", "export function main({ x, y }, context, cursor, buffer) {\n  return ${__.transport.playing ? \"●\" : \"·\"};\n}", "Play Core cell renderer"),
  snippet("play.core math imports", "import { map, clamp, mix } from '/src/modules/num.js';\nimport { vec2, add, rot, length } from '/src/modules/vec2.js';", "Offline Play Core numeric and vector helpers"),
  snippet("play.core info panel", "import { drawInfo } from '/src/modules/drawbox.js';\n\nexport function post(context, cursor, buffer) {\n  drawInfo(context, cursor, buffer);\n}", "Add the Play Core diagnostics panel"),
  snippet("play.core module", "import { ${map} } from '/src/modules/num.js';", "Import an offline bundled Play Core module"),
  snippet("@param", "// @param ${name} = ${1} (${0}..${10}, step: ${1})", "Editable Drawerator parameter"),
  ...["settings", "boot", "pre", "main", "post", "context.time", "context.frame", "context.cols", "context.rows", "cursor", "buffer", "__", "__.element", "__.object", "__.params", "__.currentColor", "__.colors", "__.appearance", "__.canvas", "__.events", "__.transport", "__.api", "drawerator", "drawerator.element", "drawerator.object", "drawerator.params", "drawerator.currentColor", "drawerator.colors", "drawerator.appearance", "drawerator.canvas", "drawerator.events", "drawerator.transport", "drawerator.api"].map(label => completion(label, "Play Core program API", "function", label.startsWith("__") ? 80 : 70)),
]);

const IANNIX_COMPLETIONS = Object.freeze([
  snippet("makeWithScript()", "function makeWithScript() {\n  ${run(\"clear\")};\n}", "IanniX score lifecycle"),
  snippet("askUserForParameters()", "function askUserForParameters() {\n  ${ask(\"General\", \"Value\", \"value\", 1)};\n}", "Declare editable IanniX parameters"),
  snippet("run()", "run(\"${add curve orbit}\");", "Execute an IanniX command"),
  snippet("ask()", "ask(\"${General}\", \"${Value}\", \"${value}\", ${1});", "Declare a shared parameter"),
  ...IANNIX_COMMAND_REFERENCE.map(iannixCommandCompletion),
  ...[
    "run", "ask", "title", "load", "loadJSON", "sessionTime", "random", "range", "rangeMid",
    "norm", "map", "linexp", "constrain", "PI", "TWO_PI", "HALF_PI",
  ].map(label => completion(label, "IanniX runtime", "function", 70)),
]);

const SVG_COMPLETIONS = Object.freeze([
  snippet("svg document", "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${320} ${180}\">\n  ${}\n</svg>", "Complete SVG document"),
  snippet("path", "<path d=\"${M20 90 C80 20 140 160 300 90}\" fill=\"none\" stroke=\"${currentColor}\"/>", "SVG path"),
  snippet("circle", "<circle cx=\"${160}\" cy=\"${90}\" r=\"${48}\"/>", "SVG circle"),
  snippet("group", "<g ${transform=\"translate(0 0)\"}>\n  ${}\n</g>", "SVG group"),
  snippet("style", "<style>\n  ${.shape { fill: none; stroke: currentColor; }}\n</style>", "Embedded SVG CSS"),
  snippet("animate", "<animate attributeName=\"${opacity}\" values=\"${0;1;0}\" dur=\"${2s}\" repeatCount=\"indefinite\"/>", "SMIL animation"),
  ...[
    "svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline",
    "polygon", "text", "tspan", "image", "clipPath", "mask", "linearGradient", "radialGradient",
    "stop", "filter", "style", "script", "animate", "animateTransform", "set",
  ].map(label => completion(label, "SVG element", "class", 60)),
  ...[
    "viewBox", "width", "height", "x", "y", "cx", "cy", "r", "rx", "ry", "d", "points",
    "fill", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "opacity", "transform", "class", "id", "href", "attributeName", "values", "dur",
    "repeatCount", "keyTimes", "keySplines",
  ].map(label => completion(label, "SVG attribute", "property", 50)),
]);

const STRUDEL_COMPLETIONS = Object.freeze([
  snippet("pattern", "note(\"${c3 e3 g3 b3}\").slow(${2})", "Strudel pattern starter"),
  completion("note", "Strudel note pattern", "function", 80),
  completion("sound", "Strudel sound pattern", "function", 80),
  completion("stack", "Combine patterns", "function", 70),
  completion("s", "Sound alias", "function", 70),
  completion("slow", "Slow a pattern by a factor", "method", 60),
  completion("fast", "Speed a pattern by a factor", "method", 60),
  completion("drawerator", "Drawerator bridge snapshot", "variable", 90),
  completion("__", "Preferred short alias for the Drawerator bridge snapshot", "variable", 95),
  completion("__.transport", "Live transport bridge", "property", 85),
]);

const MARKDOWN_COMPLETIONS = Object.freeze([
  snippet("heading", "# ${Heading}", "Markdown heading"),
  snippet("link", "[${label}](${https://example.com})", "Markdown link"),
  snippet("inline math", "$${E = mc^2}$", "Inline LaTeX"),
  snippet("display math", "$$\n${\\frac{a}{b}}\n$$", "Display LaTeX"),
]);

const ORCA_COMPLETIONS = Object.freeze([
  completion("A", "Orca arithmetic operator", "keyword", 50),
  completion("C", "Orca clock operator", "keyword", 50),
  completion("M", "Orca MIDI note operator", "keyword", 50),
]);

export const SCRIPT_EDITOR_PROFILES = Object.freeze({
  brush: Object.freeze({
    id: "brush",
    language: "javascript",
    label: "Brush JavaScript",
    completions: BRUSH_COMPLETIONS,
  }),
  iannix: Object.freeze({
    id: "iannix",
    language: "javascript",
    label: "IanniX JavaScript",
    completions: IANNIX_COMPLETIONS,
  }),
  p5: Object.freeze({
    id: "p5",
    language: "javascript",
    label: "p5 JavaScript",
    completions: P5_COMPLETIONS,
  }),
  play: Object.freeze({ id: "play", language: "javascript", label: "Play Core JavaScript", completions: PLAY_CORE_COMPLETIONS }),
  livecode: Object.freeze({ id: "livecode", language: "plain", label: "Livecode Node", completions: [] }),
  strudel: Object.freeze({ id: "strudel", language: "javascript", label: "Strudel", completions: STRUDEL_COMPLETIONS }),
  markdown: Object.freeze({ id: "markdown", language: "plain", label: "Markdown", completions: MARKDOWN_COMPLETIONS }),
  latex: Object.freeze({ id: "latex", language: "plain", label: "LaTeX", completions: [] }),
  orca: Object.freeze({ id: "orca", language: "plain", label: "Orca grid", completions: ORCA_COMPLETIONS }),
  html: Object.freeze({ id: "html", language: "html", label: "HTML", completions: SVG_COMPLETIONS }),
  svg: Object.freeze({
    id: "svg",
    language: "html",
    label: "SVG document",
    completions: SVG_COMPLETIONS,
  }),
});

export const getScriptEditorProfile = type => (
  SCRIPT_EDITOR_PROFILES[type] || SCRIPT_EDITOR_PROFILES[normalizeScriptType(type)] || SCRIPT_EDITOR_PROFILES.brush
);

export const getScriptEditorCompletions = type => getScriptEditorProfile(type).completions;
