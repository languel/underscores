# Underscores

_Underscores_ is an infinite creative computational canvas for performance,
teaching, exploration, and research. Drawing, code, sound, motion, physics,
collaboration, and time meet in one canvas _sketch_.

Think of it as a quiet collage surface for live work: put a p5 sketch beside a
GLSL shader, a Strudel song, a Markdown slideshow, a score, a physics world, or
a camera stream. Each environment remains editable and can share the canvas,
the clock, typed streams, and the assistant.

## Get started

1. Open Underscores. A fresh browser with no saved sketch opens the welcome
   screen; returning sessions restore their local sketch automatically.
2. Draw with **P** (free draw), return to selection with **V**, and press
   **Home** to frame the canvas.
3. Press **?** for the searchable Documentation panel. Choose **quick tour**
   for the guided introduction.
4. Press **/** or **Cmd/Ctrl + /** to open the Command Palette. Search by name,
   or type a slash command such as `/live`, `/transport`, `/docs`, or `/chat`.
5. Save a sketch with `/ex save` or use the Scene data controls. Sketches stay
   in the browser unless you export or share them.

## What you can make

- **Art and drawing:** native Excalidraw shapes, freehand marks, text, images,
  Bézier paths, layers, groups, grids, non-destructive Mods & FX, scriptable
  brushes, SVG documents, and themed PNG/SVG exports.
- **Livecode:** p5, Play Core, GLSL/WebGL2, Strudel, Markdown/LaTeX, Tixy,
  Three.js, Manim, Orca, and trusted SVG/HTML environments live as independent
  nodes on the canvas. Use `/live` or the shared Script panel; each node keeps
  its own source, runtime, view, parameters, and typography.
- **Music and time:** Timeline/Transport provides frames, timecode, beats,
  loops, MIDI, score roles, arrangement clips, and linked or free node clocks.
  History records performances and macros; Timeline records action loops.
- **Teaching and performance:** walkthroughs combine Markdown narration,
  semantic focus, learner-controlled steps, demos, a glowing guide pointer,
  quick tour, screencast input, presentation mode, and Keep/Restore playback.
- **AI and WebMCP:** the Assistant and Command Palette share one registered
  command surface. Ask about `@selection`, create or edit safe scene objects,
  and drive the same actions from `window.__` or WebMCP.
- **Physics, inputs, and collaboration:** add deterministic physics worlds,
  collision-to-sound mappings, MediaPipe/Unicursal streams, cameras and media,
  encrypted account-free multiplayer rooms, and shared authored state while
  keeping each editor's camera and playback local.

## Basic shortcuts

| Shortcut | Action |
| --- | --- |
| `?` | Open Canvas shortcuts in Documentation |
| `/` or `Cmd/Ctrl + /` | Open Command Palette |
| `>` | Apply an action to the selection |
| `P` / `V` / `H` | Free draw / selection / hand |
| `Space` | Play or pause the shared score |
| `Shift + Left/Right` | Jump to the Timeline or loop start/end |
| `Cmd/Ctrl + B` | Collapse or reveal the left dock |
| `Cmd/Ctrl + Opt/Alt + B` | Open the Script panel |
| `Cmd/Ctrl + Opt/Alt + A` | Open the AI Assistant |
| `Cmd/Ctrl + Opt/Alt + I` | Toggle Screencast input |
| `Cmd/Ctrl + Enter` | Run the focused script editor |

The full shortcut table, panel commands, script references, walkthroughs, and
workflow details are in [the detailed usage guide](notes/usage.md). Topic-based
help is also available inside Documentation, including the [Canvas shortcuts](notes/usage.md#keyboard-shortcuts) reference.

## Lineage and open source

Underscores grows from the infinite-canvas tradition of Excalidraw and the
live-coding traditions of p5, GLSL, TidalCycles/Strudel, IanniX, Play Core,
Manim, and algorithmic drawing. React, Vite, CodeMirror, WebGL2, Rapier,
MediaPipe, and WebRTC provide the surrounding infrastructure. The
Strudel-enabled distribution is licensed under AGPL-3.0-or-later; separately
identified Underscores-authored components retain the MIT terms in
[LICENSE-MIT](LICENSE-MIT). Bundled dependencies retain their own licenses and
notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run locally

```bash
npm install
npm run dev -- --port 8089
```

Useful checks:

```bash
npm test
npm run lint
npm run build
```

For a classroom-safe artifact use `npm run build:students` (Strudel omitted).
The internal demo build includes Strudel and remains available through the
explicitly acknowledged demo path:

```bash
npm run build:demo
UNDERSCORES_AGPL_COMPLIANCE=acknowledged npm run deploy:demo
```

See [source and reproducible build instructions](SOURCE.md), [student release](notes/student-release.md), [livecode licensing](notes/livecode-licensing.md), and [the detailed usage guide](notes/usage.md) for release, provider, scripting, physics, media, score, and API details.
