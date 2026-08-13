# Recordable Sessions and Automation

Last updated: 2026-07-15

Underscore records semantic intent and world-coordinate input rather than screen pixels. The first implementation is deliberately separate from Excalidraw undo, but both observe the same scene and command transactions so they can converge later.

## Runtime layers

- `src/commandSystem.js` owns the stable, versioned command registry, event bus, and normalized input bus. Menus, shortcuts, slash commands, the public API, AI prompts, panels, History, and transport controls share these command IDs.
- `src/sessionHistory.js` owns `underscore-session` documents, playback, editable steps, IndexedDB persistence, and `underscore-macro` sequences.
- `src/automation.js` owns auto-key extraction and playback interpolation.
- `src/HistoryPanel.jsx` is the dockable editor for recording, playback, action timing/state/JSON, time-range macro creation, and MIDI/presentation/pointer playback policies.
- `src/TransportTimeline.jsx` renders session-action and object-automation lanes under the existing score transport.

Playback never feeds back into the recorder. Commands invoked by playback use `record: false`; scene mutations run inside the scene-recorder suppression transaction.

## Session document

The JSON envelope is versioned and begins with:

```js
{
  type: "underscore-session",
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

- `/record start`, `/record play`, `/record pause`, `/record stop`
- `/history`, `/history play`, `/history seek 2.5`
- `/macro save My phrase`, `/macro insert My phrase relative`
- `/autokey`
- `/command transport.seek {"seconds":2.5}` for any stable registry ID

The browser API is exposed after `underscore:ready`:

```js
window.__.commands.list()
window.__.commands.describe("history.record.start")
window.__.commands.execute("history.record.start", {}, { source: "external" })
window.__.history.export()
window.__.macros.saveRange({ start: 1, end: 4, name: "Phrase" })
window.__.inputs.registerAdapter(adapter)
window.__.events.subscribe("input.*", listener)
```

The complete namespaces are `commands`, `history`, `macros`, `inputs`, and `events`, all under `apiVersion: 1`. Every registry entry is reachable through the generic `/command` form as well as the API. The AI system prompt receives its command catalog from that same live registry and can emit `<underscore-command>` tags, avoiding a parallel hand-maintained tool list. For drawing and animation, models should prefer `scene.create.objects`, `scene.patch.objects`, `script.brush.apply`, and `automation.keyframes.set` over raw Excalidraw internals. Credentials and command fields marked `record: never` are excluded. AI prompts can be recorded, but unrelated clipboard contents and API secrets are not captured.

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
