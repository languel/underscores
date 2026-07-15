# IanniX Score Engine Notes

Last updated: 2026-07-15

This note records Drawerator's first IanniX-inspired score slice. It adapts the concepts from the local IanniX project without coupling score semantics to its original renderer or OSC layer.

## Phase-one contract

Any Excalidraw element can carry one score role:

- **Curve** — an editable support path.
- **Cursor** — the object itself is a playhead whose geometry is translated and optionally rotated along a linked curve.
- **Trigger** — core geometry that pulses once when a cursor enters it and rearms after exit.

Multiple simultaneous roles, external outputs, and persistent routing graphs are later extensions. Phase one intentionally keeps the relationship explicit: a cursor stores one `curveId`, and a trigger listens to all active cursors.

## Element data model

Score metadata lives beside modifier metadata in `element.customData.iannix`:

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

The selected object's **IanniX** tab is the editor for these properties. A multi-selection exposes batch role assignment and allocates conflict-free role labels such as `Curve 1`, `Curve 2`, and `Cursor 1` in one history transaction. Timing and cursor links remain per-object edits. The tab sits beside **Stack** and **Script** because all three are contextual views of the same selected object.

## Global and local time

The flat, theme-aware transport owns global score time `T`, tempo, meter, playback rate, loop range, play/pause, rewind, and seeking. Its ruler projects the same seconds clock as frames, non-drop timecode (24/25/30/50/60 FPS), or bars·beats·16ths; a separate frame counter remains visible in every mode. The lower timeline lane reserves space for upcoming keyframes. Drag anywhere in the lane to scrub the playhead, drag either loop handle to set an endpoint, drag the shaded band to move the complete loop, or Shift-drag to mark a new loop. Loop text fields use the selected ruler unit and convert back to seconds internally. `Ctrl+Opt+T`, legacy `Cmd+Ctrl+T`, or `/transport` toggles visibility. Transport shares Drawerator's persistent panel placement model: drag its stopwatch icon to float it or return it to the bottom dock, or right-click the icon for explicit placement. A plain click does not detach it. Global transport and MIDI settings live in dockable **Settings → Score & MIDI** and do not belong to an individual trigger. Every active score object derives its local time rather than owning a second animation loop:

```text
unbounded = (T - start) * rate
progress  = loopMode(unbounded / duration)
localTime = progress * duration
```

Before `start`, progress is zero. **Once / hold** clamps at either endpoint, **Loop** wraps, and **Ping-pong** alternates direction. This role-independent clock is deliberately reusable for future draw-on animation of any object.

Evolving-brush time remains separate. `brushElapsedMs` describes how a brush was rendered while drawing; IanniX object time describes when and where the underlying score object participates.

### MIDI clock synchronization

The transport supports three clock modes: **Internal**, **MIDI OUT**, and **MIDI IN**. MIDI clock uses the standard 24 pulses per quarter note and Web MIDI realtime bytes: Clock `F8`, Start `FA`, Continue `FB`, Stop `FC`, plus Song Position Pointer `F2` in sixteenth-note units. In receive mode, incoming clock drives score time and estimates tempo with light damping; the BPM control becomes read-only. In send mode, Drawerator emits Start/Stop and a tempo-derived clock pulse stream to the selected global MIDI output. Ableton Live can therefore follow Drawerator when its MIDI Sync input is enabled, or drive Drawerator when its Sync output is enabled.

Cursor `visualSmoothing` is a display-only low-pass factor for runtime position and tangent angle. It defaults to `0.65`. Trigger collision and event timing always use the raw score transform, never the damped overlay transform.

## MIDI trigger compatibility

Drawerator's first MIDI slice follows IanniX's message URL convention and its default trigger template:

`midi://midi_out/notef 1 trigger_value_y trigger_value_x trigger_duration`

- `/note` accepts channel `1..16`, MIDI note `0..127`, velocity `0..127`, and duration in seconds.
- `/notef` uses the same argument order but scales note and velocity from `0..1` to `0..127`, matching `InterfaceMidi::send()`.
- `/cc` accepts channel, controller, and value as MIDI integers. `/ccf` scales its value from `0..1` to `0..127`, matching IanniX's cursor-to-controller template.
- Note-on uses status `0x90 + channel - 1`; a scheduled note-off uses `0x80 + channel - 1` after `trigger_duration`.
- `midi_out` resolves to the output selected in Drawerator's global **Settings → Score & MIDI** panel. Browser permission is requested only when **Connect MIDI** is pressed there.
- Matching IanniX `NxCursor::getCursorValue(triggerPos)`, `trigger_value_x` and `trigger_value_y` are the trigger's position mapped through the colliding cursor's curve bounds. Drawerator also mirrors IanniX's default bounds-source mode by expanding those bounds by half the cursor dimensions; this avoids collapsing ordinary edge intersections immediately to `0` or `1`. Y is inverted so upward is higher.
- Collision entry remains the event source. Visual cursor damping never changes MIDI or trigger timing.
- **Test Message** resolves the current collision cursor when possible, otherwise the cursor whose support curve is nearest the selected trigger. Its preview and emitted bytes are therefore the same message that trigger would emit during playback rather than a fixed middle-C test.

The Trigger panel provides these templates while keeping the URL pattern editable:

- **IanniX XY note** — the original `notef` template using mapped trigger Y for pitch and X for velocity.
- **Cursor-relative pitch** — projects the closest cursor/trigger intersection onto the cursor's signed primary axis. Cursor center is the base note; either end reaches the cursor or curve's configured ± octave range. This adds `trigger_offset` (`-1..1`) and resolved integer `trigger_note` tokens.
- **Fixed note** — the documented IanniX `/note 1 69 127 5` family with editable note, velocity, and channel.
- **Cursor Y → CC** — the documented `/ccf 1 0 cursor_value_y` family with editable controller and channel.
- **Custom pattern** — direct editing for supported tokens and commands.

IanniX JavaScript expressions and the `/pgm` and `/bend` message families remain future extensions.

## Core geometry versus rendered appearance

Score evaluation uses the underlying editable object, not live modifier output:

- Lines, arrows, and freehand strokes use `customData.originalPoints` when a modifier stack has preserved them; otherwise their native Excalidraw points are used.
- Rectangles, diamonds, and ellipses expose deterministic outline paths.
- Mods & FX continues to render or bake appearance above that core geometry.

This boundary prevents a Hairy Brush, Rake, bake operation, or hidden original path from silently changing cursor routing or trigger topology.

## Runtime evaluation

`src/iannixEngine.js` is a pure score kernel. For each frame it:

1. normalizes score metadata;
2. derives each object's local time and progress;
3. samples each cursor's linked curve by arc length;
4. builds a display transform from the source cursor's center to that sample, optionally using the curve tangent;
5. transforms cursor core paths for collision and overlay rendering;
6. tests both the current cursor paths and the swept paths since the previous frame against every active trigger.

Swept testing prevents a fast cursor from tunneling through a narrow trigger between animation frames. Loop discontinuities do not create a false sweep across the canvas. The React layer tracks enter/exit state so a trigger fires once on entry, pulses for its configured duration, and rearms only after the cursor exits.

Cursor motion is a runtime SVG overlay, leaving the authored Excalidraw geometry untouched and editable. Once an active cursor is linked, its in-place Excalidraw source and the ordinary modifier overlay are hidden. The runtime overlay reconstructs the cursor's complete visible appearance—source path, filters, and every generated brush track—then applies the curve translation and tangent rotation to that whole result. Unlinking, deactivating, or changing the role restores the authored source opacity. This is a non-destructive authoring model, not a bake.

Trigger pulses use the same overlay. Curve/Cursor/Trigger labels are a global display aid controlled from the transport; they are off by default and remain independent of per-object label text.

## History and persistence

Role and property edits update only the selected element's `customData` and commit through Excalidraw history. They therefore serialize with the scene and participate in undo/redo.

The IanniX tab's **Scene data** section adds an explicit exchange layer:

- **Export scene** writes standard Excalidraw JSON with a small top-level `drawerator` envelope for score time/rate. All element `customData`—including modifier stacks, IanniX roles, curve links, timing, and MIDI patterns—remains embedded on its objects.
- **Import scene** restores the complete scene, files, and Drawerator transport metadata.
- **Copy selection JSON** serializes the selected objects and modifier-generated children to the clipboard.
- **Paste selection JSON** assigns collision-safe element/group IDs, remaps parent and cursor-to-curve links, offsets the pasted copy, and selects it.

The selected MIDI hardware output is intentionally not serialized because it is a local browser/device choice.

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
