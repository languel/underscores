# Screencast input

Screencast input is a small, theme-aware teaching aid for live demonstrations. It puts the latest shortcut, click, drag, scroll, or tool event in a slightly larger header, with a short queue of earlier cues below. The header uses an event icon (keyboard, mouse, or tool) and keeps the active canvas tool on the right so the visual state is readable at a glance. It is intentionally a cue layer rather than a second event recorder: continuous pointer samples stay out of the overlay so the canvas remains quiet.

## Toggle and placement

- Run `/screencast` from the command palette or a slash-command field.
- Press **Command-Option-I** on macOS, or **Ctrl-Alt-I** on other platforms.
- Enable **Settings → Interface → Screencast input**.
- Enable **Settings → Interface → Minimal screencast input** to keep only the latest event in one row; turn it off when the recent-event queue is useful for a lesson.
- Drag the overlay header to move it. Its position is remembered in this browser.
- Click `×` or repeat the shortcut to hide it.

The overlay is off by default so a new board remains uncluttered. It can be enabled before a presentation or walkthrough and is independent from the FPS Performance Monitor and History's **Virtual cursor** playback toggle.

## Suggested presentation modes

Choose the smallest view that supports the audience:

- **Live demonstration:** use the full overlay when learners need to see the current cue and a short context trail. Keep it near an unused corner of the canvas and leave the pointer visible.
- **Performance:** turn on **Minimal screencast input**. It keeps the latest key, pointer gesture, or tool change in one compact row without adding a persistent list to the composition.
- **Tutorial recording:** enable both **Canvas / performance** and **UI events** in History. The overlay remains a visual aid while History retains the replayable input and panel actions that become walkthrough steps.
- **Clean capture:** hide Screencast input with `×` or the toggle shortcut. This affects presentation only; it does not disable History recording or virtual-cursor playback.

The overlay is intentionally not a second recorder. If a cue is missing from the trail, inspect the corresponding History scope instead: Canvas / performance owns pointer and gesture data, while UI events owns panel and settings changes.

## What it shows

The most recent four cues are shown, newest last:

- shortcut presses, including the resolved command name when a registered Underscores shortcut matches;
- left, middle, right, pen, or touch clicks, including modifier chords such as **⌘ left click**;
- a completed press/move/release as one drag cue;
- throttled wheel/trackpad scroll direction; and
- active canvas tool changes such as **Pencil**, **Hand**, **Eraser**, or a shape tool.

Modifier-only key presses are folded into the next key or pointer gesture, so holding Command for a click does not create a separate `Meta` row. The current cue is emphasized with a small keyboard keycap or mouse drawing; when the full overlay is enabled, the preceding cues form the optional trail. **Minimal screencast input** hides that trail and keeps only the current cue.

High-frequency `pointermove` samples are deliberately omitted. When **History → Canvas / performance** input is enabled, History still keeps the complete bounded gesture samples as one replayable input clip. UI events remain separately controlled by **History → UI events**, so a tutorial can capture both while a performance take records only canvas gestures.

## Pointer ownership

Screencast input never steals pointer events. Interactive p5, Three.js, model-viewer, media, and code-editor surfaces keep their own pointer and touch negotiation. Excalidraw's canvas cursor follows the active tool: the freedraw tool uses a pencil cursor, Hand uses a grab cursor, Eraser uses a cell cursor, and shape/path tools use a crosshair. Selection and livecode/model interactions continue to use their existing move, text, orbit, pan, and zoom cursors.

## Recording a tutorial

1. Enable Screencast input and place it where it will not cover the demonstration.
2. In History, enable **Canvas / performance** and **UI events** if panel and settings changes should be replayable.
3. Record the lesson. Use `/screencast` during the take if the overlay itself should be shown or hidden; the overlay's own controls are not added as noisy visual cues.
4. Stop the take and use **Create walkthrough** to turn semantic commands and retained input gestures into editable lesson steps. The Screencast overlay is a live presentation aid; the walkthrough/history virtual cursor is the persistent playback aid and uses the recorded Excalidraw tool symbol (with the recorded laser color for laser input).

## Troubleshooting

- If a modifier appears as its own cue, make sure the current build is loaded and press the shortcut again; modifier-only keys are folded into the following key or pointer gesture.
- If the trail is too busy, switch to Minimal mode rather than disabling History. Continuous pointer samples are intentionally omitted from the overlay but remain available as one gesture clip in History.
- If a replayed pointer appears without a tool symbol, verify that the source event was recorded with a canvas scope. Playback uses the recorded Excalidraw tool and keeps laser input's authored color.
