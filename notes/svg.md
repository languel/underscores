# First-Class SVG Editor and Runtime

Last updated: 2026-07-28

## Canonical document contract

An SVG object remains an ordinary transparent Excalidraw host so it participates in scene
selection, transforms, opacity, ordering, history, copy/paste, and persistence. The authored SVG
source is canonical. Visual editing, Properties, scripts, animation inspection, AI commands, and
Drawerator bindings all patch that same source; the editor does not maintain a competing flattened
scene graph.

Version 2 of `customData.draweratorSvg` is:

```js
{
  version: 2,
  documentId: "svg-document-…",
  name: "Untitled SVG",
  source: "<svg …>…</svg>",
  revision: 4,
  runtime: {
    clock: "transport",             // or "free"
    trustedScripts: false,
    allowNetwork: false,
    allowForeignObjectInteraction: false
  },
  metadataMirror: {
    version: 1,
    sourceRevision: 4,
    valid: true,
    nodes: { /* rebuildable cache */ }
  }
}
```

Version-1 hosts migrate when read. A raw source edit remains byte-for-byte authored source. The
first structured edit performs one undoable normalization transaction that adds stable
`data-drawerator-id` attributes to addressable nodes and, when needed, an embedded registry:

```xml
<metadata data-drawerator="v1">
  {"version":1,"nodes":{"svg-node-…":{"iannix":{"role":"curve"}}}}
</metadata>
```

Authored `id` attributes are never replaced. The embedded registry is canonical for Drawerator
node data; the host mirror is an indexed cache keyed to the SVG revision and can always be rebuilt.
Comments, processing instructions, whitespace, namespaces, unsupported elements, and unknown
metadata outside a changed range survive normal edits.

## Lossless document model

`SvgDocumentModel` uses four complementary representations:

- `saxes` validates namespace-aware XML and records exact source ranges.
- `css-tree` parses style blocks, selectors, declarations, custom properties, and keyframes.
- `svg-pathdata` accepts the complete SVG path grammar, including compact syntax, relative
  commands, smooth commands, and elliptical arcs.
- `transformation-matrix` composes nested SVG transforms and provides inverse matrices for
  pointer-to-local conversion.

Structured edits are non-overlapping source patches. Full serialization is reserved for an
explicit future Format/Normalize command. Malformed source stays in CodeMirror while the last valid
canvas revision remains visible.

Stable cross-system references are either:

```js
{ kind: "element", elementId }
{ kind: "svg-node", elementId, nodeId, subpathId? }
```

Legacy cursor `curveId` links continue to serialize, while `curveRef` is authoritative when
present. Native and SVG-node geometry enter IanniX through the same provider boundary, allowing an
SVG subpath to be a Curve, Cursor, or Trigger without extracting a proxy object.

## Editing workflow

SVG source lives in the shared CodeMirror Script panel. Valid changes compile to the canvas after a
short debounce; Play creates the first host or records an explicit history checkpoint. Editor
focus owns text, shortcut, copy, and paste events before Excalidraw sees them.

A normal click selects the SVG host. Double-click or Command-click enters component mode and targets
the rendered SVG node, not the transparent host rectangle. Paths and compound-path subpaths expose
the spline editor:

- Drag an anchor or handle to edit in the node's local coordinate system.
- Option-drag breaks smooth handle coupling.
- Double-click a segment inserts an exact cubic anchor.
- Delete removes the selected anchor.
- Open/Close and Reverse are explicit Properties/command actions.
- Coincident subpath endpoints move as one joint; **Detach joint** is required before separating a
  connected branch.
- Arc, quadratic, smooth, horizontal/vertical, relative, closed, and compact commands are accepted
  and converted to editable absolute cubic geometry only when that path is visually changed.
- Nested `translate`, `scale`, `rotate`, `skew`, and `matrix` transforms remain authored; pointer
  movement is mapped through their inverse CTM rather than flattening them.

Properties and Outliner share the selected SVG node. They expose the authored tree, virtual compound
subpaths, document attributes, geometry actions, matched CSS declarations, animation lanes, runtime
policy, and embedded Drawerator data. Matched stylesheet declarations are patched in their existing
rule instead of silently becoming inline styles.

Selected non-root groups and primitives expose their computed bounds. Command-dragging inside that
outline writes a local translation before the node's existing transform; pointer deltas are mapped
through the inverse parent transform, so transformed ancestors do not cause drift or flattening.

Extraction remains explicit: **Extract spline**, **Extract as curve**, **Extract as cursor**, and
**Extract as trigger** create native canonical Béziers at the same world transform. **Assign curve**,
**Assign cursor**, and **Assign trigger** instead attach the role directly to the selected SVG
subpath through embedded metadata.

## Rendering, animation, and Looom

Normal rendering uses a script-free Shadow DOM document. Before insertion, executable scripts,
event attributes, interactive `foreignObject` content, CSS imports, and remote resources are made
inert without modifying canonical source. The live SVG DOM provides rendered-node hit testing,
computed styling, SVG CTMs, SMIL seeking, and Web Animations inspection.

Drawerator transport is the default master clock. SMIL is sought with
`SVGSVGElement.setCurrentTime()` and CSS animations are sought through the Web Animations API.
Selecting **Free run** lets that SVG use its own clock.

The timing graph recognizes:

- SMIL `animate`, `set`, `animateTransform`, `animateMotion`, and `mpath`
- CSS `@keyframes`, longhand animation properties, and animation shorthand
- Drawerator metadata automation lanes
- Looom thread/frame groups and their speed, offset, play-mode, latch, mask, blend, and pressure
  custom properties

Looom is treated as an SVG dialect, not a separate renderer. Existing Looom SVGs remain valid
source and retain style blocks, masks, blend modes, thread/frame hierarchy, and custom properties.
The implementation was informed by
[mattdesl/looom-tools](https://github.com/mattdesl/looom-tools), especially its
[parser](https://github.com/mattdesl/looom-tools/blob/main/src/parse-looom-svg.js) and
[timeline fixture](https://github.com/mattdesl/looom-tools/blob/main/test/fixtures/timeline.svg).
No source was copied; Looom Tools is MIT licensed.

## Trusted scripts and security

SVG JavaScript and event attributes are preserved but inert by default. Trusting scripts is an
explicit per-document action in Properties. Trusted execution occurs in a sandboxed iframe without
same-origin access and with a restrictive content-security policy. Network access is separately
disabled by default.

The iframe receives only a token-scoped `postMessage` bridge. It may emit allowed `log`, `cue`, or
`midi` messages and receive transport seeks; malformed, unknown, or wrong-token messages are
ignored. It cannot directly mutate the canonical SVG source or application DOM. Disabling trust
returns immediately to the inert renderer.

## Structured command API

The command registry exposes revision-checked operations to UI, scripts, `window.drawerator`, slash
commands, and approved AI actions:

```text
svg.document.get
svg.document.validate
svg.document.patch
svg.node.list
svg.node.create
svg.node.patch
svg.node.delete
svg.node.reparent
svg.geometry.patchPath
svg.style.patchRule
svg.animation.list
svg.animation.upsert
svg.animation.delete
svg.binding.attach
svg.binding.detach
svg.node.role.assign
```

Structured writes require the current SVG revision. A stale write fails with
`SVG_STALE_REVISION`; it never overwrites newer source. Results include the new revision,
changed-node IDs, and the parsed document.

## Exchange and compatibility

**From selection** converts native geometry to a source-preserving SVG at the same world position in
one history change. Neutral foreground marks become `currentColor`, so they follow Drawerator's
theme; deliberate colors stay literal. Copying an SVG host returns its authored SVG. Pasting an SVG
can still use the existing native editable-path import route.

Unsupported and future SVG/CSS constructs remain renderable and source-editable. The visual editor
never discards or flattens markup solely because no specialized control exists.

## Verification gate

The SVG test corpus covers no-op source preservation, minimal patches, namespaces, malformed
drafts, CSS rules and variables, the complete path grammar including arcs, nested transform stacks,
metadata migration, stable references, IanniX SVG-node roles, animation clocks, Looom timing,
trusted-runtime containment, and stale revision rejection.

Before release, run:

```bash
npm test
npm run build
npm run build:single
git diff --check
```

Browser acceptance must additionally cover direct hit testing, transformed path editing,
source/visual synchronization, keyboard ownership, undo/redo, theme compliance, runtime seeking,
role assignment, and scene reload.

## Remaining compositor boundary

SVG hosts share canonical scene order with native objects, but the current DOM renderer is still an
overlay above Excalidraw's native canvas. True per-object native/SVG interleaving and time-specific
PNG parity require the planned unified scene compositor. That compositor must reuse this canonical
source, stable-node, security, and timing model rather than introduce a second SVG representation.
