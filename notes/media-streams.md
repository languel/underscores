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

Open the panels with `/video-input`, `/media-input`, and `/holistic`. Creating an input adds it to
the panel catalog only. **Show as canvas object** adds or removes an ordinary transformable view
without stopping the source. Canvas opacity and Outliner visibility affect that view only, so a
hidden source view remains available to Holistic and future processors.

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

## MediaPipe runtime and output

Holistic is loaded on demand from the upstream browser package used by MediaMime. Processing is
throttled to approximately 30 FPS and skips a new inference while the previous frame is pending.
Holistic output is transparent by default. The **Source feed** toggle controls whether the
processed camera/media image is painted behind the landmarks; it does not change the inference
input. **Refine face + iris** enables MediaPipe's eye/lip refinement and the ten additional iris
landmarks while the Lite/Full/Heavy selector continues to control pose-model complexity.

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

## Next phase: MediaPipe mapping and ontology

This checkpoint deliberately exposes the raw normalized landmark families without assigning
Drawerator meaning to them. The next phase will define the mapping and ontology for MediaPipe
streams: stable semantic identities for bodies, face regions, eyes/irises, hands, fingers, joints,
and derived gestures; coordinate spaces and confidence/lifecycle semantics; relationships between
source observations, tracked entities, and Drawerator objects; and a routing contract for turning
those values into properties, interactions, zones, and events. Gaze will be treated as a calibrated
derived signal rather than inferred directly from iris landmarks.

That work should preserve the distinction established here between a transient observation stream,
a persistent processor/view object, and native Drawerator geometry created from a snapshot.
