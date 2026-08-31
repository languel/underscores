# Guided Walkthroughs

Guided Walkthrough v1 is Underscores' local, reusable teaching and visible-automation layer. It uses the same registered commands as the palette, History, Playlist, the embedded assistant, WebMCP, and `window.__`; walkthroughs do not receive a parallel scene API.

## Document and state boundaries

A walkthrough is a versioned `underscores-walkthrough` document stored by ID in `underscores.authoredState.walkthroughs`. The authored definition contains ordered steps, Markdown narration, optional Info-panel copy, semantic focus targets, registered command or UI cues, pacing offsets, and deterministic advance rules. Collaboration merges definitions per walkthrough ID.

Active playback is intentionally local: cursor position, prompt state, pace, learner progress, and recovery checkpoints are never published as collaboration state. Teacher-led synchronized playback is deferred until Underscores has an explicit presenter and learner-consent authority model.

Every step has an `id`, `title`, optional `narration`, optional `info`, `focusTarget`, ordered `cues`, and an `advance` mode:

- `auto` moves on after its cues.
- `continue` waits for the learner.
- `assertion` evaluates one allowlisted assertion and offers Check, Retry, Hint, Skip, or Continue as appropriate. Waiting steps also expose `Do it`; try the step yourself first, then let the walkthrough advance it for you when needed. The final step uses `Done` for the keep/restore decision, and a completed run presents the same final action.

Assertions can inspect panel state, object existence by ID/kind/name/count, selection membership, Livecode kind/compile/running state, and observed commands or events. Walkthrough files cannot contain CSS selectors, arbitrary DOM access, or arbitrary JavaScript.

## Playback and recovery

The Walkthrough panel (`/walkthrough`, `/tour`, or `/guide`) contains the library, controls, pace, editable step list, semantic target picker, cue editor, assertion builder, and validation messages. Free-clock playback supports slow, normal, fast, custom, and instant rates. Transport-linked playback follows play, pause, seek, and rate, while read-only step markers appear in Timeline.

The visible cursor and click halo render in a portal above the application. Motion uses CSS transforms and `requestAnimationFrame`; it does not serialize or write the scene on animation frames, and reduced-motion preferences disable travel animation. The narration card can be dragged by its title bar to keep help or Timeline visible; its position remains local to the current browser session.

Before playback, Underscores captures a complete scene-exchange and presentation baseline and persists a local recovery record. Stop and completion both offer Keep Results or Restore Starting Patch. Reloading with an unfinished run offers the same choice, so walkthrough recovery does not depend on global undo/redo.

Permission-sensitive, destructive, file, MIDI, and audio cues require a learner confirmation. Imported walkthroughs use the existing command safety policy.

## Authoring and automation

History's **Create walkthrough** action converts the active recording into a draft. Actions sharing a non-null command group become one step; every ungrouped action becomes its own step. Command names supply draft labels, panel commands and element IDs supply likely targets, and pedagogical narration remains blank for the author.

The revision-checked command surface is:

- `walkthrough.welcome` starts the bundled Getting Started tour; `/welcome` and `/get_started` are its no-argument slash aliases
- `walkthrough.list`, `walkthrough.get`, `walkthrough.create`, `walkthrough.update`, `walkthrough.delete`, and `walkthrough.fromHistory`
- `walkthrough.start`, `walkthrough.pause`, `walkthrough.resume`, `walkthrough.next`, `walkthrough.previous`, and `walkthrough.stop`
- `walkthrough.rate.set`

Playlist Command triggers may call any of these IDs. Trusted code uses the equivalent `__.walkthroughs` methods. WebMCP exposes discovery and control tools, and the assistant sees the same `ai.expose` command descriptions.

Visible code demonstrations create a blank Livecode node with auto-update off, type through the registered editor adapter, then compile through the command registry. Instant playback uses the same cue with final source arguments and skips simulated typing.

Each run produces a local `underscores-walkthrough-run` JSON trace with cue execution, assertions, hints, skips, learner continuation, pace, and Keep/Restore outcome. Export redacts credentials, sensitive command arguments, and assistant/chat transcripts. There is no upload or training pipeline in v1.

## Bundled onboarding

The bundled **Welcome to Underscores** walkthrough introduces Underscores as an infinite creative computational canvas for performance, teaching, exploration, and research. It then introduces the blank canvas, command palette, core panels, Timeline and Info, visibly authored p5 and GLSL examples, explicit audio enablement, a compact audio/physics pendulum demonstration, and the final Keep/Restore decision. Run `/welcome` (or `/get_started`) to begin it. The welcome command is the first entry in an empty Command Palette, and its `walkthrough.welcome` ID is exposed to WebMCP through the shared command catalog. Info stays synchronized with the current control or walkthrough step, while Documentation provides the searchable learning library and follow-up help patches.

Documentation is a separate dockable panel (`/documentation`, `/docs`, or `/help`). It opens in the left dock by default, may move to the right, float, or join the bottom dock, and contains a persistent table of contents for reference topics and patch-based lessons. Its text-size control is stored locally, and Documentation keeps the compact **Getting started** shortcut at the top. Info stays focused on compact contextual summaries and links into Documentation rather than duplicating the full catalog.

## Implementation map

- `src/walkthroughSystem.js`: schema, normalization, revision checks, runner, assertions, traces, History conversion, and recovery.
- `src/walkthroughTargets.js`: semantic target validation and registered UI adapters.
- `src/WalkthroughOverlay.jsx`: cursor, narration, prompts, and learner controls.
- `src/WalkthroughPanel.jsx`: browsing, playback, authoring, validation, and trace export.
- `src/walkthroughCatalog.js`: onboarding and bundled help entries.
- `src/DocumentationPanel.jsx`: searchable table of contents, help-patch actions, and locally persisted reading size.
- `src/InfoPanel.jsx`: contextual hover, focus, and active-editor reference only.
- `src/webmcp.js`: WebMCP discovery and control.
