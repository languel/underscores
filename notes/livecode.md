# Livecode canvas nodes

Last updated: 2026-08-11

## What a node is

A **Livecode Node** is one transparent Excalidraw rectangle plus a minimal live DOM surface. The rectangle remains the canonical scene identity: it owns position, rotation, dimensions, selection, history, grouping, ordering, and the persisted `customData.draweratorLivecode` record. The visible surface is supplied by a per-kind adapter instead of by Excalidraw itself.

This avoids attaching a program to a separate host object. A node has one source document and can run alongside any number of other nodes. Its source and its `code`, `output`, or `code/output` view persist with the scene.

Create a node from **New Livecode Node**, `/live`, the command palette, or `livecode.node.create`. `/live p5`, `/live playcore`, `/live markdown`, `/live latex`, `/live html`, `/live strudel`, `/live orca`, and `/live shader` select a kind immediately. Selecting a node always opens its source in the shared Script panel; clicking its code or pressing **Enter** enters the same source directly on the canvas. These are two views of one source document, never competing drafts, and neither interrupts a running runtime. The Script panel exposes Run/Stop, linked/free clock mode, typography, adapter settings such as Strudel's full-frame visualizer toggle, and any `@param` values declared in the source.

## Scene schema

`customData.draweratorLivecode` is version 1:

| Field | Meaning |
| --- | --- |
| `version`, `nodeId`, `revision` | Versioned, stable node identity and source revision. |
| `kind`, `name`, `source` | Adapter id, readable name, and canonical source text. |
| `parameters` | Persisted `@param` values. |
| `runtime` | `enabled`, `running`, `transportMode` (`linked` or `free`), and adapter settings such as Strudel's default-on `frameVisuals`. |
| `view` | Scene-persisted `code`, `preview` (output), or `split` (`code/output`) surface choice. Code is normally a live overlay; Markdown deliberately uses a raw-source-only Code view. |
| `typography` | Font, size, line height, weight, tracking, line-number/fold-gutter toggles, overlay opacity, and glyph-only overlay preference. |

Source is always owned by the node. The canvas editor and the Script panel use the same CodeMirror controller; a valid edit updates the runtime, while adapters that can compile preserve their last working output when a draft is invalid.

## Typography

Node typography is independently persisted and exposed in the Script panel: **Fira Mono** for code-oriented nodes, **Inter** for readable presentation, a system serif fallback, and the five **Monaspace** families (**Argon**, **Krypton**, **Neon**, **Radon**, and **Xenon**). Size, line-height, weight, tracking, and the Ligatures toggle are stored per node. Fira Mono, Inter, and the Latin Monaspace faces are bundled offline through Fontsource at the supported editor weights; their notices are recorded in [third-party notices](../THIRD_PARTY_NOTICES.md). Monaspace enables contextual alternates (`calt`), standard ligatures (`liga`), and stylistic operator sets (`ss01`–`ss10`) when Ligatures is on. The full Nerd Font glyph archive is intentionally not part of the default bundle; a local `Symbols Nerd Font Mono` installation is used as a fallback for extra symbols.

The global CodeMirror palette still controls editor syntax colors and surfaces. Node typography only changes the node's own source/preview content.

## Editing and views

- **Code** is normally a live code overlay: the runtime stays visible while source is shown or edited above it. Press **Enter** on a selected node to enter this view and focus its canvas editor. Markdown is the deliberate exception: Code shows raw Markdown only, without a rendered layer underneath it.
- **Output** shows the runtime only. Markdown Output is also its document editor: double-click a rendered block to edit that block's exact source, click another block to move the edit session, or click below the final block to append a paragraph. Blank lines and separators remain part of the canonical source. **Code/output** is the deliberate explicit split view. Use **Cmd/Ctrl+Shift+Enter** while a node editor has focus to cycle these views; Orca is code/grid only because its code is its output.
- **Cmd/Ctrl+Enter** runs the current node. **Ctrl+M, then L** is CodeMirror's line-number toggle. The panel also exposes line numbers and the folding gutter; both default off for canvas Livecode Nodes.
- **Glyphs only** is on by default for Code overlay. Its opacity is painted behind non-whitespace source runs only, leaving blank character areas transparent so the running output remains visible. Turn it off for one continuous code surface.
- Markdown output scrolls vertically and horizontally inside its node whenever it exceeds the available node bounds; scrolling is contained within the node.
- The Script panel selector lists the node name before its kind. Double-click the name or press **F2** to rename it, and use the adjacent frame button to select and frame that node on the canvas.

## Runtime kinds

### p5 and Play Core

These use the same trusted local adapters as existing p5 and Play Core hosts. They receive the [shared Drawerator script bridge](drawerator-api.md), including `element`, `params`, `canvas`, `events`, `transport`, `currentColor`, theme colors, and `api`. They may use `@param` annotations. Every active node owns its renderer, so selecting, docking, or editing another node does not stop it.

Existing p5/Play Core frame hosts remain valid. Choose **Migrate to Livecode Node** to explicitly snapshot a legacy host's source and configuration into `draweratorLivecode` while retaining its scene element id and geometry. Migration is undoable.

The ordinary p5 and Play Core Script panels can also apply their current program directly to a
selected Livecode Node. The node keeps its scene identity and geometry while its kind, canonical
source, compatible runtime settings, name, and parameters are retargeted to the applied program.

The p5 Livecode flow is the currently polished runtime path: concurrent nodes, canvas editing, source-panel editing, output, and overlay/split views are expected to work together.

### GLSL shaders

GLSL nodes run editable GLSL ES 3.00 fragment programs in WebGL 2. `/shader hello`, `/shader rainbow`, `/shader shadow`, `/shader fluid`, and `/shader stokes` create the original bundled examples. The Example menu also includes Inkwash without adding another slash command. Hello is the minimal shader contract; Rainbow and 2D Shadows consume nearby Drawerator path segments; Fluid Brush is a stateful ping-pong feedback pass whose dye can be driven by the pointer and scene strokes; Stokes is an analytical flow field. Inkwash is a finer feedback brush whose ink can come from authored objects, the pointer, or the runtime-only physics debug drawings; **Cmd/Ctrl-drag** supplies its wash/smear interaction without conflicting with Excalidraw's right-button canvas gesture. Each node keeps its source, running state, clock, example identity, and composition settings in `runtime.settings`.

Shader output can render **Above objects** or **Below objects**. The latter uses a dedicated underlay beneath Excalidraw while keeping the drawing canvas transparent, so authored strokes remain crisp over the shader. Per-node opacity and CSS blend modes (`normal`, `screen`, `multiply`, `overlay`, and `soft-light`) apply without changing the source. **Background → Transparent** gives the WebGL canvas a real alpha channel: the Fluid example derives alpha from dye density instead of painting its dark display background, while custom fragment shaders can author alpha directly in `outColor`. **Solid** remains the compatibility default.

The shader renderer caps feedback buffers at 1024 px per axis, skips offscreen animation work, caches converted scene segments, and recompiles only when source changes. A failed shader edit is reported in the Console's Live status stream while the node keeps its last successfully compiled frame; compiler text never replaces the canvas output. Shader nodes are live DOM/WebGL surfaces rather than deterministic Excalidraw raster data; export/capture support remains a later integration step.

### Strudel

Strudel nodes use a shared native scheduler rather than a singleton REPL. Each node compiles to its own pattern; recompiling, stopping, or hushing one never clears another. Node playback unlocks Web Audio in the direct user gesture. New nodes default to Linked and follow Drawerator transport tempo and phase: transport play, rewind/loop, seek while stopped, and BPM changes re-anchor Strudel cycles to score BBU time, while transport stop resets the private scheduler cycle. `setcps`, `setcpm`, and `setbpm` update the shared score tempo in this mode, and a source with no tempo command continues to follow later score-tempo changes. Free remains available for patterns that should run independently; its tempo commands create a node-local CPS override, while a Free source with no such command also follows the score tempo. The runtime registers Strudel's XEN scope and General MIDI soundfonts in addition to the default unbanked drums, drum-machine banks, Dirt, piano, VCSL, and auxiliary sample maps. Audio data is fetched lazily on first use.

JavaScript REPL voices use separate `$:` statements and are stacked inside the node. Mini Notation is available in the normal double-quoted and template-string pattern arguments. Mondo's bare `$` pattern separator is available through its documented tagged-template form:

```js
mondo`
$ s [bd sd]
$ s hh*2
`
```

The node is intentionally code-overlay-only. Its CodeMirror surface is part of the visual output:
active event source locations receive Strudel's synchronized highlights and `markcss(...)` styles.
Underscore painters such as `._pianoroll()`, `._scope()`, and `._spiral()` remain inline CodeMirror
widgets. Public painters such as `.pianoroll()` use a node-sized canvas beneath the code overlay.
The Script panel's **Visuals → Frame** toggle is on by default and removes or restores that canvas
without recompiling or stopping the pattern.

Full-frame painters reuse the board's existing Strudel scheduler query and animation frame rather
than starting the reference REPL's viewport-sized canvas and independent animation loop. The canvas
backing resolution is capped at 2× device density, resize work happens only when node dimensions
change, and offscreen canvases skip painting. Runtime messages are panel-only and never appear
inside the live canvas frame.

Editing a running Strudel node changes its persisted draft without recompiling the active pattern. `Ctrl+Enter` compiles that draft and swaps it at the next beat boundary; the previous valid pattern remains scheduled until then, and also survives a failed evaluation. `Cmd+Enter` starts a stopped node from the current draft without serving as the update gesture. Since Drawerator maps a Strudel cycle to four score beats, beat-quantized updates use quarter-cycle boundaries. `Ctrl+.` or `Alt+.` stops the node. Native Strudel is available in local development, but public deployment is intentionally blocked by the [release gate](livecode-licensing.md#strudel-release-gate). Do not bypass that gate until the project has completed its AGPL obligations.

`Ctrl+Shift+Space` is the global rehearsal reset-toggle: from either state it sets score time to zero,
then stops or starts the global transport from zero. The shortcut remains available while an editor
owns focus.

Trusted p5, Play Core, and Strudel runtimes expose their node-local bridge through the reserved `__`
binding. `__.transport`, `__.params`, `__.canvas`, and `__.api` are the preferred concise spellings;
`drawerator` remains an identical compatibility alias for saved scenes and existing scripts. This is
a lexical runtime binding, not a `window.__` global. Sandboxed HTML keeps its narrower
`window.drawerator` message bridge and does not receive `__`.

### Markdown and LaTeX

Markdown renders locally with KaTeX inline (`$…$`) and display (`$$…$$`) mathematics. Active markup is removed from Markdown output. In Output view it behaves as a compact rendered document editor: only the active block reveals its source, and leaving edit mode restores the rendered block without normalizing blank lines. Code view is raw source only, while Code/output remains the explicit source-and-preview layout. Markdown is scrollable within a constrained node. A LaTeX node accepts ordinary text plus inline `$…$` or `\\(…\\)` and display `$$…$$` or `\\[…\\]` delimiters; bare text is not implicitly treated as an equation. Both surfaces are deterministic DOM renderers suitable for live presentation and capture.

### HTML

HTML is trusted board content, but it runs immediately in an opaque-origin iframe with `sandbox="allow-scripts"`. It cannot read the parent application DOM, navigate the top window, or inherit parent-origin privileges. The child receives a token-scoped `window.drawerator` bridge with only `post` and `onMessage`; the parent verifies both token and source window before responding. It remains a supported sandboxed adapter, but needs a dedicated browser acceptance pass before being treated as polished.

Browser security can block reliable parent-side rasterization of a sandboxed opaque-origin iframe. HTML presentation therefore reports an explicit export limitation instead of pretending that it has deterministic PNG capture.

### Orca

An Orca node is a real per-node grid, not a CodeMirror document. Canvas and panel modes subscribe to the same grid runtime. Click a cell to focus it; type to write; Arrow keys move; Shift+Arrow extends a selection; Delete clears; Cmd/Ctrl+A selects all; Cmd/Ctrl+C/V copies and pastes a grid rectangle; Cmd/Ctrl/Option+Enter or Space steps one frame. Focus owns these keys completely, so they never reach Excalidraw.

Linked Orca nodes tick from Drawerator transport; free nodes use a per-node timer. Their native operator core currently covers `A`, `B`, `C`, `D`, `E/N/S/W`, `I`, `L`, `M`, bang triggering, and MIDI `:`, mono MIDI `%`, CC `!`, and pitch bend `?`. MIDI is sent through the existing Drawerator Mixer routing. Other visible Orca glyphs are preserved in the authored grid and remain inert until their semantics are added; they are never rewritten or discarded. Orca needs a dedicated stabilization pass before its grid/runtime interaction is considered complete. The interaction and supported operator behavior are adapted from [Hundredrabbits Orca](https://github.com/hundredrabbits/Orca) under its MIT license.
The node chrome is intentionally compact: the Orca title is omitted, run/stop and single-step use
icon-only controls with tooltips and accessible labels, and the current clock state is represented
by a semantic icon (chain for linked, diamond for free, clock for waiting, pause for paused, and
square for stopped). The frame counter remains text so it can be read at a glance.

## In-app reference and commands

The docked Script editor exposes an adapter-specific quick reference with the active node's keyboard and runtime details. Core commands are:

- `livecode.node.create`
- `livecode.node.edit`
- `livecode.node.run` / `livecode.node.stop`
- `livecode.node.dock`
- `livecode.node.migrate`

Use `window.drawerator.commands.list()` to retrieve the public command contract rather than calling internal UI handlers.

## Presentation and export

Livecode nodes, including shader overlays and underlays, remain visible in presentation mode. Entering presentation hides authoring chrome, the physics toolbar, and the FPS overlay; exiting restores their prior states. Presentation auto-fit preserves the authored camera when scene bounds cannot fit even at Excalidraw's minimum zoom, preventing a distant stray object from moving the visible scene offscreen. p5, Play Core, Markdown, LaTeX, Strudel's visual feedback, and Orca can be represented at deterministic state when their renderer is available. Sandboxed HTML is intentionally the exception: cross-origin security may prevent a reliable raster readback, and this limitation is reported rather than silently producing a broken export. WebGL shader capture is not yet included in deterministic scene export.
