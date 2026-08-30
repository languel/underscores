# Ixtos: Project Genesis and Codex Handoff

**Status:** Initial project constitution and challenge handoff
**Date:** August 27, 2026
**Working product name:** **Ixtos**
**Public name for the challenge:** **Ixtos** (provisional; rename later if needed)
**Tagline:** **Living graphic scores for human and agent ensembles.**

This document is intended to be copied into the root of a new Ixtos repository as
`PROJECT_BRIEF.md`. It defines the product, challenge scope, source boundaries, technical
direction, risks, delivery plan, and an opening prompt for a new Codex project.

## 1. Direct product thesis

Ixtos is a browser-native collaborative instrument for reconstructing, composing,
interpreting, and performing graphic scores with humans and agents.

It is not a general-purpose infinite canvas with every Underscores feature exposed. It is a
focused ensemble instrument whose central object is a **living graphic score**: a visual work
that can be studied, semantically transcribed, mapped to sound and motion, revised together,
and performed in time.

Underscores is the platform, laboratory, and likely long-term public home. Ixtos is a focused
challenge prototype: a temporary product profile used to make one coherent instrument, complete
a concentrated WebMCP sprint, attract attention, and return the successful work to Underscores.
It is not intended to become a permanently independent architecture.

This relationship is an implementation constraint:

- retain the `window.__` scripting and command API;
- retain Excalidraw as the mature canvas, editor, and scene substrate;
- retain the existing Underscores document envelope and per-element score metadata;
- retain the current Underscores assistant infrastructure;
- add challenge work in separable, generally named modules that can merge upstream;
- keep Ixtos-only branding, demo material, navigation, and profile configuration thin;
- do not create duplicate scene state, a parallel command system, or a separate permanent schema.

The initial audience is:

- composers and performers working with graphic, animated, spatial, or open-form scores;
- artists and researchers reconstructing historical audiovisual practices;
- teachers and students studying relationships among notation, gesture, sound, and image;
- science-and-art collaborators who need diagrams, equations, annotations, simulation, and
  performance in one shared space;
- small ensembles that want a score to be jointly playable by people and agents.

The project should make a specific claim: **an agent becomes musically and visually useful
when it can act on the score's semantic structure, not merely click coordinates or generate a
finished artifact elsewhere.** WebMCP is the browser-native bridge that makes that possible.

## 2. Working name decision

Use **Ixtos** everywhere public during the initial build. The name is provisional: it can change
after the challenge without changing the product thesis or the underlying Underscores document.
Do not spend challenge time teaching the name's full etymology or building a large naming system.

The intended resonance is compact rather than literal: **IX** can quietly honor Iannis Xenakis,
while **istos** suggests a web, loom, or woven structure. That combination suits a browser-based
instrument made from connected paths, times, mappings, sources, performers, and interpretations.

As checked on August 27, 2026, no exact Ixtos project was found on GitHub, npm, or PyPI. The name
is not completely unused: `ixtos.com` is registered and a small electronic-music artist has
released work as Ixtos. Treat the name as a practical starting point, not completed trademark
clearance.

Current working identifiers:

- Product and interface: **Ixtos**
- Repository: `languel/ixtos`
- Package, only if needed: `@languel/ixtos`
- Challenge-facing score filename: `.ixtos.json`
- Literate challenge-facing filename: `.ixtos.md`
- Bare `.ixtos`: reserved for a possible future package/container format

Before a long-term public launch, repeat current trademark, domain, app-store, GitHub, npm, PyPI,
and music-software searches and consider professional clearance. A later rename should be treated
as presentation and namespace migration, not as a reason to postpone the core architecture.

## 3. Product vocabulary

Historical work needs precise language. Ixtos should keep these states distinct rather than
labeling every transformation a restoration:

- **Source:** An immutable reference artifact: scan, film frame, SVG, photograph, diagram,
  manuscript, or documented description.
- **Transcription:** A semantic encoding of visible or documented score elements.
- **Edition:** A documented interpretation or correction of a source.
- **Realization:** A mapping from score structures to sound, image, motion, light, OSC, MIDI,
  or another performance system.
- **Reenactment:** A time-based performance made from a particular edition and realization.
- **Variation:** A new work derived from declared source material or from another score state.

The interface and exported document should preserve those relationships. An original source
must never be silently overwritten by an agent trace, editorial correction, or performance
mapping.

Deeper Greek-derived vocabulary can remain available inside code, research notes, and later
features—for example, `synaphe` for a meaningful join and `diazeuxis` for a separation or fork.
For the challenge UI, README, tool names, and video, prefer immediately understandable terms such
as join, link, branch, source, score, mapping, performer, and performance.

## 4. The four-layer model

Ixtos should present one coherent score while retaining four separable layers:

### Source

Immutable or versioned reference media plus provenance: creator, title, date, source URL,
rights/license, checksum, notes, and confidence. A source can be visible as an underlay without
becoming editable score geometry.

### Score

Semantic objects such as curves, cursors/voices, triggers, regions, text, annotations,
equations, groups, roles, and temporal relationships. Native geometry and first-class SVG nodes
should enter the same score kernel.

### Realization

Declarative mappings from score data to a reference synthesizer, spatial position, color,
shader/p5 parameters, OSC, MIDI, or another output. Multiple realizations can coexist and be
compared without changing the source or transcription.

### Performance

Transport, performers, assignments, cues, live control, collaboration presence, agent actions,
and a reversible event history. A performance can be saved as a reenactment without pretending
that runtime motion is the authored score.

## 5. Challenge interpretation

The [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/) asks for an app that becomes
meaningfully better when people and agents use it together. Official rules are on
[Devpost](https://webmcp.devpost.com/rules). The submission deadline is **September 3, 2026 at
1:00 p.m. Pacific / 4:00 p.m. Eastern**.

The official submission must include:

- a working live URL that judges can access in ChatGPT's in-app browser or Chrome with WebMCP;
- a public GitHub, GitLab, or Bitbucket repository containing all required source, assets, and
  setup instructions;
- a detectable open-source license shown by the repository host;
- a real `document.modelContext.registerTool(...)` implementation;
- an English description explaining why WebMCP fits, how it improves the experience, what
  humans and agents can now do together, and how it was implemented;
- a public YouTube demonstration with audio, **under three minutes**;
- free judge access through the end of judging;
- clear evidence separating pre-existing Underscores work from work created during the
  challenge period.

The four equally weighted judging criteria are:

1. WebMCP leverage
2. Execution
3. Potential impact
4. Creativity and ambition

The product plan must serve all four. A large tool catalog is not evidence of WebMCP leverage;
a small set of semantic tools that support an unmistakable human-agent creative loop is.

## 6. Recommended challenge story

The clearest submission story is one continuous, rights-safe session:

1. A human opens an original graphic score created for the demo or a source with explicit
   permission/public-domain status.
2. The agent inspects the visible score context and identifies a region that has not yet been
   semantically transcribed.
3. The agent creates or proposes curves, triggers, regions, and annotations. Its changes appear
   visibly, are attributed, and can be undone.
4. The human corrects one interpretation rather than accepting everything wholesale.
5. The agent creates two declarative realizations of the same score passage: for example, one
   maps contour to pitch and density to timbre; another maps contour to spatial movement and a
   shader parameter.
6. A second human joins the anonymous room and changes a score element or performer assignment.
7. The agent reads the revised shared state and adapts the realization without overwriting the
   collaborator's work.
8. The ensemble performs the passage with a shared transport. The history shows which actions
   came from each human and which came through WebMCP.

This demonstrates interpretation, negotiation, composition, collaboration, and performance in
well under three minutes. It also makes WebMCP essential: coordinate clicking cannot reliably
understand or manipulate score semantics, mappings, provenance, and ensemble roles.

Do not use a copyrighted Norman McLaren film, Xenakis score, Herbert Brün score, commercial
recording, or third-party logo in the submission video unless permission is documented. An
original work **informed by** those practices is safer and more compelling because Ixtos itself
becomes the authored instrument.

## 7. Scope for the challenge build

### Must be first-class

- native and SVG paths with stable IDs and editable semantic score roles;
- curves, cursors/voices, triggers, regions, annotations, and groups;
- one immutable source/reference layer with provenance;
- transport and a small reference synth/visual realization system;
- one shareable anonymous multiplayer room;
- WebMCP tools that read and mutate the same command/state routes as the UI;
- visible, reversible, attributed agent actions;
- compatible Ixtos-profile `.ixtos.json` export, literate `.ixtos.md` exchange, and broad imports;
- one polished, seeded demo score that loads instantly and requires no credentials;
- accessible deployment, README, license, architecture note, and test instructions.

### Keep, but subordinate to the score

- p5.js sketches and standard shader/GLSL material;
- Markdown and KaTeX/LaTeX annotations;
- Web MIDI and a WebSocket OSC bridge;
- IanniX-compatible concepts, script/data import, and curve/cursor/trigger semantics;
- source-preserving SVG and declarative SVG/CSS animation.

### Explicitly out of the initial public submission

- Strudel and Orca integrations, pending discussion with their maintainers and a deliberate
  product/licensing decision;
- general AI-provider configuration and broad settings surfaces;
- arbitrary agent-authored trusted JavaScript, SVG scripts, network requests, or shell access;
- full native IanniX/Qt feature parity;
- accounts, cloud project management, large-room permissions, voice/video chat, or durable
  collaboration history;
- every Underscores panel, command, media mode, physics feature, and teaching utility;
- autonomous performance claims that hide the human's editorial or musical agency.

Prefer profile gates, focused entry points, and public-bundle exclusions over deleting inherited
capabilities. Remove code only where licensing, security, bundle integrity, or maintainability
requires actual removal. Keeping an implementation hidden in Ixtos is not a promise to expose it
to judges, agents, or the public build.

## 8. What to reuse from Underscores

The reference checkout is `/Users/liuboto/dev/underscores`, currently on the `multiplayer`
branch. Treat it as read-only from the new Ixtos Codex project unless the user explicitly asks
for upstream changes.

High-value architectural seams:

- `src/commandSystem.js`: stable commands, validation, a shared execution path, event emission,
  history metadata, argument redaction, and invocation provenance.
- `src/aiTooling.js`: the existing curated AI allowlist demonstrates that model access should be
  opt-in and rechecked at execution time.
- `src/App.jsx`: command-registry wiring, public `window.__` API, score state, and collaboration
  integration. Do not copy its monolithic shape as the desired Ixtos architecture.
- `src/iannixEngine.js`, `src/iannixScript.js`, and `notes/iannix.md`: the browser score kernel,
  IanniX-compatible semantics, trusted-import boundary, and performance considerations.
- `src/svgDocumentModel.js`, `src/svgCommandApi.js`, `src/svgRuntime.js`, and `notes/svg.md`:
  source-preserving SVG, stable node references, revision-checked edits, and safe rendering.
- `src/collaboration/`, `src/CollaborationPointers.jsx`, and `notes/multiplayer.md`: encrypted,
  room-based Trystero/WebRTC collaboration and the authored-state versus local-runtime boundary.
- `src/sceneExchange.js`: the scene document/envelope and internal-reference remapping work.
- p5, shader, Markdown/KaTeX, synth, mapping, and transport modules only where they support the
  focused vertical slice.

Preserve these identities in the Ixtos prototype:

- `window.__` remains the runtime scripting/API global; do not replace it with `window.ixtos`.
- The existing Underscores command registry remains the mutation authority for the UI, scripts,
  the embedded assistant, WebMCP, history, and multiplayer.
- Existing per-element `customData.score` and compatible IanniX metadata remain valid. Add new
  fields only when the challenge exposes a real missing concept.
- The top-level `underscores` envelope remains the canonical home of document-global authored
  state. Ixtos is declared as a profile within that envelope rather than as a parallel root model.
- The existing assistant remains functional. Ixtos may hide broad provider configuration and
  unrelated local/personal capabilities without deleting the reusable assistant machinery.

New code should be classified while it is built:

- **Directly upstreamable:** WebMCP adapter, semantic command contracts, provenance, revision
  safety, collaboration behavior, sources, realizations, and exchange compatibility.
- **Potentially upstreamable:** focused graphic-score workspace and performance UX.
- **Ixtos-only:** branding, seeded challenge score, restricted navigation, submission copy, and
  demo orchestration.

Important current boundaries:

- Multiplayer synchronizes authored scene state, not camera, selection, local device streams,
  or every runtime frame.
- The WebRTC mesh is appropriate for a small ensemble, roughly 6-16 peers, and currently has no
  TURN guarantee, accounts, permissions, or durable server history.
- The first-class SVG source is canonical; structured edits are revision checked and must not
  flatten unknown markup.
- Trusted IanniX or SVG script execution is not an appropriate WebMCP tool surface.
- The current public-safe Underscores build deliberately excludes Strudel and Monaspace assets.

## 9. Repository lineage and challenge evidence

Do not initialize Ixtos from a copied folder with a single fresh commit. Preserve the Underscores
history so pre-existing work remains visible.

The recommended baseline is Underscores commit:

```text
a0c173248907f4cd498985398ed51bd279d1a4e6
a0c1732 2026-08-25T11:27:59-04:00 Preview remote free-draw through presence
```

The official submission period began August 25 at 11:00 a.m. Pacific / 2:00 p.m. Eastern, so
this commit predates the period by about two and a half hours. Verify the official rules again
before submission and preserve the commit's original timestamp.

Suggested initialization sequence, to be executed deliberately in a terminal rather than
blindly pasted into an unknown working tree:

```bash
git clone --no-hardlinks --branch multiplayer \
  /Users/liuboto/dev/underscores /Users/liuboto/dev/ixtos
cd /Users/liuboto/dev/ixtos
git remote rename origin underscores
git branch -M main
git tag -a challenge-baseline-2026-08-25 a0c1732 \
  -m "Underscores baseline before the WebMCP Challenge"
gh repo create languel/ixtos --private --source=. --remote=origin --push
git push origin challenge-baseline-2026-08-25
```

Keep the new repository private only while license and asset cleanup are in progress; the
challenge submission repository must be public. Before making it public:

- add `PREEXISTING_WORK.md` naming the baseline commit and summarizing inherited capabilities;
- add `CHALLENGE_WORK.md` listing the new WebMCP and Ixtos-specific work by commit;
- make `git diff challenge-baseline-2026-08-25...HEAD` easy for judges to understand;
- remove secrets, local paths from user-facing docs, private examples, and unlicensed media;
- ensure the seeded demo contains only redistributable assets;
- choose and add a detectable `LICENSE` file;
- add third-party notices and preserve required attributions.

A separate repository does not make inherited work newly created. The submission should be
explicit and proud about the lineage: Ixtos is a focused product profile and proof of concept
derived from the pre-existing Underscores laboratory, and the judged work is its new product focus
and WebMCP human-agent loop.

## 10. Licensing decision gate

The challenge requires an open-source license. The current Underscores `package.json` is marked
private and the checkout does not currently provide a root license, so the new project must not
inherit an unspecified licensing state.

Resolve this before public release:

1. Audit which source is wholly authored/owned by the entrant and which files derive from
   third-party projects.
2. Decide whether Ixtos will reuse **concepts and formats** from IanniX or copy/adapt its source.
   The original [IanniX repository](https://github.com/buzzinglight/IanniX) and the maintained
   [Apple Silicon fork](https://github.com/languel/IanniX) are GPL-3.0. Copying or adapting GPL
   source creates obligations that do not disappear because the maintainer role has changed;
   the project has multiple historical contributors.
3. If the browser implementation remains independent of the Qt/C++ source, document the
   conceptual and compatibility relationship and choose an appropriate license for owned code.
4. Remove Strudel code and dependencies from the public Ixtos build/repository unless its
   AGPL-3.0-or-later implications are deliberately accepted and satisfied.
5. Record licenses for Excalidraw, p5, Trystero, KaTeX, Marked, CodeMirror, shader examples,
   fonts, icons, and every bundled demo asset.

Do not let Codex choose a license by assumption. A conservative option compatible with copied
IanniX GPL source is GPL-3.0-or-later. A permissive license may be possible for an independently
implemented browser work that uses only compatible dependencies and code the entrant can license,
but that conclusion requires the audit.

## 11. Assistant and WebMCP architecture

WebMCP is client-side browser tooling under `document.modelContext`; it is not the same thing as
a remote MCP server. It becomes the centerpiece of the Ixtos challenge experience without
replacing the existing Underscores assistant or `window.__` API. All entry points share the same
Underscores capability and command layer:

```text
Ixtos UI / window.__ / embedded assistant / WebMCP
    -> focused capability policy
    -> schema validation and policy
    -> Underscores command registry
    -> one atomic, undoable score transaction
    -> normal collaboration publication
    -> bounded semantic result
    -> visible provenance/activity entry
```

The UI, `window.__`, embedded assistant, WebMCP, history, and multiplayer must not implement
separate mutation logic. Build a focused capability catalog once and adapt it to the current
assistant and WebMCP where their protocols permit. Record at least:

```js
{
  invocationId,
  source: "webmcp", // or "assistant"
  actor: "agent-via:<local-guest-id>",
  commandId,
  scoreRevision,
  timestamp,
  affectedIds
}
```

The agent is **not** a fake independent WebRTC peer. It acts through one participant's browser,
and the UI should say so. Its authored changes then propagate through the ordinary room document.

The embedded assistant and WebMCP are distinct actors even when they can invoke the same command.
Keep their provenance separate. The judge-facing WebMCP path must work without an internal model
provider, paid API key, local model, or assistant configuration. Retain the current assistant for
ordinary Ixtos use and upstream learning, but hide provider surfaces and capabilities that are too
local, personal, or unrelated to collaborative graphic scores.

### Initial tool catalog

Start with six or seven tools, not the full Underscores command surface:

1. `get_score_context` — Read score metadata, selected/visible semantic elements, revisions,
   realizations, and performer roles with strict output bounds.
2. `create_score_elements` — Atomically create typed curves, cursors, triggers, regions, text,
   and annotations from declarative data.
3. `patch_score_elements` — Revision-checked semantic edits to named element IDs; never accept raw
   application snapshots.
4. `annotate_source` — Add a transcription/editorial annotation linked to a source region without
   modifying the immutable reference.
5. `set_realization_mapping` — Map score features to approved synth, visual, shader, MIDI, or OSC
   parameters through declarative presets and bounded ranges.
6. `assign_performer_roles` — Associate score objects or sections with humans, the local agent
   channel, or unassigned ensemble roles.
7. `control_transport` — Play, pause, seek, loop, or set rate within defined limits. Avoid a
   hidden autonomous performance mode.

If time is tight, ship the first five plus `control_transport`. Add tools only when the demo and
evaluations reveal a real missing semantic action.

### Tool contract requirements

- Use actual JSON Schema with explicit `type`, properties, enums, limits, and required fields.
- Require current score/element revisions for writes; return a clear stale-revision error instead
  of overwriting a collaborator.
- Make batch creation/patching one undoable transaction.
- Use `readOnlyHint` accurately and `untrustedContentHint` for user-authored annotations,
  imported source text, and external metadata.
- Keep tool names, descriptions, parameter descriptions, and outputs succinct. Chrome's current
  [security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools) recommends names
  and parameter names under 30 characters, descriptions under 500 characters, parameter
  descriptions under 150 characters, and individual outputs under about 1,500 characters.
- Accept and propagate cancellation through the `execute` callback's `AbortSignal`.
- Register/unregister tools with component lifecycle via an `AbortController`.
- Return IDs, revisions, counts, warnings, and concise summaries rather than full scenes.
- Never expose room secrets, credentials, provider settings, local file paths, clipboard contents,
  device streams, arbitrary URLs, or raw trusted code execution.
- Treat imported text and media metadata as prompt-injection-capable untrusted content.
- Prefer declarative mappings and known presets over agent-generated JavaScript or shader source
  for the challenge tool surface.
- Ensure destructive or high-impact changes have visible previews, confirmation where practical,
  and reliable undo.

Use the [WebMCP imperative API guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
and [specification repository](https://github.com/webmachinelearning/webmcp) as implementation
sources. The API is experimental, so isolate it behind a small adapter and feature detection:

```js
if (document.modelContext?.registerTool) {
  // Register the supported Ixtos tools.
}
```

The application must still work for ordinary human use when WebMCP is unavailable.

## 12. Underscores-compatible document and exchange model

Ixtos does not introduce a second permanent scene model. It uses the existing Underscores
Excalidraw-based exchange document and declares a focused profile inside the top-level
`underscores` envelope. Excalidraw remains the actual canvas, editor, geometry model, and storage
substrate for the challenge build.

### Challenge-facing filenames

- **`.ixtos.json`** is a challenge-facing filename for a compatible Underscores/Excalidraw JSON
  document that declares the Ixtos profile. It is not an incompatible new container.
- **`.ixtos.md`** wraps that same document in readable Markdown with prose, performance
  instructions, citations, and LaTeX. Use frontmatter plus an uncompressed fenced JSON block so
  the embedded scene remains inspectable and diffable.
- **`.ixtos`** remains reserved. Do not spend challenge time designing a package format.

The extension selects presentation and import behavior; it does not create a second source of
truth. Underscores should eventually be able to open `.ixtos.json` directly, and Ixtos must open
ordinary compatible Underscores scenes.

### Ownership boundary

Use the same hybrid pattern already proven in Underscores:

- Excalidraw owns element geometry, appearance, files, bindings, grouping, and editing behavior.
- Per-element score semantics remain in `customData.score` and compatible existing metadata.
- Document-global authored state remains in the top-level `underscores` envelope.
- `underscores.profile.id = "ixtos"` identifies the focused product configuration.
- New concepts intended for eventual Underscores release receive general names under
  `underscores`; challenge-only UI configuration stays inside the profile or outside the scene.
- Camera, selection, current tool, open panels, local devices, and per-frame runtime poses remain
  local rather than authored document state.

Do not move existing values merely to make an Ixtos namespace look pure. In particular, do not
duplicate transport under a new root field when `underscores.score` already owns it, and do not
duplicate semantic elements in a separate Ixtos array. One value has one authoritative location.

Illustrative shape, to be refined from the existing exchange implementation:

```js
{
  type: "excalidraw",
  version: 2,
  elements: [
    {
      id: "curve-1",
      type: "freedraw",
      customData: {
        score: {
          role: "curve",
          timing: {},
          sourceRef: "source-1",
          provenance: {}
        }
      }
    }
  ],
  appState: {},
  files: {},
  underscores: {
    version: 14,
    kind: "scene",
    profile: { id: "ixtos", version: 1 },
    score: {},
    sources: [],
    realizations: [],
    ensemble: { roles: [], assignments: [] },
    authoredState: {},
    relationshipGraph: {},
    provenance: {}
  }
}
```

The field names and exchange version are illustrative until implemented and tested. Extend the
current normalizers and migrations rather than replacing them.

### Compatibility guarantees

The sprint should establish these contracts:

1. Ixtos imports existing Underscores full-scene and selection documents and normalizes their
   existing `customData.score`, compatible IanniX metadata, and `underscores` authored state.
2. Underscores can open an Ixtos-profile document, use its ordinary Excalidraw and existing score
   data, and preserve profile fields it does not yet understand.
3. Copy, paste, duplication, selection exchange, multiplayer, undo/redo, and reconnect preserve
   the per-element metadata and stable references required by Ixtos.
4. A save/load round trip preserves unknown compatible extension fields rather than silently
   flattening future or third-party data.
5. WebMCP and assistant commands address semantic IDs and concepts, while their implementation is
   free to mutate the underlying Excalidraw elements and Underscores state.

### Compatibility imports

Import should be generous while export remains predictable. Use content sniffing and explicit
adapters rather than trusting only the filename extension. Support:

- `.ixtos.json` and `.ixtos.md` profile documents;
- generic `.excalidraw`, `.json`, and `.md` containing a recognized scene or score;
- `.excalidraw.md` and Obsidian Excalidraw Markdown with embedded uncompressed JSON;
- raw Excalidraw JSON without Underscores metadata;
- current Underscores full-scene and selection exchange envelopes;
- first-class SVG and the deliberate, explicitly trusted IanniX-compatible score-script path;
- pasted or fetched raw Markdown/JSON scene sources already supported by Underscores, subject to
  the same origin, size, validation, and trust boundaries.

A generic `.md` file without embedded score data may become notes or performance instructions; it
must never become executable merely because it was opened. An unknown `.json` shape should produce
a precise error or previewable mapping step, not guessed geometry. Maintain real Underscores and
Excalidraw fixtures before modifying an existing parser.

### Independence without rebuilding the editor

Ixtos does not need canvas independence during the challenge. Its useful long-term seam is the
semantic command/API contract: UI, `window.__`, assistant, and WebMCP ask for score operations
rather than editing raw array positions. If Underscores eventually outgrows Excalidraw, that seam
supports migration later. Do not pay for that hypothetical migration by rebuilding selection,
text, bindings, geometry, viewport, collaboration, or undo infrastructure now.

## 13. Technical challenges to watch closely

### Product focus

The main risk is reproducing Underscores with a new logo. Every visible surface should answer:
does this help inspect, author, realize, collaborate on, or perform a graphic score? Hide or remove
everything that does not support the challenge story.

The opposite risk is turning focus into a destructive fork. Prefer an Ixtos profile, focused
routes, capability allowlists, and bundle gates. Keep reusable implementations upstream-shaped so
the proven work can return to Underscores with minimal renaming or translation.

### Concurrent authorship

An agent may read revision 4 while a collaborator creates revision 5. All WebMCP writes need stale
revision handling, atomic transactions, stable IDs, and a user-visible conflict outcome. Avoid
last-writer-wins for source transcription or mappings.

### Authored versus runtime state

Share score elements, mappings, annotations, and assignments. Keep camera, current selection,
temporary pointer motion, local audio-device state, and per-frame animation poses local. Publish
ephemeral presence separately from the canonical document.

### Browser audio and transport

Autoplay policies require a human gesture before sound. The demo must include an explicit audio
unlock and must tolerate a background tab throttling animation. Transport state and audio output
need a clear authority model; exact distributed audio sync across browsers is not a realistic MVP
claim.

### WebRTC reliability

Trystero's direct mesh is excellent for the challenge's two-person demo but can fail on restrictive
networks without TURN. Test the deployed origin on the actual network used for recording and keep
a single-user WebMCP path fully functional if the second peer cannot connect.

### Output bridges

Browsers cannot send native UDP OSC directly. Treat OSC as an optional WebSocket bridge and do not
make a locally installed bridge necessary for judge testing. Web MIDI permission and hardware are
also optional enhancements, not submission dependencies.

### Source/media rights

Historical scores and films are not automatically public domain. Store rights metadata, ship an
original seeded source, and test the complete repository/video for copyrighted music, images,
logos, fonts, and examples.

### Accessibility and legibility

The score must remain usable with zoom, high contrast, keyboard transport, labels that do not rely
only on color, and readable provenance. Agent activity should be visible without flooding the main
canvas with tutorial prose.

### Experimental API drift

Feature-detect WebMCP, isolate registration in one module, pin tested browser versions in the
README, and make unsupported-browser status truthful. Test both ChatGPT's in-app browser and Chrome
149+ with the WebMCP testing flag; do not infer one from the other.

## 14. Verification strategy

Create lightweight evaluations before polishing the demo:

- tool discovery returns exactly the intended catalog;
- every schema accepts documented examples and rejects unknown kinds, oversized batches,
  out-of-range mappings, missing revisions, and arbitrary code/URLs;
- read tools never include room credentials, local paths, or entire unbounded scenes;
- write tools create one undo step and one provenance entry;
- stale writes fail without mutating state;
- WebMCP changes sync to a second browser while preserving that peer's camera and selection;
- undo/redo and reconnect preserve authored score state;
- the app works without WebMCP and shows an accurate capability status;
- a fresh judge session can load the seeded example, unlock sound, use tools, collaborate, and
  reset the demo without an account;
- deployed source, live app, README instructions, and video all demonstrate the same behavior.

Run unit tests, a production build, a public-bundle audit, and a real two-browser smoke test.
Record the exact tested ChatGPT/Chrome versions, origin, commit, and date in `TESTING.md`.

## 15. Challenge-week delivery plan

### August 27

- Create the history-preserving repository and baseline tag.
- Copy this brief into the new root.
- Decide the working public qualifier and start the license/asset audit.
- Establish the focused app shell and one seeded rights-safe score.

### August 28

- Reduce the product surface to Source, Score, Realization, and Performance.
- Define the Ixtos profile over the current Underscores exchange format without duplicating state.
- Add fixtures for Ixtos-profile JSON/Markdown, raw Excalidraw, Excalidraw Markdown, and an
  Underscores scene before extending import code.
- Make the entire demo usable by one human without WebMCP.

### August 29

- Implement the WebMCP adapter and first five tools over the existing command registry.
- Add provenance, bounded results, feature detection, and undoable transactions.

### August 30

- Connect agent mutations to the existing multiplayer publication path.
- Add stale-revision behavior and a compact visible activity/provenance view.
- Complete the human-agent-human vertical slice.

### August 31

- Freeze feature scope.
- Test in ChatGPT's in-app browser and Chrome 149+.
- Use official office hours for any unresolved API or eligibility question.

### September 1

- Deploy the live app and run fresh-session, two-browser, network, audio, and security tests.
- Finish `README.md`, `PREEXISTING_WORK.md`, `CHALLENGE_WORK.md`, `TESTING.md`, `LICENSE`, and
  third-party notices.

### September 2

- Record and publish the sub-three-minute YouTube demo with audio.
- Complete the Devpost description, screenshots, repository link, testing instructions, and live
  URL. Submit once; do not wait for the final hour.

### September 3

- Run one final read-only smoke test of the exact submitted URLs and commit.
- Keep an internal cutoff no later than **2:00 p.m. Eastern**, two hours before the official
  deadline, for any corrected submission.

## 16. Definition of challenge-ready

Ixtos is ready to submit only when all of the following are true:

- A first-time visitor understands “living graphic scores” within 15 seconds.
- The seeded example works without login, paid API, local server, MIDI hardware, or OSC bridge.
- At least one read and three meaningful write actions happen through actual WebMCP tools.
- Agent actions are visible, attributed, revision safe, collaborative, and undoable.
- A second browser sees authored changes without losing its own view or selection.
- The demo contains a genuine human correction or negotiation, not one-shot generation.
- The live site and public repo correspond to the commit named in the submission.
- The repo contains all required source/instructions, a detected license, provenance of inherited
  work, and no secret or unlicensed demo asset.
- The video is public on YouTube, includes audio, is under three minutes, and uses only cleared
  material.
- The README states exactly how to enable/test WebMCP and how to reset the demo.
- An Ixtos-profile `.ixtos.json` round-trips through the Underscores exchange path without loss of
  semantic or profile state, while representative
  `.excalidraw`, `.json`, `.md`, `.excalidraw.md`, and Underscores scene fixtures import through
  documented adapters.
- The existing embedded assistant and `window.__` remain functional, while the public Ixtos
  capability set excludes local/personal or challenge-irrelevant actions.
- New WebMCP and score-model modules are named and isolated so they can be merged back into
  Underscores without carrying Ixtos branding or demo code.
- The submission explicitly identifies what was inherited from Underscores and what was built
  after the challenge start.

## 17. Opening prompt for the new Codex project

Copy the text below into the first message of a Codex project rooted at the new Ixtos repository.

```text
We are building Ixtos, a provisionally named, focused browser-native
collaborative instrument for reconstructing, composing, interpreting, and performing living
graphic scores with humans and agents. It is a challenge-focused profile, proof of concept, and
development sprint for my existing Underscores project. It is not intended to become an
independent platform: preserve the path for successful work to merge back into Underscores,
which is the likely long-term public release.

Start by reading PROJECT_BRIEF.md completely. Then inspect these sources before proposing or
changing architecture:

- Reference Underscores checkout, read-only unless I explicitly request an upstream change:
  /Users/liuboto/dev/underscores
- In particular: notes/iannix.md, notes/svg.md, notes/multiplayer.md, src/commandSystem.js,
  src/aiTooling.js, src/iannixEngine.js, src/iannixScript.js, src/svgDocumentModel.js,
  src/svgCommandApi.js, src/sceneExchange.js, and src/collaboration/
- OpenAI challenge page: https://openai.com/webmcp-challenge/
- Official rules: https://webmcp.devpost.com/rules
- WebMCP explainer/spec: https://github.com/webmachinelearning/webmcp
- Chrome imperative API guide:
  https://developer.chrome.com/docs/ai/webmcp/imperative-api
- Chrome security guidance:
  https://developer.chrome.com/docs/ai/webmcp/secure-tools

Preserve the Underscores Git history and the annotated tag challenge-baseline-2026-08-25 at
commit a0c1732. Never describe inherited code as challenge-period work. Maintain
PREEXISTING_WORK.md and CHALLENGE_WORK.md so git diff
challenge-baseline-2026-08-25...HEAD remains judge-readable.

Product thesis: Ixtos is a living graphic-score instrument. Its four layers are Source, Score,
Realization, and Performance. Original/reference media remains immutable; transcription,
edition, realization, reenactment, and variation have distinct provenance. The challenge demo
must show a human and an agent interpreting and revising semantic score structures together,
then a second human collaborating and the ensemble performing the result.

Keep the initial public language straightforward. Deeper terms such as synaphe and diazeuxis may
appear in internal code or research notes, but the challenge UI, README, WebMCP tool names, and
video should use clear terms such as join, link, branch, mapping, performer, and performance.

Do not invent a parallel Ixtos architecture or permanent schema. Retain Excalidraw as the canvas,
editor, geometry, and exchange substrate; retain `window.__`, the Underscores command registry,
existing `customData.score` semantics, and the top-level `underscores` authored-state envelope.
Declare Ixtos as a focused profile inside that envelope. `.ixtos.json` and `.ixtos.md` are
challenge-facing filenames for compatible Underscores documents, not incompatible formats.
Import generic `.excalidraw`, `.json`, `.md`, and `.excalidraw.md`, plus current Underscores
scene/selection formats and the useful SVG and explicitly trusted IanniX-compatible imports.
Never maintain a duplicate semantic element array or a second authoritative transport state.

Retain the existing Underscores embedded assistant and its reusable machinery. Ixtos may hide
provider configuration and capabilities that are too local, personal, or unrelated to the
graphic-score challenge, but should not replace the assistant with a separate implementation.
Make WebMCP the centerpiece of the public Ixtos experience and ensure its judge-facing path works
without an internal model provider, paid API key, or local model.

Challenge scope: native/SVG score geometry, IanniX-inspired curve/cursor/trigger semantics,
regions and annotations, one reference synth/visual mapping system, anonymous small-room
multiplayer, transport, score exchange, visible provenance, and a focused WebMCP adapter. Keep
p5, shaders, Markdown, and KaTeX only where they support that score workflow. Do not emphasize or
ship Strudel or Orca. Do not expose arbitrary trusted code, credentials, room secrets, local
files, device streams, or unrestricted network access to agents.

WebMCP must register actual tools with document.modelContext.registerTool and route them through
the same validated Underscores command registry, history, and collaboration paths used by the UI,
`window.__`, and the embedded assistant. Keep assistant and WebMCP provenance distinct. Begin with
get_score_context, create_score_elements, patch_score_elements, annotate_source,
set_realization_mapping, and control_transport. Use real JSON Schema, bounded batches and
outputs, revision-checked writes, accurate annotations, AbortSignal cancellation, one undoable
transaction per call, and source:"webmcp" provenance. The agent acts through the local
participant; do not fake it as an independent WebRTC peer.

Before public release, stop for an explicit license decision after auditing inherited and
third-party code. IanniX source is GPL-3.0; conceptual compatibility is not the same as copying
its Qt/C++ source. The challenge requires a public repository with a detectable open-source
license. Remove unlicensed/private assets and use an original or explicitly cleared demo score
and audio.

Work challenge-first. Protect existing working behavior, inspect the current branch and dirty
state before editing, use small commits with evidence-focused messages, and verify each vertical
slice in the actual browser. Do not expand the feature list once the human-agent-human demo works.
Classify new work as directly upstreamable, potentially upstreamable, or Ixtos-only while it is
built. Prefer profile gates and focused bundles over deleting reusable Underscores code.
The official deadline is September 3, 2026 at 1:00 p.m. Pacific / 4:00 p.m. Eastern; target a
complete submission on September 2.

Your first response should report: repository/branch/dirty state, whether the baseline tag and
lineage documents exist, the current license and dependency risks, the smallest reusable modules
you found in Underscores, how the Ixtos profile will preserve current scene and `window.__`
compatibility, a proposed file/module boundary for the WebMCP adapter, how the embedded assistant
will share capabilities with WebMCP, and a milestone plan that reaches one complete demo vertical
slice before polish. Do not make source changes until that orientation report is complete.
```

## 18. Decisions the human should retain

Codex can investigate and implement, but it should not silently decide:

- whether and when the provisional Ixtos name should change after the challenge;
- which original/cleared score will anchor the submission;
- what counts as a musically convincing realization;
- whether the repository adopts a copyleft or permissive license after the source audit;
- whether any IanniX source code, rather than concepts/formats, will be adapted;
- how the maintainer relationship to IanniX is described publicly;
- whether and when to approach the Strudel and Orca creators;
- which inherited capabilities must be physically removed from the public bundle rather than
  merely hidden by the Ixtos profile;
- when and how the proven challenge work is merged back into Underscores;
- when the repository becomes public and when the submission is final.

Everything else should be optimized toward a truthful, coherent, working performance instrument
that makes human-agent collaboration visible rather than magical.
