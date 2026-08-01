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
 * Build the tracks shown by the transient drawing preview. Brush modifiers
 * return generated tracks separately from the source path, while filter-only
 * stacks return the filtered source as their sole line. Keeping this decision
 * here makes the live preview match the committed element without duplicating
 * filter output.
 */
export const composePreviewTracks = ({
  primaryPoints,
  allLines,
  hasAccumulated,
  hideOriginal,
}) => {
  const drawableLines = Array.isArray(allLines)
    ? allLines.filter(isDrawableTrack)
    : [];

  if (hasAccumulated && !hideOriginal && isDrawableTrack(primaryPoints)) {
    return [primaryPoints, ...drawableLines];
  }

  if (drawableLines.length > 0) return drawableLines;
  return isDrawableTrack(primaryPoints) ? [primaryPoints] : [];
};

/**
 * Compose the complete visible appearance of a runtime cursor after modifier
 * tracks have been mapped into canvas coordinates. The authored Excalidraw
 * element is hidden while linked, so the runtime overlay must own both the
 * source path and every generated brush track.
 */
export const composeRuntimeCursorTracks = ({
  sourcePaths,
  evaluatedTracks,
  hasAccumulated,
  hideOriginal,
  muteModifiers,
}) => {
  const source = Array.isArray(sourcePaths) ? sourcePaths.filter(isDrawableTrack) : [];
  const evaluated = Array.isArray(evaluatedTracks) ? evaluatedTracks.filter(isDrawableTrack) : [];

  if (muteModifiers) return source;
  if (hasAccumulated) return hideOriginal ? evaluated : [...source, ...evaluated];
  if (evaluated.length > 0) return evaluated;
  return source;
};

export const resolveHideOriginalControl = ({
  hasSelection,
  selectedHideOriginal,
  customBrushActive,
  nextStrokeHideOriginal,
}) => {
  if (hasSelection) {
    return {
      checked: Boolean(selectedHideOriginal),
      disabled: false,
      target: "selectedStroke",
    };
  }

  if (customBrushActive) {
    return {
      checked: Boolean(nextStrokeHideOriginal),
      disabled: false,
      target: "nextStroke",
    };
  }

  return {
    checked: false,
    disabled: true,
    target: null,
  };
};

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

const copyPointMetadata = (source, target) => {
  for (const key of POINT_METADATA_KEYS) {
    if (source?.[key] !== undefined) target[key] = source[key];
  }
  return target;
};

/**
 * Map an evaluator track through the same translation, resize, flip, and
 * rotation transform used by the live modifier overlay. Bake callers must use
 * this before creating native Excalidraw children; evaluator output remains in
 * the source stroke's coordinate space after a copy or transform.
 */
export const mapEvaluatedTrackToElement = ({
  track,
  evaluatedBaseline,
  originalPoints,
  element,
}) => {
  if (!isDrawableTrack(track) || !isDrawableTrack(evaluatedBaseline) || !element) return [];

  const currentPoints = Array.isArray(element.points) ? element.points : [];
  const lastWidth = element.customData?.lastWidth || element.width;
  const lastHeight = element.customData?.lastHeight || element.height;
  const scaleSignX = inferAxisFlipSign(originalPoints, currentPoints, 0);
  const scaleSignY = inferAxisFlipSign(originalPoints, currentPoints, 1);
  const scaleX = lastWidth > 0.1 && Math.abs(element.width - lastWidth) > 0.1
    ? scaleSignX * (element.width / lastWidth)
    : scaleSignX;
  const scaleY = lastHeight > 0.1 && Math.abs(element.height - lastHeight) > 0.1
    ? scaleSignY * (element.height / lastHeight)
    : scaleSignY;
  const minXRel = currentPoints.length ? Math.min(...currentPoints.map(point => point[0])) : 0;
  const minYRel = currentPoints.length ? Math.min(...currentPoints.map(point => point[1])) : 0;
  const maxXRel = currentPoints.length ? Math.max(...currentPoints.map(point => point[0])) : 0;
  const maxYRel = currentPoints.length ? Math.max(...currentPoints.map(point => point[1])) : 0;
  const centerX = element.x + (minXRel + maxXRel) / 2;
  const centerY = element.y + (minYRel + maxYRel) / 2;
  const firstPoint = currentPoints[0] || [0, 0];
  const angle = element.angle || 0;

  return track.map(point => {
    const [mappedX, mappedY] = mapTrackPointToElement({
      point,
      elementType: element.type,
      elementX: element.x,
      elementY: element.y,
      elementFirstPoint: firstPoint,
      evaluatedBaseline,
      scaleX,
      scaleY,
    });
    const [x, y] = angle === 0
      ? [mappedX, mappedY]
      : [
          centerX + (mappedX - centerX) * Math.cos(angle) - (mappedY - centerY) * Math.sin(angle),
          centerY + (mappedX - centerX) * Math.sin(angle) + (mappedY - centerY) * Math.cos(angle),
        ];
    return copyPointMetadata(point, [x, y]);
  });
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

export const resolveDrawingModifiers = ({
  globalModifiers,
}) => Array.isArray(globalModifiers) ? globalModifiers : [];

export const resolveBrushId = (modifierId, brushes) => {
  if (!modifierId || !Array.isArray(brushes)) return null;
  if (brushes.some(brush => brush.id === modifierId)) return modifierId;
  const withoutWrapper = modifierId.startsWith("custom-")
    ? modifierId.slice("custom-".length)
    : modifierId;
  return brushes.some(brush => brush.id === withoutWrapper) ? withoutWrapper : null;
};

export const replaceModifierBrushAt = (modifiers, index, brush, params) =>
  modifiers.map((modifier, modifierIndex) => modifierIndex === index
    ? {
        ...modifier,
        id: `custom-${brush.id}`,
        name: brush.name,
        params: { ...params },
        codeOverride: undefined,
      }
    : modifier);

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
