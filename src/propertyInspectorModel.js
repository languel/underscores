// The raw object inspector is the escape hatch for authored extension data.
// Keep canonical role records visible even when their most common controls are
// promoted above the tree. Compatibility aliases remain hidden so the user
// never sees two competing representations of the same role.
export const getInspectableCustomData = value => {
  const customData = { ...(value || {}) };
  delete customData.underscoresSvg;
  if (customData.physics) delete customData.underscoresPhysics;
  if (customData.score) delete customData.iannix;
  return customData;
};
