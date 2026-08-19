import { snippetCompletion } from "@codemirror/autocomplete";
import { resolveP5SourceMode } from "./p5Frame.js";
import { getUnderscoresCompletions, getUnderscoresHover, getUnderscoresReference } from "./underscoresLanguageService.js";

// A small, browser-local p5 language service.  This is intentionally data
// driven: the editor can offer the same API in global mode and instance mode,
// while the Info panel can reuse the signatures and examples without parsing
// the bundled p5 runtime at render time.  The shape mirrors the useful part of
// an LSP completion item so this can later move behind a worker or real server
// without changing editor consumers.
const p5Api = (name, signature, description, example, type = "function", options = {}) => Object.freeze({
  name,
  signature,
  description,
  example,
  type,
  referenceUrl: options.referenceUrl || `https://p5js.org/reference/p5/${name}/`,
  referenceSource: options.referenceSource || "p5.js Reference",
  ...options,
});

export const P5_API = Object.freeze([
  p5Api("createCanvas", "createCanvas(width, height, renderer?)", "Creates the sketch canvas and returns its renderer.", "createCanvas(__.element.width, __.element.height);"),
  p5Api("resizeCanvas", "resizeCanvas(width, height, noRedraw?)", "Resizes the canvas; pass true to skip an immediate redraw.", "resizeCanvas(640, 360, true);"),
  p5Api("background", "background(color | gray | r, g, b, a?)", "Sets the canvas background. A number is grayscale; CSS color strings, p5.Color values, RGB/RGBA values, and an optional alpha are supported. In p5, background() is commonly called at the start of draw() to clear the previous frame.", "background(18);\n// CSS color + alpha\nbackground(\"#101820\", 180);"),
  p5Api("clear", "clear([r, g, b, a])", "Clears the drawing surface to transparent.", "clear();"),
  p5Api("color", "color(value1, value2?, value3?, alpha?)", "Creates a p5.Color from CSS, grayscale, RGB, or RGBA values.", "const accent = color(90, 180, 255);"),
  p5Api("stroke", "stroke(color, opacity?)", "Sets the outline color for subsequent shapes.", "stroke(" + '"#8bd5ff"' + ");"),
  p5Api("strokeWeight", "strokeWeight(weight)", "Sets the width of subsequent outlines in pixels.", "strokeWeight(2);"),
  p5Api("noStroke", "noStroke()", "Disables outlines for subsequent shapes.", "noStroke();"),
  p5Api("fill", "fill(color, opacity?)", "Sets the interior color for subsequent shapes.", "fill(" + '"#f5d76e"' + ");"),
  p5Api("noFill", "noFill()", "Disables interiors for subsequent shapes.", "noFill();"),
  p5Api("point", "point(x, y, z?)", "Draws a single point.", "point(width / 2, height / 2);"),
  p5Api("line", "line(x1, y1, x2, y2, z1?, z2?)", "Draws a straight line between two points.", "line(0, 0, width, height);"),
  p5Api("circle", "circle(x, y, diameter)", "Draws a circle centered at x/y.", "circle(width / 2, height / 2, 80);"),
  p5Api("ellipse", "ellipse(x, y, width, height, detailX?, detailY?)", "Draws an ellipse centered at x/y.", "ellipse(width / 2, height / 2, 120, 80);"),
  p5Api("rect", "rect(x, y, width, height, radius?, ...radii)", "Draws a rectangle with optional rounded corners.", "rect(20, 20, 120, 80, 8);"),
  p5Api("square", "square(x, y, size, radius?)", "Draws a square with optional rounded corners.", "square(20, 20, 80, 8);"),
  p5Api("triangle", "triangle(x1, y1, x2, y2, x3, y3)", "Draws a triangle from three vertices.", "triangle(20, 100, 80, 20, 140, 100);"),
  p5Api("quad", "quad(x1, y1, x2, y2, x3, y3, x4, y4)", "Draws a four-sided polygon.", "quad(20, 20, 120, 20, 140, 100, 0, 100);"),
  p5Api("beginShape", "beginShape(kind?)", "Starts a custom shape made from vertex calls.", "beginShape();"),
  p5Api("vertex", "vertex(x, y, z?, u?, v?)", "Adds a vertex to the current custom shape.", "vertex(20, 20);"),
  p5Api("endShape", "endShape(mode?)", "Finishes the current custom shape.", "endShape(CLOSE);"),
  p5Api("push", "push()", "Saves the current drawing style and transform.", "push();"),
  p5Api("pop", "pop()", "Restores the most recently saved drawing style and transform.", "pop();"),
  p5Api("translate", "translate(x, y, z?)", "Moves the drawing origin.", "translate(width / 2, height / 2);"),
  p5Api("rotate", "rotate(angle, axis?)", "Rotates the drawing coordinate system.", "rotate(frameCount * 0.01);"),
  p5Api("scale", "scale(x, y?, z?)", "Scales the drawing coordinate system.", "scale(0.8);"),
  p5Api("random", "random(min?, max?)", "Returns a random number or random item.", "const x = random(width);"),
  p5Api("randomSeed", "randomSeed(seed)", "Sets the deterministic random sequence.", "randomSeed(42);"),
  p5Api("noise", "noise(x, y?, z?)", "Returns smooth Perlin noise in the range 0..1.", "const wobble = noise(frameCount * 0.01);"),
  p5Api("noiseSeed", "noiseSeed(seed)", "Sets the deterministic noise sequence.", "noiseSeed(42);"),
  p5Api("map", "map(value, start1, stop1, start2, stop2, withinBounds?)", "Remaps a value between numeric ranges.", "const x = map(mouseX, 0, width, -1, 1);"),
  p5Api("constrain", "constrain(value, min, max)", "Clamps a number to an inclusive range.", "const alpha = constrain(opacity, 0, 255);"),
  p5Api("lerp", "lerp(start, stop, amount)", "Interpolates between two numbers.", "const x = lerp(0, width, 0.5);"),
  p5Api("dist", "dist(x1, y1, x2, y2)", "Returns the distance between two points.", "const d = dist(mouseX, mouseY, width / 2, height / 2);"),
  p5Api("text", "text(string, x, y, maxWidth?, maxHeight?)", "Draws text at the given position.", "text(" + '"hello"' + ", 20, 30);"),
  p5Api("textSize", "textSize(size)", "Sets the text size in pixels.", "textSize(16);"),
  p5Api("textAlign", "textAlign(horizontal, vertical?)", "Sets horizontal and vertical text alignment.", "textAlign(CENTER, CENTER);"),
  p5Api("textFont", "textFont(font, size?)", "Sets the active text font.", "textFont(" + '"monospace"' + ");"),
  p5Api("image", "image(image, x, y, width?, height?)", "Draws a loaded image or video frame.", "image(img, 0, 0, width, height);"),
  p5Api("loadImage", "loadImage(path, success?, failure?)", "Loads an image asynchronously.", "loadImage(" + '"assets/dog.png"' + ", image => { img = image; });"),
  p5Api("frameRate", "frameRate(fps?)", "Reads or requests the sketch frame rate.", "frameRate(30);"),
  p5Api("noLoop", "noLoop()", "Stops automatic draw calls after the current frame.", "noLoop();"),
  p5Api("loop", "loop()", "Resumes automatic draw calls.", "loop();"),
  p5Api("redraw", "redraw()", "Requests one draw call while looping is disabled.", "redraw();"),
  p5Api("millis", "millis()", "Returns milliseconds since the sketch started.", "const elapsed = millis() / 1000;"),
  p5Api("sin", "sin(angle)", "Returns the sine of an angle.", "const y = sin(frameCount * 0.02);", "function"),
  p5Api("cos", "cos(angle)", "Returns the cosine of an angle.", "const x = cos(frameCount * 0.02);", "function"),
  p5Api("tan", "tan(angle)", "Returns the tangent of an angle.", "const slope = tan(angle);", "function"),
  p5Api("radians", "radians(degrees)", "Converts degrees to radians.", "rotate(radians(45));", "function"),
  p5Api("degrees", "degrees(radians)", "Converts radians to degrees.", "const angle = degrees(PI / 2);", "function"),
  p5Api("width", "width", "Current logical canvas width.", "rect(0, 0, width, height);", "constant"),
  p5Api("height", "height", "Current logical canvas height.", "rect(0, 0, width, height);", "constant"),
  p5Api("frameCount", "frameCount", "Number of draw calls since the sketch started.", "const phase = frameCount * 0.01;", "constant"),
  p5Api("deltaTime", "deltaTime", "Milliseconds since the previous draw call.", "const dt = deltaTime / 1000;", "constant"),
  p5Api("mouseX", "mouseX", "Current mouse X in sketch coordinates.", "circle(mouseX, mouseY, 12);", "constant"),
  p5Api("mouseY", "mouseY", "Current mouse Y in sketch coordinates.", "circle(mouseX, mouseY, 12);", "constant"),
  p5Api("pmouseX", "pmouseX", "Previous mouse X in sketch coordinates.", "line(pmouseX, pmouseY, mouseX, mouseY);", "constant"),
  p5Api("pmouseY", "pmouseY", "Previous mouse Y in sketch coordinates.", "line(pmouseX, pmouseY, mouseX, mouseY);", "constant"),
  p5Api("windowWidth", "windowWidth", "Current browser viewport width.", "resizeCanvas(windowWidth, windowHeight);", "constant"),
  p5Api("windowHeight", "windowHeight", "Current browser viewport height.", "resizeCanvas(windowWidth, windowHeight);", "constant"),
]);

const p5LifecycleCompletions = Object.freeze([
  snippetCompletion("setup()", "function setup() {\n  ${createCanvas(__.element.width, __.element.height)};\n}", {
    label: "setup()",
    detail: "p5 lifecycle",
    info: "Runs once when the node starts. Create the canvas and initialize persistent state here.",
    type: "snippet",
    boost: 100,
  }),
  snippetCompletion("draw()", "function draw() {\n  ${background(18)};\n}", {
    label: "draw()",
    detail: "p5 lifecycle",
    info: "Runs once per frame while the node is playing. Draw the current frame here.",
    type: "snippet",
    boost: 100,
  }),
  snippetCompletion("p.setup", "p.setup = () => {\n  ${p.createCanvas(__.element.width, __.element.height)};\n};", {
    label: "p.setup",
    detail: "p5 instance lifecycle",
    info: "Instance-mode setup callback. The p argument is the node-local p5 instance.",
    type: "snippet",
    boost: 90,
  }),
  snippetCompletion("p.draw", "p.draw = () => {\n  ${p.background(18)};\n};", {
    label: "p.draw",
    detail: "p5 instance lifecycle",
    info: "Instance-mode draw callback. Use p.* for the instance API.",
    type: "snippet",
    boost: 90,
  }),
  snippetCompletion("@param", "// @param ${name} = ${1} (${0}..${10}, step: ${1})", {
    label: "@param",
    detail: "Underscores parameter",
    info: "Declares a persistent numeric or typed control for this node.",
    type: "snippet",
    boost: 85,
  }),
]);

const p5Completion = entry => ({
  label: entry.name,
  detail: entry.signature,
  info: `${entry.description}\n\nExample: ${entry.example}\n\nReference: ${entry.referenceUrl}`,
  type: entry.type,
  boost: entry.type === "constant" ? 50 : 70,
});

const p5MemberCompletion = entry => ({
  ...p5Completion(entry),
  label: entry.name,
  apply: entry.name,
});

const p5BridgeCompletions = Object.freeze(getUnderscoresCompletions());

const sourceBefore = context => {
  if (!context?.state || !Number.isFinite(context.pos)) return "";
  return context.state.sliceDoc(0, context.pos);
};

export const getP5CompletionResult = (context, { mode = "auto", p5Mode } = {}) => {
  const requestedMode = p5Mode || mode;
  const before = sourceBefore(context);
  const source = context?.state?.doc?.toString?.() || before;
  const resolvedMode = requestedMode === "auto" && !source.trim()
    ? "global"
    : resolveP5SourceMode({ mode: requestedMode, source });
  const memberMatch = before.match(/(?:\bp|\bthis)\.([A-Za-z_$][\w$]*)?$/);
  if (memberMatch) {
    const typed = memberMatch[1] || "";
    const from = context.pos - typed.length;
    return { from, options: P5_API.map(p5MemberCompletion) };
  }
  if (/\b__\.(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$\w]*$/.test(before)) {
    const match = before.match(/\b(__\.(?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)?$/);
    const prefix = match?.[1] || "__.";
    const propertyOptions = p5BridgeCompletions
      .filter(item => item.label.startsWith(prefix))
      .map(item => ({
        ...item,
        label: item.label.slice(prefix.length),
        apply: item.label.slice(prefix.length),
      }));
    return {
      from: context.pos - (match?.[2]?.length || 0),
      options: propertyOptions.length > 0 ? propertyOptions : p5BridgeCompletions,
    };
  }
  const lifecycle = p5LifecycleCompletions.filter(item => (
    resolvedMode === "instance"
      ? ["p.setup", "p.draw", "@param"].includes(item.label)
      : ["setup()", "draw()", "@param"].includes(item.label)
  ));
  return {
    from: context.pos - ((before.match(/[A-Za-z_$][\w$]*$/) || [""])[0].length),
    options: [
      ...lifecycle,
      ...(resolvedMode === "instance" ? [] : P5_API.map(p5Completion)),
      ...p5BridgeCompletions,
    ],
  };
};

const isIdentifierCharacter = character => /[A-Za-z0-9_$]/.test(character || "");

const identifierAt = (source, position) => {
  const text = String(source || "");
  const cursor = Math.max(0, Math.min(text.length, Number(position) || 0));
  const character = text[cursor] || "";
  const previous = text[cursor - 1] || "";
  if (!isIdentifierCharacter(character) && !isIdentifierCharacter(previous)) return null;
  let from = cursor;
  let to = cursor;
  while (from > 0 && isIdentifierCharacter(text[from - 1])) from -= 1;
  while (to < text.length && isIdentifierCharacter(text[to])) to += 1;
  if (from === to) return null;
  return { source: text, from, to, name: text.slice(from, to) };
};

export const getP5Hover = (source, position, selectionEnd) => {
  const bridge = getUnderscoresHover(source, position, selectionEnd);
  if (bridge) return bridge;
  const token = identifierAt(source, position);
  if (!token) return null;
  const prefix = token.source.slice(Math.max(0, token.from - 5), token.from);
  const name = token.name;
  const entry = P5_API.find(candidate => candidate.name === name);
  if (!entry) return null;
  if (prefix.endsWith(".") && !prefix.endsWith("p.") && !prefix.endsWith("is.")) return null;
  return { from: token.from, to: token.to, ...entry };
};

export const getP5Reference = () => [...P5_API, ...getUnderscoresReference()];
