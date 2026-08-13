# Score Engine Notes (legacy IanniX compatibility)

Last updated: 2026-07-23

This note records Underscore's first IanniX-inspired score slice. It adapts the concepts from the local IanniX project without coupling score semantics to its original renderer or OSC layer.

## Phase-one contract

Any Excalidraw element can carry one score role:

- **Curve** — an editable support path.
- **Cursor** — the object itself is a playhead whose geometry is translated and optionally rotated along a linked curve.
- **Trigger** — core geometry that pulses once when a cursor enters it and rearms after exit.

Multiple simultaneous roles, external outputs, and persistent routing graphs are later extensions. Phase one intentionally keeps the relationship explicit: a cursor stores one `curveId`, and a trigger listens to all active cursors.

## Element data model

Score metadata lives beside modifier metadata in `element.customData.score`:

```js
{
  version: 1,
  role: null | "curve" | "cursor" | "trigger",
  active: true,
  label: "",
  time: {
    start: 0,
    duration: 5,
    rate: 1,
    loopMode: "once" | "loop" | "pingPong",
  },
  cursor: {
    curveId: null,
    followTangent: true,
  },
  trigger: {
    duration: 0.35,
  },
}
```

The independent dockable **Score** panel edits these properties. Its Object and Data tabs separate role configuration and compact custom data from the Mods & FX rendering stack. A selected object with a Score role also exposes its basic role, label, and active state in a pinned **Score role** section at the top of Properties. Trusted script catalogs and one-line commands live in the standalone typed **Script** panel under the **Score** script type. A multi-selection exposes batch role assignment and allocates conflict-free role labels such as `Curve 1`, `Curve 2`, and `Cursor 1` in one history transaction. Same-role selections also expose a shared Data editor: mixed primitive values appear blank, edits apply atomically to every compatible selected object, and `${n}` label templates expand in stable one-based scene order. `customData.iannix` remains a read/write compatibility alias for older scenes and scripts.

## Global and local time

The flat, theme-aware transport owns global score time `T`, tempo, meter, playback rate, loop range, play/pause, rewind, and seeking. Its ruler projects the same seconds clock as frames, non-drop timecode (24/25/30/50/60 FPS), or bars·beats·16ths; a separate frame counter remains visible in every mode. Major and minor grid lines adapt to the current display unit, visible time window, meter, FPS, and pixel width. Command-drag snaps the playhead or loop handles to major units; Command-Shift-drag snaps to subunits. The lower timeline lane reserves space for upcoming keyframes. Drag anywhere in the lane to scrub, drag either loop handle to set an endpoint, drag the shaded band to move the complete loop, or Shift-drag to mark a new loop. The bottom overview bar pans and resizes the visible time window; Command-click fits the complete score and Option-click fits the active loop. Loop text fields use the selected ruler unit and convert back to seconds internally. `Ctrl+Opt+T`, legacy `Cmd+Ctrl+T`, or `/transport` toggles visibility. Transport shares Underscore's persistent panel placement model: drag its stopwatch icon to float it or return it to the bottom dock, or right-click the icon for explicit placement. A plain click does not detach it. Global transport and MIDI settings live in dockable **Settings → Score & MIDI** and do not belong to an individual trigger. Every active score object derives its local time rather than owning a second animation loop:

```text
unbounded = (T - start) * rate
progress  = loopMode(unbounded / duration)
localTime = progress * duration
```

Before `start`, progress is zero. **Once / hold** clamps at either endpoint, **Loop** wraps, and **Ping-pong** alternates direction. This role-independent clock is deliberately reusable for future draw-on animation of any object.

Evolving-brush time remains separate. `brushElapsedMs` describes how a brush was rendered while drawing; IanniX object time describes when and where the underlying score object participates.

### MIDI clock synchronization

The transport supports **Internal**, **MIDI OUT**, and **MIDI IN** clock modes. MIDI clock uses the standard 24 pulses per quarter note and Web MIDI realtime bytes: Clock `F8`, Start `FA`, Continue `FB`, Stop `FC`, plus Song Position Pointer `F2` in sixteenth-note units. Incoming pulses advance score phase without assuming that they contain a numeric BPM value; the user-visible tempo therefore remains stable by default and can be matched manually. The optional receiver estimator uses a median-gated interval window and damping rather than individual browser event intervals. In send mode, Underscore emits Start/Stop and a tempo-derived pulse stream. MIDI input and output each support a concrete device, **All**, or **None**, and the global settings can independently enable clock receive and send.

Cursor `visualSmoothing` is a display-only low-pass factor for runtime position and tangent angle. It defaults to `0.65`. Trigger collision and event timing always use the raw score transform, never the damped overlay transform.

## MIDI trigger compatibility

Underscore's first MIDI slice follows IanniX's message URL convention and its default trigger template:

`midi://midi_out/notef 1 trigger_value_y trigger_value_x trigger_duration`

- `/note` accepts channel `1..16`, MIDI note `0..127`, velocity `0..127`, and duration in seconds.
- `/notef` uses the same argument order but scales note and velocity from `0..1` to `0..127`, matching `InterfaceMidi::send()`.
- `/cc` accepts channel, controller, and value as MIDI integers. `/ccf` scales its value from `0..1` to `0..127`, matching IanniX's cursor-to-controller template.
- Note-on uses status `0x90 + channel - 1`. During score playback, note-off uses `0x80 + channel - 1` when the cursor exits the trigger geometry. `trigger_duration` is the minimum/fallback: a shorter or swept contact is held until that duration, while a longer geometric contact remains sounding until exit. Test messages and non-geometric callers retain scheduled-duration behavior.
- Overlapping notes are tracked per output, channel, and pitch. One cursor/trigger gate cannot end another overlapping occurrence; the final note-off is emitted only when the last active gate exits or reaches its minimum duration.
- `midi_out` resolves through every audible Mixer track whose MIDI channel matches the message. Browser permission is requested only when **Connect MIDI** is pressed; internal tracks need no hardware permission.
- Matching IanniX `NxCursor::getCursorValue(triggerPos)`, `trigger_value_x` and `trigger_value_y` are the trigger's position mapped through the colliding cursor's curve bounds. Underscore also mirrors IanniX's default bounds-source mode by expanding those bounds by half the cursor dimensions; this avoids collapsing ordinary edge intersections immediately to `0` or `1`. Y is inverted so upward is higher.
- Collision entry remains the note-on source and collision exit is the note-off source. The activity highlight follows the same gate and uses the same minimum fallback. Visual cursor damping never changes MIDI, highlight, or trigger timing.
- **Test Message** resolves the current collision cursor when possible, otherwise the cursor whose support curve is nearest the selected trigger. Its preview and emitted bytes are therefore the same message that trigger would emit during playback rather than a fixed middle-C test.

The Trigger panel provides these templates while keeping the URL pattern editable:

- **IanniX XY note** — the original `notef` template using mapped trigger Y for pitch and X for velocity.
- **Cursor-relative pitch** — projects the closest cursor/trigger intersection onto the cursor's signed primary axis. Cursor center is the base note; either end reaches the cursor or curve's configured ± octave range. This adds `trigger_offset` (`-1..1`) and resolved integer `trigger_note` tokens.
- **Fixed note** — the documented IanniX `/note 1 69 127 5` family with editable note, velocity, and channel.
- **Cursor Y → CC** — the documented `/ccf 1 0 cursor_value_y` family with editable controller and channel.
- **Custom pattern** — direct editing for supported tokens and commands.

IanniX JavaScript expressions and the `/pgm` and `/bend` message families remain future extensions.

Trigger entry policy is configurable in **Settings → Score & MIDI**. The default latched policy treats a trigger as one shared voice source across all cursors and applies the configured minimum-duration lockout, matching the reference scores' non-retriggering behavior. Disabling latching permits independent cursor-trigger pairs to retrigger the same trigger.

### Trusted `.iannix` import

The Scene data section can execute an explicitly trusted `.iannix`/JavaScript score. The compatibility runner provides IanniX's `run()`, `load()`, `loadJSON()`, `makeWithScript()`, common math helpers, deterministic session time, and seeded randomness. Supported object/geometry/link/property commands are collected into the recordable `iannix.import.trusted` command and translated to native Underscore elements with stable import IDs. Each emitted element also stores `customData.iannixImport.scoreId` and `scoreLabel`, while `setGroup` stores the authored value in `customData.iannixImport.group`.

The Outliner renders those fields as a virtual semantic tree:

```text
Score · <saved script name, file name, or title()>
  IanniX · <setGroup value>
    Canvas group · <Excalidraw groupId>
      Curve / Cursor / Trigger
```

This is intentionally not encoded into Excalidraw `groupIds`: IanniX groups express score semantics and style targeting, whereas native groups own selection and transform behavior. Updating `setGroup` through the IanniX command line moves the object between the virtual group rows immediately. Re-running a saved score reuses its score identity, allowing the Outliner branch to remain stable.

Missing or unsupported commands are reported through UI status and events instead of being silently discarded.

This is trusted executable compatibility mode, not a sandbox or security boundary. Underscore always presents a warning before file execution.

### AI-authored scripts

The AI Assistant receives a compact IanniX-specific authoring contract only for IanniX or score-script requests. AI source must define `makeWithScript()` or `madeThroughGUI()` and create the score through supported `run("command …")` families; it must not use browser APIs, `Date`, storage, network access, or generic JavaScript return values as a substitute for IanniX commands. Underscore compiles and statically checks AI source before saving or running it, reports unsupported commands to the chat, and leaves existing scripts untouched on failure. Brush/modifier source is checked similarly: it must be a `(points, globals) => tracks` function that returns drawable tracks.

### One-line commands from the command palette

The command palette accepts `/ix <command>` (and the longer `/iannix <command>`) and passes the remaining text to the same trusted interactive compatibility executor used by the IanniX panel. For example, `/ix clear` is also listed as **IanniX: Clear Scene** and clears objects, score runtime state, and selection without the browser confirmation used by Excalidraw's native clear action. It preserves the active Underscore canvas/theme background. Commands that target the current object, `@selection`, or `#id` / `#label` use the same selection expansion rules as the IanniX command line.

### Shared script parameters

Brush and IanniX editors use the same typed script-parameter parser. A native IanniX declaration such as:

```js
ask("Lines", "Quantity", "indexMax", 30);
```

automatically creates a themed numeric field for the IanniX adapter in the standalone Script panel, persists its value with that saved script, and supplies the selected value to `ask()` during execution. Underscore infers a useful range when the IanniX source provides only a default. Authors can refine the field with the same annotation used by brush scripts:

```js
// @param indexMax = 30 (1..100, step: 1)
ask("Lines", "Quantity", "indexMax", 30);
```

When both declarations exist, `ask()` supplies the human-facing category and label while `@param` supplies the default, range, and step. The shared parser lives in `src/scriptParameters.js` so brush and score scripts cannot drift into separate parameter conventions.

## Core geometry versus rendered appearance

Score evaluation uses the underlying editable object, not live modifier output:

- Lines, arrows, and freehand strokes use `customData.originalPoints` when a modifier stack has preserved them; otherwise their native Excalidraw points are used.
- Rectangles, diamonds, and ellipses expose deterministic outline paths.
- Elements with `customData.underscoreGeometry.kind === "cubicBezierPath"` use their canonical cubic anchors and handles for sampling, length, tangent, collision, modifiers, automation, and history. Their native Excalidraw `points` are adaptive derived data only.
- Mods & FX continues to render or bake appearance above that core geometry.

This boundary prevents a Hairy Brush, Rake, bake operation, or hidden original path from silently changing cursor routing or trigger topology.

### Canonical cubic Bézier schema

Canonical geometry is normalized in the host element's local coordinate system, so Excalidraw remains authoritative for movement, rotation, grouping, undo, and non-uniform scaling:

```js
customData.underscoreGeometry = {
  version: 1,
  revision: 1,
  kind: "cubicBezierPath",
  closed: false,
  anchors: [
    { x, y, in: [dx, dy] | null, out: [dx, dy] | null, mode: "smooth" | "corner" },
  ],
};
```

`src/bezierGeometry.js` owns conversion, adaptive subdivision, cached cumulative arc length, coordinate transforms, de Casteljau insertion, anchor editing, and host-polyline regeneration. Native line and freehand elements remain unchanged until explicitly converted. Imported ellipses remain analytic.

IanniX controls use destination-point semantics. For segment `p1 → p2`, Underscore maps the first control to `p1 + p2.c1` and the second to `p2 + p2.c2`; zero controls remain straight. `setSmoothPointAt` receives the compatible automatic tangent construction. Export performs the inverse mapping back to `setPointAt` commands.

Canonical paths are hosted by native Excalidraw linear elements whose first derived point must remain local `[0, 0]`. Imported controls may extend beyond the first anchor, so using the control-point bounding-box origin as the host origin is invalid: Excalidraw rebases that host when it is selected and the curve appears displaced. Import now anchors the host at the first canonical point, preserves world geometry through rotation and scaling, and migrates legacy malformed hosts on scene change without committing the derived repair to undo history.

### Editing and grid interaction

The native Excalidraw polyline is derived data, not a second source of truth. Converting a selected line or freehand path clears any active native linear-point editor before the canonical Bézier editor is used. Command-click editing exposes anchors and handles; ordinary selection-mode drags on a canonical anchor are routed through the same canonical geometry update and therefore honor the Underscore Global Grid's point snapping. Native non-canonical line point edits preserve the selected point index so release quantization can update the authored point without transforming the whole element.

The Grid panel keeps snapping targets intentionally distinct: **Input** snaps a newly authored pointer sample, **Transforms** applies one shared snap delta to a moved or resized selection, **Points** quantizes native and canonical path point edits, and **Generated** is opt-in for modifier or generated geometry. The visual grid is dotted while snapping is off and solid while hard or magnetic snapping is active, so the canvas state is legible without relying only on the panel.

Shift-right-click offers the same geometry conversion workflow for lines, freehand paths, rectangles, diamonds, and ellipses. **Convert to Path** makes a clean closed native line, **Convert to Spline** makes an editable canonical Bézier path, **Convert to Freehand Pencil** makes a closed pressure-neutral freedraw stroke, and **Convert Selection to SVG** replaces the selected native objects with one source-preserving SVG host. **Make Cursor**, **Make Curve**, and **Make Trigger** assign score roles directly; **Add Cursor to Selected Curves** remains the separate action that creates runtime cursor objects and links them to the selected geometry. These conversions preserve the real selectable geometry, use zero sloppiness, and never leave a snapped overlay over stale source points. New rectangles and diamonds default to sharp corners; all newly authored shapes default to sloppiness `0`.

## Runtime evaluation

`src/iannixEngine.js` is a pure score kernel. For each frame it:

1. normalizes score metadata;
2. derives each object's local time and progress;
3. samples each cursor's linked curve by arc length;
4. builds a display transform from the source cursor's center to that sample, optionally using the curve tangent;
5. transforms cursor core paths for collision and overlay rendering;
6. tests both the current cursor paths and the swept paths since the previous frame against every active trigger.

Swept testing prevents a fast cursor from tunneling through a narrow trigger between animation frames. Loop discontinuities do not create a false sweep across the canvas. Collision state supports both shared-trigger latching and independent cursor-trigger entry. Geometry supplies the normal activity and note duration; the configured minimum handles contacts too brief to remain active for a complete frame and prevents accidental rapid retriggers.

Freedraw triggers are an additive Underscore geometry extension. Excalidraw may persist a click as one sample or several coincident samples; Underscore recognizes either representation. A point-like trigger's authored point remains the score position and grid-snapping anchor, while collision evaluation creates a circular footprint matching Excalidraw's rendered freedraw diameter (`strokeWidth × 4.25`). Non-degenerate freedraw triggers retain their authored centerline and add a rendered stroke envelope with segment bodies and rounded end caps. Collision therefore respects stroke thickness even for zero-width vertical paths or a cursor traveling inside a parallel stroke. Imported IanniX geometry and non-trigger paths keep their existing semantics.

### Performance checkpoint

The score kernel keeps canonical geometry and adaptive sampling intact while avoiding repeated work during playback. Core paths, Bézier metrics, normalized IanniX metadata, prepared trigger paths, and trigger bounds are cached by immutable element/geometry revisions; trigger collision uses broad-phase bounds rejection before exact path tests. Runtime evaluation is performed once per frame, React transport commits are capped at the configured refresh rate, incoming MIDI-clock updates are batched, and automation scans are skipped when no tracks exist. Overlay-only evaluations disable collision detection so visual refreshes do not duplicate score events.

Profiling representative examples in `~/Documents/IanniX/Examples` showed script parsing/model construction was not the dominant cost; repeated per-frame geometry/collision work and top-level React updates were. Dense imported scores therefore retain visual fidelity while benefiting from these caches. Future scaling work should focus on worker/off-main-thread evaluation, explicit cache invalidation instrumentation, and bundle splitting rather than reducing curve sampling globally.

Cursor motion is a runtime SVG overlay, leaving the authored Excalidraw geometry untouched and editable. Once an active cursor is linked, its in-place Excalidraw source and the ordinary modifier overlay are hidden. The runtime overlay reconstructs the cursor's complete visible appearance—source path, filters, and every generated brush track—then applies the curve translation and tangent rotation to that whole result. Unlinking, deactivating, or changing the role restores the authored source opacity. This is a non-destructive authoring model, not a bake.

Trusted import clears previous cursor transforms, collision state, trigger pulses, score events, and transport time before replacing the scene. This prevents runtime overlays from an earlier score from leaking into a newly imported score or becoming visible only after selection changes.

Trigger pulses use the same overlay. Curve/Cursor/Trigger labels are a global display aid controlled from the transport; they are off by default and remain independent of per-object label text.

## History and persistence

Role and property edits update only the selected elements' `customData` and commit through Excalidraw history. A bulk property edit is one scene transaction, so the complete selection participates in undo/redo together and serializes with the scene.

The IanniX panel's **Data** tab adds an explicit exchange layer:

- **Export scene** writes standard Excalidraw JSON with a small top-level `underscore` envelope for score time/rate. All element `customData`—including modifier stacks, IanniX roles, curve links, timing, and MIDI patterns—remains embedded on its objects.
- **Import scene** restores the complete scene, files, and Underscore transport metadata.
- **Copy/Paste scene JSON** provides the same whole-scene exchange through the clipboard for browser shells that suppress file downloads.
- **Copy selection JSON** serializes Underscore's combined native/runtime selection, modifier-generated children, and the linked cursor–curve component to the clipboard. A hidden runtime cursor therefore cannot silently disappear from a copied score.
- **Paste selection JSON** assigns collision-safe element/group IDs, remaps parent and cursor-to-curve links, offsets the pasted copy, and selects it.

The scene's normalized track routing is serialized. Concrete hardware availability remains browser/device-local, so an imported external route may appear as unavailable until that port exists on the current machine.

### Mixer and internal GM output

`src/mixerSystem.js` resolves score events by MIDI channel across one or more tracks. A track chooses None, Internal audio, or a concrete Web MIDI output plus an instrument and program. Enabled, Mute, and Solo state filter the fan-out. MIDI clock continues to target external outputs only through the separate Clock output preference.

`src/internalMidiSynth.js` is the only TinySynth-specific layer. It lazy-loads `jzz` and `jzz-synth-tiny` from the bundle after a user gesture, adapts raw `send(data, timestamp)` calls, filters system realtime messages, converts future DOM timestamps to cancellable timers, and owns Web Audio resume/dispose behavior. TinySynth supports note on/off (including velocity-zero note-on), program change, pitch bend, sustain and the common panic controllers; unsupported messages are harmlessly ignored by the backend. Timer scheduling is browser-main-thread scheduling, so it is less precise than a native Web MIDI destination under heavy load.

The Score & MIDI panel exposes a direct **Test audio** C4 independent of score links and a **Reset audio** action that panics, closes, and recreates TinySynth and its AudioContext. **Test Web Audio** plays a short raw oscillator tone through a separate temporary context, making it possible to distinguish synth/MIDI routing problems from an embedded browser's audio-output problem. It reports the running sample rate and destination channel count after rendering. A closed context is reported as an error rather than as Ready.

Web MIDI remains a browser-owned capability. Underscore requests standard non-SysEx access only and reports the browser's rejection without weakening its permission model. The current Codex/ChatGPT browser profile can persist an allow entry for the Underscore origin while still rejecting `requestMIDIAccess()` before port enumeration; external Chromium browsers enumerate the same hardware correctly. Use the internal GM synth for embedded-harness audio testing and an external browser for physical MIDI until the host permission/service integration is corrected.

The complete GM Level 1 program table and one-based UI-channel helpers live in `src/generalMidi.js`. Stored programs remain zero-based MIDI values and channel 10 is fixed as percussion. Mixer programs are reapplied on initialization and audio resume. Mixer state and History's MIDI-armed toggle use local browser storage and are normalized for older or invalid saved values.

History actions continue to store the IanniX pattern and resolved context, not an output ID or TinySynth event. The same recording can therefore replay through the current mixer configuration.

### Expressive Web Audio output

`src/expressiveSynth.js` provides an internal Mixer instrument for scores that require independently continuous pitch, such as dense string glissandi. Every active cursor owns a Web Audio voice keyed by mixer-track and cursor identity; world-space Y maps to continuous MIDI pitch and frequency, while cursor speed and host stroke width can independently drive brightness and pressure. Because voices are not multiplexed through MIDI pitch bend, simultaneous curves can glide independently.

The separate `/synth` inspector exposes shared synthesis and mapping defaults; `/mixer` chooses an Expressive Synth preset per track. Trigger patterns can target the same engine through its route-scoped raw-MIDI adapter. Normalized synth and mixer configuration are remembered locally and serialized in Underscore scene metadata.

Routing is channel-based. A linked Cursor may sound continuously through matching expressive tracks, while a Trigger set to **Continuous glissando** acts as a geometric gate: cursor entry starts the voice, the exact intersection Y drives fractional pitch, and exit releases it. Trigger length is therefore note duration, and each trigger's MIDI channel selects one or more Mixer tracks. Ordinary Pulse triggers retain their existing MIDI event behavior. The development command `/synth demo` creates a compact Metastaseis-inspired score using one timeline curve, one moving cursor, six geometric trigger contours, and six expressive tracks on channels 1–6. The generator and complete construction, synthesis, persistence, and QA details are documented in [Expressive Synth architecture and glissando study](expressive-synth.md); the track model is documented in [Mixer and score-output routing](mixer.md).

## Extension points

The current model is designed to grow in these directions without changing its core boundary:

- allow an object to own multiple roles;
- add per-object draw-on and reveal envelopes driven by the same local clock;
- add curve speed maps or authored timing functions;
- add typed trigger payloads and OSC/MIDI/WebSocket output adapters;
- render the cursor's full Mods & FX appearance in the runtime overlay;
- add score-level routing, groups, mute/solo, and transport ranges.

## Verification

Run before committing score-engine work:

```bash
npm test
npm run lint
npm run build
```

`src/iannixEngine.test.js` covers normalization, once/loop/ping-pong timing, core-geometry isolation from modifiers, path sampling, cursor transforms, current and swept collisions, and a Curve/Cursor/Trigger vertical slice.

Rendered QA should additionally exercise:

- role assignment and persistence on three separate objects;
- cursor-to-curve selection;
- play, pause, rewind, seek, and global rate;
- a cursor visibly following its curve;
- one trigger event on entry and rearming after exit;
- per-object start, duration, rate, and loop changes;
- modifying or baking an object's appearance without changing score geometry.

Current checkpoint: the Grid and IanniX logo examples import with canonical curves, cursor orientation/size, score-relative timing, role theming, and stable selection of imported Bézier hosts. Further sessions should continue broader `.iannix` command/message parity, MIDI/OSC behavior, and import coverage for scores beyond the two reference examples.
