# Drawerator UI Guidelines

Last updated: 2026-07-21

Drawerator's interface should feel dense, quiet, and predictable. Ableton Live is the reference for information density and Blender is the reference for managing many editable parameters. The application keeps its minimal color scheme and uses structure, alignment, and restrained state fills instead of decorative framing.

## Layout and hierarchy

- Prefer a single vertical parameter column in side panels.
- Group related controls with the shared `InspectorSection` disclosure component.
- Use collapsible section headers instead of nested cards, subpanels, or redundant title frames.
- Keep labels short and align repeated label/value rows consistently.
- Use segmented tabs for peer views. Do not introduce another visual hierarchy when a tab or disclosure section is sufficient.
- Keep the Grid panel vertical. Keep the timeline horizontal and compact.

## Typography and dimensions

- Use the shared Drawerator UI font tokens declared in `src/index.css`; do not invent component-local font scales.
- Standard controls are 27px high unless a genuinely smaller icon-only transport control is required.
- Labels, values, buttons, and select options should retain the same baseline and visual weight across panels.
- Timecode and tempo use the regular control font size. Their meaning, not oversized typography, supplies emphasis.

## Numeric controls

Use semantic `<input type="number">` controls for ordinary numeric values and provide `min`, `max`, `step`, and `data-default` wherever they are known. `NumberInputController` supplies the shared behavior:

- click focuses and selects the value for direct entry;
- horizontal drag changes the value using its declared step;
- Shift-drag uses one tenth of that step for fine adjustment;
- Backspace resets to the declared default;
- right-click opens Reset to Default, Copy Data Path, and Add Route actions.

Do not use sliders for ordinary scalar parameters. Keep formatted values such as SMPTE timecode as text inputs when they cannot truthfully be represented by a native number field.

## Select controls

- Closed selects use the same flat border, height, typography, and background as number boxes.
- Opening a select must not add a thick focus frame or blurred shadow.
- Picker options are vertically centered with consistent padding and selected/hover states.
- Specialized controls such as the AI model picker must still use the shared select styling and constrain long menus to the viewport with scrolling.

## Buttons and toggles

- Transport icon buttons share one footprint; active state must never change a button's size or shape.
- Show toggled state with a restrained translucent fill only.
- Do not draw a border, focus outline, or shadow around an active fill.
- Hover fills should remain quieter than content and must not make controls jump in height.
- Loop, Auto-key, and future transport toggles follow the same state treatment as the surrounding Play and Stop controls.

## Color and framing

- Preserve the minimal neutral palette and existing accent variables.
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
