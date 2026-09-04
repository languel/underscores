# Third-party notices

The Strudel-enabled Underscores distribution is released under the GNU Affero General Public
License, version 3 or later, in [`LICENSE`](LICENSE). Separately identified Underscores-authored
components retain the MIT terms in [`LICENSE-MIT`](LICENSE-MIT). This file records third-party
code, libraries, fonts, and reference material used by the application. Those components remain
under their own licenses; the application license does not relicense them. The complete
dependency graph and exact versions are recorded in [`package-lock.json`](package-lock.json).

## Adapted or informed source

### Excalidraw

Underscores uses [`@excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw), version
0.17.6, under the MIT License. `src/collaboration/reconciliation.js` contains a small adaptation
of Excalidraw's MIT-licensed collaboration reconciler and retains the same license boundary.

### Orca

The native Orca grid interaction and operator model in `src/orcaEngine.js` and `src/OrcaNode.jsx`
is adapted from [Orca by Hundredrabbits](https://github.com/hundredrabbits/Orca).

Copyright (c) 2017 Hundredrabbits. Licensed under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### Play Core compatibility

The local Play Core-style runner and utility modules in `src/playCoreFrame.js` and
`src/playCoreModules.js` implement a small compatible lifecycle and module surface informed by
[`ertdfgcvb/play.core`](https://github.com/ertdfgcvb/play.core), Apache-2.0. No upstream program
sources are bundled: the selectable Play Core examples in `src/playCoreExamples.js` are authored
for Underscores. The upstream project remains credited here because its public contract is the
compatibility reference.

### Looom Tools

The SVG timing/editor design in `notes/svg.md` was informed by the public
[`mattdesl/looom-tools`](https://github.com/mattdesl/looom-tools) project, MIT licensed. No
Looom source is copied into the runtime.

## Runtime libraries and direct dependencies

The following direct runtime dependencies are included in the locked application build. Names and
versions below match `package.json` and `package-lock.json`; transitive dependencies are covered
by the same lockfile inventory.

### MIT

React and React DOM; Excalidraw; Three.js; CodeMirror (`@codemirror/*`); Lezer highlighting;
`@frankhommers/opencode-yolo`; `css-tree`; `fflate`; `gifenc`; `gifuct-js`; `jzz`;
`jzz-synth-tiny`; KaTeX; Marked; `svg-pathdata`; `transformation-matrix`; and Trystero.

The development and release toolchain is also MIT licensed: `@types/react`, `@types/react-dom`,
`@vitejs/plugin-react`, `gh-pages`, `oxlint`, `vite`, and `vite-plugin-singlefile`.

### Apache-2.0

`@dimforge/rapier2d-deterministic-compat` (Rapier deterministic physics). The lockfile also
records Apache-2.0 transitive packages such as `webmidi` and `@ai-sdk/provider`.

### LGPL-2.1

`p5` and `p5-legacy` are distributed under the GNU Lesser General Public License, version 2.1.
Their package notices and license text must remain available in source and release artifacts.

### AGPL-3.0-or-later

The native Strudel packages (`@strudel/codemirror`, `@strudel/core`, `@strudel/draw`,
`@strudel/mini`, `@strudel/mondo`, `@strudel/soundfonts`, `@strudel/tonal`,
`@strudel/transpiler`, `@strudel/webaudio`, and `@strudel/xen`) and their Strudel runtime
dependencies are AGPL-3.0-or-later.
The public deployment check in `scripts/assert-strudel-release-gate.js` verifies the corresponding
source offer, license metadata, and attribution artifacts before publishing. Optional sample maps
are fetched at runtime from their documented upstream repositories; they are not relicensed as
Underscores assets.

### SIL Open Font License 1.1

`@fontsource/fira-mono` (Fira Mono, copyright Google Inc.), `@fontsource/inter` (Inter, copyright
2016 The Inter Project Authors), and the `@fontsource/monaspace-*` families (Monaspace, copyright
2023 GitHub, Inc.) are licensed under the SIL Open Font License, version 1.1. The font package
license files are retained in the installed packages and must accompany redistributions.

### Other locked licenses

The dependency lockfile also contains transitive packages under ISC, BSD-2-Clause, BSD-3-Clause,
0BSD, CC0-1.0, SGI-B-2.0, (MIT AND Zlib), and (AFL-2.1 OR BSD-3-Clause). Their package-level
notices and license files are authoritative and are included by the normal npm source/build
workflow.

## MediaPipe runtime

MediaPipe Holistic is loaded on demand from the public browser distribution at
[`cdn.jsdelivr.net/npm/@mediapipe/holistic`](https://www.npmjs.com/package/@mediapipe/holistic). It
is an Apache-2.0 project. The application does not bundle model weights or camera recordings;
users supply their own local camera/media input.

## Fonts: SIL Open Font License 1.1 summary

The OFL permits use, embedding, modification, and redistribution of the font software when the
copyright and license notices are preserved. Font software may not be sold by itself, and modified
versions must respect reserved font names. The complete license text is supplied by each
`@fontsource` package.
