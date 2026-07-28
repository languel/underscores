import { isSvgObjectElement, normalizeSvgObject, shouldRenderSvgObject, svgSourceToDataUrl } from "./svgObject.js";

export default function SvgObjectOverlay({ elements, appState }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const objects = (elements || []).filter(shouldRenderSvgObject);
  if (!objects.length) return null;

  return (
    <div className="drawerator-svg-object-overlay" aria-hidden="true">
      {objects.map((element, layerIndex) => {
        if (!isSvgObjectElement(element)) return null;
        const svg = normalizeSvgObject(element.customData.draweratorSvg);
        const elementOpacity = Number(element.opacity);
        const opacity = Number.isFinite(elementOpacity) ? elementOpacity : 100;
        return (
          <div
            key={element.id}
            data-drawerator-svg-element-id={element.id}
            className="drawerator-svg-object-frame"
            style={{
              left: ((Number(element.x) || 0) + scrollX) * zoom,
              top: ((Number(element.y) || 0) + scrollY) * zoom,
              width: Math.max(1, (Number(element.width) || 1) * zoom),
              height: Math.max(1, (Number(element.height) || 1) * zoom),
              opacity: Math.max(0, Math.min(1, opacity / 100)),
              zIndex: layerIndex,
              transform: `rotate(${Number(element.angle) || 0}rad)`,
              transformOrigin: "center",
            }}
          >
            <img src={svgSourceToDataUrl(svg.source)} alt="" draggable="false" />
          </div>
        );
      })}
    </div>
  );
}
