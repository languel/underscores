# Marionette classroom example

Run `/physics demo marionette`. The head, body, and arms are normal selectable Underscores objects. A fixed world pin supports the head; a damped spring forms the neck; revolute joints connect the arms.

By default, move or resize a part while paused to update its authored reset state. Choose **Paused edits → Keep reset pose** for temporary staging that Reset discards. Play and drag a moving part to pose it temporarily. Reset returns to the authored arrangement. Apply pose turns the evaluated arrangement into the new reset pose in one undoable change. Joint limits and break thresholds are available in the relationship graph API for scripted exercises.
