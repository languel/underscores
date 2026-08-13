# Generic mappings

Mappings are the canonical event-routing model for Underscores. They are persisted in
`underscores.relationshipGraph.mappings` and have one linear shape:

```text
Source -> Filter -> Transform -> Target
```

The first visible source adapter is **Physics collision**. The record shape is deliberately
source- and target-adapter based so streams, score events, MediaPipe, commands, and future
canvas nodes can use the same data without translating a physics-specific route format.

## Mapping records

Every mapping has an id, name, enabled flag, source, filter, transform, target, cooldown, and
per-pair gate behaviour. `relationshipGraph.version` 2 introduced `mappings`; version 3 adds
named physics collision layers alongside them. Layer membership and the world's contact matrix
decide whether Rapier produces a collision before the collision source can map it. Legacy
`routes` are imported as compatible `legacy-action` targets, remain accessible at
`__.physics.routes` for scripts, and are not written to new scene JSON.

Use the public mapping collection for new scripts:

```js
const mapping = __.relations.mappings.create({
  name: "wall velocity",
  source: {
    kind: "physics-collision",
    systemId: "world",
    phases: ["hit"],
    classes: ["body-wall"],
    field: "impulse",
    range: { min: 0, max: 10 },
  },
  filter: { min: 0.15 },
  transform: { outputMin: 24, outputMax: 120, clamp: true },
  target: { kind: "midi-note", channel: 1, note: 60, velocityExpression: "round(value)" },
});
```

`list(systemId)`, `create(item)`, `add(item)`, `update(id, patch)`, and `remove(id)` are
available on `__.relations.mappings`; `__.physics.mappings` exposes the same collection as a
short physics-oriented alias. Existing script hosts may access the identical public API under
`__.api.relations` and `__.api.physics`.

## Collision source

A collision source selects a system, phase, collision class, optional tags on side A/B, a numeric
field, and the input range used for normalization. Available fields are:

- `impulse`
- `relativeSpeed`
- `contactX`, `contactY`
- `normalX`, `normalY`

Physics emits `begin`, `hit`, and `end` for ordinary contacts and `enter` / `exit` for sensors.
`stay` is available only when the Physics World enables contact stay events. A pair-gate target
automatically retains its matching begin/end (or enter/exit) phases, and may include `stay` for
continuous updates.

For the selected field, the runtime exposes both `raw` and `norm`; `norm` is
`(raw - source.range.min) / (source.range.max - source.range.min)`. It is intentionally not
pre-clamped so a filter or expression may respond to values outside the authored input range.

## Filter and transform

The filter’s minimum, maximum, and optional formula all use AND semantics. The transform maps
`norm` through its output range, then applies scale and offset, optional clamp, and an optional
numeric formula. Target formulas receive the transformed value.

Formulas are parsed by a small safe evaluator: they are never passed to JavaScript execution.
They accept arithmetic, comparisons, `&&`, `||`, `!`, parentheses, and these functions:

`if`, `abs`, `min`, `max`, `clamp`, `round`, `floor`, `ceil`, `pow`.

Available variables are `raw`, `norm`, `value`, `impulse`, `speed`, `x`, `y`, `normalX`, and
`normalY`. Collision entities also expose their canvas-space positions and velocities as
`aX`, `aY`, `aVx`, `aVy`, `aSpeed` (and corresponding `b…` names), together with `aAngle`,
`aAngularVelocity`, `aMass`, `aFriction`, `aBounce`, and `aDensity` (and `b…`). World fields are
`gravityX`, `gravityY`, `worldTime`, `step`, `timeScale`, `simSpeed`, and `pixelsPerMeter`.
Each authored physics body also carries an editable **Object note**. It is exposed in formulas as
both `aNote` / `noteA` and `bNote` / `noteB`, so a collision can combine its objects directly:

```text
pentatonic((noteA + noteB) / 2, floor(speed / 12))
```

The prefix form matches physical values such as `aSpeed`; the suffix form reads naturally for
musical values. Numeric per-object mapping values will use the same two aliases as they are added.
Invalid formulas leave the mapping silent, show a card-level validation error, and emit a
rate-limited `physics.mapping.error` event.

MIDI Note has a base **Note** and a separate **Pitch formula**. Its formula returns the final
MIDI note, with `baseNote` set from the Note control. In addition to the generic math helpers,
pitch formulas may quantize safely with `major(root, degree)`, `minor(root, degree)`,
`pentatonic(root, degree)`, or `scale(root, degree, semitone0, semitone1, ...)`. For example,
`major(baseNote, floor(speed / 12))` maps relative impact speed to a major-scale degree without
executing user JavaScript.

## MIDI and expressive targets

- **MIDI Note** sends MIDI 1 note messages through every Mixer destination on its channel.
  Hit mode sends a bounded-duration note. Pair-gate mode sends note-on at `begin` and releases
  that exact mapping/body-pair/track key at `end`.
- **MIDI CC** maps a value formula to a controller on the selected channel.
- **MIDI Pitch Bend** maps a formula to the MIDI 1 14-bit `0..16383` bend range.
- **Expressive Synth** starts direct keyed voices with note, gain, pressure, brightness, pan, and
  program formulas. Hit mode releases after its duration; pair-gate mode releases on the matching
  end and can update the live voice from opt-in `stay` events.

Starting physics prepares mapped Mixer and Expressive Synth engines from the user gesture without
holding the simulation. If browser audio is unavailable or suspended, output is safely dropped and
the runtime reports `physics.mapping.audio.unavailable`. Pause, Reset, mapping/source removal, and
runtime disposal release all active pair-gated MIDI and direct synth voices.

MIDI 2/UMP and raw MIDI are deliberately deferred: they will be additional target adapters rather
than a new mapping schema. Likewise, a future Excalidraw node-and-arrow graph will edit these same
mapping records rather than inventing a parallel format.
