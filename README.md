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
- **Scriptable Brushes:** Edit or fork brush JavaScript in the Mods & FX **Script** tab. The editor is inert until its script is saved into the active stack.
- **Custom Canvas Backgrounds:** Set custom colors (including presets and hex input) from the hamburger main menu.
- **Toggles for Interface Elements:** Control the visibility of toolbar hints and bottom alerts right from the main menu.
- **Single-File Compilation:** Built to be easily bundled as a single self-contained HTML page.

## Keyboard Shortcuts

| Shortcut | Description |
| --- | --- |
| `Cmd + /` or `Ctrl + /` | Toggle Command Palette |
| `Cmd + Ctrl + Z` | Toggle Satori (Zen) Mode |
| `Ctrl + Opt + A` | Toggle AI Assistant Chat Sidebar |
| `Ctrl + Opt + P` | Toggle Mods & FX Sidebar |
| `Ctrl + Opt + B` | Open the Mods & FX Script tab |
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

Modifier operations participate in Excalidraw undo/redo. The panel can be resized from its left edge and pinned with the native pin button or `Cmd + Opt + P`.

The **Script** tab is a code editor, not a second drawing mode. **Save** updates the attached modifier currently being edited. Built-in presets remain locked; **Save As** creates a user brush and, when editing a modifier, replaces only that modifier in the stack with the new brush.

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
