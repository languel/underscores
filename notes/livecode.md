# Livecode canvas nodes

Last updated: 2026-08-16

## What a node is

A **Livecode Node** is one transparent Excalidraw rectangle plus a minimal live DOM surface. The rectangle remains the canonical scene identity: it owns position, rotation, dimensions, selection, history, grouping, ordering, and the persisted `customData.underscoresLivecode` record. The visible surface is supplied by a per-kind adapter instead of by Excalidraw itself.

This avoids attaching a program to a separate host object. A node has one source document and can run alongside any number of other nodes. Its source and its `code`, `output`, or `code/output` view persist with the scene.

Create a node from **New Livecode Node**, `/live`, the command palette, or `livecode.node.create`. `/live p5`, `/live playcore`, `/live markdown`, `/live latex`, `/live html`, `/live strudel`, `/live orca`, and `/live shader` select a kind immediately. Selecting a node always opens its source in the shared Script panel; clicking its code or pressing **Enter** enters the same source directly on the canvas. These are two views of one source document, never competing drafts, and neither interrupts a running runtime. The Script panel exposes Run/Stop, linked/free clock mode, typography, adapter settings such as Strudel's full-frame visualizer toggle, and any `@param` values declared in the source.

## Scene schema

`customData.underscoresLivecode` is version 1:

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
- **Output** shows the runtime only. Strudel is the exception: its source remains the canonical code document, while a read-only visual CodeMirror surface keeps synchronized event highlights, `markcss(...)` styles, pulses, and inline visualizer widgets alive after the source glyphs are hidden. This means Cmd/Ctrl-clicking a Strudel node into Output view preserves the visual performance without showing the code. Markdown Output is also its document editor: double-click a rendered block to edit that block's exact source, click another block to move the edit session, or click below the final block to append a paragraph. Blank lines and separators remain part of the canonical source. **Code/output** is the deliberate explicit split view. Use **Cmd/Ctrl+Shift+Enter** while a node editor has focus to cycle these views; Orca is code/grid only because its code is its output.
- **Cmd/Ctrl+Enter** runs the current node. When the pointer is over a canvas Livecode node, the same chord starts it without needing to focus the editor; **Cmd/Ctrl+.** stops that hovered node. **Ctrl+M, then L** is CodeMirror's line-number toggle. The panel also exposes line numbers and the folding gutter; both default off for canvas Livecode Nodes.
- On a canvas output, plain **Cmd/Ctrl-click** switches that Livecode node to Preview. **Cmd+Shift-click** is reserved for the canvas overlap-cycle gesture, and is never consumed by the Livecode output shortcut; clicks in the code editor or node chrome remain editor/UI interactions.
- **Glyphs only** is on by default for Code overlay. Its opacity is painted behind non-whitespace source runs only, leaving blank character areas transparent so the running output remains visible. Turn it off for one continuous code surface.
- Markdown output scrolls vertically and horizontally inside its node whenever it exceeds the available node bounds; scrolling is contained within the node.
- The Script panel selector lists the node name before its kind. Double-click the name or press **F2** to rename it, and use the adjacent frame button to select and frame that node on the canvas.

## Runtime kinds

### p5 and Play Core

These use the same trusted local adapters as existing p5 and Play Core hosts. They receive the [shared Underscores script bridge](underscores-api.md), including `element`, `params`, `canvas`, `events`, `transport`, live Excalidraw color aliases, theme colors, and `api`. They may use typed `@param` annotations for numbers, strings, booleans, JSON, canvas objects, and CSS colors. Color references are resolved on access, so a running node can follow a changed Excalidraw palette without recompilation. Every active node owns its renderer, so selecting, docking, or editing another node does not stop it.

Existing p5/Play Core frame hosts remain valid. Choose **Migrate to Livecode Node** to explicitly snapshot a legacy host's source and configuration into `underscoresLivecode` while retaining its scene element id and geometry. Migration is undoable.

The ordinary p5 and Play Core Script panels can also apply their current program directly to a
selected Livecode Node. The node keeps its scene identity and geometry while its kind, canonical
source, compatible runtime settings, name, and parameters are retargeted to the applied program.

The p5 Livecode flow is the currently polished runtime path: concurrent nodes, canvas editing, source-panel editing, output, and overlay/split views are expected to work together.
The p5 example catalog also includes **MediaPipe · Unicursal portrait**, a supported live prototype
for the shared `__.art.unicursal` engine. Add a Holistic processor first; the example reads its
latest completed frame and draws the same stable path topology used by a first-class Unicursal
object without copying landmark or segmentation data into the scene.

### Transparent frame policy and shared composition settings

For a foreground-only live frame, authors can currently call p5 `clear()` at the beginning of
`draw()`. `background("transparent")` and `background(0, 0)` are not equivalent reset operations:
they paint an alpha-zero source over the existing surface and can leave prior pixels accumulated.
The p5 `transparent` setting and transparent DOM hosts already provide the right surface; the
remaining design work is to make frame reset a shared Livecode runtime policy rather than a
per-sketch convention.

The shared vocabulary is `backgroundMode` (`auto`, `transparent`, `theme`, or `solid`) and
`persistence` (`auto`, `clear`, or `accumulate`). In explicit transparent/clear mode, a visual
adapter can reset its existing surface in place before authored rendering, avoiding readback and
avoiding a second offscreen buffer. Accumulation/feedback remains explicit. p5 uses `clear()`;
future Strudel painter and WebGL feedback adapters can use the same policy without changing the
node contract. DOM adapters keep their host background transparent and replace content normally.
`createGraphics()` remains an opt-in tool for layered or feedback work, not a requirement for
ordinary transparent composition.

Phase 1 is now implemented without changing existing defaults: `src/livecodeComposition.js`
normalizes the shared vocabulary, p5 Livecode Nodes expose **Background** and **Frame reset**
controls, and p5 calls `clear()` once per frame only when `persistence` is explicitly `clear`.
`auto` keeps authored/manual behavior, so existing p5 sketches do not gain a hidden per-frame
operation. Strudel's scheduler and painter path are intentionally unchanged. Shader nodes still
own their existing `backgroundMode` implementation; extending the shared policy to Strudel and
WebGL feedback remains a later adapter-specific phase.

### GLSL shaders

GLSL nodes run editable GLSL ES 3.00 fragment programs in WebGL 2. `/shader hello`, `/shader rainbow`, `/shader shadow`, `/shader fluid`, `/shader stokes`, and `/shader minimal` create the bundled examples. The Example menu also includes Inkwash without adding another slash command. Hello is the full GLSL contract; **Source → Minimal / Twigl / Shadertoy** is a compact dialect for code-golf fragments and small Twigl/Shadertoy-style bodies. In minimal mode, a body without `main()` is wrapped with the node's WebGL 2 header and the common classic/geek aliases (`resolution` vec2, `mouse` vec4 pixels/press state, `time`, `frame`, `backbuffer`, `r`, `m`, `t`, `f`, `b`, `FC`, and `o`); `mainImage()` is also accepted. The mode includes compact helpers such as `hsv()`, `rotate2D()`, `rotate3D()`, `fsnoise()`, `PI`, and `PI2`, and allocates a ping-pong backbuffer only when the source samples `b`/`backbuffer`. This first slice accepts fragment sources, not arbitrary JavaScript/TWGL applications; a full TWGL sketch still needs a separate JavaScript canvas adapter. Rainbow and 2D Shadows consume nearby Underscores path segments; Fluid Brush is a stateful ping-pong feedback pass whose dye can be driven by the pointer and scene strokes; Stokes is an analytical flow field. Inkwash is a finer feedback brush whose ink can come from authored objects, the pointer, or the runtime-only physics debug drawings; **Cmd/Ctrl-drag** supplies its wash/smear interaction without conflicting with Excalidraw's right-button canvas gesture. Each node keeps its source, running state, clock, example identity, dialect, and composition settings in `runtime.settings`.

Shader output can render **Above objects** or **Below objects**. The latter uses a dedicated underlay beneath Excalidraw while keeping the drawing canvas transparent, so authored strokes remain crisp over the shader. Per-node opacity and CSS blend modes (`normal`, `screen`, `multiply`, `overlay`, and `soft-light`) apply without changing the source. **Background → Transparent** gives the WebGL canvas a real alpha channel: the Fluid example derives alpha from dye density instead of painting its dark display background, while custom fragment shaders can author alpha directly in `outColor`. **Solid** remains the compatibility default.

The shader renderer caps feedback buffers at 1024 px per axis, skips offscreen animation work, caches converted scene segments, and recompiles only when source changes. A failed shader edit is reported in the Console's Live status stream while the node keeps its last successfully compiled frame; compiler text never replaces the canvas output. Shader nodes are live DOM/WebGL surfaces rather than deterministic Excalidraw raster data; export/capture support remains a later integration step.

### Strudel

Strudel nodes use a shared native scheduler rather than a singleton REPL. Each node compiles to its own pattern; recompiling, stopping, or hushing one never clears another. Node playback unlocks Web Audio in the direct user gesture. New nodes default to Linked and follow Underscores transport tempo and phase: transport play, rewind/loop, seek while stopped, and BPM changes re-anchor Strudel cycles to score BBU time, while transport stop resets the private scheduler cycle. `setcps`, `setcpm`, and `setbpm` update the shared score tempo in this mode, and a source with no tempo command continues to follow later score-tempo changes. Free remains available for patterns that should run independently; its tempo commands create a node-local CPS override, while a Free source with no such command also follows the score tempo. The runtime registers Strudel's XEN scope and General MIDI soundfonts in addition to the default unbanked drums, drum-machine banks, Dirt, piano, VCSL, and auxiliary sample maps. Audio data is fetched lazily on first use. Shared `@param` values are read through `__.params`, not `__.element.param`; use a JavaScript value such as `.color(pure(__.params.c1))` when a parameter should drive a control. To combine a live parameter with a Mini sequence, construct a pattern such as `.color(slowcat(pure(__.params.c1), \"#8bd5ff\", \"#f5d76e\", \"#9df59d\"))`. Quoted `<...>` mini-notation remains literal text, and editing a parameter queues a fresh node evaluation at the next safe beat.

JavaScript REPL voices use separate `$:` statements and are stacked inside the node. Mini Notation is available in the normal double-quoted and backtick pattern arguments. Backticks are reserved for Strudel Mini Notation in Livecode Nodes, so JavaScript template interpolation (`${...}`) is not evaluated; assign `__.params` to a normal JavaScript variable or pass it directly to a pattern method instead. Mondo's bare `$` pattern separator is available through its documented tagged-template form:

```js
mondo`
$ s [bd sd]
$ s hh*2
`
```

The node treats source text as code and its CodeMirror decorations as output. In Code view the
source and visual decorations share one editor surface. In Output view a visual-only, read-only
CodeMirror surface remains mounted over the runtime: source glyphs are transparent, while active
event locations, `markcss(...)` styles, pulses, and inline widgets remain visible. This keeps
Cmd/Ctrl-click output useful for visual performances without creating a second source document.
Code/output keeps the normal source-over-runtime overlay so code and output can be read together.
Active event source locations receive Strudel's synchronized highlights and `markcss(...)` styles.
Underscores painters such as `._pianoroll()`, `._scope()`, and `._spiral()` remain inline CodeMirror
widgets. Public painters such as `.pianoroll()` use a node-sized canvas beneath the code overlay.
The Script panel's **Visuals → Frame** toggle is on by default and removes or restores that canvas
without recompiling or stopping the pattern.

Full-frame painters reuse the board's existing Strudel scheduler query and animation frame rather
than starting the reference REPL's viewport-sized canvas and independent animation loop. The canvas
backing resolution is capped at 2× device density, resize work happens only when node dimensions
change, and offscreen canvases skip painting. Runtime messages are panel-only and never appear
inside the live canvas frame.

Editing a running Strudel node changes its persisted draft without recompiling the active pattern. `Ctrl+Enter` compiles that draft and swaps it at the next beat boundary; the previous valid pattern remains scheduled until then, and also survives a failed evaluation. `Cmd+Enter` starts a stopped node from the current draft without serving as the update gesture. Since Underscores maps a Strudel cycle to four score beats, beat-quantized updates use quarter-cycle boundaries. `Ctrl+.` or `Alt+.` stops the node. Native Strudel is available in local development, but public deployment is intentionally blocked by the [release gate](livecode-licensing.md#strudel-release-gate). Do not bypass that gate until the project has completed its AGPL obligations.

When the global timeline's **Quantize linked activation** setting is enabled, starting or stopping a linked Livecode node from its run control waits for the next selected musical boundary. The setting is available in the compact transport as `Q` plus an interval selector and in **Settings → Score & MIDI**; it is shared by all linked Livecode nodes, persists with the session, and is included in scene exchange metadata. A newly launched Strudel node gets a fresh phase origin at its actual scheduler activation, so its first event starts at the beginning of the clip rather than inheriting the transport's current cycle position. Stopping the shared transport cancels queued starts and stops. Repeatedly toggling a queued node cancels its pending change. Free-clock nodes, paused-transport changes, and already-running nodes are unaffected; a stopped linked node with **Keep last frame** still captures its final frame at the quantized stop boundary.

`Ctrl+Shift+Space` is the global rehearsal reset-toggle: from either state it sets score time to zero,
then stops or starts the global transport from zero. The shortcut remains available while an editor
owns focus.

Trusted p5, Play Core, and Strudel runtimes expose their node-local bridge through the reserved `__`
binding. `__.transport`, `__.params`, `__.canvas`, and `__.api` are the preferred concise spellings;
there is no spelled-out alias. The trusted-runtime binding is node-local; the application also exposes
its public API as `window.__`. Sandboxed HTML keeps a narrower token-scoped `window.__` message
bridge instead of receiving the trusted runtime bridge.

### Markdown and LaTeX

Markdown renders locally with KaTeX inline (`$…$`) and display (`$$…$$`) mathematics. Active markup is removed from Markdown output. In Output view it behaves as a compact rendered document editor: only the active block reveals its source, and leaving edit mode restores the rendered block without normalizing blank lines. Code view is raw source only, while Code/output remains the explicit source-and-preview layout. Markdown is scrollable within a constrained node. A LaTeX node accepts ordinary text plus inline `$…$` or `\\(…\\)` and display `$$…$$` or `\\[…\\]` delimiters; bare text is not implicitly treated as an equation. Both surfaces are deterministic DOM renderers suitable for live presentation and capture.

### HTML

HTML is trusted board content, but it runs immediately in an opaque-origin iframe with `sandbox="allow-scripts"`. It cannot read the parent application DOM, navigate the top window, or inherit parent-origin privileges. The child receives a token-scoped `window.__` bridge with only `post` and `onMessage`; the parent verifies both token and source window before responding. It remains a supported sandboxed adapter, but needs a dedicated browser acceptance pass before being treated as polished.

Browser security can block reliable parent-side rasterization of a sandboxed opaque-origin iframe. HTML presentation therefore reports an explicit export limitation instead of pretending that it has deterministic PNG capture.

### Orca

An Orca node is a real per-node grid, not a CodeMirror document. Canvas and panel modes subscribe to the same grid runtime. Click a cell to focus it; type to write; Arrow keys move; Shift+Arrow extends a selection; Delete clears; Cmd/Ctrl+A selects all; Cmd/Ctrl+C/V copies and pastes a grid rectangle; Cmd/Ctrl/Option+Enter or Space steps one frame. Focus owns these keys completely, so they never reach Excalidraw.

Linked Orca nodes tick from Underscores transport; free nodes use a per-node timer. Their native operator core currently covers `A`, `B`, `C`, `D`, `E/N/S/W`, `I`, `L`, `M`, bang triggering, and MIDI `:`, mono MIDI `%`, CC `!`, and pitch bend `?`. MIDI is sent through the existing Underscores Mixer routing. Other visible Orca glyphs are preserved in the authored grid and remain inert until their semantics are added; they are never rewritten or discarded. Orca needs a dedicated stabilization pass before its grid/runtime interaction is considered complete. The interaction and supported operator behavior are adapted from [Hundredrabbits Orca](https://github.com/hundredrabbits/Orca) under its MIT license.
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

Use `window.__.commands.list()` to retrieve the public command contract rather than calling internal UI handlers.

## Presentation and export

Livecode nodes, including shader overlays and underlays, remain visible in presentation mode. Entering presentation hides authoring chrome, the physics toolbar, and the FPS overlay; exiting restores their prior states. Presentation auto-fit preserves the authored camera when scene bounds cannot fit even at Excalidraw's minimum zoom, preventing a distant stray object from moving the visible scene offscreen. p5, Play Core, Markdown, LaTeX, Strudel's visual feedback, and Orca can be represented at deterministic state when their renderer is available. Sandboxed HTML is intentionally the exception: cross-origin security may prevent a reliable raster readback, and this limitation is reported rather than silently producing a broken export. WebGL shader capture is not yet included in deterministic scene export.
