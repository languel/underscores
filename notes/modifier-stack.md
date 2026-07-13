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

## Evaluation rules

`evaluateModifierStack()` maintains one baseline plus accumulated brush tracks:

- A geometric **filter** replaces the baseline and propagates through already accumulated tracks.
- A multi-track **brush** appends its returned tracks without destroying the source baseline.
- Smooth appearance is an SVG/Excalidraw rendering concern. It must not implicitly add control points.
- Density changes happen only inside an explicit modifier. `resampleStrokeByDistance()` is the preferred helper for device-independent brush spacing.

`src/modifierStack.js` contains pure helpers for track validation, bake resolution, coordinate mapping, flip inference, modifier removal, and distance sampling.

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

## Verification

Run before committing modifier work:

```bash
npm test
npm run lint
npm run build
```

Current automated coverage includes full/partial bake track resolution, coordinate anchoring, axis-flip inference, modifier-order preservation, density-independent distance sampling, and temporal metadata interpolation.

Rendered QA should additionally exercise:

- live preview to pointer-release visual stability;
- a second evolving stroke leaving the first stroke unchanged;
- full bake plus undo/redo;
- partial bake selection and independent transformation;
- direct editing of line control points near frame edges.

Known unrelated warnings at this checkpoint: Excalidraw emits a missing React child-key warning, and Vite reports the main production chunk above 500 kB.
