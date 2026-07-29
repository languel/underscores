# Livecode canvas nodes

Last updated: 2026-07-29

## What a node is

A **Livecode Node** is one transparent Excalidraw rectangle plus a minimal live DOM surface. The rectangle remains the canonical scene identity: it owns position, rotation, dimensions, selection, history, grouping, ordering, and the persisted `customData.draweratorLivecode` record. The visible surface is supplied by a per-kind adapter instead of by Excalidraw itself.

This avoids attaching a program to a separate host object. A node has one source document and can run alongside any number of other nodes. Its source and its `code`/`preview` view persist with the scene; whether its editor is docked is workspace-local.

Create a node from **New Livecode Node**, `/live`, the command palette, or `livecode.node.create`. Select it and double-click the surface to edit on the canvas. Select **Dock** from the compact edge controls or the command palette to move that *same* editor into the Script panel. Docking never creates a second draft and never stops a running runtime. The docked controls expose Run/Stop, linked/free clock mode, typography, and any `@param` values declared in the source.

## Scene schema

`customData.draweratorLivecode` is version 1:

| Field | Meaning |
| --- | --- |
| `version`, `nodeId`, `revision` | Versioned, stable node identity and source revision. |
| `kind`, `name`, `source` | Adapter id, readable name, and canonical source text. |
| `parameters` | Persisted `@param` values. |
| `runtime` | `enabled`, `running`, `transportMode` (`linked` or `free`), and adapter settings. |
| `view` | Scene-persisted `code` or `preview` surface choice. |
| `typography` | Font, size, line height, weight, and letter spacing. |

Source is always owned by the node. The canvas editor and the Script panel use the same CodeMirror controller; a valid edit updates the runtime, while adapters that can compile preserve their last working output when a draft is invalid.

## Typography

Node typography is independently persisted and exposed in the Script panel: **Fira Mono** for code-oriented nodes, **Inter** for readable presentation, and a system serif fallback. Size, line-height, weight, and tracking are stored per node. Fira Mono and Inter are bundled offline in the production build at weights 400/500/700 and 400/500/600/700 respectively; both are SIL Open Font License 1.1. Their notice is recorded in [third-party notices](../THIRD_PARTY_NOTICES.md).

The global CodeMirror palette still controls editor syntax colors and surfaces. Node typography only changes the node's own source/preview content.

## Runtime kinds

### p5 and Play Core

These use the same trusted local adapters as existing p5 and Play Core hosts. They receive the [shared Drawerator script bridge](drawerator-api.md), including `element`, `params`, `canvas`, `events`, `transport`, `currentColor`, theme colors, and `api`. They may use `@param` annotations. Every active node owns its renderer, so selecting, docking, or editing another node does not stop it.

Existing p5/Play Core frame hosts remain valid. Choose **Migrate to Livecode Node** to explicitly snapshot a legacy host's source and configuration into `draweratorLivecode` while retaining its scene element id and geometry. Migration is undoable.

### Strudel

Strudel nodes use a shared native scheduler rather than a singleton REPL. Each node compiles to its own pattern; recompiling, stopping, or hushing one never clears another. Node playback unlocks Web Audio in the direct user gesture. Linked nodes follow Drawerator transport and tempo; free nodes remain independent. The compact scope is a node-local visual feedback surface.

Native Strudel is available in local development, but public deployment is intentionally blocked by the [release gate](livecode-licensing.md#strudel-release-gate). Do not bypass that gate until the project has completed its AGPL obligations.

### Markdown and LaTeX

Markdown renders locally with KaTeX inline (`$…$`) and display (`$$…$$`) mathematics. Active markup is removed from Markdown output. A LaTeX node renders one local KaTeX expression. Both surfaces are deterministic DOM renderers suitable for live presentation and capture.

### HTML

HTML is trusted board content, but it runs immediately in an opaque-origin iframe with `sandbox="allow-scripts"`. It cannot read the parent application DOM, navigate the top window, or inherit parent-origin privileges. The child receives a token-scoped `window.drawerator` bridge with only `post` and `onMessage`; the parent verifies both token and source window before responding.

Browser security can block reliable parent-side rasterization of a sandboxed opaque-origin iframe. HTML presentation therefore reports an explicit export limitation instead of pretending that it has deterministic PNG capture.

### Orca

An Orca node is a real per-node grid, not a CodeMirror document. Canvas and docked modes subscribe to the same grid runtime. Click a cell to focus it; type to write; Arrow keys move; Shift+Arrow extends a selection; Delete clears; Cmd/Ctrl+A selects all; Cmd/Ctrl+C/V copies and pastes a grid rectangle; Cmd/Ctrl/Option+Enter or Space steps one frame. Focus owns these keys completely, so they never reach Excalidraw.

Linked Orca nodes tick from Drawerator transport; free nodes use a per-node timer. Their native operator core currently covers `A`, `B`, `C`, `D`, `E/N/S/W`, `I`, `L`, `M`, bang triggering, and MIDI `:`, mono MIDI `%`, CC `!`, and pitch bend `?`. MIDI is sent through the existing Drawerator Mixer routing. Other visible Orca glyphs are preserved in the authored grid and remain inert until their semantics are added; they are never rewritten or discarded. The interaction and supported operator behavior are adapted from [Hundredrabbits Orca](https://github.com/hundredrabbits/Orca) under its MIT license.

## In-app reference and commands

The docked Script editor exposes an adapter-specific quick reference with the active node's keyboard and runtime details. Core commands are:

- `livecode.node.create`
- `livecode.node.edit`
- `livecode.node.run` / `livecode.node.stop`
- `livecode.node.dock`
- `livecode.node.migrate`

Use `window.drawerator.commands.list()` to retrieve the public command contract rather than calling internal UI handlers.

## Presentation and export

Livecode nodes remain visible in presentation mode. p5, Play Core, Markdown, LaTeX, Strudel's visual feedback, and Orca can be represented at deterministic state when their renderer is available. Sandboxed HTML is intentionally the exception: cross-origin security may prevent a reliable raster readback, and this limitation is reported rather than silently producing a broken export.
