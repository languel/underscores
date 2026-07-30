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
});

export const getLivecodeHelp = kind => LIVECODE_HELP[normalizeLivecodeKind(kind)] || LIVECODE_HELP[LIVECODE_KINDS.strudel];
