# Livecode licensing and deployment gate

Last updated: 2026-07-29

## Strudel release gate

Underscore directly bundles `@strudel/core`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler`, and `@strudel/webaudio`. Strudel is AGPL-3.0-or-later. Direct integration is therefore a release obligation, not just an attribution item. The exact package versions are pinned in `package.json` and `package-lock.json`.

Local `npm run dev`, test, and build workflows remain available for development. Public deployment is blocked by `scripts/assert-strudel-release-gate.js`, which runs before the `deploy` script. It requires `UNDERSCORE_AGPL_COMPLIANCE=acknowledged` only after all of these conditions have been completed:

1. Underscore adopts an AGPL-compatible project license.
2. The public release includes complete corresponding source and reproducible build instructions.
3. Strudel's notices, version information, and any modification records are preserved.
4. Every bundled font, audio/sample pack, and other asset is separately audited and recorded.
5. Strudel sample packs stay opt-in until their individual licenses are recorded.

The environment variable is an administrative acknowledgement after compliance; it is not a substitute for the obligations above. The [Strudel custom UI guide](https://strudel.cc/technical-manual/project-start/) is the upstream integration reference.

## Orca

`src/orcaEngine.js` and `src/OrcaNode.jsx` adapt the Orca grid interaction and selected operator semantics from [Orca by Hundredrabbits](https://github.com/hundredrabbits/Orca), copyright 2017 Hundredrabbits, under the MIT License. The complete MIT notice is retained in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Presentation and font dependencies

- `marked` and `katex` are used for local Markdown and math rendering; their installed packages retain their own notices.
- `@fontsource/fira-mono` packages Fira Mono, copyright Google Inc., under SIL OFL-1.1.
- `@fontsource/inter` packages Inter, copyright 2016 The Inter Project Authors, under SIL OFL-1.1.

Fira Mono and Inter are bundled as local WOFF2 assets for Livecode Node typography. The common OFL notice and both attributions are included in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
