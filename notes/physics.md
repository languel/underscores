# Canvas-first relationships and physics

Drawerator API version 8 and scene-exchange version 10 introduce a solver-independent relationship graph at `drawerator.relationshipGraph`. The graph persists world settings, systems, object bindings, populations, constraints, mappings, and endpoint references. An authored body’s settings and reset state live on its native Excalidraw object at `object.customData.physics`; Rapier handles, live poses, collision queues, checkpoints, stream samples, and grab joints are runtime-only.

## Runtime architecture

- Rapier 2D is pinned to `@dimforge/rapier2d-deterministic-compat@0.19.3`. It runs at a fixed 60 Hz in `physics.worker.js` and is initialized only after the first enabled Rapier system is created. Normal builds use a lazy worker asset; the single-file build embeds the worker and creates its Blob only on activation.
- `runtime-lite` population members keep only solver identity, pose, collider, tags, and render style. Their transferable pose buffer is painted by one imperative Canvas2D overlay without a React render loop.
- `authored-rigid` bodies remain selectable Excalidraw objects. Display poses are batched, non-history scene updates; scene serialization substitutes the authored reset transform until Apply pose is used.
- `authored-deformable` bodies remain canonical Drawerator curves. The geometry adapter resolves stable anchor IDs and typed stream endpoints at display cadence while preserving reset geometry.
- The worker owns fixed-step accumulators, deterministic snapshots, transport checkpoints, bounded catch-up, collision queues, and pooled pose buffers. Paused systems do not send repeated pose buffers.

Each system has either an independent realtime clock or the Drawerator music transport clock. Pause holds the evaluated pose. Reset restores the authored baseline. Apply pose commits the current rigid transforms and deformable geometry as one authored history change. Seeking a transport-clocked system restores an in-memory deterministic checkpoint and advances fixed steps to the target. Transport rewind controls, including `Shift+Left`, reset a transport-linked world together with the score; independent physics is unaffected.

**Preview physics while scrubbing** is an optional, browser-local Physics World setting and is off by default. When the world follows the music transport, it evaluates the current playhead by restoring and replaying deterministic checkpoints while the timeline drag is in progress. Scrub evaluations suppress collision, audio, and command routes so a visual preview has no side effects. Large seeks can be expensive, and deterministic results require authored or recorded timed inputs rather than live external streams.

## Graph model and endpoints

`relationshipGraph.version` is currently `2`. Its collections are `systems`, `bodies`, `populations`, `constraints`, and `mappings`. Runtime ownership allows one writer per object channel: rigid systems claim `transform`; live geometry systems claim `geometry`. Duplicate claims emit `physics.writer.conflict`. Missing objects or deleted stable anchors emit `physics.relationship.orphan`; affected graph items are disabled but retained for repair. Legacy collision `routes` migrate to compatible mapping targets on load and are retained only as a script compatibility view; new scene JSON writes canonical mappings.

Endpoints can address a world point, object center or normalized object-local point, curve progress, canonical Bézier anchor by stable local ID, or a feature/value from a typed stream. Canonical Bézier geometry is version 2. Existing anchors migrate to stable `anchor-N` IDs, and newly inserted anchors receive UUIDs. Copy/import remaps object references while retaining stable local anchors.

## Canvas interaction

Open `/physics` (or `/relations`). The panel is an inspector and transport, not a node editor.

The Scene panel also exposes a **World** section. Gravity is authored in metres per second squared (default `0, -9.8`), viscosity is zero by default, and `Pixels per metre` controls the conversion into canvas coordinates. Since canvas Y grows downward, the conventional negative world-Y gravity falls downward in the drawing. `Sim speed` scales elapsed simulation time while the solver keeps its fixed cadence. Its compact controls play/pause, reset, and optionally sync all physics systems to the music transport; with sync active, either transport controls the other.

The Systems panel contains an opt-in **Physics debug overlay**. It draws diagnostic body bounds, actual collider geometry, labels, constraints, contacts, collision pulses, and force vectors in the same canvas/world coordinate system as the authored objects. Its data is runtime-only and never serializes or exports. With the overlay off, it does not collect or paint diagnostic primitives, so it adds no simulation or canvas rendering work.

Select a canvas object and use Shift-right-click → **Make Physics Body**, or run `/make body`. Drawerator creates a default World system when the scene has none, infers a collider and material from the selected object, attaches an authored dynamic body, and opens the Physics inspector. Fixed walls, pins, and joints remain separate authoring steps.

Assigned objects own their authored body data at `object.customData.physics`. The Properties panel exposes its most useful fields in a pinned **Physics role** section, while the relationship graph retains only the stable object/system binding needed for constraints and routes. Rapier receives a derived runtime body definition. Older scenes may still contain `customData.draweratorPhysics`; it is read as a legacy alias and replaced with `customData.physics` on the next body edit.

While a world is paused, **Paused edits → Author reset pose** is the default: moving, resizing, rotating, or editing an authored rigid object updates its physics reset pose and inferred collider in both the graph and `customData.physics`. **Reset** returns to that latest paused arrangement; **Apply current pose** commits a running simulation pose in the same way. Choose **Keep reset pose** when you want temporary paused staging or a simulation experiment to return to a locked authored arrangement. Play and Reset flush a pending paused edit before talking to the worker, and worker graph loads are revision-guarded so an older async load cannot replace a newer authored scene. Closed, near-round freehand strokes infer solid circle colliders; other closed strokes infer convex colliders. Path bodies can choose **Bounding box**, **Bounding ellipse**, **Convex hull**, or **Path chain** in Physics Role. A fixed Path chain is Rapier's exact concave polyline wall; a moving Path chain is a compound set of thin solid segments, so it retains path-shaped collisions and has mass.

1. Draw ordinary canvas objects and select them.
2. Assign Dynamic, Kinematic, Fixed collider, or Sensor properties.
3. Choose Pin, Spring, Distance, Revolute, Weld, or Attractor, then click two canvas endpoints. Handles appear for selected participants.
4. Press Play. Drag a running authored body directly to create a temporary grab spring; release it to return control to the solver without changing Reset.
5. Use Apply pose to author the current result, or Reset to return to the saved baseline.

The inspector edits selected-body name, collision tags, friction, restitution, density, and damping. Population controls create seeded runtime instances and can materialize them as individually authored objects in one undoable change.

Curve sculpt commands use the same stable point resolver: Smooth, seeded Randomize, an Attract brush, and Morph. Morph arc-length-resamples the target for correspondence. One-shot operations are normal undoable geometry changes; an attract-brush drag becomes one history action.

## Collisions and mappings

Collision events include graph version, system, fixed step and simulation time, phase, collision class, both identities, population/instance IDs, object references, tags, point, normal, impulse, and relative speed. Default phases are `begin`, `hit`, `end`, and sensor `enter`/`exit`; broken constraints emit `constraint-break` / `break`.

Mappings run in the collision path outside React as `Source -> Filter -> Transform -> Target`. The first source adapter selects collision phase, class, tags, numeric field, and input range. Filters combine minimum/maximum thresholds and an optional safe boolean formula; transforms provide output range, scale, offset, clamp, and a safe numeric formula. Targets include MIDI Note, CC, Pitch Bend, direct Expressive Synth voices, and compatibility actions for old routes. Pair-gated Note and Expressive targets use stable mapping/body-pair keys so `begin` opens and matching `end` releases voices across all Mixer destinations. See [Generic mappings](mappings.md) for the complete schema, formulas, and target semantics.

## Public API

```js
const system = __.physics.systems.create({ name: "Gas", gravity: { x: 0, y: 0 } });
__.relations.mappings.create({
  source: { systemId: system.id, phases: ["hit"], classes: ["body-wall"], field: "impulse", range: { min: 0, max: 10 } },
  filter: { min: 0.2 },
  transform: { outputMin: 24, outputMax: 127 },
  target: { kind: "midi-note", channel: 1, note: 60, velocityExpression: "round(value)" },
});
await __.physics.play(system.id);
const stop = __.relations.events.subscribe(events => console.log(events));
```

`__.relations` provides graph CRUD, endpoint normalization, adapter registration/listing, collision streams, event subscription, and canonical mapping collections. `__.physics` provides system helpers, lists for bodies/populations/constraints/mappings, a legacy routes compatibility view, play/pause/reset/apply, impulses, grabbing, materialization, live poses, telemetry, and deterministic snapshots. Trusted script hosts also keep `__.api.relations` and `__.api.physics` as self-reference aliases.

## Built-in classroom examples

- **Musical gas** draws curve and box walls, creates a seeded 250-particle runtime population, and routes body/body and body/wall hits to distinct sounds. See [Musical gas](examples/physics-musical-gas.md).
- **Marionette** creates persistent selectable rigid parts joined by a pin, spring, and revolute joints. See [Marionette](examples/physics-marionette.md).
- **Stream portrait** connects a stable curve anchor to a recorded deterministic face fixture; replace its stream endpoint with any MediaPipe semantic stream to drive the same curve. It also demonstrates shared sculpt operators. See [Stream portrait and sculpt](examples/physics-stream-portrait.md).

Reanimata informed the vocabulary—named joints, reset poses, rest length, stiffness, damping, and pins—but no GPL source is included.

## Performance telemetry

The existing monitor reports `physics.step`, `physics.transfer`, `physics.render`, body count, collision-event rate, dropped events, and route cost. The acceptance workload is the Musical gas example: 250 runtime bodies at a 60 Hz solver step while canvas rendering remains at least 45 FPS on the current target machine. Use a browser performance trace for CPU attribution; the overlay is cadence telemetry.
