# Project status

Last updated: 2026-07-30

## Release checkpoint

Drawerator is currently a local, browser-based score and canvas environment built around
Excalidraw-native objects, first-class SVG documents, IanniX score behavior, Livecode Nodes, and a
shared scene hierarchy. This checkpoint is ready for the release/compliance review that precedes
any public Strudel deployment.

### Available now

- Script adapters for Brush/modifier JavaScript, IanniX, p5, Play Core, and SVG, all using the
  shared CodeMirror editor.
- Keyboard ownership for focused code: selection, editing, navigation, completion, clipboard,
  undo/redo, and Run do not leak into canvas shortcuts.
- Code palettes: Drawerator adaptive, Transparent adaptive, Mono adaptive, VS Code adaptive, and
  Teaching. Board presets include paired VS Code Light and VS Code Dark workspace skins.
- SVG source-as-canonical editing, source/canvas selection parity, editable path anchors and
  handles, subpath extraction, Drawerator metadata, SVG node roles, and declarative CSS/SMIL/Looom
  timing support.
- Native scene groups and score groups in the Outliner: selectable group rows, group visibility,
  locking, deletion, drag/reparenting, and batch actions with Option-click.
- Play Core ASCII frames with offline module imports, original examples, `@param` controls, and the
  shared `drawerator` script bridge.
- First-class Livecode Nodes: self-contained transparent scene hosts with one canonical source,
  shared Script-panel/canvas editing, node typography, and concurrent p5, Play Core, Strudel,
  Markdown, LaTeX, HTML, and Orca adapters. p5 is the polished Livecode path. Markdown is
  presentation-ready with contained overflow scrolling, and LaTeX supports explicit inline/display
  delimiters. See [Livecode Nodes](livecode.md).
- Native Strudel shared scheduling now includes code-only overlays with event-synchronized CSS,
  source highlighting, inline visualizers, and REPL run/stop shortcuts. Native Orca grids with
  Drawerator transport/Mixer integration still need a dedicated follow-up stabilization pass. HTML
  remains sandboxed and needs its own browser acceptance pass. Strudel public deployment remains
  intentionally blocked pending AGPL compliance; see [Livecode licensing](livecode-licensing.md).

## Validation baseline

This release gate must pass `npm test`, `npm run build`, `npm run build:single`, `git diff --check`,
focused browser checks for concurrent Livecode Nodes, code/dock source ownership, HTML sandboxing,
and Orca keyboard containment. `npm run release:check` must fail until the Strudel release gate is
actually satisfied; an explicit acknowledgement only validates the gate's completed-compliance path.

The 2026-07-30 Strudel interaction pass completed 385 automated tests, a production build, lint
without new warnings, and an active-harness workflow check. The harness confirmed that edits remain
drafts while the last evaluated pattern continues, `Ctrl+Enter` reports a queued update before the
next-beat activation, and runtime messages remain absent from the live canvas frame.

## Known boundary

SVG hosts share canonical scene order and full document/source editing, but their DOM renderer is
still composed above Excalidraw's native canvas. A unified compositor remains the planned route to
true native/SVG per-object z-order and exact time-specific PNG parity. See
[SVG architecture](svg.md#remaining-compositor-boundary).

## Next phase

Before public deployment, complete the project licensing decision, publish corresponding source and
build instructions, audit any Strudel samples/assets, and record the final notices. Continue the
Strudel transport and Orca grid stabilization passes, browser-test sandboxed HTML,
and extend deterministic Livecode export coverage without weakening node source ownership or
keyboard containment.
