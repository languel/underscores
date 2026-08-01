# Project status

Last updated: 2026-08-01

## Release checkpoint

Drawerator is currently a local, browser-based score and canvas environment built around
Excalidraw-native objects, first-class SVG documents, IanniX score behavior, Livecode Nodes, and a
shared scene hierarchy. This checkpoint is ready for the release/compliance review that precedes
any public Strudel deployment.

A compact performance monitor now reports browser FPS, long frames, scene callback/change pressure,
object counts, and available Chromium heap use, either floating or attached to Console. Native
selections and groups can be replaced by one PNG or first-class SVG in a single undoable
transaction; this is the immediate mitigation for dense
static MediaPipe landmark snapshots. The review, reproducible Chrome camera-motion trace, CPU
profile hotspot, delivered runtime-cursor fast path, and next optimization order are in [Performance
monitor and scene baking](performance.md). The optimized synthetic 5,000-object production trace
improved from p95 50.1 ms with 58 long animation frames to p95 17.5 ms with none; a permissioned
real-camera Holistic trace remains pending.

The MediaMime integration is also active: camera and URL/file media inputs can remain
panel-only or gain optional canvas views, and MediaPipe Holistic processors are transformable scene
objects. Crop and mirror are applied once to the shared processed output used by every view and
processor; animated GIF frames now advance through that output. Browser-owned handles and landmark
frames stay transient; Holistic can hide its source feed, emits normalized Drawerator events, and
snapshots live pose/hand landmarks as native scene geometry. A shared semantic ontology now powers
the `/mapping` feature browser, `__.streams`, persistent drive/freedraw bindings, selected-feature
highlights, and capped traces without serializing raw observations. See
[Media streams](media-streams.md).
Holistic inference/publication now treats its configurable 15 FPS default as a ceiling and backs off
automatically when inference would consume too much frame time. It avoids repainting unchanged
results and no-op actor state, immediately saves processor creation/settings for reliable reloads,
remembers display choices for the next processor, and offers both one-group native landmark output
and a visually aligned PNG snapshot. Point size and line thickness match across live and native
output; pose, hand, handedness, and semantic face filters share one ontology path.

The next input layer is now present as a unified typed stream registry. **Media** retains the
camera, URL/file, and canvas image catalog; the separate **Inputs** panel owns pointer/keyboard/
clock, MediaPipe, IanniX, Web MIDI, Web Serial, WebSocket/OSC JSON, and trusted virtual source
descriptors. **Brush → Channels** maps those streams into independently owned native freedraw
sessions while **Stack** preserves the existing modifier contract. Scene exchange stores
descriptors, derived event processors, and Brush channels—not browser permissions, current
samples, pixels, or device/socket state. See
[Media streams](media-streams.md#unified-streams-and-inputs) and
[Modifier stack](modifier-stack.md#channels-are-separate-from-the-modifier-stack).

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
  shared `__` script bridge; `drawerator` remains a compatibility alias.
- First-class Livecode Nodes: self-contained transparent scene hosts with one canonical source,
  shared Script-panel/canvas editing, node typography, and concurrent p5, Play Core, Strudel,
  Markdown, LaTeX, HTML, and Orca adapters. p5 is the polished Livecode path. Markdown is
  presentation-ready with contained overflow scrolling, and LaTeX supports explicit inline/display
  delimiters. See [Livecode Nodes](livecode.md).
- Native Strudel shared scheduling now includes linked score-phase synchronization, beat-quantized
  draft updates, XEN and General MIDI soundfont scope, code-only overlays with event-synchronized
  CSS, inline underscore visualizers, and default-on node-frame public visualizers using the shared
  draw loop. Native Orca grids with Drawerator transport/Mixer integration still need a dedicated
  follow-up stabilization pass. HTML remains sandboxed and needs its own browser acceptance pass.
  Strudel public deployment remains intentionally blocked pending AGPL compliance; see
  [Livecode licensing](livecode-licensing.md).

## Validation baseline

This release gate must pass `npm test`, `npm run build`, `npm run build:single`, `git diff --check`,
focused browser checks for concurrent Livecode Nodes, code/dock source ownership, HTML sandboxing,
and Orca keyboard containment. `npm run release:check` must fail until the Strudel release gate is
actually satisfied; an explicit acknowledgement only validates the gate's completed-compliance path.

The 2026-08-01 integrated Livecode, media, baking, and performance checkpoint completed 462 automated tests and a
production build. Active-harness checks confirmed that edits remain drafts while the last evaluated
pattern continues, `Ctrl+Enter` reports a queued update before next-beat activation, and runtime
messages remain absent from the live canvas frame. `.pianoroll()` rendered across the 520 × 300 node
without creating Strudel's page-level canvas; disabling and restoring **Frame** did not stop or
recompile the Free-run pattern, and `._pianoroll()` remained an inline 500 × 72 widget.

## Known boundary

SVG hosts share canonical scene order and full document/source editing, but their DOM renderer is
still composed above Excalidraw's native canvas. A unified compositor remains the planned route to
true native/SVG per-object z-order and exact time-specific PNG parity. See
[SVG architecture](svg.md#remaining-compositor-boundary).

## Next phase

Build higher-order mappings on the now-general stream foundation: palm openness, calibrated gaze,
string-plucking, zones, MIDI actions, constraints, richer serial/OSC source templates, and a visual
graph editor. The unchanged MediaMime body-map references can become ontology-generated selectable
maps in that later slice without turning their explanatory SVG titles into runtime schema.

Before public deployment, complete the project licensing decision, publish corresponding source and
build instructions, audit any Strudel samples/assets, and record the final notices. Continue with
the next selected Livecode phase, the Orca grid stabilization pass, sandboxed HTML browser
acceptance, and deterministic Livecode export coverage without weakening node source ownership,
draw-loop performance, or keyboard containment.
