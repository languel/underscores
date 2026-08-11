import { LIVECODE_KINDS, normalizeLivecodeKind } from "./livecodeNode.js";

// Short, adapter-owned guidance for the docked Livecode editor. Keep it close
// to the adapter registry so the in-app reference and the persisted kind names
// cannot drift apart.
export const LIVECODE_HELP = Object.freeze({
  [LIVECODE_KINDS.strudel]: Object.freeze({
    title: "Strudel quick reference",
    summary: "A node-owned pattern feeds Drawerator's shared Strudel scheduler.",
    points: Object.freeze([
      "Cmd+Enter runs the current draft. While it plays, editing does not replace it; Ctrl+Enter queues the draft for the next beat. Ctrl+. or Alt+. stops it.",
      "Layer JavaScript voices with one `$:` statement per pattern. Mini Notation works inside double quotes; use a mondo`...` template for Mondo's bare `$` separator.",
      "Event locations animate in the source. Public painters such as .pianoroll() fill the node frame when Frame visuals is enabled; underscore painters such as ._pianoroll() stay inline with the code.",
      "Linked is the default, so Drawerator play/pause and tempo control the pattern. Choose Free for a node-local clock. Runs and updates join the four-beat Strudel cycle on a beat boundary.",
      "Stopping, replacing, or hushing a node affects only that node's pattern; other active Strudel nodes remain scheduled.",
    ]),
    footer: "Native Strudel is available locally, but public deployment remains blocked until Drawerator completes its AGPL compliance gate.",
  }),
  [LIVECODE_KINDS.p5]: Object.freeze({
    title: "p5 quick reference",
    summary: "The existing trusted bundled p5 renderer now runs per Livecode Node.",
    points: Object.freeze([
      "Use global setup() and draw(), or the existing compatible p5 mode. The live surface is the node's rectangle size.",
      "Use __.element, __.params, __.canvas, __.events, and __.transport from the shared bridge. drawerator remains an identical compatibility alias.",
      "Valid edits keep the last working sketch until the replacement compiles; docking never stops the running node.",
    ]),
    footer: "Legacy p5 frames remain supported. Use Migrate to Livecode Node when you want the self-contained node model.",
  }),
  [LIVECODE_KINDS.playcore]: Object.freeze({
    title: "Play Core quick reference",
    summary: "An ASCII program evaluated per cell inside this node's live surface.",
    points: Object.freeze([
      "Export main({ x, y }, context, cursor, buffer) and return a glyph or cell object. Use the shared bridge through __; drawerator remains an identical compatibility alias.",
      "Optional settings, boot, pre, post, pointerMove, pointerDown, and pointerUp hooks match existing Play Core frames.",
      "Use // @param name = value annotations and read their persisted values through __.params.",
    ]),
    footer: "The node supports Drawerator's offline Play Core module set and the same shared bridge as p5.",
  }),
  [LIVECODE_KINDS.markdown]: Object.freeze({
    title: "Markdown quick reference",
    summary: "A local presentation surface rendered from the node's canonical Markdown source.",
    points: Object.freeze([
      "Use normal Markdown headings, lists, code, and emphasis. Inline $math$ and display $$math$$ render with KaTeX.",
      "Select Preview to present the slide; select Code or double-click to edit the same source.",
      "Active markup is stripped from Markdown output so the presentation surface remains inert.",
    ]),
    footer: "Markdown and LaTeX previews are local deterministic DOM renderers suitable for the live canvas.",
  }),
  [LIVECODE_KINDS.latex]: Object.freeze({
    title: "LaTeX quick reference",
    summary: "A standalone locally typeset mathematical presentation node.",
    points: Object.freeze([
      "Use $...$ or \\( ... \\) for inline math, and $$...$$ or \\[ ... \\] for display math. Bare text stays text.",
      "Use Preview to center the expression in the node; return to Code to change the canonical source.",
      "Invalid math reports a local typesetting error without replacing your source.",
    ]),
    footer: "No remote typesetting service is used.",
  }),
  [LIVECODE_KINDS.html]: Object.freeze({
    title: "HTML quick reference",
    summary: "Trusted board HTML runs in a script-enabled, opaque-origin sandbox iframe.",
    points: Object.freeze([
      "Write complete HTML, CSS, and scripts. Scripts can use the token-scoped window.drawerator post/onMessage bridge.",
      "The iframe has allow-scripts only: no parent-origin DOM access, top navigation, or ambient application privileges.",
      "Use Preview to run the document. Browser security can prevent deterministic raster export of this kind.",
    ]),
    footer: "Treat HTML source as trusted board content even though it is isolated from Drawerator's parent page.",
  }),
  [LIVECODE_KINDS.orca]: Object.freeze({
    title: "Orca quick reference",
    summary: "A focused per-node grid with native frame timing and Drawerator MIDI routing.",
    points: Object.freeze([
      "Click a cell to focus the grid; type to write, Arrow keys to move, Shift+Arrow to extend a selection, and Delete to clear.",
      "Cmd/Ctrl+A selects the grid; Cmd/Ctrl+C and V copy/paste a rectangular cell region. Cmd/Ctrl/Option+Enter or Space steps one frame.",
      "A, B, C, D, E/N/S/W, I, L, and M are native operators. :, %, !, and ? emit MIDI note, mono note, CC, and pitch bend through Drawerator's Mixer.",
    ]),
    footer: "Linked nodes tick with Drawerator transport; Free nodes keep their own frame timer. Grid focus owns its keys and never triggers canvas shortcuts.",
  }),
  [LIVECODE_KINDS.shader]: Object.freeze({
    title: "GLSL quick reference",
    summary: "A WebGL 2 fragment shader rendered directly into this Livecode Node.",
    points: Object.freeze([
      "Write a GLSL ES 3.00 fragment shader with void main(), in vec2 v_uv, and out vec4 outColor. The host supplies the full-screen vertex stage.",
      "Choose Hello GLSL, Rainbow geometry, 2D shadows, Fluid brush, Inkwash, or Stokes flow from the Example menu, then edit the complete source.",
      "Common uniforms are u_resolution, u_time, u_transportTime, u_pointer, u_pointerDown, and u_currentColor. Geometry examples also receive u_segments and u_segmentCount.",
      "Layer places the shader above or below Excalidraw objects. Opacity and Blend provide non-destructive composition without changing the GLSL source.",
      "Fluid brush and Inkwash are feedback shaders: u_previous is the prior frame, u_delta is frame time, and u_pointerDelta carries brush motion. Emission makes the selected geometry source emit and stir dye or wet pigment.",
      "Inkwash can emit from nearby Excalidraw objects or only from visible physics diagnostics such as collider outlines, constraints, collision markers, force vectors, and trails. Ordinary drags use a fine ink pen; Command-drag activates the wider water brush without taking over Excalidraw's right-drag gesture.",
      "Linked time follows Drawerator's score; Free time advances independently. Compile errors appear in the Console's non-logged Live section while the previous working program keeps rendering.",
      "While editing, Cmd/Ctrl+Shift+Enter cycles Code → Output → Split. Cmd/Ctrl+Enter runs, Ctrl+. or Alt+. stops, and Ctrl+M then L toggles line numbers. Clicking in the source only places the editor cursor.",
    ]),
    footer: "These ports preserve excalishader's four example ideas inside the editable Livecode model; the Fluid brush uses a compact ping-pong feedback pass.",
  }),
});

export const getLivecodeHelp = kind => LIVECODE_HELP[normalizeLivecodeKind(kind)] || LIVECODE_HELP[LIVECODE_KINDS.strudel];
