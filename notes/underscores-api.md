# Underscores Script API

Underscores exposes a versioned browser API as `window.__`. p5 and Play Core frames, and
Livecode p5/Play Core/Strudel nodes, receive the same application API as `__.api`, plus a smaller
live frame bridge directly as `__`. There is no spelled-out bridge alias. Scripts are trusted local
code, not third-party plugins or a security sandbox.

`__` is reserved by these trusted JavaScript runtimes and the application installs its public API as
`window.__`. Sandboxed HTML retains only a narrower token-scoped `window.__` message bridge. Check
`__.api.apiVersion` when requiring a particular public capability.

## Live frame bridge

| Value | Meaning |
| --- | --- |
| `element` | Script host `{ id, width, height }`. |
| `object` | Read-only current snapshot of that host in the Underscores scene. |
| `frame` | p5/Play Core host configuration or a Livecode Node record. |
| `params` | Values declared with `@param`; object params are live object snapshots. |
| `currentColor`, `currentOpacity` | Active Underscores foreground appearance. |
| `colors` | `foreground`, `accent`, `highlight`, and `muted`, each `{ color, opacity, css }`. |
| `theme`, `appearance` | Theme id and full live appearance snapshot. |
| `canvas`, `objects` | Scene-query bridge (`objects` is an alias). |
| `events` | Event subscription and inspection. |
| `streams` | Live semantic MediaPipe stream queries and subscriptions. |
| `art` | Shared artistic generators. `art.unicursal` exposes the same engine as first-class Unicursal objects. |
| `transport`, `time` | Score clock and timing context; `time` is `transport.time`. |
| `api` | Full public application API listed below. |

`canvas.all()` returns non-deleted object snapshots. `canvas.get(reference)` resolves an id, score
label, or Score group. `canvas.find(query)` accepts text or a predicate, and `canvas.selected()`
returns the current selection. `events.on(pattern, listener)` subscribes and returns an unsubscribe
function; a trailing `.*` is a prefix wildcard. `events.recent(limit)` and `events.latest(pattern)`
inspect captured events.

```js
return { char: "●", color: __.colors.foreground.css };
```

## Public application API

| Namespace | Public methods |
| --- | --- |
| `commands` | `list()`, `describe(id)`, `execute(id, args, options)`, `subscribe(listener)` |
| `scene` | `get()`, `getAppState()` |
| `canvas`, `objects` | Same read-only query bridge available to the frame |
| `time` | `parse(expression)`, `resolve(value, context)`, `format(value)`, `quantize(value, quantum, context)` |
| `grid` | `getGlobal()`, `updateGlobal(patch)`, `snapPoint(point, options)`, `unitsToSeconds(units)`, `secondsToUnits(seconds)`, `worldToValue(point, options)`, `valueToWorld(value, options)`, `resolveObjectTiming(elementId)` |
| `history` | `start(options)`, `pause()`, `stop()`, `get()`, `load(session)`, `play(options)`, `pausePlayback()`, `stopPlayback()`, `seek(seconds)`, `export()`, `import(payload)` |
| `macros` | `list()`, `saveRange(options)`, `insert(id, options)`, `remove(id)` |
| `inputs` | `registerAdapter(adapter)`, `unregisterAdapter(id)`, `emit(sample)` |
| `events` | `subscribe(pattern, listener)` |
| `art.unicursal` | `presets()`, `generate(sourceRef, options)` |
| `relations` | Graph `get()`, `set(graph)`, `add(collection, item)`, `update(collection, id, patch)`, `remove(collection, id)`; `mappings.list(systemId)`, `mappings.create(item)`, `mappings.update(id, patch)`, and `mappings.remove(id)`; endpoint, adapter, collision-stream, and relationship-event helpers |
| `physics` | `world.get()` / `world.update(patch)`; system/body/population/constraint/mapping helpers; a legacy `routes` compatibility collection; `play`, `pause`, `reset`, `apply`, `materialize`, `impulse`, `grab`, `moveGrab`, `releaseGrab`, `poses`, `telemetry`, and `snapshot`. `world.pausedEditMode` defaults to `author` (paused canvas edits update the reset pose); set it to `preview` to preserve the reset pose. `world.livePose` enables constraint-solving authoring grabs; press `\\` outside a text field to toggle it. Plain Cmd remains available to Excalidraw alignment. `world.collisionLayers` owns the named layer stack and symmetric contact matrix. Authored body settings live at `object.customData.physics`, including `collider.kind` (`circle`, `ellipse`, `box`, `convex`, `polyline`, or compound `chain`) and optional `collisionLayers` membership. Constraint objects additionally persist `axle`, legacy-compatible `fixate`/Weld, `spring`, or `rope` configuration there. A rope is one authored path plus a `rope` constraint; its sampled Rapier links are runtime-only and exposed only through the rope's rendered geometry. The relationship graph supplies only stable relationship bindings. `customData.underscoresPhysics` remains a read-only legacy alias. |
| `mixer` | `get()`, `updateTrack(trackId, patch)`, `addTrack(overrides)`, `removeTrack(trackId)` |
| `streams` | `list()`, `get(idOrName)`, `subscribe(listener)`; returned streams expose `feature(id, { space })`, `features(query)`, and `subscribe(listener)` |

Use command ids returned by `__.api.commands.list()` rather than relying on private UI
handlers. Example:

```js
await __.api.commands.execute("grid.global.update", {
  patch: { enabled: true },
});
```

Semantic observations are transient and read-only:

```js
const body = __.streams.get("Holistic");
const tip = body?.feature("left_hand.index_finger_tip", { space: "scene" });
const pinch = body?.feature("right_hand.pinch");
```

API version 9 adds the reusable Unicursal portrait generator. `sourceRef` may be a Holistic object
id/name or a Unicursal object id/name. Geometry is deterministic for a completed semantic frame and
defaults to normalized coordinates; request `outputSpace: "local"` or `"scene"` when a host-space
result is needed. The returned path contains finite `{ x, y, z, pressure, width, role, t }` points,
bounds, style, source time, and availability. Segmentation stays internal to the engine.
Calls that use hybrid or segmentation silhouettes keep segmentation inference requested only while
the caller continues generating frames; the demand expires automatically when the script stops.

```js
const portrait = __.art.unicursal.generate("Holistic", {
  preset: "smooth",
  outputSpace: "normalized",
  geometry: { pointBudget: 384, maxSegments: 1, smoothCurves: true },
});
if (portrait?.available) portrait.points.forEach(({ x, y, pressure }) => {
  // Draw or transform the stable continuous route.
});

const presetCatalog = __.api.art.unicursal.presets();
```

Persistent actor changes go through `media.binding.create`, `media.binding.update`,
`media.binding.remove`, and `media.actors.arm`. API version 6 introduces the semantic stream service
and actor commands.

API version 7 adds the solver-independent `relations` and worker-backed `physics` namespaces. API
version 8 adds canonical Source -> Filter -> Transform -> Target mappings at
`__.relations.mappings`; the narrow `__.physics.routes` API remains a compatibility wrapper.
API version 9 adds `art.unicursal` and first-class typed `path` stream samples.
Relationship graph version 3 adds named Physics collision layers. Fifteen named layers are
available; the final Rapier bit is reserved for generated rope links. Version 4 adds authored Rope
constraints: a selected rendered path provides bounded, arc-length-sampled link geometry and two
independently resolved body-or-World endpoints; only the single path object persists. Rope links
do not collide with other generated rope links in this baseline, but do collide with authored
bodies and walls through normal named layers. Bodies with no named membership retain their legacy
raw Rapier collision masks until edited; an explicitly empty membership opts a body out of
named-layer collision.
Trusted script hosts also expose the same public surface at `__.api` for compatibility.
Scene exchange version 10 persists `underscores.relationshipGraph`; runtime handles, live poses,
samples, queues, and checkpoints never enter scene JSON. See [Canvas-first relationships and physics](physics.md)
and [Generic mappings](mappings.md).

The Script type hover/focus help points to the matching Info panel quick reference. Livecode nodes
also show an adapter-specific reference in their docked Script panel, including Strudel transport,
presentation security, and Orca grid keys. See [Livecode Nodes](livecode.md) for their persisted
model and lifecycle.
