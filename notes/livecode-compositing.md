# Livecode compositing

Last updated: 2026-09-01

## Purpose

Visual Livecode nodes share one presentation-composition model. A p5 sketch, shader, Tixy expression, Manim scene, Play Core program, Strudel visualizer, Orca grid, or presentation document can sit above or below native canvas objects and can blend with the surfaces beneath it without being flattened into an image.

Composition is deliberately separate from authored source and renderer lifecycle. The Excalidraw rectangle remains the node identity; the live DOM, canvas, iframe, or WebGL surface remains owned by its adapter.

## Controls

| Control | Stored value | Effect |
| --- | --- | --- |
| Layer | `compositeMode: overlay | underlay` | Routes the existing node wrapper above or below native canvas objects. An underlay makes Excalidraw's drawing background transparent while the board retains the selected canvas color. |
| Opacity | `compositeOpacity: 0..1` | Multiplies the node surface opacity after the ordinary Excalidraw element opacity. |
| Blend | `blendMode` | Applies CSS `mix-blend-mode` to the existing wrapper. The panel offers Normal, Screen, Multiply, Overlay, and Soft light. |
| Background | `backgroundMode` | Chooses Adapter default, Transparent surface, Theme surface, or Solid/authored where supported. Authored pixels still win: a p5 `background()` call or an HTML document's own body color cannot be erased by host CSS. |
| Frame reset | `persistence: auto | clear | accumulate` | Available only to adapters that own a safe reset policy. p5 currently implements it; `clear` calls `p.clear()` before authored `draw()`. |

Defaults are `overlay`, opacity `1`, blend `normal`, background `auto`, and persistence `auto`. Consequently, an untouched node does not acquire a blend stacking context or an extra per-frame operation. Shader background retains its historical `solid` default.

## Adapter capabilities

All current visual adapters expose Layer, Opacity, Blend, and Background. p5 additionally exposes Frame reset. Shader Background is intentionally limited to Solid and Transparent because its display pass owns the final alpha. Other adapters use the four shared host modes. Some runtimes can still author opaque pixels internally.

Strudel's audio scheduler is unaffected; composition applies only to its visible editor and visualizer surface. Manim maps Solid to an opaque runtime request and keeps its existing transparent default otherwise. Sandboxed HTML remains subject to iframe-origin and authored-document behavior.

## Performance model

The implementation uses CSS transforms, opacity, `mix-blend-mode`, and two stable overlay containers. It does not:

- read canvas or WebGL pixels during playback;
- call `drawImage()` to flatten nodes;
- serialize the scene on animation frames;
- publish collaboration state for visual frames; or
- add an animation loop for composition.

Blend and translucency are not free: the browser may allocate an intermediate compositor surface, and cost scales primarily with overlapping pixel area and device density. A few bounded nodes are inexpensive. Several full-window Retina feedback nodes using Screen or Soft light can become fill-rate or GPU-memory limited. Keep Normal on nodes that do not need blending, avoid unnecessary full-canvas overlap, and use the existing performance monitor when building a dense visual sketch.

Do not add global `will-change`, canvas readback, or per-frame React state to this path. New adapters should declare capabilities in `livecodeAdapters.js` and render into the existing node wrapper.

## Commands and API

The selection command field accepts:

```text
layer overlay
layer underlay
node opacity 65
blend screen
background transparent
```

The same state is revisioned through `livecode.node.update` using `runtimeSettings`, so the command registry, embedded assistant, `window.__`, and WebMCP use one update route rather than separate compositor APIs. Selection-command phrases remain the compact direct-manipulation form shown above.

## Fluid Brush and Inkwash emission

The bundled feedback examples declare:

```glsl
// @param emission = true (boolean)
```

Emission is authored shader behavior, not a general node/compositor setting. When enabled, the host supplies up to the bounded scene-segment budget and `u_sceneInteraction` lets those segments inject dye or wet pigment and add a small local flow. Inkwash can choose authored scene geometry or current physics-debug geometry as its emitter source. When disabled, pointer painting and feedback simulation continue, the segment count is zero, and scene-geometry collection is skipped.

Sketches created before this parameter existed may contain `runtime.settings.sceneInteraction`. The runtime uses that value only when the source has no `emission` declaration, preserving older scenes without keeping the demo control in general Node settings.
