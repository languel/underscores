# Expressive Synth architecture and glissando study

Last updated: 2026-07-22

Underscores's **Expressive Synth** is a native Web Audio output for scores whose simultaneous voices need independent, continuously changing pitch. It complements the Internal GM Synth: GM remains useful for familiar instruments and discrete MIDI notes, while Expressive Synth avoids MIDI's channel-wide pitch-bend constraint by giving every active cursor or continuous trigger route its own audio graph.

## Authoring model

There is deliberately no separate per-object voice matrix. Mixer tracks provide the reusable routing layer, while the Synth panel owns a scene-level program library.

1. Draw or select a line, freehand path, or canonical Bézier curve.
2. Use **Add Cursor to Selected Curves** from the context menu or `/add cursor to selected curves`.
3. In `/synth`, choose a factory program or save a scene program with its own model, envelope, gain, tone, vibrato, transpose, and glide settings.
4. In `/mixer`, route the cursor's MIDI channel to **Internal audio → Expressive Synth**, choose that program, and press Play.

Each active cursor linked to a curve becomes one voice per matching expressive mixer track. A trigger whose Behavior is **Continuous glissando** provides a second authoring model: entry starts a voice, the exact cursor/trigger centerline intersection supplies fractional pitch on every frame, and exit releases the voice. The trigger's geometric extent along the timeline therefore determines note duration. Its MIDI channel selects the Mixer track; no separate per-object voice assignment is required.

Stable track, cursor, and trigger IDs form the synth voice keys, so voices remain independent even when several contours cross, share a MIDI channel, layer different programs, or glide in opposite directions. Tracks store a program ID rather than an inline patch: several tracks may share one program, or each track may choose a different one. Editing a saved scene program updates every track that references it; **Save As** creates a new independent program. Pausing playback releases both cursor and glissando voices; resuming recreates only voices whose geometry is active at that score time. Ordinary Pulse triggers keep their discrete MIDI note behavior.

The default visual mappings are:

- cursor world-space Y, or the continuous trigger intersection Y → fractional pitch;
- support-curve or trigger stroke width → pressure and gain;
- cursor world-space speed → filter brightness.

These remain global score-to-synth mappings in configuration version 2; voice and envelope values now belong to programs. Curve/cursor metadata remains the durable authored source, which leaves room for per-object overrides and arbitrary routed parameters later.

## Source layout

- `src/expressiveSynth.js` owns configuration normalization, visual-to-sound mapping, Web Audio voice graphs, lifecycle, the raw-MIDI compatibility adapter, and local-storage identity.
- `src/ExpressiveSynthPanel.jsx` is the dockable `/synth` program editor. It contains engine recovery/testing, the factory/scene program library, envelope and model controls, and shared score mappings.
- `src/InfoPanel.jsx` is the dockable/floating `/info` view. Hovering or focusing annotated controls sends their longer explanation there while the ordinary browser title remains available as a compact tooltip.
- `src/expressiveSynthDemo.js` is a pure scene generator for the six-voice glissando study. It returns ordinary Excalidraw elements with normalized IanniX metadata; it does not manipulate React or the canvas directly.
- `src/mixerSystem.js` and `src/MixerPanel.jsx` own track identity, destination/instrument/program/channel assignment, and routing UI.
- `src/App.jsx` owns the user-gesture boundary, mixer fan-out, playback synchronization, scene installation, transport setup, and persistence integration.
- `src/sceneExchange.js` stores normalized synth and mixer configuration in Underscores scene metadata version 4. Hardware MIDI port identity remains a local/browser capability unless explicitly assigned to a local mixer track.

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

The five factory programs are immutable and intentionally small and dependency-free:

- **Pure tone:** sine carrier.
- **Warm subtractive:** sawtooth carrier through the shared filter/envelope architecture.
- **FM voice:** sine carrier with a 2:1 sine modulator and pressure-dependent modulation depth.
- **Bowed string:** sawtooth carrier, slightly detuned triangle companion, and low-level pressure-dependent noise.
- **Reed / wind:** square carrier, second-harmonic sine companion, and lower-level breath noise.

All programs add a sine vibrato oscillator. Factory programs can be auditioned and used as **Save As** starting points. Scene programs store a factory synthesis model plus normalized voice gain, ADSR, brightness, damping, pressure, transpose, glide, and vibrato values. Continuous frequency updates use the program's glide time; gain, filter, and pan use short smoothing constants. The voice limit evicts the oldest voice when required. **Panic** releases all current voices, while **Reset audio** closes the old context and constructs a fresh engine.

The raw-MIDI adapter exists so trigger patterns and History replay can target the same output contract. It supports note on/off, CC 74 brightness, CC 11 expression, and channel pitch bend with a two-semitone range. Cursor voices do not pass through that adapter and therefore do not share MIDI-channel pitch bend.

## How the Metastaseis-inspired demo is built

The demo uses six voices rather than attempting to reproduce the complete orchestral reference. `createExpressiveSynthDemoScore()` creates only eight ordinary scene objects:

1. One orange horizontal IanniX Curve is the 12-second timeline.
2. One black Cursor is linked to that curve and crosses the score from left to right.
3. Six blue line Triggers cross the timeline. Each uses Behavior `glissando`, has its own MIDI channel `1..6`, and remains an editable geometric pitch contour.
4. Runtime collision uses the trigger's visible stroke footprint, but pitch comes from the authored centerline so thick and freehand contours do not wobble between outline edges.
5. Entry emits internal note-on semantics, the live intersection Y updates fractional pitch, trigger velocity and width shape pressure/gain, and exit emits note-off semantics.

The stable command `expressiveSynth.demo.create` remains exposed as `/synth demo` for development and regression work, but is no longer a permanent Synth-panel control. The App command handler appends the eight elements, frames them, configures the first six mixer tracks as internal bowed Expressive Synth routes on channels 1–6, centers middle C on the demo's Y origin, lowers gain for simultaneous voices, enables the `0..12 s` transport loop, forces a reproducible 1× rate, and starts playback. The complete geometry addition is one normal scene-history operation, so Undo removes it.

The corresponding portable scene fixture is [`examples/glissandi.json`](examples/glissandi.json). It is useful for testing the complete scene import path, including linked cursor hosts, transport state, grid metadata, and the Expressive Synth configuration.

The same pattern can be used for an authored score: draw one timeline Curve and Cursor, set each sounding contour to Trigger → Continuous glissando, and assign its Mixer channel. The `modulation.x` and `modulation.y` values are already carried with each active route for future general parameter routing; v1 directly applies pitch, trigger velocity, stroke width, and cursor speed. Continuous external MIDI/MPE output is future work; this geometry-gated mode currently targets internal Expressive Synth tracks.

## Persistence

Normalized synth settings and user programs are written to `underscores_expressive_synth_v1`; mixer tracks are written to `underscores_mixer_v1`. Scene export stores both normalized configurations so programs, pitch mapping, and track routing travel with the score. Factory programs are code-owned defaults and are not duplicated into scene JSON. Importing a scene applies both; selection-only exchange does not replace scene-global settings. See [Mixer and score-output routing](mixer.md).

## Verification

Unit coverage checks configuration clamps, continuous Y-to-pitch polarity, exact path intersection, stroke-width and speed expression, durable curve/cursor links, unique IDs, six independently routed trigger contours, and scene persistence.

Browser QA for this checkpoint used the actual `/synth` panel in the embedded browser:

1. Run `/synth demo` from the command palette.
2. Confirm the panel reports active voices only while the cursor intersects one or more blue triggers.
3. Confirm the bowed preset and demo mapping values are installed.
4. Confirm the single black cursor moves on the orange timeline while the six blue contours remain editable.
5. Confirm the transport is playing at 1× with loop range `0..12 s`.
6. Confirm overlapping trigger contours produce simultaneous independently pitched voices.
7. Pause and confirm all glissando voices release.
8. Check the browser console for audio or scene errors.

The regression suite covers synth and user-program normalization, continuous pitch mapping, routed scene metadata, and the six-channel example. Browser QA should confirm program Save/Save As/Delete, Mixer factory/scene program assignment, the dockable Info view, six simultaneous demo voices, transport looping, and clean console output.
