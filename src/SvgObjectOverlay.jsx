import { useEffect, useRef } from "react";
import { isSvgObjectElement, normalizeSvgObject, shouldRenderSvgObject } from "./svgObject.js";
import { resumeSvgDocument, sanitizeSvgForInertRender, seekSvgDocument } from "./svgRuntime.js";
import SvgTrustedRuntime from "./SvgTrustedRuntime.jsx";

const SvgShadowDocument = ({ source, color, clock, time, interactive, onSelect, onEditNode, onConstructPath }) => {
  const hostRef = useRef(null);
  const shadowRef = useRef(null);
  const interactionRef = useRef({ interactive, onSelect, onEditNode, onConstructPath });

  interactionRef.current = { interactive, onSelect, onEditNode, onConstructPath };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadowRef.current = shadow;
    const style = document.createElement("style");
    style.textContent = `:host,.drawerator-svg-shadow-content{display:block;width:100%;height:100%}:host{color:${color || "currentColor"}}svg{display:block;width:100%;height:100%;overflow:visible}`;
    const content = document.createElement("div");
    content.className = "drawerator-svg-shadow-content";
    content.innerHTML = sanitizeSvgForInertRender(source);
    shadow.replaceChildren(style, content);

    const nodeFromEvent = event => {
      const target = event.composedPath?.().find(item => item instanceof Element && item.hasAttribute?.("data-drawerator-render-index"));
      const nodeIndex = Number(target?.getAttribute?.("data-drawerator-render-index"));
      return Number.isInteger(nodeIndex) ? nodeIndex : null;
    };
    const pointerDown = event => {
      const interaction = interactionRef.current;
      if (!interaction.interactive || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey) {
        interaction.onConstructPath?.(event);
        return;
      }
      const nodeIndex = nodeFromEvent(event);
      if ((event.metaKey || event.ctrlKey) && Number.isInteger(nodeIndex)) {
        interaction.onEditNode?.(nodeIndex, event);
      } else {
        interaction.onSelect?.(event);
      }
    };
    const doubleClick = event => {
      const interaction = interactionRef.current;
      if (!interaction.interactive) return;
      event.preventDefault();
      event.stopPropagation();
      const nodeIndex = nodeFromEvent(event);
      // Empty SVG documents have no rendered node to identify. Forward that
      // double-click too so the canvas can create the first path in its host.
      interaction.onEditNode?.(nodeIndex, event);
    };
    shadow.addEventListener("pointerdown", pointerDown, true);
    shadow.addEventListener("dblclick", doubleClick, true);
    return () => {
      shadow.removeEventListener("pointerdown", pointerDown, true);
      shadow.removeEventListener("dblclick", doubleClick, true);
    };
  }, [source, color]);

  useEffect(() => {
    if (clock === "free") resumeSvgDocument(shadowRef.current);
    else seekSvgDocument(shadowRef.current, time);
  }, [clock, source, time]);

  return <div ref={hostRef} className="drawerator-svg-shadow-host" />;
};

export default function SvgObjectOverlay({ elements, appState, time = 0, onSelect, onEditPath, onEditNode, onConstructPath }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const selectionMode = appState?.activeTool?.type === "selection";
  const objects = (elements || []).filter(shouldRenderSvgObject);
  if (!objects.length) return null;

  return (
    <div className="drawerator-svg-object-overlay" aria-hidden="true">
      {objects.map((element, layerIndex) => {
        if (!isSvgObjectElement(element)) return null;
        const svg = normalizeSvgObject(element.customData.draweratorSvg);
        const elementOpacity = Number(element.opacity);
        const opacity = Number.isFinite(elementOpacity) ? elementOpacity : 100;
        const selected = Boolean(appState?.selectedElementIds?.[element.id]);
        const interactive = selectionMode && !selected && !element.locked;
        const handlePointerDown = event => {
          if (!interactive || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.metaKey || event.ctrlKey) onEditPath?.(element.id, event);
          else onSelect?.(element.id, event);
        };
        return (
          <div
            key={element.id}
            data-drawerator-svg-element-id={element.id}
            className={`drawerator-svg-object-frame ${interactive ? "drawerator-svg-object-frame-interactive" : ""}`}
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
            {svg.runtime.trustedScripts ? (
              <SvgTrustedRuntime
                source={svg.source}
                color={appState?.svgForegroundColor}
                policy={svg.runtime}
                time={time}
              />
            ) : (
              <SvgShadowDocument
                source={svg.source}
                color={appState?.svgForegroundColor}
                clock={svg.runtime.clock}
                time={time}
                interactive={interactive}
                onSelect={handlePointerDown}
                onEditNode={(nodeIndex, event) => {
                  // A Shadow DOM double-click cannot bubble to the canvas
                  // capture handler. Keep the node selection in sync, then
                  // forward it to the same path-insertion gesture used by the
                  // canvas so unselected and selected SVG hosts behave alike.
                  onEditNode?.(element.id, nodeIndex, event);
                  onEditPath?.(element.id, event);
                }}
                onConstructPath={event => onConstructPath?.(element.id, event)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
