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

## First-run welcome

A fresh visitor lands on an empty canvas with no panels open, so the first run offers an introduction rather than requiring the visitor to already know `/welcome`. `src/welcomeExperience.js` owns the decision and `src/WelcomeCard.jsx` renders it: a compact card on the panel surface listing the full tour, the Livecode, Physics, and Timeline lessons, **Browse documentation**, and **Start blank**.

The offer is deliberately narrow. `shouldOfferWelcome` returns true only when the visitor has not dismissed it before, the canvas is empty, presentation mode is off, there is no `?scene=` reference, no saved patch was restored, and no walkthrough is already running. Reopening a saved patch, following a published scene link, joining a multiplayer room, or presenting are all deliberate arrivals and are never interrupted.

Any answer retires the offer permanently in `underscores_welcome_seen_v1`, including simply starting to draw: while the card is visible a one-shot capture listener on the canvas dismisses it on the first pointer down. `help.welcome.show` (`/welcome screen`) brings it back, which is how a presenter resets between demonstrations without clearing local storage.

## Bundled onboarding

The bundled library is onboarding plus one lesson for each priority area, in `src/walkthroughCatalog.js`:

- **Welcome to Underscores** (`guided-onboarding-v1`) — canvas, command palette, core panels, Documentation, Timeline and Info, visibly authored p5 and GLSL examples, explicit audio enablement, a compact audio/physics pendulum demonstration, and the final Keep/Restore decision. Run `/welcome` (or `/get_started`).
- **Livecode: your first program** (`livecode-first-program-v1`) — one p5 node grown from a blank source through `@param` declarations to transport-linked score time, then composed with a shader underlay.
- **Physics: make a drawing sound** (`physics-first-instrument-v1`) — the Musical gas world, a collision mapping into the Expressive Synth, mapping formulas, the debug overlay, and an assertion that waits for the learner's own body.
- **Timeline: give the patch time** (`timeline-arrangement-v1`) — the three display modes, a loop, a linked node, quantized launch, and arrangement clips, kept deliberately separate because learners conflate transport time, a node's clock, and a clip.
- **Wayang puppet and a Miro mobile** (`wayang-mobile-instrument-v1`) — an articulated rod puppet that plays a hanging mobile. It builds and reads two rigs, authors the collision mappings that make the mobile an instrument, then hands over both control paths: dragging a running body with the mouse, and the MediaPipe rod controller for both hands at once.
- **Physics marionette** (`physics-marionette-study-v1`) — the longer case study.

Three constraints keep these playable. A step's `focusTarget` must be a registered semantic target, or the walkthrough cursor silently freezes at the previous step's position; `app.commandPalette` resolves `#command-palette-input` first, since the live palette has no `role="dialog"` ancestor and no bare `.command-palette` class. An assertion step needs a hint, because the hint is the learner's recovery path. And a command that throws without a selection — `arrangement.clip.add` is the example — stays a learner action rather than an automated cue.

One further timing constraint: an assertion is evaluated once, immediately after a step's last cue, and a failure drops the learner into a Check prompt rather than retrying. A `physics.state` assertion on `playing` reads React state, so a step that starts a world needs a later cue after `physics.play` to give that state a beat to propagate; otherwise the learner sees a spurious warning on a step that actually succeeded. The welcome command is the first entry in an empty Command Palette, and its `walkthrough.welcome` ID is exposed to WebMCP through the shared command catalog. Info stays synchronized with the current control or walkthrough step, while Documentation provides the searchable learning library and follow-up help patches.

Documentation is a separate dockable panel (`/documentation`, `/docs`, or `/help`). It opens in the left dock by default, may move to the right, float, or join the bottom dock, and contains a persistent table of contents for reference topics and patch-based lessons. Its text-size control is stored locally, and Documentation keeps the compact **Getting started** shortcut at the top. Info stays focused on compact contextual summaries and links into Documentation rather than duplicating the full catalog.

## Implementation map

- `src/walkthroughSystem.js`: schema, normalization, revision checks, runner, assertions, traces, History conversion, and recovery.
- `src/walkthroughTargets.js`: semantic target validation and registered UI adapters.
- `src/WalkthroughOverlay.jsx`: cursor, narration, prompts, and learner controls.
- `src/WalkthroughPanel.jsx`: browsing, playback, authoring, validation, and trace export.
- `src/walkthroughCatalog.js`: onboarding, the Livecode/Physics/Timeline lessons, the marionette case study, and bundled help entries.
- `src/welcomeExperience.js` and `src/WelcomeCard.jsx`: the first-run offer and the rules that suppress it.
- `src/DocumentationPanel.jsx`: searchable table of contents, help-patch actions, and locally persisted reading size.
- `src/InfoPanel.jsx`: contextual hover, focus, and active-editor reference only.
- `src/webmcp.js`: WebMCP discovery and control.
