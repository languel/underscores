import { useEffect, useMemo, useRef, useState } from "react";
import { HAND_CONNECTIONS, POSE_CONNECTIONS, listMediaFeatureDefinitions, resolveMediaFeatureDefinition } from "./mediaLandmarkOntology.js";

// Draw a compact semantic map from the ontology instead of bundling a copied
// third-party illustration. The picker remains useful even when offline and
// its points always use the canonical feature ids.
const DEFAULT_VIEW_BOX = Object.freeze({ x: 0, y: 0, width: 1000, height: 900 });
const VISUAL_MODES = Object.freeze([
  { id: "all", label: "All", viewBox: DEFAULT_VIEW_BOX },
  { id: "pose", label: "Pose", viewBox: Object.freeze({ x: 285, y: 210, width: 430, height: 650 }) },
  { id: "hands", label: "Hands", viewBox: Object.freeze({ x: 0, y: 300, width: 1000, height: 420 }) },
  { id: "face", label: "Face", viewBox: Object.freeze({ x: 300, y: 20, width: 400, height: 350 }) },
]);

const POSE_NAMES = Object.freeze([
  "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]);
const HAND_NAMES = Object.freeze([
  "wrist", "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip", "index_finger_mcp", "index_finger_pip", "index_finger_dip", "index_finger_tip", "middle_finger_mcp", "middle_finger_pip", "middle_finger_dip", "middle_finger_tip", "ring_finger_mcp", "ring_finger_pip", "ring_finger_dip", "ring_finger_tip", "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip",
]);
const POSE_LAYOUT = Object.freeze([
  [500, 110], [475, 120], [488, 120], [501, 120], [512, 120], [525, 120], [538, 120], [458, 145], [542, 145], [485, 165], [515, 165],
  [420, 250], [580, 250], [360, 360], [640, 360], [300, 470], [700, 470], [265, 490], [735, 490], [250, 540], [750, 540], [275, 565], [725, 565],
  [450, 470], [550, 470], [410, 610], [590, 610], [380, 760], [620, 760], [355, 805], [645, 805], [350, 850], [650, 850],
]);

const handPoint = (originX, originY, index) => {
  if (index === 0) return [originX, originY];
  const finger = Math.floor((index - 1) / 4);
  const step = (index - 1) % 4;
  const spread = [-64, -32, 0, 32, 62][finger] || 0;
  const direction = originX < 500 ? -1 : 1;
  return [originX + spread * direction, originY - 16 - step * 25 - Math.abs(spread) * 0.08];
};

const featureDiagramNodes = definitions => definitions.flatMap(definition => {
  if (definition.kind !== "point") return [];
  const [x, y] = definition.family === "pose"
    ? (POSE_LAYOUT[definition.index] || [500, 450])
    : definition.family === "left_hand"
      ? handPoint(145, 540, definition.index)
      : definition.family === "right_hand"
        ? handPoint(855, 540, definition.index)
        : [500 + Math.cos(definition.index * 0.37) * (70 + (definition.index % 7) * 5), 155 + Math.sin(definition.index * 0.37) * (90 + (definition.index % 5) * 3)];
  return [{ id: definition.id, x, y, family: definition.family }];
});

const featureDiagramLines = nodes => {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const line = (family, from, to) => {
    const left = byId.get(`${family}.${family === "pose" ? POSE_NAMES[from] : HAND_NAMES[from]}`);
    const right = byId.get(`${family}.${family === "pose" ? POSE_NAMES[to] : HAND_NAMES[to]}`);
    return left && right ? { x1: left.x, y1: left.y, x2: right.x, y2: right.y, family } : null;
  };
  return [
    ...POSE_CONNECTIONS.map(([from, to]) => line("pose", from, to)),
    ...HAND_CONNECTIONS.flatMap(([from, to]) => [line("left_hand", from, to), line("right_hand", from, to)]),
  ].filter(Boolean);
};

const pointInSvg = (svg, event) => {
  const matrix = svg.getScreenCTM?.();
  if (!matrix) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
};

export default function MediaVisualFeaturePicker({ selectedIds = [], focusFeatureId = "", onSelect, onSelectMany, mode: controlledMode, onModeChange, compact = false }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const definitions = useMemo(() => listMediaFeatureDefinitions(), []);
  const [modeState, setModeState] = useState("all");
  const mode = controlledMode || modeState;
  const modeDefinition = VISUAL_MODES.find(candidate => candidate.id === mode) || VISUAL_MODES[0];
  const [viewBox, setViewBox] = useState(modeDefinition.viewBox);
  const nodes = useMemo(() => featureDiagramNodes([
    ...definitions,
    ...Array.from({ length: 478 }, (_, index) => resolveMediaFeatureDefinition(`face.${index}`)),
  ].filter(Boolean)), [definitions]);
  const lines = useMemo(() => featureDiagramLines(nodes), [nodes]);
  const [selectionBox, setSelectionBox] = useState(null);

  const changeMode = nextMode => {
    if (!VISUAL_MODES.some(candidate => candidate.id === nextMode)) return;
    if (controlledMode === undefined) setModeState(nextMode);
    onModeChange?.(nextMode);
    setViewBox(VISUAL_MODES.find(candidate => candidate.id === nextMode).viewBox);
  };

  useEffect(() => {
    if (!focusFeatureId) return;
    const node = nodes.find(candidate => candidate.id === focusFeatureId);
    if (!node) return;
    setViewBox(previous => ({
      ...previous,
      x: node.x - previous.width / 2,
      y: node.y - previous.height / 2,
    }));
  }, [focusFeatureId, nodes]);

  const beginPointer = event => {
    const point = pointInSvg(svgRef.current, event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      mode: event.shiftKey ? "box" : "pan",
      start: point,
      startClient: { x: event.clientX, y: event.clientY },
      bounds: event.currentTarget.getBoundingClientRect(),
      viewBox,
    };
    if (event.shiftKey) setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const movePointer = event => {
    const drag = dragRef.current;
    const point = pointInSvg(svgRef.current, event);
    if (!drag || !point) return;
    if (drag.mode === "box") {
      setSelectionBox({
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        width: Math.abs(point.x - drag.start.x),
        height: Math.abs(point.y - drag.start.y),
      });
      return;
    }
    const deltaX = (event.clientX - drag.startClient.x) * (drag.viewBox.width / drag.bounds.width);
    const deltaY = (event.clientY - drag.startClient.y) * (drag.viewBox.height / drag.bounds.height);
    setViewBox({
      ...drag.viewBox,
      x: drag.viewBox.x - deltaX,
      y: drag.viewBox.y - deltaY,
    });
  };

  const endPointer = event => {
    const drag = dragRef.current;
    const point = pointInSvg(svgRef.current, event);
    dragRef.current = null;
    if (!drag || !point) return;
    if (drag.mode === "box") {
      const x0 = Math.min(drag.start.x, point.x);
      const x1 = Math.max(drag.start.x, point.x);
      const y0 = Math.min(drag.start.y, point.y);
      const y1 = Math.max(drag.start.y, point.y);
      onSelectMany?.(nodes.filter(node => node.x >= x0 && node.x <= x1 && node.y >= y0 && node.y <= y1).map(node => node.id), event);
    }
    setSelectionBox(null);
  };

  const zoomAtPointer = event => {
    event.preventDefault();
    const point = pointInSvg(svgRef.current, event);
    if (!point) return;
    const scale = event.deltaY > 0 ? 1.14 : 0.88;
    setViewBox(previous => {
      const width = Math.max(70, Math.min(DEFAULT_VIEW_BOX.width * 2, previous.width * scale));
      const height = Math.max(70, Math.min(DEFAULT_VIEW_BOX.height * 2, previous.height * scale));
      return {
        width,
        height,
        x: point.x - (point.x - previous.x) * (width / previous.width),
        y: point.y - (point.y - previous.y) * (height / previous.height),
      };
    });
  };

  const viewBoxText = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  return <div className={`media-visual-feature-picker-shell is-${mode} ${compact ? "is-compact" : ""}`}>
    {!compact && <div className="media-visual-feature-picker-modes" role="group" aria-label="Visual feature map mode">
      {VISUAL_MODES.map(candidate => <button key={candidate.id} type="button" className={candidate.id === mode ? "is-active" : ""} onClick={() => changeMode(candidate.id)}>{candidate.label}</button>)}
    </div>}
    <svg
      ref={svgRef}
      className="media-visual-feature-picker"
      viewBox={viewBoxText}
      role="application"
      aria-label="Interactive MediaPipe feature map. Drag to pan, wheel to zoom, Shift-drag to box select."
      onPointerDown={beginPointer}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={zoomAtPointer}
    >
      <rect x={DEFAULT_VIEW_BOX.x} y={DEFAULT_VIEW_BOX.y} width={DEFAULT_VIEW_BOX.width} height={DEFAULT_VIEW_BOX.height} fill="var(--color-background, #151519)" pointerEvents="none" />
      <g className="media-visual-feature-map-lines" pointerEvents="none">
        {lines.map((line, index) => <line key={`${line.family}-${index}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
      </g>
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="transparent" />
      {nodes.map(node => <circle
        key={node.id}
        cx={node.x}
        cy={node.y}
        r={11}
        className={`media-visual-feature-hit ${selectedIds.includes(node.id) ? "is-selected" : ""}`}
        aria-label={node.id}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onSelect?.(node.id, event, definitions);
        }}
      />)}
      {selectionBox && <rect className="media-visual-feature-selection-box" {...selectionBox} />}
    </svg>
  </div>;
}
