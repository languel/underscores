# Drawerator AI Board

Drawerator is a sleek, AI-assisted infinite canvas sketchboard built on top of React, Vite, and Excalidraw. It features customized themes, automated drawing tools, satori-zen layout, and an integrated local AI chat assistant.

## Features

- **Infinite Canvas & Advanced Tools:** Standard straight line, rectangles, freehand drawing, and shapes.
- **Satori Mode:** Auto-locking properties (e.g. 0 sloppiness for straight lines/architect-mode).
- **AI Side Panel:** Chat with an integrated assistant that can help with design, concepts, or canvas queries.
- **AI Provider Routes:** Use local Ollama/LM Studio, OpenAI-compatible servers, OpenRouter, NVIDIA NIM, OpenAI, Anthropic, GitHub Copilot, or Google API-key connections. Provider-specific credentials remain in browser local storage for this development-oriented release; the Info panel explains the security trade-off and each provider's setup. NVIDIA's hosted NIM endpoint is relayed automatically when Drawerator runs through its local Vite server because that endpoint does not permit direct browser CORS requests; static deployments require a CORS-capable proxy or self-hosted endpoint.
- **Context Tagging System (@):** Reference specific canvas elements inside the chat input block:
  - `@selection` / `@canvas` (as JSON context)
  - `@selection-as-svg` / `@canvas-as-svg` (as inline SVG vectors)
  - `@selection-as-png` / `@canvas-as-png` (multimodal vision support - exports selection/canvas screenshots as base64 inline images for vision models)
  - Actions/Skills trigger tags: `@mermaid`, `@manim`, `@imagegen`
- **Autocomplete Popover:** Typing `@` inside the prompt opens a dropdown suggestion list; navigate via `ArrowUp`/`ArrowDown` and select using `Enter`/`Tab`.
- **Add Context (+) Drop-up Menu:** A quick-select footer menu to insert mentions, media elements, or skill actions into your prompt.
- **Command Palette:** Instantly run commands, toggle states, change tools, or ask questions to the AI.
- **Mono & Transparent Themes:** Mono Dark is the fresh-session default, with matching Mono Light plus paired Transparent Dark/Light presets for overlay use. Appearance settings can save complete named local themes, including panel/input/canvas/grid surfaces and role colors; switching light/dark preserves a matching built-in theme family when available. Theme colors accept CSS values such as named colors, hex, `rgb()`, `rgba()`, and modern CSS color functions.
- **Recordable Sessions & Automation:** `/history` records commands, world-coordinate strokes, coalesced scene edits, score/MIDI events, and optional presentation state. Sessions can be edited, sought, replayed from their captured baseline, exported, or saved as reusable relative/absolute sequences.
- **Object Auto-keying:** The transport records position, rotation, scale, opacity, styles, modifier/IanniX properties, and geometry snapshots into editable object automation tracks.
- **Independent Dockable Panels:** AI Assistant, Mods & FX, Script, IanniX, Mixer, Expressive Synth, Info, Settings, and Console each keep their own placement. Floating panels can coexist; panels docked to the same side become one compact icon tab group. Timeline, Mixer, and Info naturally return to the bottom dock; every other panel returns to the right dock. Shared dock dimensions remain stable while switching tabs and change only through the dock resize edges. Closing a panel returns it to its natural dock rather than removing it from the workspace.
- **Non-destructive Mods & FX:** Attach ordered geometric filters and multi-track brushes to freehand strokes or lines while retaining editable source points.
- **Modifier Baking:** Bake a complete stack or one modifier at a time. Partial bakes become independently selectable artwork while the remaining stack stays live.
- **Evolving Brushes:** Time-aware brushes can animate while the pointer is down, freeze per stroke on release, and optionally use a shared global clock.
- **Shared Script Parameters:** Brush `@param` annotations and native IanniX `ask()` declarations use one typed parameter model, producing persistent sliders that are injected into script execution.
- **Typed Script Panel:** `/script` opens one dockable CodeMirror editor with Brush / modifier, IanniX, p5 sketch, Play Core, and SVG adapters. Each type retains its own catalog, actions, execution environment, language mode, validation, and runtime-aware completions. The shared editor adds syntax highlighting, line numbers, folding, search, bracket handling, snippets, lint markers, and `Mod+Enter` execution without turning the panel into a full IDE.
- **First-Class Livecode Canvas Nodes:** `/live` creates a transparent scene host whose own source, runtime, view, parameters, and typography persist on the canvas. Selecting a node opens its shared Script-panel source; pressing Enter or clicking code edits that same source on canvas without stopping its runtime. p5 and Play Core are ready for concurrent live use; Markdown scrolls within its node and LaTeX accepts explicit inline/display delimiters. Local Strudel nodes provide event-synchronized source styling, inline underscore visualizers, and default-on full-frame public visualizers such as `.pianoroll()` through the shared draw loop, but remain public-release-gated; Orca remains experimental, while sandboxed HTML awaits browser acceptance coverage. See [Livecode Nodes](notes/livecode.md) and the [release gate](notes/livecode-licensing.md).
- **Semantic Media Streams and Actors:** `/video-input`, `/media-input`, `/holistic`, and `/mapping` cover webcam/media acquisition, performance-protected MediaPipe Holistic processing, a shared semantic feature ontology, and persistent position/freedraw bindings. Inputs can remain panel-only or gain optional transformable canvas views; hidden views remain usable upstream. Holistic hosts, display filters, point/line styling, processing ceilings, and the default-on 8 FPS performance cap persist with the scene and seed the next processor; completed landmarks are visually interpolated at up to 30 FPS without fabricating semantic frames. Native grouped landmark snapshots and exact in-place PNG snapshots share the live display choices; trusted p5, Play Core, and Strudel code reads transient frames through `__.streams`. See [Media streams](notes/media-streams.md).
- **Canvas-First Relationships and Physics:** `/physics` adds persistent bodies, colliders, sensors, populations, named collision layers, canvas-authored Axle/Weld pivots, event routes, and point-level curve sculpting without replacing the infinite canvas with a node editor. A lazy deterministic Rapier worker handles rigid dynamics while lightweight geometry adapters connect stable curve anchors and typed streams. Multi-selected physics bodies expose shared batch controls in Properties, and Live pose (or temporary `Cmd`-drag) lets constraints solve interactively without advancing transport time. See [Relationship and physics engine](notes/physics.md).
- **Scriptable Brushes:** Edit, import, rename, fork, or apply brush JavaScript in the standalone **Script** panel. The Run action applies the active brush draft to selected freehand or line paths.
- **First-class SVG Documents:** `/svg` opens the shared CodeMirror Script panel in SVG mode. Press Play to create or update a scene-persisted, source-preserving SVG, or use **From selection** to convert native geometry in place. Valid source updates after a short typing pause while malformed drafts retain the last valid render. Canvas, Properties, Outliner, and source selection remain synchronized; paths support direct anchor/handle editing plus explicit insertion and removal, and native two-point lines convert to semantic two-anchor SVG paths rather than rough-rendering duplicates. Complete path syntax and nested transforms remain editable, matched CSS rules and SMIL/CSS/Looom timing are inspectable, SVG subpaths can receive Curve/Cursor/Trigger roles directly, and scripts remain inert until explicitly trusted in the sandbox runtime.
- **Canonical Layer Stack & Hierarchy:** One back-to-front scene order drives native Excalidraw paint order, the front-to-back Outliner, and Drawerator ordering actions. Drag an Outliner row above or below another row to reorder it predictably; drop into another row to group, and use `Mod+G` / `Mod+Shift+G` to group or ungroup. IanniX runs add a separate semantic hierarchy—**Score → `setGroup` → canvas groups → objects**—without conflating score membership with transform groups.
- **Trusted p5 Frames & Themed Export:** Attach a bundled p5 sketch to a rectangle or frame for an interactive, scene-persisted canvas. PNG export captures the live p5 output alongside Excalidraw geometry, honors the active light/dark theme, uses device-pixel-ratio rendering for a sharp result, and can retain transparency when requested.
- **Performance Monitor & Scene Baking:** `/performance` (or `/perf`) opens a compact monitor for browser FPS, long frames, scene-change pressure, changed elements, object counts, and Chromium heap use. It can float over the canvas or attach to Console, where it follows Console visibility instead of creating another bottom panel. Select native objects, rendered modifier stacks, p5 frames, media streams, or a group and use **Bake Selection to PNG** (`/bake png`) to replace them with one current-theme image in a single undoable transaction, or **Convert / Bake Selection to SVG** (`/bake svg`) to retain a first-class editable vector document. See [performance monitor and review](notes/performance.md).
- **Play Core Frames:** Attach a trusted local Play Core-style ASCII program to a rectangle or frame. Its `settings`, `boot`, `pre`, `main`, `post`, and pointer lifecycle run inside the same Drawerator bridge as p5, including live `@param` controls, scene queries, events, and transport.
- **Canonical Bézier Paths:** Explicitly convert native lines or freehand paths into editable cubic Béziers. Versioned local-space anchors and handles remain canonical while an adaptive Excalidraw polyline supplies native selection, transforms, exports, and hit-testing.
- **Drawerator Global Grid:** A scene-wide rectangular grid supports independent spacing and subdivisions, rotated origins, major/minor rendering, hard or magnetic snapping, configurable input/transform/point/generated targets, and beat/bar/second/frame conversion. It renders dotted while snapping is off and solid while snapping is active. Grid state is persisted with scenes and restored locally for new scenes.
- **Selection Filter:** The bottom Grid panel can limit canvas and Outliner selection to any combination of IanniX curves, cursors, and triggers. “Anything” restores normal all-object selection, and the workspace preference is remembered locally.
- **IanniX Score Objects:** Give any selected canvas object one score role—Curve, Cursor, or Trigger—from the dockable **IanniX** panel. A compact global transport drives each object's local clock while cursor motion and trigger evaluation continue to use the editable core geometry beneath Mods & FX.
- **Trusted IanniX Script Import:** Explicitly trusted `.iannix` scripts use deterministic IanniX-style `run()` and math helpers, map supported score commands through Drawerator's recorder, and report unsupported commands.
- **IanniX Command Palette Bridge:** `/ix <command>` runs a trusted one-line IanniX command through the same compatibility route as the IanniX panel. `/ix clear` clears the scene without invoking Excalidraw's confirmation or changing the themed canvas background.
- **Cached Score Playback:** Canonical Bézier metrics, prepared trigger paths, metadata, and bounds are cached during playback; collision checks use broad-phase rejection and transport/MIDI updates are throttled without reducing imported curve fidelity.
- **Custom Canvas Backgrounds:** Set custom colors (including presets and hex input) from the hamburger main menu.
- **Toggles for Interface Elements:** Control the visibility of toolbar hints and bottom alerts right from the main menu.
- **Single-File Compilation:** Built to be easily bundled as a single self-contained HTML page.

## Keyboard Shortcuts

| Shortcut | Description |
| --- | --- |
| `Cmd + /` or `Ctrl + /` | Toggle Command Palette |
| `Cmd + Ctrl + Z` | Toggle Satori (Zen) Mode |
| `Ctrl + Opt + T` | Toggle the global transport (`Cmd + Ctrl + T` remains supported) |
| `Ctrl + Shift + Space` | Reset the global transport to `t = 0` and toggle playback from zero |
| `Shift + Left Arrow` | Jump the timeline to its start (and reset physics when it is linked to transport) |
| `Ctrl + Opt + R` | Start / stop session recording |
| `Cmd + ,` | Toggle the Settings sidebar |
| `Ctrl + Opt + A` | Toggle AI Assistant Chat Sidebar |
| `Ctrl + Opt + P` | Toggle Mods & FX Sidebar |
| `Ctrl + Opt + B` | Open the Script panel in Brush / modifier mode |
| `Cmd + B` | Collapse / reveal the left dock |
| `Cmd + Opt + B` | Collapse / reveal the right dock |
| `Cmd + Shift + B` | Collapse / reveal the bottom dock |
| `Ctrl + Shift + Backspace` | Clear the scene through the no-popup IanniX route |
| `Ctrl + Opt + Shift + D` | Reset the complete workspace to its initial Mono Dark pen-mode state |
| `Cmd + Opt + P` | Pin / unpin Modifiers sidebar |
| `Opt + Shift + D` | Toggle Dark / Light Theme |
| `[` | Decrease stroke width (for Pen and Line tools) |
| `]` | Increase stroke width (for Pen and Line tools) |
| `Shift` + `[` | Decrease stroke width by 0.1 |
| `Shift` + `]` | Increase stroke width by 0.1 |

The same complete reset is available from **Settings → Board → Reset to defaults** and `/reset defaults`. It restores every panel to its natural dock, collapses all docks and canvas chrome, selects the unlocked pen, restores sharp zero-sloppiness shapes, and disables the spatial grid and snapping.
| `Cmd + Shift + 0` or `Ctrl + Shift + 0` | Toggle Canvas Background Transparency |
| `Escape` | Dismiss Command Palette, Context overlays, and Autocomplete popups |

Fresh sessions start in Mono Dark Satori pen mode with left, right, and bottom docks collapsed, the global grid hidden, and snapping off. Any local workspace preferences restore on later launches.

### Code editor shortcuts and themes

When a Drawerator CodeMirror editor has focus, it owns its keyboard session: source selection, navigation, clipboard, undo/redo, Find, completion, and execution shortcuts never operate on the canvas. Use `Cmd/Ctrl + A` to select source, `Cmd/Ctrl + Z` and `Cmd/Ctrl + Shift + Z` to undo/redo source edits, `Cmd/Ctrl + F` to search, `Tab` or `Enter` to accept a completion, arrow keys to navigate, `Escape` to close completion/search, and `Cmd/Ctrl + Enter` to run the active script. The active Script Info panel repeats this reference.

**Settings → Board → Code editor palette** is independent from the surrounding Drawerator theme. **Drawerator adaptive** follows the active board colors and surface; **Transparent adaptive** retains adaptive syntax with no editor or gutter fill; **Mono adaptive** follows its light/dark mode while deliberately rendering syntax in grayscale; **VS Code adaptive** follows the active light/dark mode with familiar conventional syntax colors; and **Teaching** uses especially distinct, high-contrast colors while keeping the editor surface transparent. The Board theme presets also include VS Code Dark and Light, so the entire workspace can follow either skin when desired.

See [Project status](notes/project-status.md) for the current release checkpoint, known compositor boundary, and the next repository-cleanup phase.

## Mods & FX workflow

1. Select one freehand stroke or line and open **🛠️ Mods & FX**, or enable **Mod Pen** before drawing.
2. Add filters or brushes to the ordered stack. The source control points remain editable. An empty Mod Pen stack draws a normal Excalidraw stroke; an open Script editor never acts as an implicit brush.
3. Use the compact header actions to bypass the stack, hide/show the original, convert between line and freehand, restore a recoverable source, or bake. Hover an action for its description.
4. **Bypass Stack** temporarily shows the editable source without evaluating modifiers. **Hide Original** removes only the source from the result. They are mutually exclusive, and the next-stroke Hide Original preference persists until changed.
5. Use the Apply action on a modifier card to bake only that modifier, or bake the full stack from the panel header.
6. Baked tracks are native, selectable Excalidraw elements. Full bake clears the stack; partial bake preserves every remaining modifier in order.

Modifier operations participate in Excalidraw undo/redo. The panel icon is the unified placement control: click to activate its dock tab, drag to float or dock, and right-click for explicit placement or close actions. A click alone never detaches a panel. Resize a side dock from its canvas-facing edge, the bottom dock from its top edge, or a floating panel from its lower-right corner. Dragging a dock below its minimum size collapses it; drag or double-click its hidden edge handle to restore it. `Cmd + Opt + P` toggles Mods & FX between floating and right-docked placement.

The standalone **Script** panel is a code editor, not a second drawing mode. Choose **Brush / modifier** as its script type. **Run** is enabled for selected freehand or line paths and appends the active draft, including unsaved code and parameter values, to each selected path. **Save** updates the attached modifier currently being edited. Built-in presets remain locked; **Save As** creates a user brush and, when editing a modifier, replaces only that modifier in the stack with the new brush. Press `F2` or double-click a custom script selector to rename it in place; new scripts immediately enter rename mode.

## Play Core workflow

1. Open **Script** and choose **Play Core**. The program selector is a local working-file catalog: choose a saved program, then use **Save**, **Duplicate**, **New**, **Import**, or **Delete** just as in the p5 editor. Its separate **Original play.core examples** group provides local, editable starters adapted from [ertdfgcvb/play.core](https://github.com/ertdfgcvb/play.core); choosing one creates an ordinary saved Drawerator program. Saving a linked program updates every Play Core host using that file. Press Play with no selection to create a 640 × 360 frame; select a rectangle or frame first to attach the selected program in place. The host border becomes transparent, matching p5 and SVG script frames.
2. Selecting exactly one Play Core host loads that host’s canonical source and saved-file identity into the editor. Selecting a different file from the dropdown attaches it to that host immediately; active valid typing is never replaced by a stale canvas snapshot.
3. Programs use the play.core lifecycle: `export const settings`, then optional `boot`, `pre`, `main`, `post`, `pointerMove`, `pointerDown`, and `pointerUp` functions. `main({ x, y, index }, context, cursor, buffer)` returns a character or a cell object for each ASCII cell. `context` includes time, frame, cell dimensions, host dimensions, and settings; `cursor` is in cell coordinates and exposes its previous state through `cursor.p`.
4. Declare `// @param threshold = 0.55 (0..1, step: 0.01)` to create a persistent host control. Read it at runtime through `__.params.threshold`. Object parameters use `(object)` and resolve to a live Drawerator canvas object.
5. Use static ES imports for the offline Play Core utility suite. The single-file build includes `/src/modules/num.js`, `sort.js`, `vec2.js`, `vec3.js`, `sdf.js`, `string.js`, `buffer.js`, `drawbox.js`, and `color.js`, so `import { map } from '/src/modules/num.js'` is portable. Named, default, and namespace imports are supported; dynamic or non-bundled imports fail clearly rather than reaching the network.
6. Every Play Core program receives the shared live `__` bridge: host/object identity, `params`, `currentColor`, theme colors, canvas queries, events, transport, and the public API. The legacy `drawerator` spelling remains available for compatibility. See the Play Core Info panel for the complete reference.

The shared p5 / Play Core bridge and versioned public `window.drawerator` API are documented in [Drawerator Script API](notes/drawerator-api.md). Hover or focus the **Script type** control to see the active adapter’s in-app quick reference; p5 and Play Core include this API reference directly in the Info panel.
7. `__.canvas`, `__.events`, and `__.transport` are the same read-only score bridge available to p5. Source recompiles when it is valid; invalid drafts remain in the editor without replacing the last working frame. Programs run locally and are therefore trusted code.

## SVG object workflow

1. Open the existing **Script** panel in **SVG** mode with `/svg`, author a complete `<svg>` document, and press Play to create a selectable, transformable SVG host on the canvas. After that first run, every valid source change updates the canvas automatically; incomplete or invalid markup leaves the last valid render in place. Manual Play provides an explicit history checkpoint.
2. Select native canvas geometry and choose **From selection** in the SVG script adapter to export it through Drawerator's existing vector exchange path, replace the originals in one undoable scene change, and continue with the exported markup. Converted neutral foreground marks use SVG `currentColor`, so they follow Drawerator's light/dark foreground while deliberate colors remain unchanged.
3. Click the rendered SVG directly to select its scene host. Command-click a visible path or compound-path subpath to edit spline-style anchors and handles; double-clicking a segment enters editing and inserts one anchor at that exact location. Use **Option-click** in empty SVG space to start an SVG pen path; subsequent clicks add straight anchors, click-drag adds a cubic handle, and Enter or Escape finishes the pen session. Option-drag breaks smooth handle coupling, Delete removes one, and Escape exits. Coincident endpoints across compound subpaths behave as one joint by default, including multi-way junctions. Select a shared endpoint and use **Detach joint** in Properties before dragging when that branch should separate deliberately. Select a group or primitive and Command-drag its highlighted bounds to move it by authoring a local `transform`, without flattening its descendants.
4. Open **Properties** for the selected SVG to edit document dimensions, viewBox, the element tree, attributes, matched CSS rules, animation lanes, runtime clock, and trust policy. Compound `<path>` data exposes each `M…` subpath as a child without splitting the authored XML node. Assign Curve, Cursor, or Trigger directly to that SVG component, or explicitly extract it as a native Drawerator spline. In-place edits rewrite only the affected source range and preserve its siblings.
5. Scene JSON and `.excalidraw` exchange preserve the SVG source in the object's custom data. **Copy selection SVG** copies a selected SVG object's authored source intact; ordinary pasted SVG continues to import as native editable canvas geometry.

SVG objects participate in selection, transforms, opacity, naming, Outliner order, history, score evaluation, and scene persistence. Structured editing assigns stable node identities and stores canonical Drawerator metadata inside the SVG, while the host keeps only a revision-keyed cache. Complete path syntax—including arcs and compact relative commands—and nested transform stacks are editable through inverse-CTM pointer mapping. Normal rendering is a script-free Shadow DOM document synchronized to Drawerator transport; JavaScript can run only after explicit trust in a sandboxed, capability-limited iframe. Looom remains authored SVG and is represented in the common timing graph. Native/SVG layer interleaving and whole-board time-specific export remain unified-compositor work. See [first-class SVG architecture](notes/svg.md).

## IanniX score workflow

1. Select one or more canvas objects and open the independent **IanniX** panel with `/iannix`. Multi-selection can assign a shared role in one undoable action; Drawerator generates unique role labels automatically.
   In the **Data** tab, same-role multi-selections expose one shared property editor. Mixed values appear blank, each edit applies to the entire compatible selection, and label templates such as `trigger_${n}` expand in stable scene order (`trigger_1`, `trigger_2`, and so on).
2. Assign exactly one role for this first slice: **Curve**, **Cursor**, or **Trigger**. The role and its properties belong only to that object.
3. For a cursor, choose a Curve object as its support path. The cursor object itself becomes the moving playhead; its source geometry remains editable at rest.
4. Set the object's start, duration, rate, and loop mode. These derive a local object clock from the global transport and are independent of modifier or evolving-brush clocks.
5. Press Play in the transport. Switch its ruler between frames, SMPTE-style timecode, and bars·beats·16ths while the current frame remains visible in every mode. Drag the timeline playhead to seek, drag the loop handles or band to edit the range, or Shift-drag the lane to mark a new loop. Tempo, meter, FPS, and MIDI clock synchronization remain available in the transport and Score & MIDI settings. The cursor's complete visible Mods & FX result moves along the underlying curve geometry, while triggers pulse once when a cursor enters their core geometry. A point-like freedraw trigger uses its visible stroke diameter as its collision footprint—even when Excalidraw stores several coincident samples—so its snapped point remains the center and stroke width becomes a trigger-size parameter. Drag the stopwatch icon to float or bottom-dock the transport; right-click it for the same placements.
6. A Trigger can optionally emit MIDI using IanniX-compatible `/note`, `/notef`, `/cc`, or `/ccf` URL patterns. Templates cover IanniX XY mapping, fixed notes, cursor-relative pitch, and cursor-driven CC. Cursor/Curve base-note, octave-range, and MIDI-channel controls make intersection position musically meaningful; **Test message** previews the exact resolved event before playback. During score playback note-on occurs at geometric entry and note-off at exit; **Minimum duration** is only a fallback for shorter contacts. The activity highlight follows the same gate. Overlapping notes are voice-tracked, and trigger latching can be shared across cursors or disabled for independent retriggering.
7. Open `/mixer` to route each score MIDI channel through one or more tracks. Every track has its own destination, instrument, program, MIDI channel, Enabled, Mute, and Solo state. Destinations can be Internal GM, an Expressive Synth preset, or a concrete Web MIDI output; the same channel can layer several tracks. MIDI clock keeps a separate external destination in **Settings → Score & MIDI**. Track routing persists locally and in complete scene exports. See [Mixer and score-output routing](notes/mixer.md).
8. **Internal GM Synth** is the lightweight General MIDI instrument available to internal mixer tracks. Pressing **Play**, **Enable audio**, or an audio test after reload satisfies the browser's user-gesture requirement. **Test audio** sends a direct C4 diagnostic, **Test Web Audio** isolates the browser's raw audio output, and **Reset audio** recreates a stuck synth and AudioContext. Channel 10 is percussion. Physical Web MIDI remains browser-controlled; the Codex embedded harness may deny device enumeration despite a saved site allow entry, so use an external browser for hardware I/O when necessary.
9. **Expressive Synth** is an internal mixer instrument for continuous, independently pitched voices. Open `/synth` to audition factory programs or save scene-owned programs with their own model, ADSR, tone, pressure, transpose, glide, and vibrato settings; every mixer track can select a different program, while several tracks may intentionally share one. Linked cursors can sound continuously, while a Trigger set to **Continuous glissando** starts on entry, follows the live intersection Y at fractional pitch, and releases on exit—so its geometric length is its duration. `/synth demo` remains a development command for creating the compact Metastaseis-inspired study. Open `/info` for the dockable/floating contextual help view. See [Expressive Synth architecture and glissando study](notes/expressive-synth.md).
10. Use the **Scene data** section or **Export Drawerator .excalidraw** in the main menu to export/import a complete Drawerator scene or copy/paste JSON through the clipboard when a browser blocks downloads. Both paths preserve Mods & FX and IanniX custom properties; selection exchange includes hidden runtime cursor hosts and their linked curves, then paste remaps their internal IDs and links. **Copy selection SVG** places vector SVG on the system clipboard; pasting SVG from Drawerator, Excalidraw, tldraw, or another vector editor creates native editable lines, freehand paths, rectangles, and ellipses instead of a raster image. Imported paths can then be assigned score roles normally.
11. **Import trusted .iannix** executes compatible scripts after an explicit trust warning. Every run records a stable score identity and label, so its generated objects appear together beneath a top-level **Score** row in the Outliner. `setGroup` commands create the next nested semantic level; running `setGroup current "section A"` moves that object to **IanniX · section A** immediately. These virtual score rows do not alter Excalidraw `groupIds`, so canvas grouping, transforms, and score organization remain independent. Native `ask()` declarations automatically become persistent sliders and can be refined with brush-compatible `@param` annotations. This compatibility mode is executable JavaScript, not a security sandbox; unsupported commands are reported.

Imported IanniX curves preserve `setPointAt` cubic controls as canonical Drawerator Béziers. Ordinary Excalidraw lines remain native until **Convert to Bézier** or `/bezier convert` is invoked. Shift-right-click a line, freehand path, rectangle, diamond, or ellipse to convert it to a native path, canonical spline, freehand pencil, or source-preserving SVG. The same menu can assign Cursor, Curve, or Trigger score roles, or create and attach runtime cursors with **Add Cursor to Selected Curves**. In Bézier edit mode, drag anchors or handles, Option-drag to break smooth coupling, double-click a segment to insert an exact de Casteljau anchor, Delete to remove an anchor, and Escape to exit. `/iannix export` writes selected canonical curves back to equivalent `setPointAt` commands.

The **Properties** panel exposes native element fields and nested Drawerator metadata. Filter by a field path (for example `strokeWidth`, `role`, or `group`) to focus it; compatible primitive and enum fields are shared across a multi-selection, even when their current values differ. Editing any such field updates every compatible selected object in the same Excalidraw history action.

Global Grid snapping is available from the compact bottom **Grid** panel. Enable visibility and snapping independently, choose minor or major resolution, and select the target classes to affect: **Input** affects authored samples, **Transforms** preserves relative selection geometry with one snap delta, **Points** affects editable path points, and **Generated** is opt-in for generated output. Converted Bézier paths keep their canonical anchors and handles synchronized in both command-click editing and ordinary selected-anchor editing; native line point edits retain their selected point metadata while snapping.

The adjacent **Select** controls filter canvas clicks, marquee selection, runtime cursor hits, and Outliner selection by IanniX role. Role toggles are inclusive, so Curve and Trigger can be enabled together; disabling the last role returns to Anything.

Mods & FX remains the rendering layer: changing or baking a brush does not redefine score topology. See `notes/iannix.md` for the phase-one schema, timing model, and extension points.

## Recording and automation workflow

1. Open **History** with `/history`, then Record. Recording begins immediately and does not force transport playback; `/record play` starts both.
2. Draw with native or custom brushes and use commands, panels, modifiers, IanniX, or MIDI normally. Strokes preserve scene-coordinate samples and exact final element snapshots.
3. Stop, edit/mute/reorder steps, seek, choose whether presentation, pointer, and MIDI play back, then Play. Full sessions restore their captured baseline by default.
4. Save one action or a time range as a reusable sequence. Relative insertion remaps IDs and places a fresh copy at the canvas anchor; absolute insertion preserves authored coordinates.
5. Enable Auto-key in the transport to capture object transforms, supported styles, modifier/IanniX properties, and geometry snapshots at global score time.

The same registry powers menu, shortcut, slash, API, and AI execution. Any stable command ID can be invoked with `/command <id> <json>`. External tools can subscribe to events or register normalized input adapters through `window.drawerator`. See `notes/history-automation.md` for the session format, API, interpolation rules, and adapter contract.

### AI automation

The AI Assistant receives a curated, execution-enforced subset of Drawerator's stable command registry. It emits ordered actions as command tags, for example:

```xml
<drawerator-command id="scene.create.objects">{"objects":[{"type":"rectangle","x":120,"y":160,"width":200,"height":100}]}</drawerator-command>
```

This surface supports creating, patching, and deleting scene objects; assigning score roles; updating timing, transport, grid, and safe board appearance settings; applying Brush scripts; and adding keyframes to supported Excalidraw properties. IanniX and Brush requests receive a compact language-specific authoring contract in addition to this catalog. Generated IanniX source must use an IanniX lifecycle (`makeWithScript()` or `madeThroughGUI()`) and documented `run("…")` commands; generated Brushes must be `(points, globals) => tracks` functions. Drawerator preflights both forms before saving or running them, so generic browser JavaScript is rejected with an actionable chat error instead of becoming a broken script. Commands share the same application routes as the UI, API, history, and slash-command paths. Credentials, provider endpoints, browser permissions, and all commands not explicitly marked for AI remain unavailable to models.

## Development

```bash
npm run dev -- --port 8089
npm test
npm run lint
npm run build
```

Modifier-stack, score-engine, command, session, macro, input, IanniX-import, and automation behavior are covered by Node's built-in test runner. See `notes/modifier-stack.md`, `notes/iannix.md`, and `notes/history-automation.md` for their data models and implementation invariants.

The IanniX performance path is intentionally fidelity-first: imported geometry remains adaptively sampled, while repeated metrics, trigger preparation, collision broad-phase checks, and UI commits are cached or coalesced. See the performance checkpoint in `notes/iannix.md` for profiling results and future worker/bundle-splitting directions.

## Command Palette Commands

Access the command palette using `Cmd + /` or `Ctrl + /` and select from options like:
- **Toggle AI Assistant `/chat`**
- **Toggle Mods & FX `/mods`**
- **Toggle Settings `/settings`**
- **Toggle Console / Info `/console`**
- **Toggle Performance Monitor `/performance`, `/perf`**
- **Toggle SVG editor `/svg`**
- **Toggle IanniX `/iannix`**
- **Toggle Transport `/transport`**
- **Convert / edit Bézier paths `/bezier convert`, `/bezier edit`**
- **History `/history`**
- **Start / pause / stop recording `/record …`**
- **Play / seek History `/history play`, `/history seek …`**
- **Save / insert sequence `/macro …`**
- **Toggle Canvas Background Transparency**
- **Toggle Satori Mode (Zen) /satori**
- **Toggle Dark/Light Theme**
- **Toggle AI Assistant Chat**
- **Reset Zoom & Pan View**
- **Clear Sketchboard Canvas**
