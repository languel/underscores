# Patches and help catalog

Underscores projects, reusable fragments, and help files share the Excalidraw-compatible JSON envelope. The default filename is `name.__.json`; `.excalidraw` remains an explicit interoperable export, and Obsidian Markdown remains an explicit note export.

Versioned patch metadata distinguishes three uses without replacing the existing internal exchange kinds:

- `project`: a complete patch and authored Underscores state.
- `fragment`: selected portable objects and their required authored dependencies.
- `help`: an explanatory patch that may also link to snippets and walkthroughs.

Internal `scene` and `selection` kinds remain compatible with existing imports. Selected Livecode nodes export as self-contained fragments. Import uses the existing selection remapper, assigning fresh object and dependency IDs so a fragment can be inserted repeatedly without collisions.

Documentation (`/docs`, `/documentation`, `/help`) is the searchable library. Its table of contents is ordered by `DOCUMENTATION_SECTIONS` in `src/documentationPanelModel.js`: **Getting started**, Workspace, Livecode, Scripting, Physics, Timeline, Score, Media, Systems, Workflow. `documentationTopicSection` maps a topic id to its section, so a new `start-`, `livecode-`, `timeline-`, or `physics-` page files itself; anything unmapped falls through to Scripting. Both live in the plain model module rather than the panel so the mapping stays testable, and `DocumentationPanel.test.js` fails if a topic lands in a section the panel never renders or if a listed section has no topics.

Reference pages live in `src/helpTopics.js` as `{ id, title, keywords, body, examples? }`. Bodies use `\n\n` for paragraph breaks and are rendered as paragraphs; `keywords` exists so search matches the words a learner would actually type. A page with `examples` gets a copy button, and for Livecode kinds a button that creates a node from that example directly.

The Info panel contains the first bundled help catalog. Catalog entries are searchable and may offer **Insert Patch**, **Insert Snippet**, or **Start Walkthrough**. Insert actions reuse registered commands and selection import instead of directly mutating the scene. The initial entries cover onboarding, p5, GLSL, and audio/physics; the same model can later support a comprehensive bundled or user-installed help library.
