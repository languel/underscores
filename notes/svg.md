# SVG Object Architecture

Last updated: 2026-07-28

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

SVG is a type in Drawerator's existing Script panel alongside Brush, IanniX, and p5. It reuses the shared catalog, action toolbar, CodeMirror source editor, font-size control, import route, and theme-aware status treatment. The SVG profile uses HTML/XML syntax support plus SVG element, attribute, CSS, and SMIL completions. The adapter validates XML plus the root `<svg>` element. Play creates a new host; once a target exists, valid source changes update it automatically after a short debounce. Invalid or incomplete edits report the validation error and leave the last valid canvas render intact. Manual Play remains an explicit history checkpoint.

Visual editing has three related levels. A normal click selects the transparent native host through the SVG overlay and exposes Excalidraw's transform handles. Command-click or double-click a visible path enters SVG path edit mode; anchors and cubic handles use the same gestures as Drawerator splines. A compound `<path>` is parsed into ordered `M…` subpaths, and hit-testing chooses the nearest supported child. Coincident open-subpath endpoints are treated as one authored joint, so dragging any member updates every endpoint at that coordinate while preserving each branch's relative handles. This includes multi-way junctions. **Detach joint** in Properties arms the selected endpoint for one independent drag; once its coordinates separate, ordinary SVG geometry records the disconnection without hidden persistent state. Other edits serialize only the active child back into the parent `d` attribute, leaving unrelated sibling command text unchanged. Double-click inserts an exact cubic anchor, Delete removes the selected anchor, Option-drag breaks smooth handle coupling, and Escape exits.

SVG-specific document dimensions, viewBox, element tree, and attributes are extensions of the existing Properties panel. The Outliner keeps the SVG as one scene layer but can expand it to show the source document's nested nodes. Compound path nodes expose virtual subpath children in both trees; they are editor identities, not manufactured XML or Excalidraw objects. Both panels share one component selection with the canvas. Selecting a supported subpath immediately exposes its spline-style editor, while selecting the compound parent, root, group, or supported primitive shows source-derived bounds. The Properties tree follows an Outliner selection and vice versa. Attribute controls patch the matching start tag in the canonical source, so unsupported elements, metadata, styles, animation, and formatting outside the changed tag survive.

The selected subpath can cross the source/native boundary deliberately. **Extract spline** creates a canonical native Drawerator Bézier at the same world-space position, including host rotation, viewBox scaling, handles, closure, paint, width, and opacity where those values can be resolved. **Make curve**, **Make cursor**, and **Make trigger** perform that extraction and assign the requested score role in the same scene change. The SVG remains unchanged, and the new spline records its source element, node, and subpath indices in `customData.draweratorSvgSource` for later round-trip tooling. This provides the score interaction seam without flattening the rest of the document.

`/svg` selects the SVG Script adapter. `svg.object.run` exposes Play to the command palette, slash commands, `window.drawerator`, and approved AI actions. `svg.object.fromSelection` uses Excalidraw's established `exportToSvg` path, marks the original selected elements deleted, and inserts one SVG host in the same undoable scene commit. Neutral foreground colors produced by that export are normalized to standard SVG `currentColor`; the overlay resolves that semantic color from Drawerator's live foreground setting, so converted marks follow light/dark themes while explicitly colored artwork remains literal. `/svg path edit` enters the first supported path and subpath, and `/svg path cubic` canonicalizes its line, quadratic, smooth, and cubic commands to an absolute cubic representation before editing.

The first direct-edit slice deliberately supports one path node at a time. It accepts `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, and `Z`; paths with arc commands, multiple subpaths, or a `transform` on themselves or an ancestor remain source-editable but must be converted before direct canvas editing. Source-tree bounds are available for paths, rectangles, images, circles, ellipses, lines, polylines, polygons, and transform-free groups; unsupported nodes remain selectable and editable from their raw attributes/source even when they have no canvas bounds overlay.

## Hierarchy boundary

Drawerator maintains two related hierarchies without conflating them:

- The scene hierarchy owns objects, groups, nesting, paint order, transforms, visibility, locking, selection, and history.
- An SVG object's document hierarchy owns its `<svg>`, `<g>`, `<path>`, and other authored nodes inside one scene object.

The expandable SVG rows in Outliner expose the second hierarchy now, including virtual children for compound path subpaths. They do not manufacture separate Excalidraw objects for every source node or subpath, so source CSS, inheritance, definitions, metadata, and animation remain intact. Only an explicit extraction creates a first-class native Drawerator spline. General scene grouping and nested transforms can evolve independently and later host an SVG object exactly like any other scene object; it is not a prerequisite for SVG hit-testing or path editing.

## Exchange and trust boundary

Complete scene JSON and `.excalidraw` files already preserve unknown `customData`, so SVG documents survive the normal Drawerator scene route. Copying one SVG object as SVG uses its authored document rather than exporting the transparent native host. Pasting ordinary SVG still takes the complementary path: it becomes native editable Drawerator geometry.

The overlay uses an SVG image rather than injecting markup into the application DOM. CSS and declarative SMIL animation work inside that image. `<script>` content is preserved as author data but does not execute. Executable SVG JavaScript requires an explicit trusted runtime design comparable to IanniX/p5, including lifecycle, permissions, error isolation, and deterministic scene mutation.

## Current compositor boundary

SVG hosts share the canonical scene order and are ordered correctly relative to other SVG hosts, but the DOM overlay sits above Excalidraw's native canvas. A source-preserving SVG therefore cannot yet be interleaved between two native objects, and whole-board raster/vector export does not yet composite live SVG overlays. The next compositor phase should consume the same `draweratorSvg` payload so this data model and editor do not need to change.
