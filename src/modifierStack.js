export const isDrawableTrack = (track) =>
  Array.isArray(track) &&
  track.length >= 2 &&
  track.every((point) =>
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
  );

/**
 * Resolve the evaluator output into the one track owned by the parent element
 * and the additional tracks that must be baked as grouped child elements.
 *
 * A brush result already includes its primary track at allLines[0]. Keeping
 * primaryPoints on the parent and also baking allLines[0] creates a duplicate
 * stroke (and adds a baseline to brushes such as Rake that intentionally omit
 * one). Filter-only stacks use primaryPoints as their sole output.
 */
export const resolveBakedTracks = ({ primaryPoints, allLines, hasAccumulated }) => {
  const drawableLines = Array.isArray(allLines)
    ? allLines.filter(isDrawableTrack)
    : [];

  if (hasAccumulated && drawableLines.length > 0) {
    return {
      parentTrack: drawableLines[0],
      childTracks: drawableLines.slice(1),
    };
  }

  return {
    parentTrack: isDrawableTrack(primaryPoints) ? primaryPoints : null,
    childTracks: [],
  };
};

export const mapTrackPointToElement = ({
  point,
  elementType,
  elementX,
  elementY,
  elementFirstPoint = [0, 0],
  evaluatedBaseline,
  scaleX = 1,
  scaleY = 1,
}) => {
  if (!isDrawableTrack(evaluatedBaseline)) return [elementX, elementY];

  if (elementType === "freedraw") {
    const baselineMinX = Math.min(...evaluatedBaseline.map(p => p[0]));
    const baselineMinY = Math.min(...evaluatedBaseline.map(p => p[1]));
    return [
      elementX + (point[0] - baselineMinX) * scaleX,
      elementY + (point[1] - baselineMinY) * scaleY,
    ];
  }

  return [
    elementX + elementFirstPoint[0] + (point[0] - evaluatedBaseline[0][0]) * scaleX,
    elementY + elementFirstPoint[1] + (point[1] - evaluatedBaseline[0][1]) * scaleY,
  ];
};

export const inferAxisFlipSign = (originalPoints, currentPoints, axis) => {
  if (!isDrawableTrack(originalPoints) || !isDrawableTrack(currentPoints)) return 1;

  const originalDelta = originalPoints.at(-1)[axis] - originalPoints[0][axis];
  const currentDelta = currentPoints.at(-1)[axis] - currentPoints[0][axis];
  if (Math.abs(originalDelta) > 0.1 && Math.abs(currentDelta) > 0.1) {
    return originalDelta * currentDelta < 0 ? -1 : 1;
  }

  const extremaOrder = (points) => {
    let minIndex = 0;
    let maxIndex = 0;
    for (let index = 1; index < points.length; index++) {
      if (points[index][axis] < points[minIndex][axis]) minIndex = index;
      if (points[index][axis] > points[maxIndex][axis]) maxIndex = index;
    }
    if (Math.abs(points[maxIndex][axis] - points[minIndex][axis]) <= 0.1) return 0;
    return Math.sign(maxIndex - minIndex);
  };

  const originalOrder = extremaOrder(originalPoints);
  const currentOrder = extremaOrder(currentPoints);
  return originalOrder !== 0 && currentOrder !== 0 && originalOrder !== currentOrder ? -1 : 1;
};

export const removeModifierAt = (modifiers, index) =>
  modifiers.filter((_, modifierIndex) => modifierIndex !== index);

const POINT_METADATA_KEYS = ["pressure", "time", "strokeTime", "speed"];

/**
 * Samples a stroke at a stable canvas-distance interval while retaining the
 * temporal metadata used by evolving brushes. This deliberately lives in the
 * modifier layer: Excalidraw's source/control-point density remains untouched.
 */
export const resampleStrokeByDistance = (points, spacing) => {
  if (!isDrawableTrack(points)) return [];

  const step = Math.max(0.1, Number(spacing) || 1);
  const first = [points[0][0], points[0][1]];
  for (const key of POINT_METADATA_KEYS) {
    if (points[0][key] !== undefined) first[key] = points[0][key];
  }
  first.sourceSegmentIndex = 0;

  const samples = [first];
  let distanceUntilNextSample = step;

  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 0.000001) continue;

    let distanceAlongSegment = 0;
    while (distanceAlongSegment + distanceUntilNextSample <= segmentLength + 0.000001) {
      distanceAlongSegment += distanceUntilNextSample;
      const t = Math.min(1, distanceAlongSegment / segmentLength);
      const sample = [start[0] + dx * t, start[1] + dy * t];
      for (const key of POINT_METADATA_KEYS) {
        const startValue = start[key];
        const endValue = end[key];
        if (startValue !== undefined && endValue !== undefined) {
          sample[key] = startValue + (endValue - startValue) * t;
        } else if (startValue !== undefined) {
          sample[key] = startValue;
        } else if (endValue !== undefined) {
          sample[key] = endValue;
        }
      }
      sample.sourceSegmentIndex = segmentIndex;
      samples.push(sample);
      distanceUntilNextSample = step;
    }

    distanceUntilNextSample -= segmentLength - distanceAlongSegment;
    if (distanceUntilNextSample < 0.000001) distanceUntilNextSample = step;
  }

  return samples;
};
