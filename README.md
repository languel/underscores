# Drawerator AI Board

Drawerator is a sleek, AI-assisted infinite canvas sketchboard built on top of React, Vite, and Excalidraw. It features customized themes, automated drawing tools, satori-zen layout, and an integrated local AI chat assistant.

## Features

- **Infinite Canvas & Advanced Tools:** Standard straight line, rectangles, freehand drawing, and shapes.
- **Satori Mode:** Auto-locking properties (e.g. 0 sloppiness for straight lines/architect-mode).
- **AI Side Panel:** Chat with an integrated assistant that can help with design, concepts, or canvas queries.
- **Context Tagging System (@):** Reference specific canvas elements inside the chat input block:
  - `@selection` / `@canvas` (as JSON context)
  - `@selection-as-svg` / `@canvas-as-svg` (as inline SVG vectors)
  - `@selection-as-png` / `@canvas-as-png` (multimodal vision support - exports selection/canvas screenshots as base64 inline images for vision models)
  - Actions/Skills trigger tags: `@mermaid`, `@manim`, `@imagegen`
- **Autocomplete Popover:** Typing `@` inside the prompt opens a dropdown suggestion list; navigate via `ArrowUp`/`ArrowDown` and select using `Enter`/`Tab`.
- **Add Context (+) Drop-up Menu:** A quick-select footer menu to insert mentions, media elements, or skill actions into your prompt.
- **Command Palette:** Instantly run commands, toggle states, change tools, or ask questions to the AI.
- **Recordable Sessions & Automation:** `/history` records commands, world-coordinate strokes, coalesced scene edits, score/MIDI events, and optional presentation state. Sessions can be edited, sought, replayed from their captured baseline, exported, or saved as reusable relative/absolute sequences.
- **Object Auto-keying:** The transport records position, rotation, scale, opacity, styles, modifier/IanniX properties, and geometry snapshots into editable object automation tracks.
- **Independent Dockable Panels:** AI Assistant, Mods & FX, Settings, and Console / Info each keep their own visibility, size, and left/float/right placement. Floating panels can coexist; panels docked to the same side become one compact tab group whose active tab shows its icon and label. Transport uses the same interaction for floating or bottom docking. Visibility, active tabs, collapsed docks, and layouts persist independently; toggle panels with `/chat`, `/mods`, `/settings`, `/console`, and `/transport`.
- **Non-destructive Mods & FX:** Attach ordered geometric filters and multi-track brushes to freehand strokes or lines while retaining editable source points.
- **Modifier Baking:** Bake a complete stack or one modifier at a time. Partial bakes become independently selectable artwork while the remaining stack stays live.
- **Evolving Brushes:** Time-aware brushes can animate while the pointer is down, freeze per stroke on release, and optionally use a shared global clock.
- **Shared Script Parameters:** Brush `@param` annotations and native IanniX `ask()` declarations use one typed parameter model, producing persistent sliders that are injected into script execution.
- **Scriptable Brushes:** Edit or fork brush JavaScript in the Mods & FX **Script** tab. The editor is inert until its script is saved into the active stack.
- **Canonical Bézier Paths:** Explicitly convert native lines or freehand paths into editable cubic Béziers. Versioned local-space anchors and handles remain canonical while an adaptive Excalidraw polyline supplies native selection, transforms, exports, and hit-testing.
- **Drawerator Global Grid:** A scene-wide rectangular grid supports independent spacing and subdivisions, rotated origins, major/minor rendering, hard or magnetic snapping, configurable input/transform/point/generated targets, and beat/bar/second/frame conversion. Grid state is persisted with scenes and restored locally for new scenes.
- **IanniX Score Objects:** Give any selected canvas object one score role—Curve, Cursor, or Trigger—from the dockable **IanniX** panel. A compact global transport drives each object's local clock while cursor motion and trigger evaluation continue to use the editable core geometry beneath Mods & FX.
- **Trusted IanniX Script Import:** Explicitly trusted `.iannix` scripts use deterministic IanniX-style `run()` and math helpers, map supported score commands through Drawerator's recorder, and report unsupported commands.
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
| `Ctrl + Opt + R` | Start / stop session recording |
| `Cmd + ,` | Toggle the Settings sidebar |
| `Ctrl + Opt + A` | Toggle AI Assistant Chat Sidebar |
| `Ctrl + Opt + P` | Toggle Mods & FX Sidebar |
| `Ctrl + Opt + B` | Open the Mods & FX Script tab |
| `Cmd + B` | Collapse / reveal the left dock |
| `Cmd + Opt + B` | Collapse / reveal the right dock |
| `Cmd + Opt + P` | Pin / unpin Modifiers sidebar |
| `Opt + Shift + D` | Toggle Dark / Light Theme |
| `[` | Decrease stroke width (for Pen and Line tools) |
| `]` | Increase stroke width (for Pen and Line tools) |
| `Cmd + Shift + 0` or `Ctrl + Shift + 0` | Toggle Canvas Background Transparency |
| `Escape` | Dismiss Command Palette, Context overlays, and Autocomplete popups |

## Mods & FX workflow

1. Select one freehand stroke or line and open **🛠️ Mods & FX**, or enable **Mod Pen** before drawing.
2. Add filters or brushes to the ordered stack. The source control points remain editable. An empty Mod Pen stack draws a normal Excalidraw stroke; an open Script editor never acts as an implicit brush.
3. Use the compact header actions to bypass the stack, hide/show the original, convert between line and freehand, restore a recoverable source, or bake. Hover an action for its description.
4. **Bypass Stack** temporarily shows the editable source without evaluating modifiers. **Hide Original** removes only the source from the result. They are mutually exclusive, and the next-stroke Hide Original preference persists until changed.
5. Use the Apply action on a modifier card to bake only that modifier, or bake the full stack from the panel header.
6. Baked tracks are native, selectable Excalidraw elements. Full bake clears the stack; partial bake preserves every remaining modifier in order.

Modifier operations participate in Excalidraw undo/redo. The panel icon is the unified placement control: click to activate its dock tab, drag to float or dock, and right-click for explicit placement or close actions. A click alone never detaches a panel. Resize a side dock from its canvas-facing edge or a floating panel from its lower-right corner. Dragging a dock below its minimum width collapses it; drag or double-click its hidden edge handle to restore it. `Cmd + Opt + P` toggles Mods & FX between floating and right-docked placement.

The **Script** tab is a code editor, not a second drawing mode. **Save** updates the attached modifier currently being edited. Built-in presets remain locked; **Save As** creates a user brush and, when editing a modifier, replaces only that modifier in the stack with the new brush.

## IanniX score workflow

1. Select one or more canvas objects and open the independent **IanniX** panel with `/iannix`. Multi-selection can assign a shared role in one undoable action; Drawerator generates unique role labels automatically.
2. Assign exactly one role for this first slice: **Curve**, **Cursor**, or **Trigger**. The role and its properties belong only to that object.
3. For a cursor, choose a Curve object as its support path. The cursor object itself becomes the moving playhead; its source geometry remains editable at rest.
4. Set the object's start, duration, rate, and loop mode. These derive a local object clock from the global transport and are independent of modifier or evolving-brush clocks.
5. Press Play in the transport. Switch its ruler between frames, SMPTE-style timecode, and bars·beats·16ths while the current frame remains visible in every mode. Drag the timeline playhead to seek, drag the loop handles or band to edit the range, or Shift-drag the lane to mark a new loop. Tempo, meter, FPS, and MIDI clock synchronization remain available in the transport and Score & MIDI settings. The cursor's complete visible Mods & FX result moves along the underlying curve geometry, while triggers pulse once when a cursor enters their core geometry. Drag the stopwatch icon to float or bottom-dock the transport; right-click it for the same placements.
6. A Trigger can optionally emit MIDI using IanniX-compatible `/note`, `/notef`, `/cc`, or `/ccf` URL patterns. Templates cover IanniX XY mapping, fixed notes, cursor-relative pitch, and cursor-driven CC. Cursor/Curve base-note and octave-range controls make intersection position musically meaningful; **Test message** previews the exact resolved event before playback. Overlapping notes are voice-tracked, and trigger latching can be shared across cursors or disabled for independent retriggering. MIDI routing, clock direction, and score tempo live in global **Settings → Score & MIDI**.
7. **Internal GM Synth** is a lightweight Web Audio fallback when a Web MIDI destination is absent or disconnected. Selecting it or pressing **Enable audio** after reload satisfies the browser's user-gesture requirement. The compact program section assigns GM programs per melodic channel; channel 10 is percussion. The selected output, fallback policy, program assignments, and History MIDI-armed state are remembered in local storage. Recorded MIDI stays raw and destination-independent, so the active route is chosen at replay time.
8. Use the **Scene data** section to export/import a complete Drawerator scene or copy/paste selection JSON. Both paths preserve Mods & FX and IanniX custom properties; selection paste remaps internal IDs and cursor/curve links.
9. **Import trusted .iannix** executes compatible scripts after an explicit trust warning. Native `ask()` declarations automatically become persistent sliders and can be refined with brush-compatible `@param` annotations. This compatibility mode is executable JavaScript, not a security sandbox; unsupported commands are reported.

Imported IanniX curves preserve `setPointAt` cubic controls as canonical Drawerator Béziers. Ordinary Excalidraw lines remain native until **Convert to Bézier** or `/bezier convert` is invoked. In Bézier edit mode, drag anchors or handles, Option-drag to break smooth coupling, double-click a segment to insert an exact de Casteljau anchor, Delete to remove an anchor, and Escape to exit. `/iannix export` writes selected canonical curves back to equivalent `setPointAt` commands.

Global Grid snapping is available from the compact bottom **Grid** panel. Enable visibility and snapping independently, choose minor or major resolution, and select the target classes to affect. Converted Bézier paths keep their canonical anchors and handles synchronized in both command-click editing and ordinary selected-anchor editing; native line point edits retain their selected point metadata while snapping.

Mods & FX remains the rendering layer: changing or baking a brush does not redefine score topology. See `notes/iannix.md` for the phase-one schema, timing model, and extension points.

## Recording and automation workflow

1. Open **History** with `/history`, then Record. Recording begins immediately and does not force transport playback; `/record play` starts both.
2. Draw with native or custom brushes and use commands, panels, modifiers, IanniX, or MIDI normally. Strokes preserve scene-coordinate samples and exact final element snapshots.
3. Stop, edit/mute/reorder steps, seek, choose whether presentation, pointer, and MIDI play back, then Play. Full sessions restore their captured baseline by default.
4. Save one action or a time range as a reusable sequence. Relative insertion remaps IDs and places a fresh copy at the canvas anchor; absolute insertion preserves authored coordinates.
5. Enable Auto-key in the transport to capture object transforms, supported styles, modifier/IanniX properties, and geometry snapshots at global score time.

The same registry powers menu, shortcut, slash, API, and AI execution. Any stable command ID can be invoked with `/command <id> <json>`. External tools can subscribe to events or register normalized input adapters through `window.drawerator`. See `notes/history-automation.md` for the session format, API, interpolation rules, and adapter contract.

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
