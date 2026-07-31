import { useEffect, useMemo, useRef, useState } from "react";
import { listMediaFeatureDefinitions } from "./mediaLandmarkOntology.js";

const MAP_ASSET = "/media/mediamime-body-map-detached-hands-large.svg";
const DEFAULT_VIEW_BOX = Object.freeze({ x: -316.4, y: 0, width: 1232.8, height: 1251 });
const VISUAL_MODES = Object.freeze([
  { id: "all", label: "All", viewBox: DEFAULT_VIEW_BOX },
  { id: "pose", label: "Pose", viewBox: Object.freeze({ x: 50, y: 440, width: 500, height: 811 }) },
  { id: "hands", label: "Hands", viewBox: Object.freeze({ x: -210, y: 320, width: 1020, height: 430 }) },
  { id: "face", label: "Face", viewBox: Object.freeze({ x: 80, y: 0, width: 440, height: 440 }) },
]);

const featureForDiagramNode = (definitions, title) => {
  const match = /^(pose|face|handL|handR)\s+(\d+):/i.exec(title || "");
  if (!match) return null;
  const [, sourceFamily, indexText] = match;
  const family = sourceFamily === "handL" ? "left_hand" : sourceFamily === "handR" ? "right_hand" : sourceFamily.toLowerCase();
  const index = Number(indexText);
  if (family === "face" && index >= 0 && index <= 477) return `face.${index}`;
  return definitions.find(definition => definition.family === family && definition.index === index)?.id || null;
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
  const [assetUrl, setAssetUrl] = useState("");
  const [modeState, setModeState] = useState("all");
  const mode = controlledMode || modeState;
  const modeDefinition = VISUAL_MODES.find(candidate => candidate.id === mode) || VISUAL_MODES[0];
  const [viewBox, setViewBox] = useState(modeDefinition.viewBox);
  const [nodes, setNodes] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);

  useEffect(() => {
    let disposed = false;
    let url = "";
    fetch(MAP_ASSET).then(response => response.text()).then(source => {
      if (disposed) return;
      const document = new DOMParser().parseFromString(source, "image/svg+xml");
      document.querySelector("svg > rect")?.remove();
      const parsedNodes = [...document.querySelectorAll("circle")].map(circle => ({
        id: featureForDiagramNode(definitions, circle.querySelector("title")?.textContent),
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
      })).filter(node => node.id && Number.isFinite(node.x) && Number.isFinite(node.y));
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(document.documentElement)], { type: "image/svg+xml" }));
      setNodes(parsedNodes);
      setAssetUrl(url);
    }).catch(() => {
      if (!disposed) setAssetUrl(MAP_ASSET);
    });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [definitions]);

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
      {assetUrl && <image href={assetUrl} x={DEFAULT_VIEW_BOX.x} y={DEFAULT_VIEW_BOX.y} width={DEFAULT_VIEW_BOX.width} height={DEFAULT_VIEW_BOX.height} pointerEvents="none" />}
      <rect x={viewBox.x} y={viewBox.y} width={viewBox.width} height={viewBox.height} fill="transparent" />
      {nodes.map(node => <circle
        key={node.id}
        cx={node.x}
        cy={node.y}
        r={11}
        className={`media-visual-feature-hit ${selectedIds.includes(node.id) ? "is-selected" : ""}`}
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
