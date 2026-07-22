# Expressive Synth architecture and glissando study

Drawerator's **Expressive Synth** is a native Web Audio output for scores whose simultaneous voices need independent, continuously changing pitch. It complements the Internal GM Synth: GM remains useful for familiar instruments and discrete MIDI notes, while Expressive Synth avoids MIDI's channel-wide pitch-bend constraint by giving every active score cursor its own audio graph.

## Authoring model

There is deliberately no separate voice-assignment matrix.

1. Draw or select a line, freehand path, or canonical Bézier curve.
2. Use **Add Cursor to Selected Curves** from the context menu or `/add cursor to selected curves`.
3. Select **Expressive Synth** as the score output and press Play.

Each active cursor linked to a curve becomes one voice. The cursor's stable element ID is also the synth voice key, so voices remain independent even when several curves cross, share the same nominal pitch, or glide in opposite directions. Pausing playback releases cursor voices; resuming recreates only the voices active at that score time.

The default visual mappings are:

- cursor world-space Y → continuous pitch;
- support-curve stroke width → pressure and gain;
- cursor world-space speed → filter brightness.

These are global synth mappings in v1. Curve/cursor metadata remains the durable authored source, which leaves room for per-object overrides and arbitrary routed parameters later.

## Source layout

- `src/expressiveSynth.js` owns configuration normalization, visual-to-sound mapping, Web Audio voice graphs, lifecycle, the raw-MIDI compatibility adapter, and local-storage identity.
- `src/ExpressiveSynthPanel.jsx` is the dockable `/synth` inspector. It contains engine recovery/testing, presets, envelope controls, visual mappings, modulation, and the built-in demo action.
- `src/expressiveSynthDemo.js` is a pure scene generator for the six-voice glissando study. It returns ordinary Excalidraw elements with normalized IanniX metadata; it does not manipulate React or the canvas directly.
- `src/App.jsx` owns the user-gesture boundary, selected output, playback synchronization, scene installation, transport setup, and persistence integration.
- `src/midiOutputRouting.js` resolves Expressive Synth as an explicit output independently of the GM fallback route.
- `src/sceneExchange.js` stores normalized synth configuration in Drawerator scene metadata version 3. The selected hardware/audio output remains a local browser choice.

## Pitch and expression mapping

The pitch mapping stays in scene coordinates so it is unaffected by zoom, pan, panel placement, or display pixel ratio:

```text
note = referenceNote + transpose
     + (referenceY - cursorWorldY) * 12 / pixelsPerOctave

frequency = 440 * 2 ^ ((note - 69) / 12)
```

Smaller canvas Y values therefore produce higher pitches, matching a conventional musical vertical axis. Notes are floating-point values, so no semitone quantization occurs.

Stroke width is normalized from widths `1..10` to `0..1` and added to the base pressure through **Width → pressure**. Cursor speed is normalized against 900 scene units per second and added to the base brightness through **Speed → brightness**. Both results are clamped to `0..1`. Pressure scales the voice gain and contributes to filter cutoff; brightness primarily controls the filter cutoff.

## Web Audio voice graph

The engine creates its `AudioContext` only after an explicit user gesture such as **Enable**, **Test**, selecting the output, or launching the demo. A shared master gain feeds a dynamics compressor and the browser destination.

Every voice owns:

```text
carrier/source(s) → low-pass filter → ADSR envelope → expression gain → stereo panner → master
```

Available preset models are intentionally small and dependency-free:

- **Pure tone:** sine carrier.
- **Warm subtractive:** sawtooth carrier through the shared filter/envelope architecture.
- **FM voice:** sine carrier with a 2:1 sine modulator and pressure-dependent modulation depth.
- **Bowed string:** sawtooth carrier, slightly detuned triangle companion, and low-level pressure-dependent noise.
- **Reed / wind:** square carrier, second-harmonic sine companion, and lower-level breath noise.

All presets add a sine vibrato oscillator. Continuous frequency updates use the configured glide time; gain, filter, and pan use short smoothing constants. The voice limit evicts the oldest voice when required. **Panic** releases all current voices, while **Reset audio** closes the old context and constructs a fresh engine.

The raw-MIDI adapter exists so trigger patterns and History replay can target the same output contract. It supports note on/off, CC 74 brightness, CC 11 expression, and channel pitch bend with a two-semitone range. Cursor voices do not pass through that adapter and therefore do not share MIDI-channel pitch bend.

## How the Metastaseis-inspired demo is built

The demo uses six voices rather than attempting to reproduce the complete orchestral reference. `DEMO_PATHS` contains six mirrored arrays of four normalized Y values. For each array, `createExpressiveSynthDemoScore()`:

1. Places four X positions evenly across a `720 × 360` scene-space region centered in the visible canvas.
2. Converts the normalized Y values into a convergence/divergence polyline.
3. Creates a real Excalidraw line with IanniX role `curve`, a unique `Glissando n` label, increasing stroke width, and a 12-second ping-pong clock.
4. Creates a corresponding hidden line host with IanniX role `cursor`, a unique `Voice n` label, and `cursor.curveId` pointing to that curve.
5. Calls `reconcileRuntimeCursorHosts()` so each authored cursor host is actually baked onto its curve's start pose before runtime hiding and animation.

The stable command `expressiveSynth.demo.create` is exposed as `/synth demo` and by **Add & play 6-voice glissando demo**. The App command handler appends the twelve real elements to the current scene, frames the six curves, selects the bowed preset, centers middle C on the demo's Y origin, uses 180 pixels per octave, lowers gain for six simultaneous voices, enables the `0..12 s` transport loop, forces a reproducible 1× rate, selects Expressive Synth, and starts playback. The complete addition is one normal scene-history operation, so Undo removes it.

The same pattern can be used for an authored score: create one curve and one linked cursor per independent sounding line. Triggers are optional; they are not needed for sustained glissandi.

## Persistence

Normalized synth settings are written to `drawerator_expressive_synth_v1` in local storage and become the starting point for the next browser session. Scene export stores the same normalized configuration in Drawerator scene metadata so the pitch scale and timbral mapping travel with the score. Importing a scene applies its synth configuration; selection-only exchange does not replace scene-global settings. The active output ID is intentionally local and is restored through Drawerator's existing output preference.

## Verification

Unit coverage checks configuration clamps, continuous Y-to-pitch polarity, stroke-width and speed expression, durable curve/cursor links, real cursor-host placement, unique IDs, and six independent moving runtime cursors.

Browser QA for this checkpoint used the actual `/synth` panel in the embedded browser:

1. Click **Add & play 6-voice glissando demo**.
2. Confirm the panel reports `Ready · 6 voices`.
3. Confirm the bowed preset and demo mapping values are installed.
4. Confirm all six cursor marks move independently on their visible support curves.
5. Confirm the transport is playing at 1× with loop range `0..12 s`.
6. Let playback cross the loop boundary and confirm it continues with six voices.
7. Pause and confirm cursor voices release.
8. Check the browser console for audio or scene errors.

At the documented checkpoint the complete Node test suite passes with 166 tests, both the regular Vite build and single-file build complete, and browser QA reports no console errors.
