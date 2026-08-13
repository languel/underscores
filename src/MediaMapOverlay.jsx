import MediaVisualFeaturePicker from "./MediaVisualFeaturePicker.jsx";
import { isMediaMapElement, normalizeMediaMapConfig } from "./mediaMap.js";

export default function MediaMapOverlay({ elements, appState, inspected, onSelectFeature, onSelectFeatures }) {
  const zoom = Number(appState?.zoom?.value) || 1;
  const scrollX = Number(appState?.scrollX) || 0;
  const scrollY = Number(appState?.scrollY) || 0;
  const maps = (elements || []).filter(isMediaMapElement);
  if (!maps.length) return null;
  return <div className="underscore-media-map-overlay">
    {maps.map((element, index) => {
      const config = normalizeMediaMapConfig(element.customData.underscoreMediaMap);
      const selectedIds = inspected?.streamId === config.streamId ? inspected.featureIds || [] : [];
      return <div
        key={element.id}
        className="underscore-media-map-node"
        style={{
          left: ((Number(element.x) || 0) + scrollX) * zoom,
          top: ((Number(element.y) || 0) + scrollY) * zoom,
          width: Math.max(180, (Number(element.width) || 1) * zoom),
          height: Math.max(180, (Number(element.height) || 1) * zoom),
          transform: `rotate(${Number(element.angle) || 0}rad)`,
          zIndex: index,
        }}
      >
        <div className="underscore-media-map-node-header">Media Map</div>
        <MediaVisualFeaturePicker
          selectedIds={selectedIds}
          onSelect={(featureId, event, definitions) => onSelectFeature?.(config.streamId, featureId, event, definitions)}
          onSelectMany={(featureIds, event) => onSelectFeatures?.(config.streamId, featureIds, event)}
        />
      </div>;
    })}
  </div>;
}
