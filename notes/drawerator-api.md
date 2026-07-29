# Drawerator Script API

Drawerator exposes a versioned browser API as `window.drawerator`. p5 and Play Core frames receive
the same application API as `drawerator.api`, plus a smaller live frame bridge directly as
`drawerator`. Scripts are trusted local code, not third-party plugins or a security sandbox.

Check `drawerator.api.apiVersion` when requiring a particular public capability.

## Live frame bridge

| Value | Meaning |
| --- | --- |
| `element` | Script host `{ id, width, height }`. |
| `object` | Read-only current snapshot of that host in the Drawerator scene. |
| `frame` | p5 or Play Core frame configuration. |
| `params` | Values declared with `@param`; object params are live object snapshots. |
| `currentColor`, `currentOpacity` | Active Drawerator foreground appearance. |
| `colors` | `foreground`, `accent`, `highlight`, and `muted`, each `{ color, opacity, css }`. |
| `theme`, `appearance` | Theme id and full live appearance snapshot. |
| `canvas`, `objects` | Scene-query bridge (`objects` is an alias). |
| `events` | Event subscription and inspection. |
| `transport`, `time` | Score clock and timing context; `time` is `transport.time`. |
| `api` | Full public application API listed below. |

`canvas.all()` returns non-deleted object snapshots. `canvas.get(reference)` resolves an id, score
label, or IanniX group. `canvas.find(query)` accepts text or a predicate, and `canvas.selected()`
returns the current selection. `events.on(pattern, listener)` subscribes and returns an unsubscribe
function; a trailing `.*` is a prefix wildcard. `events.recent(limit)` and `events.latest(pattern)`
inspect captured events.

```js
return { char: "●", color: drawerator.colors.foreground.css };
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
| `mixer` | `get()`, `updateTrack(trackId, patch)`, `addTrack(overrides)`, `removeTrack(trackId)` |

Use command ids returned by `drawerator.api.commands.list()` rather than relying on private UI
handlers. Example:

```js
await drawerator.api.commands.execute("grid.global.update", {
  patch: { enabled: true },
});
```

The Script type hover/focus help points to the matching Info panel quick reference. The p5 and Play
Core Info references include this API in-app, so the documentation remains available while writing a
program.
