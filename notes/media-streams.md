# Media streams

Drawerator media inputs are persistent source objects that do not require an Excalidraw host.
Camera and media sources live in a small local catalog and continue producing a processed output
while their optional canvas view is absent or hidden. This keeps acquisition and processing
separate from presentation: panels, canvas views, and downstream processors all consume the same
source output.

The initial stream graph has three kinds:

- `camera` acquires a selected `videoinput` with `getUserMedia`;
- `media` decodes an image, animated GIF, or video from a URL or session-local file;
- `holistic` is a transformable canvas processor that consumes a source by stable source id and
  renders MediaPipe pose, hand, and sampled face landmarks.

Open the source catalog with `/media` (the `/media-input` alias remains available), signal streams with
`/inputs`, and processors with `/holistic`. Creating an input adds it to the panel catalog only.
**Show as canvas object** adds or removes an ordinary transformable view
without stopping the source. Canvas opacity and Outliner visibility affect that view only, so a
hidden source view remains available to Holistic and future processors. Hiding a Holistic processor
also hides its canvas output without stopping inference or its semantic stream, so mappings and
livecode can continue consuming it.

## One processed output

Mirror and normalized crop controls are applied once at the source. A continuously refreshed canvas
is the canonical processed output consumed by the panel preview, optional canvas view, and
MediaPipe. This prevents a source transform from changing only its presentation while downstream
analysis continues to see the raw input.

Animated GIFs are decoded frame-by-frame into that output. This avoids the browser behavior that can
freeze an offscreen `<img>` on its first GIF frame. Video and camera sources update the same output
on the browser animation clock.

## Persisted and transient state

Source configuration is normalized by `src/mediaStream.js` and stored in the local
`drawerator_media_source_catalog_v1` catalog. Optional views and Holistic processors persist in
`customData.draweratorMediaStream`; Excalidraw continues to own their selection, transforms,
opacity, grouping, history, and scene exchange.

Browser-owned values remain transient in `src/mediaStreamRuntime.js`: live `MediaStream` handles,
decoded surfaces, the latest landmark frame, and local file object URLs. A local file's name and
media kind persist, but the browser file handle does not, so choose it again after reload.

## Source catalog and previews

The **Media Input** source stack uses source-kind icons instead of textual type badges. Drag a
source icon to the canvas to create a named `preview` rectangle at the drop point. Its dimensions
use the source's current processed output size when available, falling back to the configured
resolution. The preview remains an ordinary selectable Drawerator object and appears in the
Outliner using the source name. Existing rectangles or frames can still become previews through
the context menu or `/preview` command.

## MediaPipe runtime and output

Holistic is loaded on demand from the upstream browser package used by MediaMime. Processing is
throttled to approximately 30 FPS and skips a new inference while the previous frame is pending.
Holistic output is transparent by default. The **Source feed** toggle controls whether the
processed camera/media image is painted behind the landmarks; it does not change the inference
input. **Refine face + iris** enables MediaPipe's eye/lip refinement and the ten additional iris
landmarks while the Lite/Full/Heavy selector continues to control pose-model complexity.

Face rendering is a semantic nested filter rather than a decimated point sample. **All** enables
the complete 478-point refined mesh; Outline, Eyes, Iris, Mouth, Brows, and Remaining can then be
toggled independently. The resulting view shows exactly those selected point sets.

Every result updates the derived object's live canvas and emits `media.holistic.frame` on the
Drawerator event bus with normalized pose, left-hand, right-hand, and face landmarks.
**Snapshot landmarks** converts the latest pose/hand frame into ordinary Drawerator ellipses and
lines tagged with `customData.draweratorMediaLandmark`.

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

The service is also `__.api.streams` and `window.drawerator.streams`. `__` itself remains lexical
to trusted livecode runtimes and is never installed as `window.__`. Raw observations remain
transient and are evaluated once per Holistic result; a scene file persists the processor and its
versioned binding definitions, not hundreds of landmark elements.

## Unified streams and Inputs

`src/streamRuntime.js` generalizes semantic MediaPipe observations into one typed registry. A stream
declares one primary frame kind—`space`, `time`, `value`, `event`, or `image`—plus any additional
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

Camera, URL/file media, canvas capture, and Preview outputs register as read-only image streams.
Image pixels and `CanvasImageSource` handles are transient; a trusted script recreates virtual
image output after reload. Existing `__.streams.get("Holistic").feature(...)` and `.features(...)`
remain unchanged. The public equivalent is `window.drawerator.streams`; `window.__` is never
installed.

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

## Derived events and IanniX streams

The persisted stream graph can derive ordinary event streams from a point crossing a curve,
entering/leaving a rectangle, or a scalar rising/falling through hysteresis thresholds. Every
event carries its source, optional target, scene position, transition, and timestamp. These are
available immediately as Brush gates and remain a command-backed foundation for later generators.

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

## Mapping and media actors

Open `/mapping` for the shared actor surface. It provides a locally remembered global arm switch,
Holistic stream/status selection, searchable feature browser, normalized/local/scene inspection,
selected-feature highlight, bounded traces, and binding create/edit/duplicate/test/delete actions.
Missing streams, landmarks, and target objects are reported in place.

Actors run independently of score transport while armed. Disarming immediately releases gates and
ends active strokes. Initial bindings are:

- `drive-position`: maps a semantic point or region centroid to the actual selected Drawerator
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
