# Recordable Sessions and Automation

Last updated: 2026-08-19

Underscores records semantic intent and world-coordinate input rather than screen pixels. The first implementation is deliberately separate from Excalidraw undo, but both observe the same scene and command transactions so they can converge later.

History is also deliberately separate from [Arrangement clips](arrangement-clips.md). Arrangement schedules object lifecycles on the score timeline; History remains the complete-app audit, automation, and replay system. Arrangement commands may appear in an active History audit like other commands, but this project does not change History's action schema, Actions table, controls, playback model, or project-duration authority.

## Runtime layers

- `src/commandSystem.js` owns the stable, versioned command registry, event bus, and normalized input bus. Menus, shortcuts, slash commands, the public API, AI prompts, panels, History, and transport controls share these command IDs.
- `src/sessionHistory.js` owns `underscores-session` documents, playback, editable steps, IndexedDB persistence, and `underscores-macro` sequences.
- `src/automation.js` owns auto-key extraction and playback interpolation.
- `src/HistoryPanel.jsx` is the dockable editor for recording, playback, action timing/state/JSON, time-range macro creation, and MIDI/presentation/pointer playback policies.
- `src/TransportTimeline.jsx` renders session-action and object-automation lanes under the existing score transport.

Playback never feeds back into the recorder. Commands invoked by playback use `record: false`; scene mutations run inside the scene-recorder suppression transaction.

## Session document

The JSON envelope is versioned and begins with:

```js
{
  type: "underscores-session",
  version: 1,
  seed,
  clock: { fps, tempo, signature },
  baseline: {
    sceneJson,
    presentation: { camera, selection, activeTool, panels, tabs },
  },
  actions: [],
}
```

Every action has monotonic `at` time, global `transportTime`, `duration`, `source`, `groupId`, track, enabled state, typed arguments, and optional result references. Full playback restores the baseline by default. Presentation playback and MIDI output can be armed independently. MIDI actions store destination-independent pattern/context data and resolve the current external or internal route only when replayed.

High-rate strokes store normalized input samples as one stream rather than one command per point. Samples include scene coordinates, relative time, pressure, tilt, twist, buttons, pointer/device identity, and phase. The completed native Excalidraw element snapshot is kept beside the stream so playback can reveal the stroke and then commit exact geometry independent of viewport size or zoom.

## Loop gesture overdub

History's **Loop overdub** mode uses the active score-transport loop as a repeating drawing pass. Starting recording in this mode enables the loop, seeks to its start, and starts transport playback. Each completed Excalidraw freedraw/line or modifier-stack stroke becomes an ordinary selectable scene object with `customData.underscoresGesture`:

- sample timestamps and pressure/speed cadence;
- traveled-path progress for accurate partial reveals;
- the transport phase at pointer-down and the captured loop range;
- a retained authored opacity plus transport-loop playback settings.

The authored object remains the editable geometry and hit target. During loop playback its normal Excalidraw paint is hidden and a lightweight SVG overlay reveals the current portion without rewriting scene geometry every frame. Completed strokes hold until the loop boundary, disappear before their recorded phase on the next pass, and redraw with subsequent overdubs. The current global transport loop is authoritative, so changing that loop retimes the pass; per-gesture loop ranges and start phases remain stored for later clip/layer editing.

Use `/record loop` for the one-step command path, or set the loop in Transport, enable **Loop overdub** in History, and press Record. Stopping History ends capture but leaves the score transport and gesture playback at their current state.

Deleting a recorded stroke removes its non-baseline gesture objects and any linked scene-create/update actions, so a later replay cannot resurrect the deleted take.

Unmediated Excalidraw changes are converted to coalesced `scene.create`, `scene.update`, and `scene.delete` actions. Continuous resize, drag, point edits, and styling are grouped after activity settles.

## History and sequences

Open `/history` to record, pause, stop, play, seek, change playback rate, or edit the action list. An action can be muted, duplicated, deleted, moved, or edited as validated JSON. A single action or time range can be saved as a reusable sequence.

Sequences default to relative insertion. Their origin is translated to the chosen anchor and every element, binding, parent, and IanniX curve reference receives a fresh ID. Absolute insertion is explicit. Stored source sequences are never mutated by insertion.

Sessions and sequences are stored in IndexedDB and can be imported/exported as JSON.

## Auto-key scope

The transport record control captures a session without forcing score playback. Record-and-Play is a separate command. Auto-key currently captures:

- position, rotation, scale, opacity, and supported style fields;
- modifier parameters and complete `customData.iannix` state;
- whole-object point snapshots when geometry changes.

Numbers interpolate linearly, rotations use the shortest angular path, and structured/boolean/geometry values hold until the next key. The timeline shows automation keys and session actions; recorded strokes occupy their real draw duration.

## Commands and public API

Useful slash commands include:

- `/record start`, `/record play`, `/record loop`, `/record pause`, `/record stop`
- `/history`, `/history play`, `/history seek 2.5`
- `/macro save My phrase`, `/macro insert My phrase relative`
- `/ex save [name]` saves the current scene; an optional name such as `/ex save bioblip_melody` downloads `bioblip_melody.excalidraw`
- `/autokey`
- `/command transport.seek {"seconds":2.5}` for any stable registry ID

AI and multiplayer chat, as well as the Command Palette, share the same `@` context tags and
slash-command completion list. Exact slash aliases execute locally through the registry; for
example, `/physics play` does not become a model prompt. The generic `/command <id> <json>` form
remains available for typed arguments and for replay strings copied from Console. Chat transcripts
are not stored in scene-authored state or History sessions.

The browser API is exposed after `underscores:ready`:

```js
window.__.commands.list()
window.__.commands.describe("history.record.start")
window.__.commands.execute("history.record.start", {}, { source: "external" })
window.__.history.export()
window.__.macros.saveRange({ start: 1, end: 4, name: "Phrase" })
window.__.inputs.registerAdapter(adapter)
window.__.events.subscribe("input.*", listener)
```

The complete namespaces are `commands`, `history`, `macros`, `inputs`, and `events`, all under `apiVersion: 1`. Every registry entry is reachable through the generic `/command` form as well as the API. The AI system prompt receives its command catalog from that same live registry and can emit `<underscores-command>` tags, avoiding a parallel hand-maintained tool list. For drawing and animation, models should prefer `scene.create.objects`, `scene.patch.objects`, `script.brush.apply`, and `automation.keyframes.set` over raw Excalidraw internals. Credentials and command fields marked `record: never` are excluded. AI prompts can be recorded, but unrelated clipboard contents and API secrets are not captured.

## IanniX trusted-script compatibility

The IanniX tab accepts explicitly trusted `.iannix`/JavaScript files. This mode uses familiar `run()`, `load()`, `loadJSON()`, `makeWithScript()`, deterministic random helpers, and IanniX math constants. It is not a security boundary; a trust warning is mandatory before execution.

Core `add curve|cursor|trigger`, geometry, position, link, speed, size, group, label, color, pattern/message, clear, and presentation commands are collected into the `iannix.import.trusted` dispatcher command. Imported objects retain their external IDs in `customData.iannixImport`. Unsupported commands are reported through status and `iannix.import.complete` events instead of disappearing silently.

## Input adapter contract

Pointer and browser touch already enter the normalized input bus. Future MediaMime, MediaPipe, WebSocket, MIDI, or native-trackpad adapters call:

```js
const remove = window.__.inputs.registerAdapter({
  id: "body-right-hand",
  start(emit) {
    source.addEventListener("sample", event => emit({
      phase: "move",
      scene: event.detail.scene,
      pressure: event.detail.confidence,
      deviceId: "camera-1",
    }));
    return () => source.close();
  },
});
```

Raw model output stays in the adapter. The recorder only knows normalized semantic samples.

## Verification

Run:

```bash
npm test
npm run lint
npm run build
```

Core tests cover validation, normalization, scene-diff coalescing, session migration, recording suppression, baseline playback, macro ID remapping and time ranges, generic slash execution, auto-key interpolation, deterministic IanniX execution, and unsupported-command reporting. Browser QA should record several strokes at one zoom, replay at another, compare final scene JSON, toggle presentation and MIDI tracks independently, then repeat with modifiers and IanniX metadata.
