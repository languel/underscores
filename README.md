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
- **Non-destructive Mods & FX:** Attach ordered geometric filters and multi-track brushes to freehand strokes or lines while retaining editable source points.
- **Modifier Baking:** Bake a complete stack or one modifier at a time. Partial bakes become independently selectable artwork while the remaining stack stays live.
- **Evolving Brushes:** Time-aware brushes can animate while the pointer is down, freeze per stroke on release, and optionally use a shared global clock.
- **Custom Canvas Backgrounds:** Set custom colors (including presets and hex input) from the hamburger main menu.
- **Toggles for Interface Elements:** Control the visibility of toolbar hints and bottom alerts right from the main menu.
- **Single-File Compilation:** Built to be easily bundled as a single self-contained HTML page.

## Keyboard Shortcuts

| Shortcut | Description |
| --- | --- |
| `Cmd + /` or `Ctrl + /` | Toggle Command Palette |
| `Cmd + Ctrl + Z` | Toggle Satori (Zen) Mode |
| `Ctrl + Opt + A` | Toggle AI Assistant Chat Sidebar |
| `Cmd + Opt + P` | Pin / unpin Modifiers sidebar |
| `Opt + Shift + D` | Toggle Dark / Light Theme |
| `[` | Decrease stroke width (for Pen and Line tools) |
| `]` | Increase stroke width (for Pen and Line tools) |
| `Cmd + Shift + 0` or `Ctrl + Shift + 0` | Toggle Canvas Background Transparency |
| `Escape` | Dismiss Command Palette, Context overlays, and Autocomplete popups |

## Mods & FX workflow

1. Select one freehand stroke or line and open **🛠️ Mods & FX**.
2. Add filters or brushes to the ordered stack. The source control points remain editable.
3. Use **Hide Original Path** to display generated tracks without the source stroke; it does not alter source sampling.
4. Use the Apply action on a modifier card to bake only that modifier, or bake the full stack from the panel header.
5. Baked tracks are native, selectable Excalidraw elements. Full bake clears the stack; partial bake preserves every remaining modifier in order.

Modifier operations participate in Excalidraw undo/redo. The panel can be pinned with its pin button or `Cmd + Opt + P`.

## Development

```bash
npm run dev -- --port 8089
npm test
npm run lint
npm run build
```

Modifier-stack behavior is covered by Node's built-in test runner in `src/modifierStack.test.js`. See `notes/modifier-stack.md` for the data model and implementation invariants.

## Command Palette Commands

Access the command palette using `Cmd + /` or `Ctrl + /` and select from options like:
- **Toggle Canvas Background Transparency**
- **Toggle Satori Mode (Zen) /satori**
- **Toggle Dark/Light Theme**
- **Toggle AI Assistant Chat**
- **Reset Zoom & Pan View**
- **Clear Sketchboard Canvas**
