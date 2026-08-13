# Drawerator to Underscores migration

Status: in progress on `codex/rename-underscores`

## Decision

Rename the existing private GitHub repository in place from `languel/drawerator`
to `languel/underscores`. Do not create a second canonical repository. The in-place
rename preserves history, branches, tags, repository settings, and GitHub Pages
configuration while GitHub redirects old repository URLs.

The npm package remains private. The unscoped `underscores` package name is already
owned by an existing WordPress-theme CLI, so a future registry release must use a
scoped name such as `@languel/underscores` or a distinct package name.

## Migration boundary

| Surface | Migration rule |
| --- | --- |
| Product name, UI, docs, filenames | Rename to Underscores now. |
| GitHub repository and Pages base path | Rename to `underscores` now. |
| Browser/script API | Use `window.__` and the `__` script bridge. Do not expose a spelled-out brand alias. |
| Persisted scene JSON, `customData`, SVG metadata, CSS hooks, DOM events, and localStorage | Rename directly to the `underscores` namespace. Existing pre-release browser state and example files do not need a compatibility reader. |
| Environment variables | Rename directly to `UNDERSCORES_*`. |
| Git history and archive branches | Do not rewrite. Historical commits keep their original names. |

## Execution checklist

- [x] Confirm a clean worktree, branches, worktrees, tags, remotes, GitHub settings, and authentication.
- [x] Confirm `languel/underscores` is available and note the npm naming collision.
- [x] Create a full local Git bundle before changing repository identity.
- [x] Tag the pre-rename `main` and `livecode` tips and push both tags.
- [x] Rename the GitHub repository in place and update `origin`.
- [x] Create a dedicated migration branch from the current `livecode` tip.
- [x] Rename product-facing code, documentation, module names, package metadata, and the Pages base path.
- [x] Verify `window.__` and the `__` script bridge, with no spelled-out brand alias.
- [x] Run the full unit suite, production build, single-file build, lint, and a residual-name audit.
- [x] Push the migration branch for review.
- [x] Merge it into `main` after review (PR #3, merge commit `be67de7`).
- [ ] Rename the local checkout directory after this Codex workspace is closed and reopen it at `/Users/liuboto/dev/underscores`.
- [ ] Verify the GitHub Pages URL and any bookmarks/integrations after the migration branch is deployed.

## Pre-release data reset

Because there are no external users, the migration intentionally does not dual-read
the old namespace. Old browser-local settings and scenes may be cleared or manually
re-exported before switching builds. Checked-in examples are migrated in place and
validated by the normal scene, SVG, scripting, and storage tests.

## Rollback

The original safety tags are `pre-underscore-main-2026-08-13` and
`pre-underscore-livecode-2026-08-13`. The singular migration checkpoint is
`pre-underscores-pluralization-2026-08-13`. Full local bundles are stored at
`/Users/liuboto/dev/drawerator-pre-underscore-2026-08-13.bundle` and
`/Users/liuboto/dev/underscore-pre-plural-2026-08-13.bundle`. GitHub repository
renames are reversible; restoring an earlier name and remote URL does not require
rewriting commits.
