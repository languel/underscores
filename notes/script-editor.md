# Script Editor Architecture

Last updated: 2026-07-27

## Scope

The Script panel uses one CodeMirror 6 editing surface for Brush / modifier JavaScript, IanniX JavaScript, p5 JavaScript, and SVG documents. It is deliberately a compact live-coding editor inside Drawerator's existing panel system, not a second application shell. Catalogs, parameter controls, adapter actions, status, and the current panel placement model remain outside the editor.

The shared surface provides:

- language-aware syntax trees for JavaScript and SVG/HTML;
- line numbers, active-line treatment, folding, indentation, bracket matching, and automatic closing;
- search and replace, selection-match highlighting, multiple selections, and rectangular selection;
- adapter-specific snippets and completions for Brush globals, IanniX commands/runtime helpers, p5 plus the `drawerator` bridge, and SVG elements/attributes;
- debounced adapter diagnostics and lint-gutter markers;
- persistent font sizing and complete Mono/Transparent light/dark theme inheritance;
- `Mod+Enter` as a common Run/Play gesture.

## Boundaries

`src/DraweratorCodeEditor.jsx` owns CodeMirror state, controlled-source synchronization, configuration compartments, editor commands, and accessibility attributes. It does not save or execute scripts.

`src/scriptEditorProfiles.js` is the language-intelligence registry. A profile selects the CodeMirror language package and supplies the runtime-aware completion list. New script adapters should add one profile and one `src/scriptTypes.js` entry rather than forking the editor.

The adapter blocks in `src/App.jsx` continue to own:

- catalog and current-source state;
- adapter-specific validation;
- import, save, duplicate, rename, and delete operations;
- runtime execution and trust boundaries;
- status messages and any selection requirements.

This separation preserves the live behavior that predates CodeMirror: p5 still recompiles edits into its trusted live frame, SVG still updates validity status while typing, Brush still syncs drafts to attached modifiers on blur, and IanniX still runs through its compatibility recorder.

## Diagnostics and AI extension point

Diagnostics currently wrap the same validators used by each adapter and are intentionally advisory while typing. Runtime execution remains the authority and continues to report its full status below the editor.

AI integration should operate on the canonical adapter source and explicit editor selections, not on CodeMirror internals. Future AI edit actions can accept a script type, source range, and proposed patch, then dispatch a controlled source update through the same adapter state. Completion providers can later add async AI suggestions alongside the deterministic local profile without changing persistence or execution.

## Styling contract

CodeMirror emits structural and `tok-*` classes; `src/index.css` maps them exclusively through Drawerator/Excalidraw theme variables. Editor, gutter, search panel, completion tooltip, diagnostics, selection, and focus borders must remain legible in all four built-in theme families. Avoid fixed dark-only editor themes, extra status bars, minimaps, breadcrumbs, or nested cards.
