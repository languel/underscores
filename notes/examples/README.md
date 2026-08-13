# Development score examples

This directory is for small, version-controlled scores used while developing
Underscores.  It is intentionally separate from user libraries and release
assets: the files here are fixtures, regression references, and useful starting
points rather than a promised distribution format.

- `glissandi.json` is a complete Underscores/Excalidraw scene. Import it from
  **Data → Import scene** to load one orange timeline curve, one black runtime
  cursor, six blue continuous-glissando triggers, the transport loop, and six
  internal Expressive Synth tracks addressed on MIDI channels 1–6. Each track
  voice starts when the cursor enters its trigger, follows the exact Y
  intersection as fractional pitch, and releases when the cursor leaves it.
- `.iannix` files may live beside these JSON scenes. Treat them as trusted
  source material when importing, as usual.

Keep examples compact and name them for the behavior they exercise. When a
score covers a regression, add or extend a test that validates its important
metadata and relationships.
