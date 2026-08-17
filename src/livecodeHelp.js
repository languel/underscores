import { LIVECODE_KINDS, normalizeLivecodeKind } from "./livecodeNode.js";

export const getLivecodeBridgeHelp = kind => {
  const normalizedKind = normalizeLivecodeKind(kind);
  const trusted = [LIVECODE_KINDS.p5, LIVECODE_KINDS.playcore, LIVECODE_KINDS.strudel].includes(normalizedKind);
  const details = {
    [LIVECODE_KINDS.p5]: "p5 receives __ as its live frame bridge. Use __.element for the host size, __.params for @param values, and __.canvas / __.events / __.transport for scene queries, events, and score time.",
    [LIVECODE_KINDS.playcore]: "Play Core receives __ as the final program argument. Use __.element, __.params, __.canvas, __.events, __.transport, and __.api from lifecycle hooks and main().",
    [LIVECODE_KINDS.strudel]: "Strudel evaluates with __ in scope. The most useful live values are __.transport, __.canvas, __.events, __.params, and __.strudel for node-local transport controls.",
    [LIVECODE_KINDS.html]: "HTML runs in an isolated iframe instead of the JavaScript bridge. Use window.__.post(type, detail) to send a message and window.__.onMessage(listener) to receive the host's read-only runtime snapshot.",
    [LIVECODE_KINDS.markdown]: "Markdown is a deterministic document renderer; it does not execute JavaScript and has no __ bridge. Use Markdown, inline/display LaTeX, and the Output/Code view modes.",
    [LIVECODE_KINDS.latex]: "LaTeX is a deterministic typesetting renderer; it does not execute JavaScript and has no __ bridge. Use TeX math delimiters and the Output/Code view modes.",
    [LIVECODE_KINDS.orca]: "Orca is a focused grid language rather than JavaScript, so __ is not available. Use its operators and the native MIDI/CC/pitch-bend routing instead.",
    [LIVECODE_KINDS.shader]: "GLSL runs on the GPU and has no JavaScript __ bridge. Use the documented uniforms such as u_resolution, u_time, u_pointer, u_currentColor, and u_segments; Minimal / Twigl / Shadertoy mode also provides iResolution, iTime, iMouse, FC, r, t, and o.",
  };
  return {
    title: "Underscores bridge (__)",
    available: trusted,
    summary: details[normalizedKind] || "This script kind has no shared JavaScript bridge.",
    points: trusted ? [
      "__.element is the host snapshot ({ id, width, height }); __.object is the current scene-object snapshot.",
      "__.params contains values declared with // @param: numbers, strings, CSS colors, booleans, parsed JSON, and live canvas object references. Color references are live on each access, so __.params.tint follows __.currentColor or __.colors.foreground.css-style references after a palette click. Object parameters resolve through the same canvas query API.",
      "__.canvas (also __.objects) exposes read-only all(), get(id/label), find(query), and selected() scene queries.",
      "__.events provides recent(limit), latest(pattern), and on(pattern, listener). __.transport exposes time and timing context.",
      "Send messages to the Event Console with console.log/info/warn/error/debug (p5 captures these), __.console.log(...args), or the shorthand __.log/info/warn/error/debug(...args) from any JavaScript bridge runtime. Turn on Console → Log to collect script.log events.",
      "__.currentColor/currentStroke and __.currentBackgroundColor/currentFill are theme-matched Excalidraw display colors for unfiltered live surfaces; __.currentRawColor and __.appState.currentItemStrokeColor expose authored Excalidraw values. __.colors keeps both raw and display color fields.",
      "__.api is the deliberate application API for commands, scene/time/grid, physics, mixer, inputs, relations, and streams. Prefer documented calls over DOM access.",
    ] : [],
  };
};

// Short, adapter-owned guidance for the docked Livecode editor. Keep it close
// to the adapter registry so the in-app reference and the persisted kind names
// cannot drift apart.
export const LIVECODE_HELP = Object.freeze({
  [LIVECODE_KINDS.strudel]: Object.freeze({
    title: "Strudel quick reference",
    summary: "A node-owned pattern feeds Underscores's shared Strudel scheduler.",
    points: Object.freeze([
      "Cmd+Enter runs the current draft. While it plays, editing does not replace it; Ctrl+Enter queues the draft for the next beat. Ctrl+. or Alt+. stops it.",
      "Layer JavaScript voices with one `$:` statement per pattern. Mini Notation works inside double quotes and backticks; backticks are reserved for Mini Notation, so JavaScript `${...}` interpolation is not evaluated. Use a normal variable such as `const c = __.params.c1` or pass `__.params.c1` directly. Use a mondo`...` template for Mondo's bare `$` separator.",
      "Event locations animate in the source. Public painters such as .pianoroll() fill the node frame when Frame visuals is enabled; underscores painters such as ._pianoroll() stay inline with the code.",
      "Declare // @param c1 = \"red\" (color) and read it as __.params.c1, for example .color(pure(__.params.c1)). JavaScript expressions inside a quoted <...> mini-notation string are literal text; parameter edits recompile the running node on the next safe beat.",
      "To combine a live parameter with a Mini sequence, build the pattern in JavaScript: .color(slowcat(pure(__.params.c1), \"#8bd5ff\", \"#f5d76e\", \"#9df59d\")). Strudel's color control stores each CSS color string on the resulting Hap for visualizers to render.",
      "Numeric // @param declarations are persistent node controls, for example // @param room = 1.93 (0..10, step: 0.01), then use .room(__.params.room). Inline slider(value, min, max, step) is also supported and appears beside the source when the editor is open.",
      "REPL helpers all(transform) and each(transform) apply to this node's labelled `$:` voices. Legacy .piano() is supported as an alias for the piano-roll visualizer; use .s(\"piano\") for the piano sound.",
      "Linked is the default, so Underscores play/pause and tempo control the pattern. Choose Free for a node-local clock. Runs and updates join the four-beat Strudel cycle on a beat boundary.",
      "Stopping, replacing, or hushing a node affects only that node's pattern; other active Strudel nodes remain scheduled.",
    ]),
    footer: "Native Strudel is available locally, but public deployment remains blocked until Underscores completes its AGPL compliance gate.",
  }),
  [LIVECODE_KINDS.p5]: Object.freeze({
    title: "p5 quick reference",
    summary: "The existing trusted bundled p5 renderer now runs per Livecode Node.",
    points: Object.freeze([
      "Use global setup() and draw(), or the existing compatible p5 mode. The live surface is the node's rectangle size.",
      "Use __.element, __.params, __.canvas, __.events, and __.transport from the shared bridge.",
      "Valid edits keep the last working sketch until the replacement compiles; docking never stops the running node.",
    ]),
    footer: "Legacy p5 frames remain supported. Use Migrate to Livecode Node when you want the self-contained node model.",
  }),
  [LIVECODE_KINDS.playcore]: Object.freeze({
    title: "Play Core quick reference",
    summary: "An ASCII program evaluated per cell inside this node's live surface.",
    points: Object.freeze([
      "Export main({ x, y }, context, cursor, buffer, __) and return a glyph or cell object. Use the shared bridge through __.",
      "Optional settings, boot, pre, post, pointerMove, pointerDown, and pointerUp hooks match existing Play Core frames.",
      "Use // @param name = value annotations and read their persisted values through __.params.",
    ]),
    footer: "The node supports Underscores's offline Play Core module set and the same shared bridge as p5.",
  }),
  [LIVECODE_KINDS.markdown]: Object.freeze({
    title: "Markdown quick reference",
    summary: "A local presentation surface rendered from the node's canonical Markdown source.",
    points: Object.freeze([
      "Use normal Markdown headings, lists, code, and emphasis. Inline $math$ and display $$math$$ render with KaTeX.",
      "Output presents the document, Code shows only Markdown source, Code Overlay combines source and output, and Code/Output splits them. Double-clicking an Output document opens its in-place editor.",
      "Active markup is stripped from Markdown output so the presentation surface remains inert.",
    ]),
    footer: "Markdown and LaTeX previews are local deterministic DOM renderers suitable for the live canvas.",
  }),
  [LIVECODE_KINDS.latex]: Object.freeze({
    title: "LaTeX quick reference",
    summary: "A standalone locally typeset mathematical presentation node.",
    points: Object.freeze([
      "Use $...$ or \\( ... \\) for inline math, and $$...$$ or \\[ ... \\] for display math. Bare text stays text.",
      "Output centers the expression in the node; Code shows only the canonical source, Code Overlay combines source and output, and Code/Output splits them.",
      "Invalid math reports a local typesetting error without replacing your source.",
    ]),
    footer: "No remote typesetting service is used.",
  }),
  [LIVECODE_KINDS.html]: Object.freeze({
    title: "HTML quick reference",
    summary: "Trusted board HTML runs in a script-enabled, opaque-origin sandbox iframe.",
    points: Object.freeze([
      "Write complete HTML, CSS, and scripts. Scripts can use the token-scoped window.__ post/onMessage bridge.",
      "The iframe has allow-scripts only: no parent-origin DOM access, top navigation, or ambient application privileges.",
      "Output runs the document. Code shows only source, Code Overlay combines source and output, and Code/Output splits them. Browser security can prevent deterministic raster export of this kind.",
    ]),
    footer: "Treat HTML source as trusted board content even though it is isolated from Underscores's parent page.",
  }),
  [LIVECODE_KINDS.orca]: Object.freeze({
    title: "Orca quick reference",
    summary: "A focused per-node grid with native frame timing and Underscores MIDI routing.",
    points: Object.freeze([
      "Click a cell to focus the grid; type to write, Arrow keys to move, Shift+Arrow to extend a selection, and Delete to clear.",
      "Cmd/Ctrl+A selects the grid; Cmd/Ctrl+C and V copy/paste a rectangular cell region. Cmd/Ctrl/Option+Enter or Space steps one frame.",
      "A, B, C, D, E/N/S/W, I, L, and M are native operators. :, %, !, and ? emit MIDI note, mono note, CC, and pitch bend through Underscores's Mixer.",
    ]),
    footer: "Linked nodes tick with Underscores transport; Free nodes keep their own frame timer. Grid focus owns its keys and never triggers canvas shortcuts.",
  }),
  [LIVECODE_KINDS.shader]: Object.freeze({
    title: "GLSL quick reference",
    summary: "A WebGL 2 fragment shader rendered directly into this Livecode Node, with a compact Twigl/Shadertoy-style source mode.",
    points: Object.freeze([
      "Write a GLSL ES 3.00 fragment shader with void main(), in vec2 v_uv, and out vec4 outColor. The host supplies the full-screen vertex stage.",
      "For code-golf and small Twigl/Shadertoy-style fragments, choose Source → Minimal / Twigl / Shadertoy. A body without main() is wrapped automatically; mainImage(out vec4, in vec2) is also accepted.",
      "Minimal mode supplies classic Twigl values resolution (vec2), mouse (vec4 pixels/press state), time, frame, and backbuffer, plus the short aliases iResolution, iTime, iMouse, iFrame, FC, r, m, t, f, b, and o. Common Twigl helpers include hsv(), rotate2D(), rotate3D(), fsnoise(), PI, and PI2.",
      "Choose Hello GLSL, Rainbow geometry, 2D shadows, Fluid brush, Inkwash, or Stokes flow from the Example menu, then edit the complete source.",
      "Common uniforms are u_resolution, u_time, u_transportTime, u_pointer, u_pointerDown, and u_currentColor. Geometry examples also receive u_segments and u_segmentCount.",
      "Layer places the shader above or below Excalidraw objects. Opacity and Blend provide non-destructive composition without changing the GLSL source.",
      "Fluid brush and Inkwash are feedback shaders: u_previous is the prior frame, u_delta is frame time, and u_pointerDelta carries brush motion. Emission makes the selected geometry source emit and stir dye or wet pigment.",
      "Inkwash can emit from nearby Excalidraw objects or only from visible physics diagnostics such as collider outlines, constraints, collision markers, force vectors, and trails. Ordinary drags use a fine ink pen; Command-drag activates the wider water brush without taking over Excalidraw's right-drag gesture.",
      "Linked time follows Underscores's score; Free time advances independently. Compile errors appear in the Console's non-logged Live section while the previous working program keeps rendering.",
      "While editing, Cmd/Ctrl+Shift+Enter cycles Output → Code → Code Overlay → Code/Output. Cmd/Ctrl+Enter runs, Ctrl+. or Alt+. stops, and Ctrl+M then L toggles line numbers. Clicking in the source only places the editor cursor.",
    ]),
    footer: "These ports preserve excalishader's four example ideas inside the editable Livecode model; the Fluid brush uses a compact ping-pong feedback pass.",
  }),
});

export const getLivecodeHelp = kind => LIVECODE_HELP[normalizeLivecodeKind(kind)] || LIVECODE_HELP[LIVECODE_KINDS.strudel];
