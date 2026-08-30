# Playlist anchors

The Playlist panel is a lightweight presentation layer over the global transport. Any selected canvas object (or a group of selected objects) can be added as an ordered anchor, and **Add** also creates an empty row when nothing is selected. Each row stores its object ids, duration, transition placeholder, cue metadata, and an optional `triggerTargetId` in `underscores.authoredState.playlist`.

Rows can be reordered by dragging, selected with a click, and framed to fit with a double-click. Play advances through the anchors using each row's duration; the step button and left/right arrows advance manually. Looping repeats the list. Removing the last row does not change the underlying canvas object.

Manim cues form an inner presentation level beneath an anchor. **Next**, the right/down arrow keys while the panel is focused, and manual Step first advance the first pending Manim cue among the active anchor's element ids. Only when no cue is pending do they move to the next outer anchor. The cue advance goes through `livecode.manim.cue.next`, so Playlist uses the same semantic command path as shortcuts, History, the assistant, and WebMCP. Timed Playlist playback pauses when it reaches a pending manual Manim cue rather than skipping the build. Previous continues to mean previous outer anchor until deterministic Manim cue reconstruction is implemented.

Each row can also run a trigger when it is activated (double-click, Playlist Play, outer Next/Step, or `__.playlist.activate(index)`). The row's **Target** picker resolves to a specific Livecode node. If a Livecode node is selected when a row is added, it is filled in automatically; an empty row can be targeted later. Choose a trigger in the row's second line and enter its source:

- **Command** accepts a command id, name, or alias followed by an optional JSON object, for example `transport.seek {"seconds": 2}` or `playlist.next`.
- **Mini-script** accepts the command-palette slash forms, including `/command playlist.next {}` and `/frame all`.
- **JavaScript** accepts trusted one-line code against the public `__` bridge, for example `const target = __.api.playlist.getTarget(); await __.api.commands.execute("livecode.manim.cue.next", { elementId: target.id })`. It is bounded to the bridge and rejects obvious page/global escape tokens. `getTarget()` returns the row's resolved target snapshot while the trigger runs, or `null` when the row has no target.

Command and Mini-script triggers receive the target automatically as `elementId` when they do not provide an explicit `elementId` or `targetId`; explicit arguments win. This makes a row such as `livecode.node.stop` address its chosen node without embedding a scene id in the source.

The same target path works for GLSL nodes: set a row's **Target** to the shader and use `livecode.node.run` or `livecode.node.stop` as a command trigger. A JavaScript trigger can address the same node explicitly with `const target = __.api.playlist.getTarget(); if (target) await __.api.commands.execute("livecode.node.run", { elementId: target.id });`.

Triggers execute through the same command registry used by shortcuts, the assistant, Manim, and WebMCP. They are not fired by a plain row selection, and an inner pending Manim cue still wins over outer anchor movement. The current implementation is intentionally cut-only. Fade, event/SRT triggers, armed cues, and richer QLab-style actions remain represented as metadata so later playback work can extend the same persisted shape without changing the basic panel workflow.

Guided walkthroughs use ordinary Playlist Command triggers rather than a special playback path. Rows can call `walkthrough.start`, `walkthrough.pause`, `walkthrough.resume`, `walkthrough.next`, `walkthrough.previous`, `walkthrough.stop`, or `walkthrough.rate.set`, including a walkthrough ID or pace in the row's JSON arguments.
