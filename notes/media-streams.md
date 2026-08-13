# Media streams

Underscores media inputs are persistent source objects that do not require an Excalidraw host.
Camera and media sources live in a small local catalog, but catalog membership alone does not
start decoding, capture, or playback. A source runtime is demanded only while its source is
selected in the Media panel or while an enabled scene object references it. This keeps the
catalog cheap while preserving one shared processed output for the panel preview, canvas views,
and downstream processors that actually consume it.

The media graph has four principal kinds:

- `camera` acquires a selected `videoinput` with `getUserMedia`;
- `media` decodes an image, animated GIF, or video from a URL or session-local file;
- `holistic` is a transformable canvas processor that consumes a source by stable source id and
  renders MediaPipe pose, hand, and sampled face landmarks;
- `unicursal` is a transformable artistic drawing that consumes a Holistic frame, generates one
  stable person-shaped route, and publishes it as a typed path stream.

Open the source catalog with `/media` (the `/media-input` alias remains available), signal streams with
`/inputs`, and processors with `/holistic`. Creating an input adds it to the panel catalog only.
Selecting a source starts its preview and playback; its transport controls still determine whether
it is playing, and its mute control determines whether audio is audible. Press **Escape** to clear
the panel selection. **Show as canvas object** adds or removes an ordinary transformable view;
an enabled preview, Holistic processor, or derived Unicursal object keeps the source runtime alive
even when the panel selection is cleared. Canvas opacity and Outliner visibility affect that view
only, so a hidden source view remains available to active downstream processors. A disabled scene
object no longer demands its input source.

## One processed output

Mirror and normalized crop controls are applied once at the source. A continuously refreshed canvas
is the canonical processed output consumed by the panel preview, optional canvas view, and
MediaPipe. This prevents a source transform from changing only its presentation while downstream
analysis continues to see the raw input.

Animated GIFs are decoded frame-by-frame into that output. This avoids the browser behavior that can
freeze an offscreen `<img>` on its first GIF frame. Video and camera sources update the same output
on the browser animation clock. When no panel selection or enabled scene connection demands a
source, its runtime component is unmounted so it does not consume media decode, animation-frame,
GPU, or MediaPipe work.

## Persisted and transient state

Source configuration is normalized by `src/mediaStream.js` and stored in the local
`underscores_media_source_catalog_v1` catalog. Optional views and Holistic processors persist in
`customData.underscoresMediaStream`; Excalidraw continues to own their selection, transforms,
opacity, grouping, history, and scene exchange.

Creating a Holistic processor or changing its display/processing settings also writes the current
scene immediately. This closes the short debounce window in which a reload directly after the last
panel change could restore the previous scene state.

Browser-owned values remain transient in `src/mediaStreamRuntime.js`: live `MediaStream` handles,
decoded surfaces, the latest landmark frame, and local file object URLs. A local file's name and
media kind persist, but the browser file handle does not, so choose it again after reload.

## Source catalog and previews

The **Media Input** source stack uses source-kind icons instead of textual type badges. Drag a
source icon to the canvas to create a named `preview` rectangle at the drop point. Its dimensions
use the source's current processed output size when available, falling back to the configured
resolution. The preview remains an ordinary selectable Underscores object and appears in the
Outliner using the source name. Existing rectangles or frames can still become previews through
the context menu or `/preview` command.

## MediaPipe runtime and output

Holistic is loaded on demand from the upstream browser package used by MediaMime. **Processing FPS**
limits inference and semantic-frame publication independently from the input stream; new processors
default to 15 FPS, with choices from 1 to 30 FPS. A new inference is skipped while the previous frame
is pending, so the selected rate is a ceiling rather than a promise to exceed the source or model's
actual throughput. Default-on **Performance mode** caps inference and semantic publication at 8 FPS
to protect the main canvas, then visually interpolates completed landmark geometry at up to 30 FPS.
Interpolation affects only the live canvas: mappings, scripts, actors, snapshots, and stream events
continue to receive completed detector results. Turn Performance mode off to honor Processing FPS
directly when detector cadence is more important than board cadence. On the traced development
machine, Performance mode off at 12 FPS held the board near 50 FPS while retaining acceptable live
tracking; this is a useful fidelity-oriented starting point rather than a portable guarantee.
Holistic output is transparent by default. The **Source feed** toggle controls whether the
processed camera/media image is painted behind the landmarks; it does not change the inference
input. **Refine face + iris** enables MediaPipe's eye/lip refinement and the ten additional iris
landmarks while the Lite/Full/Heavy selector continues to control pose-model complexity.

Pose rendering is independently selectable as **Pose · body** (torso, limbs, and legs), **Pose · head**,
**Pose · L hand** (17, 19, 21), and **Pose · R hand** (18, 20, 22), alongside the separate 21-point
**L hand** and **R hand** trackers. Each group has its own adjacent swatch. Face rendering is a semantic nested filter rather than a
decimated point sample. **All** enables the complete 478-point refined mesh; Outline, Eyes, Iris,
Nose, Mouth (both inner and outer contours), Brows, and Remaining can then be toggled independently.
The Nose display deliberately uses a sparse center bridge and open nostril-base contour instead of
the complete box-like Face Mesh loop. Live rendering and both snapshot paths consume this same
connection set.
The global **Connections** setting draws the official category connections for every enabled face
group except Remaining, which is deliberately points-only.
The resulting view shows exactly those selected point sets.

Use **Swap L / R** when a mirrored camera needs the opposite semantic handedness. The
toggle remaps the overlay, snapshots, MediaPipe stream features, mappings, and Brush channels
together; it does not alter the source image pixels.

Every result updates the derived object's live canvas and emits `media.holistic.frame` on the
Underscores event bus with normalized pose, left-hand, right-hand, and face landmarks.
**Snapshot landmarks** converts the currently enabled pose, hand, and Face Mesh display into native
Underscores points, connection lines, and landmark IDs according to the active view toggles. Pose
points below the live 0.2 visibility threshold are excluded. Each snapshot point is tagged with
`customData.underscoresMediaLandmark` and a canonical `customData.underscoresLabel`, such as
`pose.left_pinky`, `right_hand.thumb_tip`, or `face.33`. Every snapshot is one native
Excalidraw group, so its points can be selected and moved as one output.

**Snapshot PNG** captures the current Holistic canvas directly, including the enabled source-feed
and landmark view, and inserts a selected static image at the processor's exact position, size,
rotation, and frame membership. The live processor remains editable underneath the snapshot.
**Point size** and **Line thickness** are shared by the live view and native landmark snapshots.
Holistic display and processing choices are remembered locally as the preset for the next processor;
each existing processor also retains its own settings in the saved scene.

## Unicursal artistic portraits

The **Artistic drawings** section in the Holistic panel creates a first-class Unicursal object from
the selected Holistic processor. This is an interpretation rather than another landmark overlay:
one stable route passes through a silhouette, selected facial features, hands, and restrained body
accents, joined by curved anatomical bridges. It never paints the pose skeleton. A fixed point
budget (384 by default) keeps point identity stable across frames, missing regions collapse into
their bridge after a grace interval, and seeded ornaments are functions of arc length rather than
new frame randomness.

The four presets change the same topology: **Smooth** favors flowing splines and taper, **Cubist**
retains simplified corners, **Ornate** adds controlled curls and transitions, and **Messy** adds
correlated overshoot and offset retracing. Advanced groups expose Anatomy, Silhouette, Geometry,
Ornament, Ink, and Motion settings. The persisted ink begins with the active foreground at creation
and is independently editable afterward.

Hybrid silhouette mode requests MediaPipe segmentation only while an enabled Unicursal consumer
needs it. The mask is downsampled, and its largest connected component is traced once per completed
inference frame. Segmentation mode still falls back to a landmark-derived anatomical envelope when
the model or current frame has no usable mask. The main line renders on Canvas2D without changing
Excalidraw elements on animation frames. Echoes are opt-in runtime visuals (two when enabled);
enable **Snapshot echoes** to deliberately capture them with the main line as one selected native
group. Otherwise **Snapshot path** creates native pressure-profiled freedraw geometry.

The renderer is demand-driven: it sleeps after response interpolation converges, keeps only the
bounded history needed by enabled echoes, and paints each semantic curve as one pressure ribbon
instead of issuing a stroke for every point pair. The object background is transparent by default,
with an optional solid color. **Max curve segments** defaults to one and can recover separate
silhouette, face, hand, and body curves without unstable frame-to-frame regrouping. Point weights
allocate detail toward important features, per-feature exaggeration changes face, hands, and body
independently, and feature importance can influence variable stroke width. **Smooth curves** keeps
small point budgets fluid. A diagnostic landmark overlay can show the same semantic face, hand, and
pose subsets used by the Holistic view while tuning the interpretation.

Curve interpolation is explicit: **Catmull–Rom** is the default for both the centerline and the
edges of variable-width pressure ribbons, with **Quadratic** and **Polyline** alternatives for
comparison or deliberately angular work. Numeric field ranges are editing suggestions; typed
finite values may exceed them, subject only to broad safety limits in the generator. The landmark
diagnostic can additionally draw the exact silhouette source used by the route (segmentation
contour or envelope fallback) and can inherit the portrait's ink color when it is intended as part
of the output.

Motion stabilization has three independent controls. **Inertia** retains more of the previous
route while the new frame arrives; **Confidence weight** discounts updates from landmarks with low
visibility/presence (and from features that have collapsed after their grace period); and
**Feature stickiness** slows semantic regions as a group so bridges do not visibly detach from the
face, hands, silhouette, or body accents. They are intentionally separate from response time, so a
portrait can remain responsive while still resisting short tracking glitches.

Each object publishes `unicursal:<object-id>` as a read-only, scene-space `path` stream. A path
sample contains finite points with pressure/width metadata, coordinate space, bounds, source time,
style, and availability. Removing the object removes its stream registration. Trusted code can use
the stream directly or call the shared generator:

```js
const pathStream = __.streams.get("Unicursal portrait");
const current = pathStream?.snapshot();

const path = __.art.unicursal.generate("Holistic", {
  preset: "ornate",
  outputSpace: "normalized",
});
```

The p5 example catalog includes **MediaPipe · Unicursal portrait**. It calls this exact shared
engine, so the livecode prototype and first-class object produce identical target geometry for the
same completed frame and options; only their renderer and host transform differ.

## Verification checkpoint

Automated coverage checks schema defaults, nested patches, type inference, clamping, panel-only
source identity, feed visibility, and optional-view visibility. The complete test suite and
production build pass. Active-harness browser QA verified:

1. a URL GIF source runs with no canvas host while its panel preview remains available;
2. its 44 decoded frames advance through the canonical processed output;
3. crop changes the output from 400 by 400 to 200 by 200 and mirror is applied at the same layer;
4. an optional canvas view can be attached and detached while the source keeps advancing;
5. Holistic accepts that panel-only processed source, reaches ready state, and exposes a working
   Source feed toggle.

The Holistic browser runtime and model assets currently require network access to jsDelivr.

## Semantic ontology

`src/mediaLandmarkOntology.js` is the single registry used by Mapping and trusted scripts. Official
MediaPipe names are normalized to lower snake case:

- pose points such as `pose.left_index`, `pose.right_hip`, and `pose.nose`;
- hand points such as `left_hand.index_finger_tip` and `right_hand.thumb_tip`;
- numeric Face Mesh points such as `face.468`, because MediaPipe does not name every vertex;
- official face groups including `face.face_oval`, `face.left_eye`, `face.right_eye`,
  `face.left_iris`, `face.right_iris`, `face.lips`, and the eyebrow groups.

Derived aggregates include `left_hand`, `right_hand`, their palms and finger chains,
`body.head_outline` (backed by `face.face_oval`), and scale-normalized
`left_hand.pinch` / `right_hand.pinch`. Pinch divides thumb-tip/index-tip distance by palm size and
uses separate close/open thresholds for hysteresis. `LH`, `RH`, and `HEAD_outline` remain accepted
compatibility aliases; the UI and documentation use canonical names.

Every feature snapshot identifies its feature and kind, then reports availability, frame age,
optional confidence, and relevant geometry or scalar/boolean value. Point geometry is available in:

- `normalized`: processed MediaPipe source coordinates after upstream crop/mirror;
- `local`: pixels inside the Holistic processor rectangle;
- `scene`: the processor rectangle's translated, scaled, and rotated canvas coordinates.

Z remains available as observation data but does not change the default 2D projection. Missing
features remain explicitly unavailable rather than becoming zero-valued scene points.

## Script service

The same semantic frames power Mapping, p5, Play Core, and Strudel:

```js
const streams = __.streams.list();
const body = __.streams.get("Holistic"); // id or configured name
const finger = body.feature("left_hand.index_finger_tip", { space: "scene" });
const hands = body.features("hand");
const unsubscribe = body.subscribe(frame => {
  console.log(frame.feature("right_hand.pinch"));
});
```

The service is also `__.api.streams` and `window.__.streams`. Trusted livecode receives a node-local
`__` bridge, while the application installs the public API at `window.__`. Raw observations remain
transient and are evaluated once per Holistic result; a scene file persists the processor and its
versioned binding definitions, not hundreds of landmark elements.

## Unified streams and Inputs

`src/streamRuntime.js` generalizes semantic MediaPipe observations into one typed registry. A stream
declares one primary frame kind—`space`, `time`, `value`, `event`, `image`, or `path`—plus any additional
capabilities and its overlapping `input`/`output` roles. `inputs` and `outputs` are views over the
same registry rather than disconnected buses.

```js
const all = __.streams.list({ kind: "space" });
const source = __.streams.get("pointer");
const current = source.snapshot();
const stop = source.subscribe(sample => console.log(sample));

// Trusted runtimes can create only runtime-owned streams. They disappear
// when the owning p5, Play Core, Strudel, Brush, or Livecode runner stops.
const signal = __.streams.create({ id: "energy", kind: "value" });
signal.write({ kind: "value", value: 0.75 });
```

## Runtime diagnosis

Use the bottom-docked **Console** when a MediaPipe or Brush interaction appears inactive. Its Live strip remains active even with event logging off: a Brush channel reports `source waiting` when its position stream has no current sample, `source live` when it does, and its held gate, mapped XY, and pressure separately. This distinguishes missing camera/landmark input from a closed pinch gate or an unarmed channel. Enable the retained Console log only when needed, then filter `status`, `media`, `input`, or `brush` events without adding a high-rate coordinate record for every frame.

Camera, URL/file media, canvas capture, and Preview outputs register as read-only image streams.
Image pixels and `CanvasImageSource` handles are transient; a trusted script recreates virtual
image output after reload. Existing `__.streams.get("Holistic").feature(...)` and `.features(...)`
remain unchanged. The public equivalent is `window.__.streams`.

The **Media** panel retains the image-source catalog, its source-specific editors, preview controls,
and stored source ids. The dedicated **Inputs** panel uses the same source-stack/detail-editor model
for pointer, keyboard, transport/wall/animation/MIDI clocks, MediaPipe features, IanniX
maps/cursors/triggers, Web MIDI, Web Serial, WebSocket JSON, OSC-over-WebSocket JSON, and virtual
streams. Browser permissions, connected devices, socket credentials, current frames, and samples
are deliberately local. A source descriptor may persist unresolved and show a waiting/disconnected
state after reload.

Web Serial connection is always an explicit user gesture. OSC is a configurable WebSocket client,
not a UDP server: run an external bridge and send JSON such as
`{ "address": "/hand/right", "args": [0.2, 0.7] }`, then map fields such as
`x=args.0, y=args.1` in the source. Browser JavaScript cannot receive raw UDP OSC directly; see
[MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).

## Typed processors, gates, and IanniX streams

The persisted stream graph is a typed list-and-inspector graph: named sources feed named processor
outputs, and every output is an ordinary `__.streams` stream. Existing Region, Cross, and legacy
Threshold definitions continue to publish transition events so saved scenes keep their behaviour.
New processor families are Geometry (distance, midpoint, delta), Value (map/range, transform, and
combine), Motion (velocity, speed, dwell), Filter (smoothing and attack/release envelope), Gate
(hysteresis, debounce, grace, and latch modes), and Events (edge, region enter/leave, curve
crossing).

MediaPipe sources select a Holistic processor and an ontology feature rather than relying on a raw
feature-id field. A point publishes a `space` stream, metrics such as `right_hand.pinch` publish a
numeric `value`, and **Active gate** publishes a held Boolean `value`. This makes a source's output
kind visible before it reaches a processor or a Brush channel.

**Gates are continuous state, not one-shot events.** A Gate processor publishes a persistent
Boolean/value output for Brush plus a separate `<name> edges` event stream for generators and later
automation. Its default 40 ms smoothing and 120 ms missing-signal grace avoid momentary tracking
gaps ending a stroke. Its modes are:

- **Momentary** — open while the condition is true;
- **Toggle latch** — toggle on each debounced activation;
- **Reset latch** — remain open until its optional reset input closes it.

Brush only offers persistent value streams as a gate. Edge streams are instead suitable for a
processor reset input, a future trigger, or automation; treating a transition as a held gate would
leave a stroke open indefinitely.

Use **Inputs → Processors → Pinch brush** for the quick proof. Choose a Holistic stream and either
the right index tip or right thumb/index midpoint for position. The recipe creates the corresponding
MediaPipe position source, `right_hand.pinch` Active gate source, momentary Gate processor, and an
editable Brush channel aimed at scene space. The same result can be assembled manually:

```text
Right index tip (space) ───────────────────────→ Brush position
Right pinch Active gate (value) → Gate ────────→ Brush gate
                                      └ edges ─→ event/reset/automation
```

Processor configuration persists with named stream references. Live values, browser/device state,
and image frames remain transient. Trusted scripts can inspect outputs and mutate the persistent
graph with `__.api.streams.processors.create(...)`, `.update(id, patch)`, and `.remove(id)`; the
equivalent public read surface is `window.__.streams`.

IanniX curves publish sampled reusable map data, active cursors publish scene position, progress,
and score time, and trigger contact emits enter/leave event frames. This does not alter the
existing score/MIDI evaluation path.

## Brush channels

The former **Mods & FX** workspace panel is now **Brush** (`/brush`; `/mods` remains an alias).
Its **Channels** tab hosts ordered parallel stroke channels; **Stack** retains the non-destructive
modifier pipeline; **Script** remains the Brush script adapter. The native Pointer channel is
intentionally preserved so mouse/pen/touch behavior does not change.

Each non-native channel selects a spatial stream plus optional gate and pressure streams, maps
source ranges with manual/automatic min/max, inversion, clamp, scale, and offset, and targets scene
space, a viewport frozen when the session starts, or a selected rotated rectangle/frame. The
source-agnostic runtime owns a separate start/move/end sequence and transient preview for every
channel. Gate loss, missing input, disconnect, or channel removal closes that session and commits
at most one native undoable freedraw element; parallel channels never merge.

A non-native channel captures the current paint appearance and the visible Brush stack when its
gate opens. Its modifier result is rendered continuously as a transient canvas overlay while the
gate remains open, using the same track-composition path as a pointer stroke. No generated tracks
are written to the scene during that preview; gate close commits the already-previewed result as
one native freedraw history entry.

Holistic objects are valid **Object bounds** targets: their native rectangular host supplies the
destination geometry even when the rendered camera feed and landmarks are hidden. Preview and
source hosts remain excluded from geometric input pickers, preventing accidental feedback routes.

## Mapping and media actors

Open `/mapping` for the shared actor surface. It provides a locally remembered global arm switch,
Holistic stream/status selection, searchable feature browser, normalized/local/scene inspection,
selected-feature highlight, bounded traces, and binding create/edit/duplicate/test/delete actions.
Missing streams, landmarks, and target objects are reported in place.

Actors run independently of score transport while armed. Disarming immediately releases gates and
ends active strokes. Initial bindings are:

- `drive-position`: maps a semantic point or region centroid to the actual selected Underscores
  target, with target anchor/offset, confidence threshold, about 40 ms time-based smoothing, and a
  120 ms missing-signal grace period. Runtime updates move the real selectable host rather than
  leaving stale geometry behind; its acquired and final poses are therefore already baked.
- `freedraw-actor`: uses one semantic point for XY and a gesture/threshold feature as its gate. The
  default proof maps `left_hand.index_finger_tip` through `right_hand.pinch`. While active it emits
  start/move/end samples through the input bus and shows a transient preview. Closing the gate,
  losing the signal, or disarming commits exactly one native undoable freedraw object when at least
  two distinct points were captured.

Persistent changes use `media.binding.create`, `media.binding.update`, `media.binding.remove`, and
`media.actors.arm`. Actor evaluation is batched once per result, trace history is capped, and
inactive or unavailable bindings remain dormant.

## Reference body maps

The original MediaMime diagrams are copied unchanged as explanatory references:

- [attached hands](media/mediamime-body-map-large.svg) — 176 labeled nodes;
- [detached hands](media/mediamime-body-map-detached-hands-large.svg) — 193 labeled nodes,
  including all 33 pose points.

Their SVG titles are labels, not runtime ids or schemas. This slice does not parse them or make them
selectable; a later map phase can generate annotated ids from the canonical ontology.

Gaze remains a future calibrated derived signal rather than a direct interpretation of iris
position. Palm openness, string-plucking, zones, MIDI actions, constraints, and the broader mapping
graph build on the same registry in later slices.

## Unicursal checkpoint — 2026-08-13

The first usable portrait pass is now recorded as a checkpoint. The first-class object and the p5
prototype share the same deterministic path generator, with transparent backgrounds by default,
optional runtime echoes, typed scene-space `path` output, and no per-frame Excalidraw scene writes.
Smooth rendering uses Catmull–Rom-derived cubic Bézier curves for both the centerline and
variable-width ribbon edges; quadratic and polyline modes are available for comparison. The
landmark diagnostic can preview the exact segmentation contour or envelope fallback and inherit the
portrait ink color. Numeric control ranges are intentionally advisory so experimental values can be
typed beyond the suggested UI range.

Verification at this checkpoint: the full test suite passes (652 tests), the production build
passes, and the working tree is clean of whitespace errors. Known follow-ups are silhouette
quality/contour heuristics, further performance work for high point budgets or echoes, and richer
feature-specific route allocation while preserving fixed topology.
