# Underscores UI Guidelines

Last updated: 2026-07-31

Underscores's interface should feel dense, quiet, and predictable. Ableton Live is the reference for information density and Blender is the reference for managing many editable parameters. The application keeps its minimal color scheme and uses structure, alignment, and restrained state fills instead of decorative framing.

## Layout and hierarchy

- Prefer a single vertical parameter column in side panels.
- Group related controls with the shared `InspectorSection` disclosure component.
- Use collapsible section headers instead of nested cards, subpanels, or redundant title frames.
- Keep labels short and align repeated label/value rows consistently.
- Use segmented tabs for peer views. Do not introduce another visual hierarchy when a tab or disclosure section is sufficient.
- Keep the Grid panel vertical. Keep the timeline horizontal and compact.
- Bottom-docked Mixer, Timeline, and Info views share one tab group and one collapsible top resize edge. Match the side handles: a single full-width line thickens on hover; do not add a centered grip or notch.

## Typography and dimensions

- Use the shared Underscores UI font tokens declared in `src/index.css`; do not invent component-local font scales.
- Standard controls are 27px high unless a genuinely smaller icon-only transport control is required.
- Labels, values, buttons, and select options should retain the same baseline and visual weight across panels.
- Timecode and tempo use the regular control font size. Their meaning, not oversized typography, supplies emphasis.

## Numeric controls

Use semantic `<input type="number">` controls for ordinary numeric values and provide `min`, `max`, `step`, and `data-default` wherever they are known. `NumberInputController` supplies the shared behavior:

- click focuses and selects the value for direct entry;
- horizontal drag changes the value using its declared step;
- Shift-drag uses one tenth of that step for fine adjustment;
- Shift+Backspace resets to the declared default; ordinary Backspace remains available for editing;
- right-click opens Reset to Default, Copy Data Path, and Add Route actions.
- Context menus use the active Underscores light/dark surface, text, separator, hover, and shortcut-hint colors.

Do not use sliders for ordinary scalar parameters. Keep formatted values such as SMPTE timecode as text inputs when they cannot truthfully be represented by a native number field.

## Select controls

- Closed selects use the same flat border, height, typography, and background as number boxes.
- Opening a select must not add a thick focus frame or blurred shadow.
- Picker options are vertically centered with consistent padding and selected/hover states.
- Longer explanations belong in the dockable/floating `/info` view and concise native hover titles, not as permanent prose between controls. Annotated controls expose `data-info-title` and `data-info`; hovering or focusing them updates Info without changing layout.
- Specialized controls such as the AI model picker must still use the shared select styling and constrain long menus to the viewport with scrolling.

## Contextual help and shortcuts

- Put stable control explanations in concise native hover titles and the dockable/floating **Info** panel, rather than leaving explanatory paragraphs in inspectors.
- Never leave stable tips or helper prose visible between controls. Attach that guidance to the relevant control as a hover title and Info-panel annotation; reserve inline text for live status, errors, and values that change while playing.
- Use the shared `infoProps(title, body)` helper so a control supplies both `title` and the `data-info-title` / `data-info` pair consumed by Info on hover or keyboard focus.
- Use a small `ⓘ` or `?` help anchor only where no existing control can naturally carry the explanation. Dynamic errors, live status, and values that change while playing remain inline.
- Keep the editable Shortcuts panel dense: shortcut rows are compact label/binding pairs, not large button cards. Register every Underscores action in the shared shortcut registry so its default is visible and rebindable there; do not add a hard-coded duplicate listener.
- Canvas selection follows the familiar default: click selects one object, Cmd/Ctrl-click toggles,
  Shift-click ranges in list views, and Escape or an empty-canvas click clears selection. Command-click
  selects a rectangular, framed, or Underscores-hosted object by its interior; repeat Command-Shift-click
  at one point to cycle overlapping eligible objects by depth. Option-drag remains available for copying.

## Buttons and toggles

- Transport icon buttons share one footprint; active state must never change a button's size or shape.
- Show toggled state with a restrained translucent fill only.
- Do not draw a border, focus outline, or shadow around an active fill.
- Hover fills should remain quieter than content and must not make controls jump in height.
- Loop, Auto-key, and future transport toggles follow the same state treatment as the surrounding Play and Stop controls.

## Color and framing

- Preserve the minimal neutral palette and existing accent variables.
- Appearance presets must define one coordinated accent, hover, panel, input, timeline, canvas, and grid palette. Mono Dark is the neutral fresh-session baseline; Mono Light is its light counterpart. Transparent Dark and Transparent Light use zero-opacity surfaces for overlay hosts. Built-in light/dark switching preserves a matching preset family; custom or unpaired themes fall back to Mono Light/Dark. Saved custom themes are local named snapshots of the complete appearance state.
- Theme and score-role color fields accept CSS color strings (`red`, hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `hwb()`, `lab()`/`lch()`, and `oklab()`/`oklch()`). The color picker resolves the authored string to a solid swatch while the text field retains the authored value.
- Context menus and command palette cards use the active panel surface. Command-palette overlays may dim the canvas, but never blur it.
- Canvas opacity is a first-class theme setting. An opacity of `0%` is reserved for transparent-overlay hosts; surrounding panel opacity remains independently configurable.
- Prefer separators, spacing, and background changes over extra frames.
- Avoid shadows except where a floating surface genuinely needs separation from the canvas.
- Validate both light and dark themes whenever changing shared controls.

## Review checklist

Before landing UI changes, verify:

1. repeated controls have matching heights, type, alignment, and focus behavior;
2. disclosure sections collapse without leaving redundant frames;
3. active and hover states do not change layout;
4. select menus remain readable and bounded;
5. numeric inputs support typing, coarse drag, fine drag, reset, and their context menu;
6. the timeline remains one compact row at supported desktop widths;
7. light and dark themes preserve contrast without stronger borders or fills.
8. stable control help appears in a hover title and Info, while dynamic status remains inline;
9. newly introduced Underscores actions are present in the editable Shortcuts panel.
