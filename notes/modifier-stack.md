# Modifier Stack Architecture Notes

Last updated: 2026-07-13

This note records the contracts behind Drawerator's non-destructive **🛠️ Mods & FX** implementation. Preserve these invariants when adding brushes, filters, transforms, or history behavior.

## Element data model

The selected Excalidraw `freedraw` or `line` remains the source element. Live modifier state is stored in `element.customData`:

- `originalPoints`: absolute source/control points, including temporal and pressure metadata.
- `modifiers`: ordered modifier descriptors with `id`, `enabled`, and `params`.
- `hideOriginal` / `savedOpacity`: presentation state; hiding never resamples the source.
- `muteModifiers`: temporarily displays the editable base.
- `brushElapsedMs`: the frozen local clock captured when an evolving stroke is released.
- `version`, `excalidrawVersion`, `lastWidth`, and `lastHeight`: synchronization and transform bookkeeping.

Generated live tracks are rendered in the SVG overlay. They are not included in Excalidraw selection accounting until baked.

The panel also maintains a drawing-session stack for Mod Pen. It is a template for the next stroke, not a canvas-global mutation. `nextStrokeHideOriginal` is likewise a persistent next-stroke preference. Once a stroke is committed, both the stack and its hide state are copied into that element's `customData`.

The Script tab is deliberately inert. A selected editor script is never consulted by the drawing pipeline unless it has been saved into the visible modifier stack. `resolveDrawingModifiers()` enforces this rule, including the empty-stack case.

## Evaluation rules

`evaluateModifierStack()` maintains one baseline plus accumulated brush tracks:

- A geometric **filter** replaces the baseline and propagates through already accumulated tracks.
- A multi-track **brush** appends its returned tracks without destroying the source baseline.
- Smooth appearance is an SVG/Excalidraw rendering concern. It must not implicitly add control points.
- Density changes happen only inside an explicit modifier. `resampleStrokeByDistance()` is the preferred helper for device-independent brush spacing.

`src/modifierStack.js` contains pure helpers for track validation, bake resolution, coordinate mapping, flip inference, modifier removal, and distance sampling.

`composePreviewTracks()` and `resolveBakedTracks()` share the same ownership rule: a brush owns the tracks it emits, while the source path is controlled separately. This prevents a hidden source from reappearing during bake and prevents one brush's spine from being mistaken for another global original.

## Panel controls and state

The header is the single home for contextual stack actions. Keep these behaviors intact:

- **Bypass Stack** (`muteModifiers`) temporarily renders the editable source and skips evaluation; turning it off reapplies the same stack.
- **Hide Original** controls only the selected stroke, or the next-stroke preference when no stroke is selected in Mod Pen mode.
- Bypass and Hide Original are mutually exclusive. The UI disables the conflicting action and the handlers also enforce the invariant.
- Line/freehand conversion and source restoration are contextual and must remain unavailable when the selected element cannot support the action.
- The sidebar uses Excalidraw's native dock/pin state. Its width is user-resizable and persisted independently.

## Bake semantics

Full bake materializes the currently visible result as native Excalidraw elements, clears the modifier stack, and groups the resulting tracks as one logical object. **Hide Original Path** is preserved visually: a hidden source is not reintroduced by baking.

Applying one modifier card performs a partial bake:

1. Evaluate the upstream stack and selected modifier.
2. Materialize that modifier's drawable tracks.
3. Remove only the selected modifier.
4. Keep all other modifiers in their original order on the source element.
5. Insert the detached baked group immediately beneath the source.
6. Keep the live source selected, while allowing the baked group to be selected and transformed later.

## Transforms and control points

For Excalidraw `line` elements, current line points are authoritative during direct point editing. Do not reconstruct these edits from frame width, extrema, or inferred axis flips; that previously caused edge points to snap, stretch, or flip the modifier output.

Frame transforms for other element types still use the stored bounds and coordinate mapping helpers. Baked tracks are detached and transform independently.

## Undo and redo

All bake and modifier mutations must use `updateScene(..., commitToHistory: true)` when they represent a user action. The synchronization refs in `App.jsx` prevent the modifier evaluator from immediately overwriting an element restored by Excalidraw history:

- `processedModifierVersionsRef`
- `restoredHistoryElementVersionsRef`
- `suppressedModifierSyncVersionsRef`
- `linearEditPointsRef`

Undo/redo should restore both geometry and modifier metadata as one operation.

## Evolving-brush clocks

The active drawing preview reads the live `brushElapsedRef`. Pointer release snapshots points, modifier parameters, and elapsed time before the delayed Excalidraw commit.

Completed elements evaluate with their own `customData.brushElapsedMs`, so starting another stroke cannot grow or otherwise mutate past strokes. The Growing Hairy preset exposes **Use global clock** as an opt-in parameter; local clocks are the default.

The live preview and release commit must use the same frozen points, modifier parameters, spacing, and elapsed time. The preview stays mounted until Excalidraw has committed the replacement element, avoiding the one-frame release blink. When Hide Original is off, the source path is included in the live preview rather than appearing only after release.

Distance-based brushes should derive density exclusively from `resampleStrokeByDistance()`. Evolving collision brushes test generated geometry against the source path, not earlier hairs from the same evaluation. The Zen Garden Rake preset uses stabilized parallel offsets plus corner compression/loop cleanup to keep grooves separated through tight turns.

## Script editing

Mods & FX contains **Stack** and **Script** tabs; there is no standalone Custom Brush Lab drawing mode.

- Built-in scripts are read-only until forked with **Save As**.
- **Save** updates the specific attached modifier being edited, including its inline code and parsed parameters.
- **Save As** creates a user brush. If a modifier is being edited, only that modifier is retargeted to the new brush and its stale inline override is cleared.
- Saving or selecting a script never activates it for drawing by itself. A brush participates only when its modifier is present and enabled in the visible stack.

## Verification

Run before committing modifier work:

```bash
npm test
npm run lint
npm run build
```

Current automated coverage includes source/preview/bake track ownership, hide-original control resolution, full/partial bake track resolution, coordinate anchoring, axis-flip inference, modifier-order preservation, density-independent distance sampling, temporal metadata interpolation, visible-stack-only drawing, brush-ID resolution, and Save As modifier retargeting.

Rendered QA should additionally exercise:

- live preview to pointer-release visual stability;
- source visibility during a live modified stroke when Hide Original is off;
- a second evolving stroke leaving the first stroke unchanged;
- full bake plus undo/redo;
- partial bake selection and independent transformation;
- empty-stack Mod Pen drawing a native stroke regardless of the open Script tab;
- mutual exclusion of Bypass Stack and Hide Original;
- direct editing of line control points near frame edges.

Known unrelated warnings at this checkpoint: Excalidraw emits a missing React child-key warning, and Vite reports the main production chunk above 500 kB.
