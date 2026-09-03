# Livecode licensing and deployment gate

Last updated: 2026-07-29

## Strudel release gate

Underscores directly bundles `@strudel/core`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler`, and `@strudel/webaudio`. Strudel is AGPL-3.0-or-later. Direct integration is therefore a release obligation, not just an attribution item. The exact package versions are pinned in `package.json` and `package-lock.json`.

Local `npm run dev`, test, and build workflows remain available for development. Public deployment is blocked by `scripts/assert-strudel-release-gate.js`, which runs before the `deploy` script. It requires `UNDERSCORES_AGPL_COMPLIANCE=acknowledged` only after all of these conditions have been completed:

1. Underscores adopts an AGPL-compatible project license.
2. The public release includes complete corresponding source and reproducible build instructions.
3. Strudel's notices, version information, and any modification records are preserved.
4. Every bundled font, audio/sample pack, and other asset is separately audited and recorded.
5. Strudel sample packs stay opt-in until their individual licenses are recorded.

The environment variable is an administrative acknowledgement after compliance; it is not a substitute for the obligations above. The [Strudel custom UI guide](https://strudel.cc/technical-manual/project-start/) is the upstream integration reference.

## Internal demo profile

For controlled testing, `npm run build:demo` creates a single-file artifact with
the native Strudel runtime included. The profile is deliberately separate from
the student/public-safe build so its eventual feature allowlist can be defined
independently; today it includes the full local runtime. Deployment remains an
explicit opt-in:

```bash
UNDERSCORES_AGPL_COMPLIANCE=acknowledged npm run deploy:demo
```

This publishes the demo artifact through the existing `gh-pages` mechanism but
does not weaken or satisfy the full public-release gate above. The exact
spelling is `UNDERSCORES_AGPL_COMPLIANCE` (including the leading `U` and the
final `S` in `UNDERSCORES`), with the literal value `acknowledged`. The gate
also reads the value from an ignored local `.env` or `.env.local` file; copy
`.env.example` to `.env`, set the value, and run `npm run deploy:demo`.

## Student/public-safe artifact

The repository has a separate classroom release profile documented in
[`notes/student-release.md`](./student-release.md). Run `npm run build:students`
to build a single-file artifact with compile-time aliases that omit native
Strudel, its CodeMirror integration, and the optional Monaspace font pack.
Persisted Strudel nodes remain visible as an explicit unavailable notice, while
new Livecode nodes default to p5. `npm run deploy:students` runs the same check
and publishes the resulting `dist` directory to `gh-pages`.

This profile is a packaging control, not a legal conclusion. The full source
tree and normal development build continue to carry the experimental
dependencies and their notices so they can be audited and acknowledged later.

## Orca

`src/orcaEngine.js` and `src/OrcaNode.jsx` adapt the Orca grid interaction and selected operator semantics from [Orca by Hundredrabbits](https://github.com/hundredrabbits/Orca), copyright 2017 Hundredrabbits, under the MIT License. The complete MIT notice is retained in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Presentation and font dependencies

- `marked` and `katex` are used for local Markdown and math rendering; their installed packages retain their own notices.
- `@fontsource/fira-mono` packages Fira Mono, copyright Google Inc., under SIL OFL-1.1.
- `@fontsource/inter` packages Inter, copyright 2016 The Inter Project Authors, under SIL OFL-1.1.

Fira Mono and Inter are bundled as local WOFF2 assets for Livecode Node typography. The common OFL notice and both attributions are included in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
