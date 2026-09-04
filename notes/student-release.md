# Student/public-safe release

Underscores keeps the full experimental toolchain in the repository for local
authoring, while offering a smaller artifact for classroom sharing. The safe
profile is an engineering boundary, not a substitute for a complete license
review.

## Build and publish

```bash
npm run build:students
npm run deploy:students
```

`build:students` creates the same single-file Vite application used by Pages,
but sets `PUBLIC_SAFE_BUILD=true`. The build aliases the native Strudel runtime
and Strudel CodeMirror hooks to unavailable/no-op adapters, and aliases the
optional Monaspace stylesheet to an empty stylesheet. The post-build check
fails if Strudel package markers or Monaspace font assets appear in `dist`.

`deploy:students` publishes that checked `dist` directory to the `gh-pages`
branch. The normal `npm run deploy` command publishes the full Strudel-enabled
AGPL distribution after running the corresponding-source and notice checks;
it is intentionally not used for the student artifact.

## What students receive

The Pages artifact keeps the useful local canvas, media, p5, Play Core, Orca,
shader, Markdown, LaTeX, SVG, score, and object-picker workflows. A persisted
Strudel node is shown as unavailable rather than evaluated, and new Livecode
nodes default to p5; no Strudel scheduler, Web Audio integration, sample map,
or Strudel editor package is shipped. The internal Fira Mono and Inter fonts
remain available and their OFL notices stay in the source release.

## What remains tracked internally

The normal development/build profile still installs and tests native Strudel,
the Monaspace font families, and their source adapters. Their versions,
notices, and the public-release requirements are recorded in
[`notes/livecode-licensing.md`](./livecode-licensing.md), [`SOURCE.md`](../SOURCE.md),
and [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). The full deploy path
verifies those artifacts on every release.
