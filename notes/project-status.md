# Project status

Last updated: 2026-07-29

## Release checkpoint

Drawerator is currently a local, browser-based score and canvas environment built around
Excalidraw-native objects, first-class SVG documents, IanniX score behavior, live scripts, and a
shared scene hierarchy. This checkpoint is ready for the next repository-cleanup phase.

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

## Validation baseline

This release gate passes `npm test` (356 tests), `npm run build`, `npm run build:single`, and
`git diff --check`. Browser checks cover script-editor keyboard ownership, palette switching,
transparent Teaching/Transparent surfaces, and adaptive VS Code light/dark switching.

## Known boundary

SVG hosts share canonical scene order and full document/source editing, but their DOM renderer is
still composed above Excalidraw's native canvas. A unified compositor remains the planned route to
true native/SVG per-object z-order and exact time-specific PNG parity. See
[SVG architecture](svg.md#remaining-compositor-boundary).

## Next phase

Repository cleanup follows this checkpoint: consolidate the remaining branch/worktree history,
remove only verified redundant artifacts, and preserve this release state before beginning the next
editor phase.
