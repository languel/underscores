# Stream portrait and sculpt classroom example

Run `/physics demo portrait`. Its face outline is a canonical Bézier curve with stable anchor IDs. The initial attractor reads `physics:fixture:face`, a deterministic recorded motion fixture, so the example works without camera permission.

To use live tracking, update the attractor's stream endpoint to the desired Holistic canvas processor ID and a semantic feature such as `pose.nose`, using scene space. MediaPipe remains a transient input stream; only the reference is saved. The geometry adapter eases lower-rate samples while the main physics clock remains fixed.

Select canonical curves and use Smooth or seeded Randomize. Select two curves and use Morph; target correspondence is based on arc length rather than anchor count. Choose Attract brush and drag across one selected curve for a single undoable sculpt stroke.
