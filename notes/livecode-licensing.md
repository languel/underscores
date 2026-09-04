# Livecode licensing and deployment gate

Last updated: 2026-09-04

## Strudel release gate

Underscores directly bundles `@strudel/core`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler`, and `@strudel/webaudio`. Strudel is AGPL-3.0-or-later. Direct integration is therefore a release obligation, not just an attribution item. The exact package versions are pinned in `package.json` and `package-lock.json`.

The Strudel-enabled distribution now declares AGPL-3.0-or-later in `package.json`, provides the full license in `LICENSE`, and publishes the corresponding-source offer in [`SOURCE.md`](../SOURCE.md). `scripts/assert-strudel-release-gate.js` runs before `npm run deploy` and verifies those artifacts, the third-party inventory, and the release record. It does not use an acknowledgement variable for the public path.

Local `npm run dev`, test, and build workflows remain available for development. The [public release compliance record](release-compliance.md) is the checklist to review before each tagged deployment. The [Strudel custom UI guide](https://strudel.cc/technical-manual/project-start/) is the upstream integration reference.

## Internal demo profile

For controlled testing, `npm run build:demo` creates a single-file artifact with
the native Strudel runtime included. The profile is deliberately separate from
the student/public-safe build so its eventual feature allowlist can be defined
independently; today it includes the full local runtime. Deployment remains an
explicit opt-in:

```bash
UNDERSCORES_AGPL_COMPLIANCE=acknowledged npm run deploy:demo
```

This publishes the demo artifact through the existing `gh-pages` mechanism.
The exact spelling is `UNDERSCORES_AGPL_COMPLIANCE` (including the leading `U`
and the final `S` in `UNDERSCORES`), with the literal value `acknowledged`. The
demo gate also reads the value from an ignored local `.env` or `.env.local`
file; copy `.env.example` to `.env`, set the value, and run
`npm run deploy:demo`. The public path remains `npm run deploy`, which runs the
artifact checks above without this acknowledgement.

## Student/public-safe artifact

The repository has a separate classroom release profile documented in
[`notes/student-release.md`](./student-release.md). Run `npm run build:students`
to build a single-file artifact with compile-time aliases that omit native
Strudel, its CodeMirror integration, and the optional Monaspace font pack.
Persisted Strudel nodes remain visible as an explicit unavailable notice, while
new Livecode nodes default to p5. `npm run deploy:students` runs the same check
and publishes the resulting `dist` directory to `gh-pages`.

This profile is a packaging control, not a legal conclusion. The full source
tree and normal development build continue to carry the dependencies and their
notices so the same pinned graph is available for every release and audit.

## Orca

`src/orcaEngine.js` and `src/OrcaNode.jsx` adapt the Orca grid interaction and selected operator semantics from [Orca by Hundredrabbits](https://github.com/hundredrabbits/Orca), copyright 2017 Hundredrabbits, under the MIT License. The complete MIT notice is retained in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Presentation and font dependencies

- `marked` and `katex` are used for local Markdown and math rendering; their installed packages retain their own notices.
- `@fontsource/fira-mono` packages Fira Mono, copyright Google Inc., under SIL OFL-1.1.
- `@fontsource/inter` packages Inter, copyright 2016 The Inter Project Authors, under SIL OFL-1.1.

Fira Mono and Inter are bundled as local WOFF2 assets for Livecode Node typography. The common OFL notice and both attributions are included in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
