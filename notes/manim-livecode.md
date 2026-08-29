# Manim Livecode integration

Status: implementation branch `manim`

## Goal

Add `manim-web` as a first-class Underscores Livecode runtime for mathematical/scientific animation without creating a parallel editor, parameter system, transport, or presentation model.

The intended authoring surface is deliberately close to normal Manim:

```js
// @param radius = 1.5 (0.25..3 step:0.05)
const circle = new Circle({ radius: __.params.radius });
await scene.play(new Create(circle));
```

Underscores owns the host DOM element, lifecycle, parameters, transport relationship, capture, and presentation cues. Authored code owns the mathematical scene.

## Architecture

```text
Livecode Node
  source
  parameters
  runtime
    transportMode: free | linked
    settings.progressionMode: auto | cue
       |
       v
livecodeAdapters.js
       |
       v
ManimFrame.jsx
  lifecycle / cancellation
  __ bridge
  transport gate
  cue controller
       |
       v
manim-web Scene
       |
       v
Three.js canvas
```

The persisted node never contains a Manim `Scene`, Three.js objects, renderer state, animation instances, or cue promises. Those remain disposable runtime state, matching the existing Livecode adapter contract.

## Runtime source environment

Manim Livecode receives:

- every identifier-safe public export from `manim-web` (`Circle`, `Square`, `Axes`, `MathTex`, `Create`, `Transform`, etc.);
- `scene`, the mounted `manim-web` scene;
- `MANIM`, the complete module namespace for less-common APIs;
- `__`, the Underscores bridge;
- `cue(label, options)`, the presentation build primitive.

Top-level `await` is supported so ordinary authored code can remain concise:

```js
const square = new Square({ sideLength: 3 });
const circle = new Circle({ radius: 1.5 });

await scene.play(new Create(square));
await scene.play(new Transform(square, circle));
await scene.play(new FadeOut(square));
```

## Parameters

Manim uses the existing shared Livecode parameter parser rather than a new slider DSL.

```js
// @param amplitude = 1 (0..4 step:0.05)
// @param showAxes = true (boolean)

const a = __.params.amplitude;
```

The current implementation reruns the Manim frame when persisted parameters change, matching the initial p5-style configuration path. A later reactive layer may bind selected parameters directly to mobject mutation without reconstructing the scene.

Planned generic convenience syntax, only if useful across runtimes:

```js
const a = __.number("amplitude", 1, { min: 0, max: 4, step: 0.05 });
```

This should be implemented in the shared scripting API, not Manim-specific code.

## Clock and progression are separate concerns

Two independent axes avoid conflating score synchronization with presentation builds.

### Clock

`runtime.transportMode`

- `free`: Manim runs from its own animation scheduler even when the score is stopped.
- `linked`: execution waits for the shared score transport before starting each `scene.play()` call. If upstream exposes pause/resume on the scene, score pause/resume is forwarded as a best-effort operation.

### Progression

`runtime.settings.progressionMode`

- `auto`: `cue()` resolves immediately and the program behaves like an ordinary Manim animation.
- `cue`: `cue()` becomes a presentation boundary and waits for an advance command.

This yields four useful combinations:

```text
free + auto     standalone animation
free + cue      PowerPoint/Keynote-style worked example
linked + auto   score-synchronized animation/performance
linked + cue    score-aware presentation with manual builds
```

## Cue / keyframe metaphor

A cue is a semantic presentation boundary, not a frame snapshot.

```js
const axes = new Axes();
await scene.play(new Create(axes));

await cue("Function");
const graph = new FunctionGraph({ func: x => x * x });
await scene.play(new Create(graph));

await cue("Derivative");
// ...
```

In `auto` mode those boundaries cost nothing. In `cue` mode the program suspends at each boundary.

Current controls:

- the Manim frame shows a small **Next** control in cue mode. It is disabled until a cue is actually pending, and remains clickable inside the otherwise pass-through livecode overlay;
- external code may dispatch `underscores:manim-control` with `{ elementId, action: "next" }`;
- trusted Livecode code may emit `__.events.emit("manim.cue.next", { elementId: __.element.id })`;
- the public API exposes the same event path as `window.__.events.emit(...)`;
- the command registry exposes `livecode.manim.cue.next`, which is also available to WebMCP and defaults to `Alt+Shift+ArrowRight` (customizable in Settings → Shortcuts);
- the frame publishes `underscores:manim-status` events including cue metadata and runtime status.

All of these routes converge on the same `manim.cue.next` event and cue controller. This keeps keyboard shortcuts, WebMCP, AI, scripted events, and presentation controls semantically aligned. The outer Playlist **Next** hierarchy still needs to be wired to consume a pending Manim cue before advancing its anchor.

## Presentation integration

The intended hierarchy is:

```text
Playlist anchor / presentation step
    |- Manim cue 0
    |- Manim cue 1
    |- Manim cue 2
    `- next outer anchor
```

Presentation **Next** should first ask the active Manim node whether it has a pending cue. If so, advance that cue. Otherwise advance the outer Playlist anchor.

This is preferable to representing every mathematical reveal as a full canvas presentation anchor.

`manim-web` 0.3.x also has its own slides mode (`nextSlide`, auto-next, per-slide looping). The integration should evaluate adapting that upstream machinery, but Underscores remains authoritative for persistence, commands, History, and outer presentation state.

## Transport

Initial linked transport intentionally does not promise arbitrary seek into an in-progress Manim animation.

Implemented semantics:

- free nodes ignore score play state;
- linked nodes wait for score Play before starting authored execution / the next `scene.play()`;
- optional upstream `scene.pause()` / `scene.resume()` methods are invoked when present;
- node rerun/stop disposes the old scene and invalidates stale async continuations.

Later transport work, only if teaching/performance use requires it:

1. exact pause/resume of current animation;
2. phase-locking to score time;
3. cue-aware reconstruction after score seek;
4. deterministic restart from transport loop boundaries.

## Keyframe reconstruction

For lecture navigation, prefer deterministic cue reconstruction over serialization of arbitrary Three.js state.

Conceptually, `gotoCue(n)` can:

1. dispose/reset the scene;
2. execute preceding animation steps with zero or near-zero duration;
3. stop at cue `n`;
4. resume ordinary duration from that point.

That produces a practical PowerPoint-like "previous build" without attempting to serialize Manim mobjects or scrub arbitrary promises.

This is not implemented in the first runtime pass.

## History and recording

History should record semantic presenter intent, not Manim internal frames.

Recordable actions should eventually include:

```text
livecode.manim.run
livecode.manim.stop
livecode.manim.restart
livecode.manim.cue.next
livecode.manim.cue.goto
livecode.parameter.set
```

Do not record individual Three.js mutations or every internal `scene.play()`.

A recorded lecture can then reproduce:

- presentation navigation;
- Manim cue reveals;
- Livecode parameter changes;
- canvas drawings/annotations;
- other existing History actions.

Pixel/video recording remains a separate export layer.

## Auto-key

Livecode parameters should become ordinary automation targets, e.g.

```text
livecode:<nodeId>:parameter:amplitude
```

Numeric parameters interpolate using the existing automation rules. Boolean/string/select values hold until the next key.

This gives one parameter three consistent behaviors:

```text
manual slider -> live value
Auto-key armed -> writes keys
transport playback -> receives interpolated values
```

Manim does not need to know how the timeline stores those keys.

## Interaction

Manim should reuse Livecode's existing interaction arbitration. `allowInteraction` is already passed through the adapter.

Desired behavior:

- canvas mode: pointer gestures select/move/resize the Livecode node;
- interactive mode: pointer gestures reach Manim draggable/clickable mobjects;
- Escape or the existing Livecode interaction convention returns ownership to the canvas.

Do not create a Manim-specific lock mode if the generic Livecode mechanism can own this.

## Resize and appearance

The node rectangle is the viewport. Mathematical coordinates should remain stable while the renderer/camera adapts to node size.

The Manim canvas follows the node's transformed DOM viewport (`width: 100%` /
`height: 100%`) while retaining its authored renderer dimensions for the
logical scene. This keeps board zoom and node transforms from leaving a fixed
Three.js canvas stranded in the upper-left corner. Authored width/height
changes recreate the disposable `Scene` with the new renderer dimensions.

`manim-web` does not currently consume a `transparent` Scene option. The
adapter translates the persisted `transparent` setting to
`backgroundOpacity: 0` (or `1` for an opaque frame), which enables WebGL alpha
compositing. A scene can still draw an opaque rectangle or background itself;
transparency only controls the renderer clear color.

The bridge exposes Underscores appearance state (`__.currentColor`, theme/colors) so authored scenes can opt into canvas styling. A later helper may provide sensible Manim defaults derived from Underscores foreground/background without hiding standard Manim color controls.

## Error and lifecycle model

Every run receives a generation id. When source/config/size changes or a node is stopped/deleted, the previous generation is invalidated. Stale async continuations must not mutate the replacement scene.

Cleanup is best-effort across upstream API versions:

- stop/dispose scene if provided;
- dispose renderer/controls if provided;
- release cue and transport waiters;
- unregister events/capture;
- clear the host.

The longer-term target is parity with p5's last-working-frame behavior: a bad edit should show diagnostics while retaining the last successful output.

## Dependency strategy

The implementation branch initially pins the official browser build URL to `manim-web@0.3.24` in `manimFrame.js`.

Reason: the repository commits `package-lock.json`; adding only `package.json` through the GitHub integration would leave `npm ci` inconsistent. The runtime loader is isolated so the dependency strategy can be changed without changing authored code or Livecode state.

Before merging to `main`, preferred production packaging is:

1. run a real `npm install manim-web@0.3.24` in a working checkout;
2. commit both `package.json` and the generated `package-lock.json`;
3. replace the remote runtime loader with the bundled import;
4. verify single-file/student build size and offline behavior.

Until then, the branch requires network access the first time a Manim runtime is loaded.

## Current branch implementation

Implemented:

- `manim` Livecode kind and JavaScript editor profile;
- Manim adapter + source validation;
- pinned `manim-web` browser runtime loader;
- high-level public Manim API injected into authored code;
- top-level `await`;
- `scene` / `MANIM` / `__` / `cue` source globals;
- shared `// @param` / `__.params` support;
- free vs linked transport gate;
- `auto` vs `cue` progression;
- in-node cue Next control;
- external cue/status events;
- generation-based cancellation and cleanup;
- Livecode capture hook;
- CodeMirror syntax diagnostics;
- starter + four teaching examples;
- unit tests for runtime helpers and Livecode registration.

## Next implementation phases

### Phase 2: command/presentation integration

- register stable `livecode.manim.*` commands;
- route cue Next through the command registry;
- let presentation Next consume an internal cue before advancing Playlist;
- add keyboard/presentation-remote mapping;
- expose cue state in the node/presentation UI;
- implement restart and deterministic `gotoCue` reconstruction.

### Phase 3: History + automation

- record semantic Manim commands;
- make Livecode parameters explicit automation targets;
- show parameter lanes/keys in the existing TransportTimeline;
- replay cue and parameter actions without recorder feedback.

### Phase 4: richer runtime control

- test upstream slides mode and `nextSlide` integration;
- exact pause/resume where supported;
- linked transport loop behavior;
- reactive parameters that mutate mobjects without full rerun;
- preserve last successful frame on runtime error.

### Phase 5: export

- still capture through the existing Livecode capture contract;
- evaluate manim-web GIF/video export;
- optional WebM/GIF node export;
- standalone HTML export if useful for lecture-note publishing.

## Verification checklist before merge

- create/run/stop/rerun a Manim node;
- edit invalid source and confirm diagnostics;
- resize and zoom the canvas;
- duplicate/delete the node while running;
- run two Manim nodes simultaneously;
- verify `// @param` controls and rerun behavior;
- verify free mode while score transport is stopped;
- verify linked mode waits for score Play;
- verify cue mode advances one build at a time;
- verify capture finds the rendered canvas;
- verify no Livecode regressions for p5, Strudel, Orca, Play Core, GLSL, Markdown, LaTeX, HTML;
- run `npm test`, `npm run lint`, and `npm run build` in a checkout;
- replace CDN runtime with bundled dependency + lockfile before merging.
