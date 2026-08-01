# Performance monitor and scene baking

Drawerator now has a lightweight performance monitor that can float over the canvas or attach to the
Console panel. The attached monitor follows Console visibility and does not create an independent
bottom panel. Enable it from **Settings → Board → Interface**, `/performance`, or `/perf`. The compact
view shows browser animation FPS; click it to expand average frame time, frames longer than 34 ms,
live scene-object count, Excalidraw scene callbacks per second, changed elements per second, special
object counts, and Chromium heap use when the browser exposes it.

The FPS number measures the browser tab's `requestAnimationFrame` cadence. It is a practical visual
smoothness signal, not a substitute for a CPU flame chart. Scene and changed-object rates help tell
continuous runtime work apart from a large but idle scene. Monitoring is disabled when the widget is
closed, so its version-map accounting does not add permanent work to the normal canvas path.

## Bake workflow

Select an object or a complete group, then Shift-right-click and choose **Bake Selection to PNG** or
**Convert / Bake Selection to SVG**. The same actions are available as `/bake png` and `/bake svg`.

- PNG bake renders native Excalidraw geometry, evaluated modifier-stack tracks, supported p5
  content, and media-stream canvases at the selection's world bounds with a transparent background,
  inserts one image element in the same position, and marks the editable sources deleted in the
  same Excalidraw history transaction. Undo restores them.
- SVG bake uses Drawerator's source-preserving native-to-SVG conversion. It remains editable as one
  first-class SVG document and is usually the better bake when vector editing, theming, or SVG-node
  roles will still be needed.
- The PNG output captures the current Drawerator theme. Keep the vector sources, or use Undo, when
  the result must later adapt automatically to a different light/dark palette.
- SVG, Play Core, and Livecode DOM overlays are rejected by PNG bake for now; the current compositor
  cannot capture those live layers without risking a blank or incomplete replacement. Holistic also
  offers **Snapshot PNG**, which captures its current live view in place while leaving the processor
  editable underneath. Native landmark snapshots are ordinary grouped elements and are supported.

The baked PNG records its source element IDs and count in `customData.draweratorBake`. This is
provenance for inspection and exchange, not a second hidden copy of the source geometry; recovery is
through normal scene undo or a previously saved complete scene.

## Performance review: 2026-08-01

This review combines direct code-path inspection, the in-app counters, Chrome Long Animation Frame
timings, and a Chrome CPU sampling profile. The repeatable browser fixture uses 2,500 small native
ellipses plus 2,500 native lines as a landmark-like stress scene. Each interaction run sends 250
alternating camera-wheel updates over five nominal seconds. This isolates object-count scaling and
bake behavior without requiring camera permission; a real live-Holistic capture remains a separate
follow-up.

### Browser trace results

| Production scenario | rAF p50 | rAF p95 | rAF p99 | Frames >= 34 ms | Long animation frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5,000 native objects, camera moving, before runtime-cursor guard | 16.7 ms | 50.1 ms | 50.7 ms | 53 | 58 |
| 5,000 native objects, camera moving, after runtime-cursor guard | 16.7 ms | 17.5 ms | 17.7 ms | 0 | 0 |
| Same scene baked to one PNG, camera moving | 16.7 ms | 17.8 ms | 18.6 ms | 0 | 0 |

The production rerun after adding the raw runtime-cursor guard stayed within one animation frame at
p99 and produced no Long Animation Frames. This removes the unexpected IanniX normalization cost
from ordinary elements; baking remains useful for reducing Excalidraw render, hit-test, selection,
history, persistence, and export pressure. Before the guard, the development build produced the same
shape with a larger gap: the 5,000-object scene reached
p95 66.7 ms and 46 long animation frames, while the baked image reached p95 17.5 ms with none. An
empty board and a 1,200-object scene both remained near 60 FPS during the same camera workload.
Disabling the performance widget did not materially change the 5,000-object result (p95 66.6 ms
and 52 long animation frames in the development build), so the monitor is not the regression.

Long Animation Frame attribution is overwhelmingly scripting: 3.59 seconds of script time versus
4.6 ms of post-render work across the production run's long frames. The saved development CPU
profile further localizes the unexpected work. `createTimeValue`, `normalizeIannixData`,
`createDefaultIannixData`, `migrateNumericTimeValue`, `normalizeTimeContext`, and `trimNumber`
together account for about 52% of sampled CPU. The path is the Excalidraw `onChange` visibility
pass: it maps every scene element through `enforceRuntimeCursorHostVisibility()`, whose
`isRuntimeCursor()` call fully normalizes IanniX data even when the element has no IanniX metadata.
The all-element p5 signature and performance-monitor accounting appear in the profile, but are
minor beside this default-IanniX construction.

The development sampling profile was captured locally in Chrome DevTools. Its generated 2.1 MB
artifact is not versioned; the repeatable measurements and attributed call path are retained here.

### Confirmed sources of work

1. **Landmark snapshots multiply native scene objects.** Each enabled point becomes an ellipse,
   every enabled landmark ID becomes a text object, and each enabled connection becomes a line.
   Face Mesh alone can therefore add hundreds of independently selectable, serializable objects in
   one snapshot. They are static after capture; the cost is their participation in later whole-scene
   operations, not a per-landmark animation loop.
2. **Every Excalidraw scene callback performs several whole-scene passes.** The main `onChange` path
   normalizes visibility, filters selection, builds version maps, finds changed and removed elements,
   and synchronizes p5, SVG, and Livecode overlays. Those passes scale with total element count even
   when only one element changes.
3. **The p5/media overlay signature currently scans every active canvas element.** This is necessary
   for canvas-capture dependencies, but it also means a large static landmark snapshot expands the
   signature work on every scene callback.
4. **Scene persistence serializes the complete Drawerator exchange document.** Autosave is debounced
   by 500 ms, so it does not run once per frame, but a large snapshot makes each settled save and each
   full scene export proportionally larger.
5. **MediaPipe publishes a rich holistic event every result.** Pose, both hands, and face landmark
   arrays are emitted to the shared event bus and the semantic feature frame and active bindings are
   derived on the main thread. This is appropriate for signal routing, but subscriber count and face
   feature use should be measured under a real camera trace.
6. **Overlay synchronization serializes rich node state.** Livecode signatures include complete
   source plus typography/runtime JSON; media signatures include normalized configuration JSON.
   Version-keyed cached signatures would avoid repeated string construction for unchanged hosts.

### Immediate mitigation delivered

- Runtime-cursor detection rejects elements without raw cursor metadata before constructing and
  normalizing default IanniX data. The repeatable 5,000-object production workload improved from
  p95 50.1 ms and 58 long animation frames to p95 17.5 ms and none.
- Holistic processors now default to a separately configurable 15 FPS inference/publication rate,
  treat that rate as a ceiling with inference-cost backoff, skip duplicate landmark paints between
  results, avoid empty actor-overlay state updates, and persist host/settings changes immediately.
- The monitor makes frame cadence, long frames, scene churn, and object growth visible without
  opening developer tools.
- PNG/SVG baking turns a large static native snapshot group into one scene object in one undoable
  operation. This directly reduces Excalidraw render, hit-test, selection, history-diff, persistence,
  and export workloads for that snapshot.

### Next profiling and optimization order

1. Capture a permissioned real-camera trace for live Holistic at several processing ceilings and
   confirm the inference-cost backoff against the synthetic workload above.
2. Replace independent whole-scene overlay scans with one version-keyed scene index shared by p5,
   media, SVG, Livecode, Outliner, and history. Cache normalized per-element signatures by element
   version and only rebuild dependency closures when their members change.
3. Gate the all-element p5 capture signature behind actual canvas-capture consumers; ordinary p5 and
   media hosts should not require a concatenated signature for every unrelated element.
4. Add event-bus demand accounting. Preserve the configured processor rate for active bindings while
   allowing UI-only inspectors to receive a further-coalesced frame.
5. Move complete-scene serialization and other source-preserving heavy transforms to workers after
   measuring transfer and structured-clone cost.
6. Compare the dedicated non-destructive Holistic PNG snapshot with generic replacement baking under
   rotated/framed hosts and source-feed-on capture, retaining native grouped snapshots for users who
   need individual points, connections, and IDs.

The production bundle is also large (about 7.1 MB minified at this checkpoint). Runtime adapters,
MediaPipe, and Strudel are candidates for route/feature-level dynamic imports, but bundle size is a
startup/network concern and should not be conflated with the steady-state canvas FPS issue.
