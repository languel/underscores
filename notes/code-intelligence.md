# Code intelligence

## Current checkpoint

The shared CodeMirror editor now has a language-service extension point. Each
script profile can provide `completionSource`, `hover`, and `reference` data
without changing the editor shell. p5 is the first provider.

The p5 provider is browser-local and data-driven. It covers the common global
and instance-mode API, lifecycle snippets (`setup`, `draw`, `p.setup`, and
`p.draw`), Underscores bridge values, function signatures, short descriptions,
and runnable examples. Typing `p.` or `this.` narrows completion to instance
members; global-mode nodes offer unprefixed p5 names such as `background()`,
while instance-mode nodes keep the `p.background()` / `this.background()` form.
Auto mode follows the same source-mode detection used by the p5 runtime.
Hovering a documented p5 or Strudel name shows its signature, description,
example, and a link to the canonical language documentation. The same reference
data is available from the Info panel; the compact editor popup can be hidden
without hiding the Info-panel reference.

Trusted JavaScript editors also share a local Underscores bridge catalog.
Selecting `__`, `__.element`, `__.params`, `__.canvas`, `__.events`,
`__.transport`, `__.colors`, or `__.api` shows the matching signature,
description, and example in the Info panel. Nested query and API namespaces such
as `__.canvas.selected`, `__.events.latest`, and `__.api.commands` are included;
the catalog is bundled and does not fetch documentation during editing.

Documentation overlays are opt-in per language. The global setting in
Settings → Board → Interface is the default, with p5 and Strudel overrides
beside it. The context command accepts `/docs overlay`, `/docs overlay p5 off`,
`/lsp overlay strudel on`, or the equivalent natural-language forms;
`Mod+Shift+H` toggles the global default.

The same Interface section now separates the documentation trigger from
autocomplete. `Code tip trigger` can be `None`, `Hover`, or `Select`: Hover
keeps the short delayed reference card, None disables documentation tips, and
Select keeps the canvas quiet until a word is selected (normally with a
double-click), then updates the Info panel for that selection. The per-language
overlay switches still control only the floating popup card; they do not block
the Info-panel reference. `Code autocomplete` can be disabled independently
when completion suggestions would be distracting during a performance.

This is intentionally an LSP-shaped browser service rather than a network
dependency. The next step is to move providers into a worker-backed protocol
when diagnostics, symbols, parameter hints, and larger catalogs justify it.
That keeps live performance nodes independent from editor work and avoids
loading a language server for code kinds that are not open.

## Provider contract

`scriptEditorProfiles.js` exposes three optional provider hooks:

- `completionSource(context, options)` returns `{ from, options }` for
  CodeMirror. The p5 provider receives the node's `p5Mode` so global and
  instance completions stay consistent with the runtime.
- `hover(source, position)` returns a symbol range plus signature and docs.
- `reference()` returns structured entries for the Info panel or future search.

The existing static `completions` list remains the fallback for lightweight
profiles. Strudel, shaders, Orca, SVG, and Play Core can adopt the same hooks
incrementally without changing their runtime adapters.

## Planned increments

1. Add p5 parameter hints and diagnostics for lifecycle/API misuse.
2. Generate the p5 catalog from a pinned declaration/source snapshot while
   retaining curated examples and Underscores-specific bridge entries.
3. Add worker-backed services for shader GLSL and Strudel Mini syntax.
4. Add document symbols and go-to-definition for local `@param` declarations,
   `$:` voices, and shader uniforms.
