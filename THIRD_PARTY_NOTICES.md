# Third-party notices

## Orca

The native Orca grid interaction and operator model in `src/orcaEngine.js` and
`src/OrcaNode.jsx` is adapted from [Orca by Hundredrabbits](https://github.com/hundredrabbits/Orca).

Copyright (c) 2017 Hundredrabbits

Licensed under the MIT License:

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

## Fira Mono, Inter, and Monaspace fonts

The Livecode Node typography bundles Fira Mono via `@fontsource/fira-mono` (copyright Google Inc.)
and Inter via `@fontsource/inter` (copyright 2016 The Inter Project Authors). Both font packages
are included at the pinned versions in `package.json` and licensed under the SIL Open Font License,
Version 1.1. Their complete upstream license texts are retained in the corresponding installed
packages at `node_modules/@fontsource/fira-mono/LICENSE` and `node_modules/@fontsource/inter/LICENSE`;
source distributions and public release artifacts must preserve that notice and license.

The Monaspace families Argon, Krypton, Neon, Radon, and Xenon are bundled through the corresponding
`@fontsource/monaspace-*` packages for the normal local/internal build. Monaspace is Copyright (c)
2023 GitHub, Inc. and is licensed under the SIL Open Font License, Version 1.1. The complete
upstream license texts are retained in each installed package's `LICENSE` file; source distributions
must preserve the relevant notices and license. The student/public-safe build deliberately omits
these packages until the internal asset audit is complete; see `notes/student-release.md`.

SIL Open Font License, Version 1.1 — 26 February 2007

> Permission is hereby granted, free of charge, to any person obtaining a copy of the Font Software,
> to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies
> of the Font Software, subject to the conditions of the SIL Open Font License, Version 1.1.
>
> Neither the Font Software nor any of its individual components, in Original or Modified Versions,
> may be sold by itself. Original or Modified Versions may be bundled, redistributed, and/or sold
> with software when each copy contains the relevant copyright notice and license. Modified versions
> must not use reserved font names without permission and must remain under this license.

The authoritative full text is included with the above font packages and is also available from the
[SIL Open Font License](https://openfontlicense.org/).
