# Arrangement clips

Last updated: 2026-08-20

Arrangement clips schedule when authored canvas objects participate in the global score transport. They are separate from History: History remains the complete-app command and automation recorder, while Arrangement maps global time into an object's existing local lifecycle.

## Object and project data

The authoritative placement lives with the object in `customData.underscoresArrangement`. Creating the first clip opts that object into arrangement scheduling; deleting its final clip returns it to its normal always-present behavior. Gesture samples, media duration, Livecode source/runtime settings, and other lifecycle content remain separate from placement.

Scene-level `underscores.arrangement` metadata stores takes, lane ordering, take mute/solo state, recording mode, step size, and the Step-mode Hold/one-frame preference. Lanes are derived from clip-bearing objects rather than duplicated in project metadata. Scene export/import, URL sharing, clipboard selection exchange, and local persistence retain this metadata; duplicated clips receive fresh clip and recording IDs.

Each rolling recording sample preserves three clocks:

- monotonic unwrapped recording time;
- visible transport time, which may wrap;
- loop phase and loop iteration.

Recordings that cross a loop boundary become source-continuous linked segments with one shared recording ID. Each loop pass is an overlay take. Muting or soloing a take affects evaluation without changing the authored objects.

## Timeline and editing

Arrangement rows extend the existing transport timeline. Take rows are collapsed summaries by default and expand into individual object lanes. When a take is expanded, its aggregate row remains a header and the clips render only in the object lanes, avoiding duplicate clip tiles. Arranged objects not belonging to a take receive standalone lanes; objects without clips do not consume timeline rows.

- Select a clip to select its canvas object; selecting an arranged object reveals its lane.
- Shift-click clips to select a contiguous range, Command/Ctrl-click to toggle individual clips, or drag across the clip area to make a block selection. A multi-clip selection selects all corresponding canvas objects while the last selected clip remains the active edit target.
- Drag a clip body to move it.
- Drag either edge to trim the active window. A left trim also advances the source offset.
- Hold Command while dragging for major ruler snapping, or Command+Shift for minor snapping.
- Option-drag an edge to stretch the internal lifecycle by changing playback rate.
- Double-click a clip to toggle local lifecycle looping.
- Delete removes the selected clip. Removing a take removes its child clips, so deleted recordings do not reappear during playback.

Clip edits commit once at pointer release as one scene-history transaction. Runtime evaluation is transient and never writes scene JSON per frame.

## Recording

Arrangement Record is independent from History recording. The default shortcuts are:

- `Alt+Shift+R`: arm or disarm Arrangement Record;
- `Alt+Shift+S`: switch Rolling and Step modes;
- `Alt+Right` / `Alt+Left`: advance or reverse the Step playhead by the configured value.

Rolling starts from the current playhead and starts transport playback when necessary. A completed drawing becomes a gesture lifecycle and a clip. Manual media or Livecode starts create a pending clip, finalized by stop or transport stop. Changing record mode affects the next event, not one already in progress.

Step mode keeps transport paused. Completed objects default to Hold through project end, or can use a one-frame window (`1 / transport FPS`). The step value uses the shared time-value control and accepts frames, beats, bars, seconds, and other supported expressions. Raw gesture timing is retained even when the first presentation is a static Hold or one-frame clip.

“Add clip at playhead” opts an existing selection into Arrangement: static objects use Hold, media uses its intrinsic duration when available, gesture objects use their recorded duration, and Livecode defaults to one bar.

## Lifecycle adapters

The shared adapter boundary is `getIntrinsicDuration`, `activate`, `seek`, and `deactivate`.

- Static objects are gated for display and interaction without changing authored geometry, deletion, opacity, or lock state in saved scene data.
- Gestures render progressive recorded geometry at local clip time, then hold their completed path through the active window. Freedraw playback reuses Excalidraw's `getFreeDrawSvgPath()` for each revealed prefix, preserving the authored/simulated pressure feel, caps, joins, and corners instead of replacing the stroke with a constant-width polyline. A lightweight cubic-pressure renderer remains the fallback when the native outline cannot be produced.
- Gesture playback is an overlay concern: it does not rewrite the Excalidraw element or scene JSON on every frame. The authored stroke remains the source of truth while the transient overlay reveals its recorded lifecycle.
- Media maps local time to audio, video, or GIF playback. Corrective seeks occur on discontinuities rather than every frame, and existing short edge fades remain active.
- Livecode restarts from local zero on activation and stops at clip end while preserving Keep last frame. p5 and shader nodes receive deterministic local time for playback and scrubbing; Strudel does not emit retroactive scrub audio.

Objects without arrangement metadata retain the previous gesture, media-transport-link, and free/linked Livecode behavior.

## Timing and overlap

`evaluateClipAtTime()` is the pure timing authority and returns `{ active, localTime, progress, iteration, complete }`. Fixed clips have an explicit active window; Hold clips follow project end without extending it. A once-through visual lifecycle holds its final state inside a longer active window, while audio becomes silent. Loop repeats the local lifecycle to fill the active window.

Version 1 uses a deterministic latest-started-wins overlap rule, with take order as the tie-breaker. When the winning clip ends, an earlier overlapping clip resumes at its transport-derived local time. Clip IDs, take order, and adapter boundaries preserve a later path to multi-voice blending without a schema migration.

Project end is the latest fixed arrangement clip, score-object/automation end, enabled transport loop end, or a ten-second minimum. Hold clips and History duration do not extend it.

## Verification

Run:

```bash
npm test
npm run lint
npm run build
```

Focused tests cover fixed/Hold timing, trimming, stretching, looping, deterministic overlap/resume, take mute/solo, first/final clip behavior, legacy gesture migration, duplicate ID remapping, wrapped recording clocks, cross-boundary splitting, scene exchange, lifecycle adapter transitions, and a 500-clip/100-lane indexed schedule.
