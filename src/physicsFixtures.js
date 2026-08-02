export const PORTRAIT_LANDMARK_FIXTURE = Object.freeze([
  Object.freeze({ t: 0, x: 0.50, y: 0.48 }),
  Object.freeze({ t: 0.25, x: 0.54, y: 0.45 }),
  Object.freeze({ t: 0.5, x: 0.51, y: 0.51 }),
  Object.freeze({ t: 0.75, x: 0.46, y: 0.47 }),
  Object.freeze({ t: 1, x: 0.50, y: 0.48 }),
]);

const lerp = (a, b, amount) => a + (b - a) * amount;

export const samplePortraitLandmarkFixture = (timeSeconds, bounds) => {
  const duration = 4;
  const progress = ((Number(timeSeconds) || 0) % duration + duration) % duration / duration;
  let upper = PORTRAIT_LANDMARK_FIXTURE.findIndex(sample => sample.t >= progress);
  if (upper <= 0) upper = 1;
  const a = PORTRAIT_LANDMARK_FIXTURE[upper - 1];
  const b = PORTRAIT_LANDMARK_FIXTURE[upper];
  const mix = (progress - a.t) / Math.max(1e-9, b.t - a.t);
  return {
    x: bounds.x + lerp(a.x, b.x, mix) * bounds.width,
    y: bounds.y + lerp(a.y, b.y, mix) * bounds.height,
  };
};
