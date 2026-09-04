# Public release compliance record

This record describes the engineering artifacts shipped with the
Strudel-enabled Underscores distribution. It is a release checklist, not legal
advice; copyright and licensing questions remain the responsibility of the
project's rights holders.

## Distribution scope

The public Strudel-enabled artifact is produced by `npm run build:single` and
published by `npm run deploy`. The classroom/public-safe artifact is a separate
Strudel-free build produced by `npm run build:students`.

## Required artifacts

- `LICENSE` contains the GNU Affero General Public License, version 3 or later.
- `LICENSE-MIT` preserves the MIT terms for separately identified
  Underscores-authored components.
- `SOURCE.md` is the corresponding-source offer. It points to the public
  repository, release history, exact build commands, and the deployed site.
- `package-lock.json` pins the dependency graph used to create the artifact.
- `THIRD_PARTY_NOTICES.md` records direct dependencies, adapted code, fonts,
  remote media, and license boundaries.
- Documentation exposes Source, License, and Third-party notices links.

## Strudel and asset audit

The native Strudel packages are pinned in `package.json` and retain their
AGPL-3.0-or-later notices. No Strudel package source is modified in this
repository. The local runtime integration is authored in
`src/strudelRuntime.js`.

Fira Mono, Inter, and Monaspace are bundled under the SIL Open Font License and
are listed in `THIRD_PARTY_NOTICES.md`. The repository contains no bundled
recordings or sample audio files. Optional Strudel sample maps and aliases are
fetched from their documented upstream URLs at runtime; they are not copied
into the artifact or relicensed as Underscores content.

## Release check

Run the release check and the reproducible build from the tagged source commit:

```bash
npm ci
npm run release:check
npm run build:single
npm run deploy
```

The release check is intentionally deterministic and verifies the files and
metadata above before `npm run deploy` publishes `dist/`.
