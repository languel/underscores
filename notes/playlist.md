# Playlist anchors

The Playlist panel is a lightweight presentation layer over the global transport. Any selected canvas object (or a group of selected objects) can be added as an ordered anchor. Each row stores its object ids, duration, transition placeholder, and cue metadata in `underscores.authoredState.playlist`.

Rows can be reordered by dragging, selected with a click, and framed to fit with a double-click. Play advances through the anchors using each row's duration; the step button and left/right arrows advance manually. Looping repeats the list. Removing the last row does not change the underlying canvas object.

The current implementation is intentionally cut-only. Fade, event/script/SRT triggers, armed cues, and richer QLab-style actions are represented as metadata so later playback work can extend the same persisted shape without changing the basic panel workflow.
