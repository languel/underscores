# Panel System Notes

Last updated: 2026-07-23

Drawerator owns one persistent panel model for **AI Assistant**, **Mods & FX**, **Script**, **IanniX**, **Mixer**, **Expressive Synth**, **Info**, **Settings**, **Console**, and **Transport**. Side panels support left dock, floating, and right dock placement. Mixer and Info additionally support the bottom dock; Transport supports floating and bottom-docked placement.

## Identity icon contract

The panel identity icon is the only visible placement control:

- click activates an inactive dock tab;
- click without pointer movement never changes placement;
- drag begins only after a small movement threshold, then detaches the panel and previews eligible dock targets;
- right-click opens the explicit placement and close menu;
- floating-panel menus include **Minimize**, which reduces the panel to its draggable identity icon without losing its saved size;
- Shift-double-click toggles that icon-only minimized state while floating;
- Option-double-click returns the panel to its natural dock: right for vertical panels and bottom for Mixer and Timeline;
- the same icon and interaction remain available while floating.

When multiple panels share a side, they render as one tab row. The active tab shows **icon + label** and inactive tabs show only their icons. The active tab replaces the otherwise redundant panel-title row. Each tab icon retains its own drag and context-menu behavior, so an inactive panel can be detached without first expanding a second header.

## Sizing and collapse

Panel dimensions are stored per panel; resizing one never changes another. Floating panels resize in both axes from the lower-right proximity handle. Docked panels resize from the canvas-facing edge.

Dragging a side panel below its minimum width collapses the complete dock. Dragging the bottom dock's top resize bar below its minimum height does the same. A collapsed dock leaves only its thin resize edge; drag that edge or double-click it to restore the dock. In transparent-overlay workspaces the bottom edge is invisible at rest and appears only on hover, where it thickens without an extra center notch. Hover alone never expands it. `Cmd+B` toggles the left dock, `Cmd+Opt+B` toggles the right dock, and `Cmd+Shift+B` toggles the bottom dock.

Invoking a docked panel from its shortcut, main menu, or command palette makes it the active tab and expands its dock. Invoking the already frontmost expanded panel collapses that dock. Floating panels instead toggle visibility.

## Persistence and commands

The following state persists independently:

- per-panel visibility and placement;
- per-panel floating position, width, and height;
- per-panel floating minimized state;
- active panel for each side and bottom dock;
- collapsed state for each side and bottom dock;
- transport placement and dimensions.

Every panel is available from the main menu and command palette, including `/chat`, `/mods`, `/script`, `/iannix`, `/synth`, `/settings`, `/console`, and `/transport`. Console / Info owns scene counts, score activity, MIDI clock status, and the global score-label display toggle rather than placing those diagnostics in the timeline.

## Script panel

Script editing is a standalone dockable concern rather than a tab embedded in a feature panel. The panel persists its selected script type and currently exposes two adapters:

- **Brush / modifier** retains the brush catalog, JavaScript editor, compilation feedback, shared `@param` controls, Run/apply-to-selection, Save, Duplicate, New, Import, Delete, and attached-modifier editing.
- **IanniX** retains the trusted script catalog, editable names, `ask()` / `@param` controls, Run, Save, Duplicate, New, Import, Delete, and one-line IanniX command execution.

The type selector changes the catalog, execution environment, and available actions together. `src/scriptTypes.js` is the registry boundary for future adapters; each adapter continues to own its existing persistence and runtime semantics. Opening a modifier's edit action selects Brush / modifier mode. Importing a trusted `.iannix` file selects IanniX mode. `Ctrl+Opt+B`, `/script`, the main menu, and the command palette open the independent panel.

Both adapters follow one compact editor layout: catalog and parameters first, then the action toolbar with a shared persistent monospace font-size control, a code editor that consumes the remaining height, and adapter status or command input at the bottom. Script selectors inherit the panel surface; code editors use the configurable **Subpanel background** surface. Compilation feedback is unframed text—green for success and red for errors—rather than another nested panel. `F2` or Shift-double-click on a selected custom script opens the selector in-place for renaming; new scripts do this automatically. Brush Run remains disabled until one or more compatible freehand or line paths are selected, then appends the active editor draft and its current parameter values as a live modifier.

Mods & FX now owns only the ordered modifier stack and its rendering controls. IanniX owns only score-object and data editing. This prevents either feature panel from becoming the lifetime or placement owner of the shared editor.

Fresh workspaces begin in Satori freehand mode with the left, right, and bottom docks collapsed. The normal default keeps the Mods/Grid dock tabs and Timeline available behind those reveal edges, while restored local layouts always win after first launch.

## Inspector layout

Dense parameter panels use the shared `InspectorSection` disclosure pattern. Sections are single-column, open by default when their contents are immediately useful, and collapse in place without adding nested card frames. A section header may include a compact readout or action on its right edge.

The Grid panel is a vertical inspector rather than a horizontal extension of the timeline. Timeline and inspector controls share the same compact type and control-height tokens; neither establishes a competing visual scale.

## Contextual help and shortcuts

Info is a normal panel, not an inspector card. It may float or join the bottom dock. Controls annotated with `data-info-title` and `data-info` update it on hover or keyboard focus while retaining a concise native hover title. This carries stable explanations for panel options; live errors, transport state, and changing values remain adjacent to their controls.

The editable **Settings → Shortcuts** view is the source of truth for Drawerator-specific key bindings. In addition to canvas tools and grid actions, it includes panel toggles, left/right/bottom dock collapse, transport, history, theme, modifier, geometry, and stroke-width actions. New actions must be registered there before they receive an application keyboard handler.

The detailed control and styling contract lives in [UI guidelines](ui-guidelines.md).
