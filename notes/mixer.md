# Mixer and score-output routing

Last updated: 2026-07-22

Drawerator routes score sound through **tracks**. A track is an authored mixer route; a MIDI **channel** remains the protocol address `1..16`. This distinction lets several tracks listen to the same score channel and fan the same event out to different destinations without redefining MIDI terminology.

Open the dockable Mixer with `/mixer`, the main menu, or **Settings → Score & MIDI → Open Mixer**. It shares the bottom dock with Timeline and Info by default and can also be moved to the left, right, or a floating panel. The compact strip shows the track number, name, MIDI channel, destination, instrument, Solo, and Mute state. Click a strip to edit its route.

Each track stores:

- stable track ID and display name;
- Enabled, Mute, and Solo state;
- MIDI channel `1..16`;
- destination: None, Internal audio, or a concrete Web MIDI output;
- instrument: General MIDI, Expressive Synth, or External MIDI;
- program: MIDI program `0..127` internally (shown as `1..128`) or an Expressive Synth factory/scene program ID.

Channel 10 keeps General MIDI percussion semantics. For General MIDI and external MIDI, program choice belongs to the destination/channel pair; two tracks aimed at the same destination and channel therefore share that channel's active program, as normal MIDI devices do. Expressive Synth tracks are separate routed instances and may use different programs even when they listen to the same MIDI channel. Programs are authored once in `/synth`; tracks hold only the selected program ID.

## Runtime routing

Trigger patterns still emit ordinary MIDI-compatible messages. The message channel selects every enabled, audible mixer track with the same channel. Drawerator then fans the raw message out to those tracks:

- **Internal audio + General MIDI** sends it to TinySynth.
- **Internal audio + Expressive Synth** sends it to a route-scoped Web Audio voice graph using that track's program.
- **External MIDI** sends it to the selected Web MIDI output.
- **None**, disabled, muted, or non-solo tracks remain silent.

If any audible track is soloed, only soloed tracks participate. Panic clears all internal voices and every destination tracked by the MIDI voice manager.

MIDI note triggers are geometric gates during score playback. Entry sends note-on to every matching track and exit sends note-off; the Trigger panel's **Minimum duration** is used only when the geometric contact is shorter. The same gate drives the trigger activity highlight, so sound and visual feedback turn off together. CC patterns remain instantaneous messages.

Linked cursor voices use the cursor's `midi.midiChannel`. Every internal Expressive Synth track listening to that channel receives an independent cursor voice. This preserves freely moving per-curve pitch while allowing one score channel to layer several expressive presets. Curve and cursor inspectors expose the MIDI channel directly.

Continuous glissando triggers use the trigger's channel instead. When the score cursor enters the trigger geometry, every matching internal Expressive Synth track starts a route-scoped voice. The exact centerline intersection Y updates fractional pitch for as long as the cursor remains inside; leaving the geometry releases the voice. This makes trigger length the note duration and allows each visible glissando line to select a separate track without hard-wiring a synth voice to an element. Pulse notes use the same entry/exit gate but retain discrete MIDI pitch and the minimum-duration fallback.

MIDI clock remains separate because it is transport synchronization, not a score instrument. **Settings → Score & MIDI → Clock output** selects None, All MIDI Outputs, or one external device. It does not choose score sound.

## Persistence and migration

The normalized mixer is stored locally as `drawerator_mixer_v1` and becomes the next-session default. Expressive user programs live in the synth configuration under `drawerator_expressive_synth_v1`. Complete scene export writes both into Drawerator scene metadata version 4; complete scene import replaces the current mixer and program library together, while selection-only exchange does not. Older scenes receive a normalized mixer migrated from the previous global score-output preference and stored GM programs.

The current public API is Drawerator API version 3:

```js
window.drawerator.mixer.get()
window.drawerator.mixer.updateTrack(trackId, patch)
window.drawerator.mixer.addTrack(overrides)
window.drawerator.mixer.removeTrack(trackId)
```

Mixers normalize to at least one and at most 128 tracks. The engine does not create 128 AudioContexts: Internal GM shares TinySynth, Expressive Synth shares one Web Audio context and master bus while keeping route-scoped voices, and external tracks share browser-owned MIDI ports. Practical polyphony is governed by the synth voice limit and the host computer rather than track count alone.

## Source layout

- `src/mixerSystem.js` owns schema normalization, migration, track edits, Solo/Mute filtering, and channel matching.
- `src/MixerPanel.jsx` renders the track strips and route controls.
- `src/App.jsx` owns local/scene persistence, audio-engine activation, trigger fan-out, cursor-to-track assignment, and the public API.
- `src/expressiveSynth.js` provides route-scoped MIDI and cursor voices so multiple track presets can share one engine safely.
- `src/sceneExchange.js` serializes the normalized mixer with scene-global metadata.

The mixer is also the intended destination for future numeric-parameter modulation. Track identity is already stable, so score-object routes can target track and instrument parameters without overloading the MIDI channel number.
