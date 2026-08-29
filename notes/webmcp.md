# Underscores WebMCP Site tools

Underscores registers a composition and automation surface through the proposed WebMCP standard. In
a compatible top-level browser page, ChatGPT Work or Codex can inspect and edit the same live score
that the person sees. Browsers without WebMCP continue to use the full application unchanged.

The adapter follows OpenAI's current [Site tools documentation](https://learn.chatgpt.com/docs/webmcp)
and the [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api). It uses
`document.modelContext.registerTool`; it does not require an MCP server or an OpenAI API key.

## Tools

| Tool | Effect |
| --- | --- |
| `get_score_context` | Read a bounded semantic snapshot of the canvas, selection, Score roles, transport, collaboration status, and scene revision. |
| `get_underscores_command_catalog` | Discover the assistant command catalog plus a small WebMCP runtime-control extension, with argument contracts, API method names, and policy for each callable operation. |
| `execute_underscores_command` | Invoke one explicitly allowlisted assistant or runtime command through the shared command registry. |
| `execute_underscores_sequence` | Invoke up to 32 commands in order with revision checks between steps; useful for complete physics/music-machine workflows. |
| `create_score_objects` | Create rectangles, ellipses, diamonds, lines, or freedraw paths through `scene.create.objects`. |
| `patch_score_objects` | Move or restyle existing objects by stable id through `scene.patch.objects`. |
| `assign_score_roles` | Assign or clear curve, cursor, and trigger roles through `score.roles.assign`. |

The first high-level composition commands are discoverable through the same catalog:

| Command | Effect |
| --- | --- |
| `demo.catalog` | Lists the ready-made composition/physics studies and their intended phase. |
| `demo.reich.pendulum.create` | Creates a native Steve Reich-inspired pendulum study (four voices by default): rods, bobs, world axles, speakers, a phase timeline, score metadata, and collision-to-Expressive-Synth mappings. `running` defaults to true; `audio: false` stages physics without intentionally starting audio. |

The pendulum study is an intentionally honest first scaffold rather than a claim to reproduce the
original recording. Its first sound path uses contact-begin velocity, angular velocity, mapped gain,
and scene position to shape built-in voices. Raw feedback and double-pendulum variants are
future demo phases. For prompt-driven livecoding, use `livecode.node.create` with a bounded source and
`running: true`, then `livecode.node.update` or `livecode.node.run` after inspecting the returned host id.

All write tools execute through the shared command registry with `source: "webmcp"`, `record: true`,
and a unique invocation id. They therefore use the same mutation, command-event, history, and
collaboration paths as the UI, `window.__`, and the embedded assistant. The command bridge is what
makes the current assistant workflows available to a browser agent: for example, a sequence can
create score geometry, create a physics system, assign bodies and constraints, create a p5 or
livecode voice, set timing, and start playback.

For vision-guided authoring, use `scene.selection.set` with the stable ids returned by
`get_score_context`, then call the existing selection-first physics commands (`physics.body.make`,
`physics.collider.assign`, `physics.axle.make`, `physics.fixate.make`, or `physics.spring.make`) in
the same sequence. This keeps the model's spatial interpretation separate from the canonical
relationship graph while still making the graph edits inspectable and collaborative.

The read tool returns a `revision`. Write tools accept that value as `expectedRevision` and reject
the edit when the scene changed in the meantime. This is an optimistic concurrency guard for a
person and an agent—or multiple peers—editing the same score.

## Safety boundary

WebMCP uses an explicit bridge to the existing `ai.expose` allowlist, with a small separately
reviewable extension for runtime controls needed to complete compositions (physics play/pause/reset,
transport seek, livecode run/stop, and history recording). It never exposes the raw `window.__`
object or arbitrary JavaScript execution. File dialogs and raw file/export commands are blocked.
Destructive scene deletion/clearing and trusted IanniX execution require a `confirm: true` flag only
when the user explicitly requested that operation. Sensitive argument keys (credentials, tokens,
endpoints, permissions, room ids, and similar fields) are rejected, even if a command's normal
assistant description mentions them.

Schemas reject extra fields, bound array sizes, and restrict object and role types. Context defaults
to 40 objects and never includes deleted collaboration tombstones unless requested. Long text and
large path arrays are summarized. Tool results include the affected ids, safe element summaries,
and the new scene revision so an agent can verify what changed.

## Runtime inspection

The public API reports the feature independently of browser support:

```js
__.webmcp.tools();
__.webmcp.getStatus();
```

`getStatus()` returns `{ supported, active, tools, errors }`. Underscores dispatches
`underscores:webmcp-ready` after registration settles and `underscores:webmcp-disposed` when the
application unregisters its tools.

In a browser implementation that exposes discovery and manual execution:

```js
const tools = await document.modelContext.getTools();
const read = tools.find(tool => tool.name === "get_score_context");
const result = await document.modelContext.executeTool(read, { maxElements: 20 });
```

For ChatGPT desktop testing, update the app, use GPT-5.6 Sol or Terra, open Underscores in the
built-in browser, and inspect **Site tools** in the address bar. Site tools currently are not
available with GPT-5.6 Luna or in Enterprise/Edu workspaces. The tools must be registered by the
top-level page; the ChatGPT browser does not currently discover declarative or iframe tools.

## Development

The adapter is isolated in `src/webmcp.js`; API changes should remain contained there. Its unit tests
use a fake ModelContext and command registry:

```sh
node --test src/webmcp.test.js
```

The integration is dependency-free. React owns only the registration lifecycle and the live
transport-context ref in `App.jsx`.

The generic bridge is intentionally command-oriented rather than API-object-oriented. A browser
agent cannot safely call `window.__.physics` or `window.__.commands` by reference; it first reads the
catalog, then calls a named operation with JSON arguments. This keeps the public trusted-script API
compatible with the existing Underscores assistant while giving WebMCP a stable, inspectable tool
surface.

## A good agent workflow

For a visual composition request, the browser agent should:

1. Read `get_score_context` and keep its `revision`.
2. Read `get_underscores_command_catalog` with `query: "demo"`, `"livecode"`, or `"physics"`.
3. Prefer one high-level demo command when it matches the intent; otherwise compose a short
   `execute_underscores_sequence` using native scene, physics, score, and livecode commands.
4. Re-read `get_score_context` after mutation and use element ids/relationship endpoints to verify the
   visual result. A screenshot-capable browser agent can then ground those ids against the rendered
   canvas before making a second edit.
