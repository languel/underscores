# SVG Object Architecture

Last updated: 2026-07-27

## Phase-one contract

An SVG object is an ordinary Excalidraw rectangle host with versioned `customData.draweratorSvg`. The host supplies canonical scene identity, bounds, transform, opacity, selection, Outliner order, undo/redo, and scene persistence. Its SVG document is the authored visual source:

```js
{
  version: 1,
  name: "Untitled SVG",
  source: "<svg ...>...</svg>",
  revision: 1
}
```

The host's native fill and stroke remain transparent. `SvgObjectOverlay` maps its scene bounds through the current Excalidraw camera and renders the source as an SVG data image. Resizing or rotating the host therefore transforms the authored document without rewriting its geometry.

## Editor and commands

SVG is a type in Drawerator's existing Script panel alongside Brush, IanniX, and p5. It reuses the shared catalog, action toolbar, monospace source editor, font-size control, import route, and theme-aware status treatment. The adapter validates XML plus the root `<svg>` element. Play creates a new host or updates the selected target.

Visual editing means using the normal canvas selection and transform handles. SVG-specific document dimensions, viewBox, element tree, and attributes are extensions of the existing Properties panel. Attribute controls patch the matching start tag in the canonical source, so unsupported elements, metadata, styles, animation, and formatting outside the changed tag survive.

`/svg` selects the SVG Script adapter. `svg.object.run` exposes Play to the command palette, slash commands, `window.drawerator`, and approved AI actions. `svg.object.fromSelection` uses Excalidraw's established `exportToSvg` path, marks the original selected elements deleted, and inserts one SVG host in the same undoable scene commit.

## Exchange and trust boundary

Complete scene JSON and `.excalidraw` files already preserve unknown `customData`, so SVG documents survive the normal Drawerator scene route. Copying one SVG object as SVG uses its authored document rather than exporting the transparent native host. Pasting ordinary SVG still takes the complementary path: it becomes native editable Drawerator geometry.

The overlay uses an SVG image rather than injecting markup into the application DOM. CSS and declarative SMIL animation work inside that image. `<script>` content is preserved as author data but does not execute. Executable SVG JavaScript requires an explicit trusted runtime design comparable to IanniX/p5, including lifecycle, permissions, error isolation, and deterministic scene mutation.

## Current compositor boundary

SVG hosts share the canonical scene order and are ordered correctly relative to other SVG hosts, but the DOM overlay sits above Excalidraw's native canvas. A source-preserving SVG therefore cannot yet be interleaved between two native objects, and whole-board raster/vector export does not yet composite live SVG overlays. The next compositor phase should consume the same `draweratorSvg` payload so this data model and editor do not need to change.
