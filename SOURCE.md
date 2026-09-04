# Source, license, and reproducible build

Underscores' Strudel-enabled distribution is licensed under the GNU Affero
General Public License, version 3 or later. The corresponding source for the
web application is this repository:

- <https://github.com/languel/underscores>
- <https://github.com/languel/underscores/tags>

The deployed site is published from the `gh-pages` branch:

- <https://languel.github.io/underscores/>

Use the tagged source commit that produced a deployment when reproducing it.
The lockfile is authoritative for dependency versions.

## Reproduce the Strudel-enabled build

Requirements: Node.js 20.19.0 or newer (or Node.js 22.12.0+) and npm.

```bash
git clone https://github.com/languel/underscores.git
cd underscores
npm ci
npm run build:single
```

The generated single-file artifact is written to `dist/`. To publish it using
the repository's release workflow, run:

```bash
npm run release:check
npm run deploy
```

`npm run deploy` validates the license and source-offer artifacts before
building and publishing. The Strudel-free classroom artifact remains
available with `npm run build:students` and `npm run deploy:students`.

## Notices and source boundaries

- [AGPL-3.0-or-later license](LICENSE)
- [MIT license for separately identified Underscores-authored components](LICENSE-MIT)
- [Third-party notices and dependency inventory](THIRD_PARTY_NOTICES.md)
- [Strudel release and asset audit](notes/livecode-licensing.md)

The full source tree, `package-lock.json`, build scripts, and release notes are
part of the corresponding source. Native Strudel packages are pinned in
`package.json` and loaded in `src/strudelRuntime.js`; optional sample maps are
fetched from their documented upstream URLs at runtime and are not silently
relicensed as Underscores assets.
