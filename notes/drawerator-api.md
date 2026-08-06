# Drawerator Script API

Drawerator exposes a versioned browser API as `window.drawerator`. p5 and Play Core frames, and
Livecode p5/Play Core/Strudel nodes, receive the same application API as `__.api`, plus a smaller
live frame bridge directly as `__`. The longer `drawerator` binding remains an identical
compatibility alias, so existing scenes and scripts do not need migration. Scripts are trusted local
code, not third-party plugins or a security sandbox.

`__` is reserved by these trusted JavaScript runtimes and is never installed as `window.__`.
Sandboxed HTML retains only its token-scoped `window.drawerator` message bridge. Check
`__.api.apiVersion` when requiring a particular public capability.

## Live frame bridge

| Value | Meaning |
| --- | --- |
| `element` | Script host `{ id, width, height }`. |
| `object` | Read-only current snapshot of that host in the Drawerator scene. |
| `frame` | p5/Play Core host configuration or a Livecode Node record. |
| `params` | Values declared with `@param`; object params are live object snapshots. |
| `currentColor`, `currentOpacity` | Active Drawerator foreground appearance. |
| `colors` | `foreground`, `accent`, `highlight`, and `muted`, each `{ color, opacity, css }`. |
| `theme`, `appearance` | Theme id and full live appearance snapshot. |
| `canvas`, `objects` | Scene-query bridge (`objects` is an alias). |
| `events` | Event subscription and inspection. |
| `streams` | Live semantic MediaPipe stream queries and subscriptions. |
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
| `relations` | Graph `get()`, `set(graph)`, `add(collection, item)`, `update(collection, id, patch)`, `remove(collection, id)`; `mappings.list(systemId)`, `mappings.create(item)`, `mappings.update(id, patch)`, and `mappings.remove(id)`; endpoint, adapter, collision-stream, and relationship-event helpers |
| `physics` | `world.get()` / `world.update(patch)`; system/body/population/constraint/mapping helpers; a legacy `routes` compatibility collection; `play`, `pause`, `reset`, `apply`, `materialize`, `impulse`, `grab`, `moveGrab`, `releaseGrab`, `poses`, `telemetry`, and `snapshot`. `world.pausedEditMode` defaults to `author` (paused canvas edits update the reset pose); set it to `preview` to preserve the reset pose. `world.collisionLayers` owns the named layer stack and symmetric contact matrix. Authored body settings live at `object.customData.physics`, including `collider.kind` (`circle`, `ellipse`, `box`, `convex`, `polyline`, or compound `chain`) and optional `collisionLayers` membership; the relationship graph supplies only its stable relationship binding. `customData.draweratorPhysics` remains a read-only legacy alias. |
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

Persistent actor changes go through `media.binding.create`, `media.binding.update`,
`media.binding.remove`, and `media.actors.arm`. API version 6 introduces the semantic stream service
and actor commands.

API version 7 adds the solver-independent `relations` and worker-backed `physics` namespaces. API
version 8 adds canonical Source -> Filter -> Transform -> Target mappings at
`__.relations.mappings`; the narrow `__.physics.routes` API remains a compatibility wrapper.
Relationship graph version 3 adds named Physics collision layers. Bodies with no named
membership retain their legacy raw Rapier collision masks until edited.
Trusted script hosts also expose the same public surface at `__.api` for compatibility.
Scene exchange version 10 persists `drawerator.relationshipGraph`; runtime handles, live poses,
samples, queues, and checkpoints never enter scene JSON. See [Canvas-first relationships and physics](physics.md)
and [Generic mappings](mappings.md).

The Script type hover/focus help points to the matching Info panel quick reference. Livecode nodes
also show an adapter-specific reference in their docked Script panel, including Strudel transport,
presentation security, and Orca grid keys. See [Livecode Nodes](livecode.md) for their persisted
model and lifecycle.
