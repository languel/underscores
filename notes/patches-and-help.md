# Patches and help catalog

Underscores projects, reusable fragments, and help files share the Excalidraw-compatible JSON envelope. The default filename is `name.__.json`; `.excalidraw` remains an explicit interoperable export, and Obsidian Markdown remains an explicit note export.

Versioned patch metadata distinguishes three uses without replacing the existing internal exchange kinds:

- `project`: a complete patch and authored Underscores state.
- `fragment`: selected portable objects and their required authored dependencies.
- `help`: an explanatory patch that may also link to snippets and walkthroughs.

Internal `scene` and `selection` kinds remain compatible with existing imports. Selected Livecode nodes export as self-contained fragments. Import uses the existing selection remapper, assigning fresh object and dependency IDs so a fragment can be inserted repeatedly without collisions.

The Info panel contains the first bundled help catalog. Catalog entries are searchable and may offer **Insert Patch**, **Insert Snippet**, or **Start Walkthrough**. Insert actions reuse registered commands and selection import instead of directly mutating the scene. The initial entries cover onboarding, p5, GLSL, and audio/physics; the same model can later support a comprehensive bundled or user-installed help library.
