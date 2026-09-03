# Script Editor Architecture

Last updated: 2026-08-11

## Scope

The Script panel uses one CodeMirror 6 editing surface for Brush / modifier JavaScript, IanniX JavaScript, p5 JavaScript, Play Core JavaScript, SVG documents, and every non-grid Livecode Node. It is deliberately a compact live-coding editor inside Underscores's existing panel system, not a second application shell. Catalogs, parameter controls, adapter actions, status, and the current panel placement model remain outside the editor.

The shared surface provides:

- language-aware syntax trees for JavaScript and SVG/HTML;
- line numbers, active-line treatment, folding, indentation, bracket matching, and automatic closing;
- search and replace, selection-match highlighting, multiple selections, and rectangular selection;
- adapter-specific snippets and completions for Brush globals, IanniX commands/runtime helpers, p5 and Play Core plus the preferred `__` bridge (`underscores` remains a compatibility alias), and SVG elements/attributes;
- debounced adapter diagnostics and lint-gutter markers;
- persistent font sizing plus Underscores, Transparent, Mono, VS Code, and Teaching code palettes;
- `Mod+Enter` as a common Run/Play gesture.

When CodeMirror is focused it owns the complete editing session. Keyboard and clipboard events do
not fall through to Excalidraw's single-key tools or canvas copy/paste handlers. In particular,
unmodified Delete and Backspace are captured before Excalidraw's page-level deletion shortcut and
run CodeMirror's character-deletion commands directly, preserving the selected canvas object while
its source changes.

The compact contextual command field is opened with **Option/Alt+Shift+-**. It keeps the canvas
visible, passes the current selection as context, submits on Enter, and inserts a newline on
Shift+Enter. The assistant may propose a source edit, but the application still routes writes
through its controlled adapter update path; the canonical editor remains the source of truth.

## Boundaries

`src/UnderscoresCodeEditor.jsx` owns CodeMirror state, controlled-source synchronization, configuration compartments, editor commands, and accessibility attributes. It does not save or execute scripts.

`src/scriptEditorProfiles.js` is the language-intelligence registry. A profile selects the CodeMirror language package and supplies the runtime-aware completion list. New script adapters should add one profile and one `src/scriptTypes.js` entry rather than forking the editor.

The adapter blocks in `src/App.jsx` continue to own:

- catalog and current-source state;
- adapter-specific validation;
- import, save, duplicate, rename, and delete operations;
- runtime execution and trust boundaries;
- status messages and any selection requirements.

This separation preserves the live behavior that predates CodeMirror: p5 and Play Core both recompile valid edits
into their trusted live frames, SVG validates immediately and applies valid source after a 650 ms
typing pause, Brush still syncs drafts to attached modifiers on blur, and IanniX still runs through
its compatibility recorder.

SVG additionally uses the shared editor's selection callback and external range decoration. A
settled collapsed source cursor selects the corresponding SVG node or compound subpath; canvas,
Properties, and Outliner selection highlights the exact authored range without replacing editor
focus or rewriting the document.

## Livecode Node placement

`src/LivecodeNodeOverlay.jsx` places the exact same Livecode controller on the canvas or in the
Script panel. The node's `source` remains the single scene-persisted draft; changing placement does
not copy, reinitialize, or stop its adapter. A node's `view` and typography belong to the scene,
while dock placement belongs to local workspace state. Orca is the intentional exception to the
CodeMirror surface: it has a per-node grid editor whose focus captures all editing/navigation keys.
Canvas editors deliberately omit line numbers and fold gutters; those controls affect only the
docked Script editor. Both surfaces inherit the same muted adaptive syntax palette and visible
selection treatment, while the canvas relies on the Excalidraw host for its outer frame.

Markdown is the intentional presentation exception. Its canvas Code view is raw source only,
Output is a rendered document editor that reveals one source block at a time, and Code/output is
the explicit split layout. The docked editor always remains the full canonical source editor. Its
CodeMirror root and scroller must both fill the available panel width with `min-width: 0`; editor
content must never retain a stale measured width that leaves an internal scrollbar in the middle
of a resized or docked panel.

Strudel additionally places public painters such as `.pianoroll()` on a node-sized canvas below the
code overlay. The default-on **Frame** toggle registers or removes that target without recompiling
the pattern. Painter work uses the existing shared Strudel draw loop and pauses for offscreen
canvases; underscores methods continue to create inline CodeMirror widgets.
See [Livecode Nodes](livecode.md) for adapter behavior and the in-app quick-reference contract.

## Play Core adapter

`src/playCoreFrame.js` defines the portable host contract and a compact local implementation of the
public program lifecycle popularized by [ertdfgcvb/play.core](https://github.com/ertdfgcvb/play.core):
`settings`, `boot`, `pre`, `main`, `post`, and pointer callbacks. A Play Core host is an ordinary
transparent rectangle or frame with `customData.underscoresPlayCore`; it stays selectable and
transformable like a p5 host.

Play Core also uses the same local working-file model as p5. The selector exposes saved programs
from `underscores_play_core_scripts`; Save, Duplicate, New, Import, and Delete act on that catalog.
Its separate **Underscores examples** group provides original local teaching programs for the
Play Core-style lifecycle. Choosing an example creates an ordinary editable saved Underscores
program, so it can be modified, renamed, duplicated, and attached without a network dependency.
The examples are authored for this runner and do not copy upstream program sources.
Hosts retain a `scriptId`, so saving the selected program recompiles every linked host while an
unsaved draft remains local until it is saved or attached.

When the Script panel is in p5 or Play Core mode, selecting exactly one matching canvas host makes
that host authoritative for the editor: its linked file, canonical source, mode (for p5), and name
are loaded into the panel. This synchronization is deliberately driven by host-scene updates rather
than catalog updates, so a valid keystroke cannot be overwritten by the one-frame-old host snapshot
that precedes its live recompile.

The runner lives in `src/PlayCoreFrame.jsx`. It is intentionally local and ASCII-first: it derives a
cell buffer from `settings.cols` / `settings.rows` (or the host size), evaluates the program at its
configured frame rate, and renders it to a monospace `<pre>`. Runtime code receives the existing
`createScriptCanvasApi` bridge, so `__.canvas`, `__.events`, and
`__.transport` have the same semantics as p5. `@param` annotations are parsed by the shared
parameter module, persisted per host, and exposed as `__.params`.

The live shared `__` bridge is the same in Play Core and p5. It exposes `element`, `object`,
`frame`, `params`, `canvas`/`objects`, `events`, `transport`, and `time`. Appearance is also live:
`currentColor`, `currentOpacity`, `theme`, and `colors` (`foreground`, `accent`, `highlight`, and
`muted`, each with `color`, `opacity`, and composited `css`). `__.api` exposes the public
Underscores API for deliberate higher-level scene, grid, command, history, and macro operations.
The legacy `underscores` name remains available for compatibility.

## Typed stream bridge

All trusted runtimes—p5, Play Core, Strudel, Brush, and Livecode Nodes—receive a lexical
`__.streams` view. It can read typed `space`, `time`, `value`, `event`, and `image` streams through
`list({ kind, role })`, `get(idOrName)`, `snapshot()`, and `subscribe(listener)`. Existing Holistic
semantic methods remain compatible: `__.streams.get("Holistic").feature(...)` and `.features(...)`.

Trusted scripts may create a runtime-owned stream with `__.streams.create(descriptor)` and write to
that stream only. Created virtual streams are removed when their owning runtime stops; image frames
and browser handles are never serialized. `__.api.streams` and `window.__.streams` expose
the same public service for deliberate app integration.
The maintained full reference is [Underscores Script API](./underscores-api.md); the p5 and Play Core
Info panel guides present the same reference while scripting.

`main({ x, y, index }, context, cursor, buffer)` runs for each ASCII cell. `context`
contains the time, frame number, grid dimensions, host dimensions, and resolved settings; `cursor`
uses cell coordinates and retains its previous state at `cursor.p`. A program may return a character
or a cell object such as `{ char: "·" }`. `pre`, `post`, and pointer callbacks operate on the same
cell buffer and Underscores bridge.

Static ES imports resolve from a bundled, offline Play Core registry. The supported absolute paths
are `/src/modules/num.js`, `sort.js`, `vec2.js`, `vec3.js`, `sdf.js`, `string.js`, `buffer.js`,
`drawbox.js`, and `color.js` (all under `/src/modules/`). Named, default, namespace, and combined default/named
imports are rewritten before evaluation. Dynamic imports and paths outside that registry are rejected
with a diagnostic, which keeps scene playback and single-file export deterministic and network-free.

## Diagnostics and AI extension point

Diagnostics currently wrap the same validators used by each adapter and are intentionally advisory while typing. Runtime execution remains the authority and continues to report its full status below the editor.

AI integration should operate on the canonical adapter source and explicit editor selections, not on CodeMirror internals. Future AI edit actions can accept a script type, source range, and proposed patch, then dispatch a controlled source update through the same adapter state. Completion providers can later add async AI suggestions alongside the deterministic local profile without changing persistence or execution.

## Styling contract

CodeMirror emits structural and `tok-*` classes; `src/index.css` maps them through Underscores/Excalidraw theme variables and the explicit palette skin. **Underscores adaptive** follows the active board; **Transparent adaptive** has no editor or gutter fill; **Mono adaptive** tracks the active light/dark mode in grayscale; and **VS Code adaptive** switches between its familiar light and dark syntax skins with the board. **Teaching** retains high-contrast syntax on a transparent surface and supplies readable light-mode token colors rather than forcing a dark editor onto a light board. Editor, gutter, search panel, completion tooltip, diagnostics, selection, and focus borders must remain legible in all built-in board themes. Avoid extra status bars, minimaps, breadcrumbs, or nested cards.
