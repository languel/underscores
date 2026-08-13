import { memo, useEffect, useMemo, useRef, useState } from "react";
import { EMBED_DISPLAY_MODES, embedPolicyForElement, getEmbedProvider } from "./embedPolicy.js";
import { DEFAULT_P5_CDN_URL, isP5FrameElement, normalizeP5Frame, resolveP5SourceMode } from "./p5Frame.js";
import {
  analyzeSvgSource,
  isSvgObjectElement,
  normalizeSvgObject,
  updateStructuredSvgNodeAttribute,
  updateStructuredSvgRootDocument,
} from "./svgObject.js";
import { getEditableSvgPathNodes } from "./svgPathGeometry.js";
import { buildSvgTimingGraph } from "./svgAnimation.js";
import { getSvgNodeStyleCascade, updateStructuredSvgStyleDeclaration } from "./svgStyleModel.js";
import { isMediaStreamElement, MEDIA_STREAM_KINDS, normalizeMediaStreamConfig, patchMediaStreamConfig } from "./mediaStream.js";
import { getScoreData } from "./iannixEngine.js";
import { getPhysicsColliderSelectionValue } from "./physicsGeometry.js";
import { normalizePhysicsConstraint } from "./relationshipGraph.js";
import { getInspectableCustomData } from "./propertyInspectorModel.js";
import { getOutlinerElementLabel } from "./OutlinerPanel.jsx";
import NumericInput from "./NumericInput.jsx";
import { getSpringGeometricLength } from "./physicsConstraintAuthoring.js";
import GeometryResetIcon from "./GeometryResetIcon.jsx";
import { infoProps } from "./uiInfo.js";

const READ_ONLY_KEYS = new Set([
  "id", "type", "width", "height", "version", "versionNonce", "updated", "index", "seed",
  "points", "pressures", "originalPoints", "boundElements", "groupIds", "frameId", "containerId",
  "startBinding", "endBinding", "isDeleted", "excalidrawVersion", "lastWidth", "lastHeight",
]);

const PROPERTIES_PINS_STORAGE_KEY = "underscore_properties_pins_v1";

const pathKey = path => path.map(String).join(".");
const getElementName = element => {
  if (getScoreData(element)?.label) return getScoreData(element).label;
  if (element.customData?.underscoreLabel) return element.customData.underscoreLabel;
  if (element.name) return element.name;
  if (element.customData?.name) return element.customData.name;
  if (isMediaStreamElement(element)) return normalizeMediaStreamConfig(element.customData.underscoreMediaStream).name;
  if (isSvgObjectElement(element)) return normalizeSvgObject(element.customData.underscoreSvg).name;
  return "";
};
// Frames are semantic Excalidraw containers. Although their element data has a
// `roundness` slot, Excalidraw's frame renderer uses a fixed rounded outline
// and does not apply that value. Keep the control to shapes that actually
// respond to it.
const supportsRoundness = element => ["line", "rectangle", "diamond"].includes(element?.type);
const isObjectReferencePath = path => pathKey(path) === "customData.underscoreMediaStream.canvas.elementId";

const defaultPinnedPathsFor = element => {
  if (element?.type === "frame") return [
    ["customData", "underscoreFrame", "label"],
    ["customData", "underscoreFrame", "showLabel"],
  ];
  if (isMediaStreamElement(element)) {
    const stream = normalizeMediaStreamConfig(element.customData?.underscoreMediaStream);
    if (stream.kind === MEDIA_STREAM_KINDS.PREVIEW) return [
      ["customData", "underscoreMediaStream", "sourceId"],
      ["customData", "underscoreMediaStream", "enabled"],
      ["customData", "underscoreMediaStream", "mirror"],
    ];
  }
  if (getScoreData(element)?.role) return [["customData", "score", "role"]];
  return [["x"], ["y"]];
};

const primitiveText = value => {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
};

// Excalidraw stores all dimensions as immutable-looking primitive fields, but
// ellipse bounds are ordinary editable geometry. Keep dimensions protected for
// every other native type until it has an explicit resize contract, while
// allowing an ellipse's own width/height fields to use the same scene update
// path as x and y.
const isEllipseDimensionPath = (path, element) => (
  element?.type === "ellipse"
  && path.length === 1
  && ["width", "height"].includes(String(path[0]))
);

const canEditPath = (path, element) => (
  isEllipseDimensionPath(path, element)
  || !path.some(segment => READ_ONLY_KEYS.has(String(segment)))
);

const readPath = (value, path) => path.reduce((current, segment) => (
  current != null && Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined
), value);

const isSharedEditablePath = (elements, path) => {
  if (elements.length < 2 || !elements.every(element => canEditPath(path, element))) return false;
  const values = elements.map(element => readPath(element, path));
  if (values.some(value => value === undefined)) return false;
  const types = new Set(values.map(value => typeof value));
  return types.size === 1 && (["boolean", "number", "string"].includes(values[0]) || Boolean(enumOptionsForPath(path)));
};

const enumOptionsForPath = path => {
  const key = String(path.at(-1) || "");
  const joined = path.map(String).join(".");
  if (joined === "customData.score.role") return [
    [null, "None"], ["curve", "Curve"], ["cursor", "Cursor"], ["trigger", "Trigger"],
  ];
  if (joined === "customData.score.time.loopMode") return [
    ["once", "Once / hold"], ["loop", "Loop"], ["pingPong", "Ping-pong"],
  ];
  if (joined === "customData.score.time.startMode") return [["manual", "Manual"], ["curve", "Curve"]];
  if (joined === "customData.score.time.durationMode") return [
    ["geometry", "Geometry"], ["manual", "Manual"], ["curve", "Curve"], ["ratio", "Ratio"],
  ];
  if (joined === "customData.score.gridBinding.metric") return [
    ["auto", "Auto"], ["xSpan", "X span"], ["ySpan", "Y span"], ["arcLength", "Arc length"], ["manhattan", "Manhattan"],
  ];
  if (joined === "customData.score.trigger.behavior") return [["pulse", "Pulse"], ["glissando", "Continuous glissando"]];
  if (joined === "customData.score.trigger.midiBaseSource") return [["cursor", "Cursor"], ["curve", "Curve"]];
  if (key === "strokeStyle") return [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]];
  if (key === "fillStyle") return [["hachure", "Hachure"], ["cross-hatch", "Cross-hatch"], ["solid", "Solid"], ["zigzag", "Zigzag"]];
  if (key === "textAlign") return [["left", "Left"], ["center", "Center"], ["right", "Right"]];
  if (key === "verticalAlign") return [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]];
  return null;
};

const collectLeafPaths = (value, path = []) => {
  if (value === null || typeof value !== "object") return [path];
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.flatMap(([key, item]) => collectLeafPaths(item, [...path, key]));
};

const collectLeafEntries = (value, path = []) => {
  if (value === null || typeof value !== "object") return [{ path, value }];
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.flatMap(([key, item]) => collectLeafEntries(item, [...path, key]));
};

const pathMatches = (path, query) => {
  if (!query?.needle) return true;
  const segments = path.map(segment => String(segment).toLowerCase());
  const fullPath = segments.join(".");
  if (query.exactOnly) return segments.includes(query.needle) || fullPath === query.needle;
  return segments.some(segment => segment.includes(query.needle)) || fullPath.includes(query.needle);
};

const leafMatches = (value, path, query) => {
  if (pathMatches(path, query)) return true;
  // A non-field query is also useful for retained imported metadata such as
  // customData.iannixImport.group = "lines". Exact field-name filtering keeps
  // its existing narrow behaviour once a field name is recognised.
  return Boolean(query?.needle && !query.exactOnly && String(value ?? "").toLowerCase().includes(query.needle));
};

const nodeMatches = (value, path, query) => {
  if (value === null || typeof value !== "object") return leafMatches(value, path, query);
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  return entries.some(([key, item]) => nodeMatches(item, [...path, key], query));
};

const EditableValue = ({ value, path, onChange, mediaSources = [] }) => {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => value == null ? "" : String(value));
  useEffect(() => {
    if (typeof document === "undefined" || document.activeElement !== inputRef.current) {
      setDraft(value == null ? "" : String(value));
    }
  }, [value]);
  const sourceOptions = pathKey(path).endsWith(".sourceId")
    ? [["", "Choose input…"], ...mediaSources.map(source => [source.id, source.name])]
    : null;
  const enumOptions = enumOptionsForPath(path) || sourceOptions;
  if (enumOptions) return (
    <select value={value ?? ""} onChange={event => {
      const option = enumOptions.find(([candidate]) => String(candidate ?? "") === event.target.value);
      if (option) onChange(option[0]);
    }}>
      {enumOptions.map(([optionValue, label]) => <option key={String(optionValue ?? "none")} value={optionValue ?? ""}>{label}</option>)}
    </select>
  );
  if (typeof value === "boolean") return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
  if (typeof value === "number") return <NumericInput value={value} defaultValue={value} onCommit={onChange} />;
  if (typeof value === "string") return <input ref={inputRef} type="text" value={draft} onChange={event => {
    const next = event.target.value;
    setDraft(next);
    if (next !== value) onChange(next);
  }} />;
  return <code>{primitiveText(value)}</code>;
};

const PropertyNode = ({ name, value, depth = 0, path = [], query, onChange, isSharedPath, mediaSources, pinnedKeys, onTogglePin, showPin = true, ownerElement, onPickObjectReference }) => {
  const roundness = path.at(-1) === "roundness" && supportsRoundness(ownerElement);
  if (roundness) {
    const key = pathKey(path);
    return <div className="properties-row editable"><span>{name}</span><div className="properties-row-value"><select value={value?.type === 2 ? "round" : "sharp"} onChange={event => onChange(path, event.target.value === "round" ? { type: 2 } : null, isSharedPath?.(path))} aria-label="Roundness"><option value="sharp">Sharp</option><option value="round">Round</option></select>{showPin && <button type="button" className={`properties-pin ${pinnedKeys?.has(key) ? "pinned" : ""}`} onClick={() => onTogglePin?.(path)} title={pinnedKeys?.has(key) ? "Unpin property" : "Pin property"} aria-label={pinnedKeys?.has(key) ? `Unpin ${key}` : `Pin ${key}`}>★</button>}</div></div>;
  }
  const nested = value !== null && typeof value === "object";
  if (!nested) {
    if (!leafMatches(value, path, query)) return null;
    const editable = canEditPath(path, ownerElement) && (Boolean(enumOptionsForPath(path)) || ["boolean", "number", "string"].includes(typeof value));
    const key = pathKey(path);
    return <div className={`properties-row ${editable ? "editable" : "readonly"}`}><span>{name}</span><div className="properties-row-value">{editable
      ? <EditableValue value={value} path={path} mediaSources={mediaSources} onChange={next => onChange(path, next, isSharedPath?.(path))} />
      : <code>{primitiveText(value)}</code>}{isObjectReferencePath(path) && <button type="button" className="properties-object-picker" onClick={() => onPickObjectReference?.(path)} title="Pick a canvas object" aria-label={`Pick ${key}`}>⌖</button>}{editable && showPin && <button type="button" className={`properties-pin ${pinnedKeys?.has(key) ? "pinned" : ""}`} onClick={() => onTogglePin?.(path)} title={pinnedKeys?.has(key) ? "Unpin property" : "Pin property"} aria-label={pinnedKeys?.has(key) ? `Unpin ${key}` : `Pin ${key}`}>★</button>}</div></div>;
  }
  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  const visibleEntries = query?.needle
    ? entries.filter(([key, item]) => nodeMatches(item, [...path, key], query))
    : entries;
  if (!visibleEntries.length) return null;
  return (
    <details className="properties-group" open={query?.needle ? true : depth < 1}>
      <summary><span>{name}</span><small>{Array.isArray(value) ? `[${visibleEntries.length}]` : `{${visibleEntries.length}}`}</small></summary>
      <div className="properties-children">
        {visibleEntries.map(([key, item]) => <PropertyNode key={key} name={String(key)} value={item} depth={depth + 1} path={[...path, key]} query={query} onChange={onChange} isSharedPath={isSharedPath} mediaSources={mediaSources} pinnedKeys={pinnedKeys} onTogglePin={onTogglePin} showPin={showPin} ownerElement={ownerElement} onPickObjectReference={onPickObjectReference} />)}
      </div>
    </details>
  );
};

const EmbedControls = ({ element, query, onChange }) => {
  if (element?.type !== "embeddable" || isP5FrameElement(element)) return null;
  const policy = embedPolicyForElement(element);
  const matches = name => !query?.needle || ["embed", "link", "url", "provider", "enabled", "display", "interaction", "crop", "css", "reload", name].some(value => value.includes(query.needle));
  if (query?.needle && !matches("embed")) return null;
  const preventCanvasDeletion = event => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.stopPropagation();
    // Excalidraw also has native document-level keyboard listeners. Stopping
    // the underlying event prevents its canvas delete shortcut from seeing
    // keystrokes intended to edit this URL.
    event.nativeEvent?.stopImmediatePropagation?.();
  };
  return (
    <details className="properties-group properties-embed-group" open>
      <summary><span>embed</span><small>{getEmbedProvider(element.link)}</small></summary>
      <div className="properties-children">
        {matches("link") && <div className="properties-row editable"><span>url</span><input className="properties-embed-url" type="url" value={element.link || ""} onKeyDown={preventCanvasDeletion} onKeyUp={preventCanvasDeletion} onChange={event => onChange(["link"], event.target.value)} /></div>}
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>content</span><button type="button" className="iannix-flat-button" onClick={() => onChange(["customData", "underscoreEmbed", "reloadNonce"], Date.now())}>Reload embed</button></div>}
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={policy.enabled} onChange={event => onChange(["customData", "underscoreEmbed", "enabled"], event.target.checked)} /></div>}
        {matches("display") && <div className="properties-row editable"><span>display</span><select value={policy.display} onChange={event => onChange(["customData", "underscoreEmbed", "display"], event.target.value)}>{EMBED_DISPLAY_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={policy.allowInteraction} onChange={event => onChange(["customData", "underscoreEmbed", "allowInteraction"], event.target.checked)} /></div>}
        {matches("crop") && [["cropTop", "crop top"], ["cropRight", "crop right"], ["cropBottom", "crop bottom"], ["cropLeft", "crop left"]].map(([key, label]) => <div className="properties-row editable" key={key}><span>{label} px</span><NumericInput min="0" step="1" value={policy[key]} defaultValue={0} onCommit={value => onChange(["customData", "underscoreEmbed", key], value)} /></div>)}
        {matches("css") && <div className="properties-row properties-embed-css editable"><span>inject CSS</span><textarea value={policy.css} onChange={event => onChange(["customData", "underscoreEmbed", "css"], event.target.value)} placeholder="body { margin: 0; }" /></div>}
        {!query?.needle && <p className="properties-embed-note">HTTP(S) only. “Presentation only” embeds appear when Live presentation mode is enabled. Interact passes mouse input to the page; turn it off to select or transform the embed. Crop hides fixed page chrome. CSS is injected only into same-origin embeds—browser security prevents it for external sites such as p5.js.</p>}
      </div>
    </details>
  );
};

const P5FrameControls = ({ element, query, onChange }) => {
  if (!isP5FrameElement(element)) return null;
  const frame = normalizeP5Frame(element.customData?.underscoreP5);
  const matches = name => !query?.needle || ["p5", "sketch", "mode", "classic", "global", "runtime", "cdn", "autoplay", "fps", "transparent", "interaction", "reload", "source", name]
    .some(value => value.includes(query.needle));
  if (query?.needle && !matches("p5")) return null;
  const stopCanvasKeys = event => {
    event.stopPropagation();
    if (["Delete", "Backspace", "Escape"].includes(event.key)) event.nativeEvent?.stopImmediatePropagation?.();
  };
  const update = patch => onChange(["customData", "underscoreP5"], normalizeP5Frame({ ...frame, ...patch }));
  return (
    <details className="properties-group properties-p5-group" open>
      <summary><span>p5 sketch</span><small>{resolveP5SourceMode(frame)} · {frame.runtime}</small></summary>
      <div className="properties-children">
        {matches("mode") && <div className="properties-row editable"><span>source mode</span><select value={frame.mode} onChange={event => update({ mode: event.target.value })}><option value="auto">Auto detect</option><option value="instance">Instance mode (p.*)</option><option value="global">Classic global mode</option></select></div>}
        {matches("runtime") && <div className="properties-row editable"><span>runtime</span><select value={frame.runtime} onChange={event => update({ runtime: event.target.value })}><option value="bundled">Bundled p5</option><option value="cdn">CDN URL</option></select></div>}
        {frame.runtime === "cdn" && matches("cdn") && <div className="properties-row editable"><span>cdn url</span><input type="url" value={frame.cdnUrl || DEFAULT_P5_CDN_URL} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ cdnUrl: event.target.value })} /></div>}
        {matches("autoplay") && <div className="properties-row editable"><span>autoplay</span><input type="checkbox" checked={frame.autoplay} onChange={event => update({ autoplay: event.target.checked })} /></div>}
        {matches("fps") && <div className="properties-row editable"><span>fps</span><NumericInput min="1" max="120" step="1" value={frame.fps} defaultValue={30} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onCommit={fps => update({ fps })} /></div>}
        {matches("transparent") && <div className="properties-row editable"><span>transparent</span><input type="checkbox" checked={frame.transparent} onChange={event => update({ transparent: event.target.checked })} /></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={frame.allowInteraction} onChange={event => update({ allowInteraction: event.target.checked })} /></div>}
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>preview</span><button type="button" className="iannix-flat-button" onClick={() => update({ reloadNonce: Date.now() })}>Reload sketch</button></div>}
        {matches("source") && <div className="properties-row properties-p5-source editable"><span>source</span><textarea value={frame.source} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ source: event.target.value })} spellCheck="false" /></div>}
        {!query?.needle && <p className="properties-p5-note">Trusted local code: this sketch runs directly in Underscore with full page access. Use only scripts you trust. Bundled p5 is included with Underscore; CDN mode loads a compatible runtime from the URL above.</p>}
      </div>
    </details>
  );
};

const FRAME_HIDDEN_LABEL = "\u200B";

const normalizeFramePresentation = element => {
  const value = element?.customData?.underscoreFrame || {};
  return {
    label: typeof value.label === "string"
      ? value.label
      : (typeof element?.name === "string" && element.name !== FRAME_HIDDEN_LABEL ? element.name : ""),
    showLabel: value.showLabel === true,
  };
};

const FrameControls = ({ element, query, onChange }) => {
  const isFrame = element?.type === "frame";
  const presentation = normalizeFramePresentation(element);
  const hasFramePresentation = Boolean(element?.customData?.underscoreFrame);
  // Native Excalidraw frames predate the Underscore presentation data. Adopt
  // a selected legacy frame once, with the new label-hidden default.
  useEffect(() => {
    if (!isFrame || hasFramePresentation) return;
    onChange(["customData", "underscoreFrame"], presentation);
  }, [isFrame, hasFramePresentation, onChange, presentation]);
  if (!isFrame) return null;
  const matches = name => !query?.needle || ["frame", "label", "name", "title", "show label", name]
    .some(value => value.includes(query.needle));
  if (query?.needle && !matches("frame")) return null;
  const update = patch => onChange(["customData", "underscoreFrame"], { ...presentation, ...patch });
  return (
    <details className="properties-group properties-frame-group" open>
      <summary><span>customData · frame</span><small>pinned</small></summary>
      <div className="properties-children">
        {matches("label") && <div className="properties-row editable"><span>label</span><input
          type="text"
          value={presentation.label}
          placeholder="Frame label"
          onChange={event => update({ label: event.target.value })}
          title="The frame label. It remains stored while hidden."
        /></div>}
        {matches("show label") && <div className="properties-row editable"><span>show label</span><input
          type="checkbox"
          checked={presentation.showLabel}
          onChange={event => update({ showLabel: event.target.checked })}
          title="Hide the native frame label without changing frame grouping."
        /></div>}
      </div>
    </details>
  );
};

const MediaPreviewControls = ({ element, query, onChange, mediaSources = [], onFocusMediaSource }) => {
  if (!isMediaStreamElement(element)) return null;
  const stream = normalizeMediaStreamConfig(element.customData?.underscoreMediaStream);
  if (stream.kind !== MEDIA_STREAM_KINDS.PREVIEW) return null;
  const matches = name => !query?.needle || ["preview", "media", "source", "input", "enabled", "mirror", name]
    .some(value => value.includes(query.needle));
  if (query?.needle && !matches("preview")) return null;
  const update = patch => onChange(["customData", "underscoreMediaStream"], patchMediaStreamConfig(stream, patch));
  return (
    <details className="properties-group properties-media-preview-group" open>
      <summary><span>customData · preview</span><small>pinned</small></summary>
      <div className="properties-children">
        {matches("source") && <div className="properties-row editable properties-media-preview-source">
          <span>source</span>
          <div>
            <select value={stream.sourceId || ""} onChange={event => {
              const next = mediaSources.find(candidate => candidate.id === event.target.value);
              update({ sourceId: event.target.value, ...(next ? { name: next.name } : {}) });
            }} aria-label="Preview input source">
              <option value="">Choose input…</option>
              {mediaSources.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
            <button type="button" className="iannix-flat-button" disabled={!stream.sourceId} onClick={() => onFocusMediaSource?.(stream.sourceId)} title="Open this input in Media Input" aria-label="Open preview input">⌖</button>
          </div>
        </div>}
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={stream.enabled} onChange={event => update({ enabled: event.target.checked })} /></div>}
        {matches("mirror") && <div className="properties-row editable"><span>mirror</span><input type="checkbox" checked={stream.mirror} onChange={event => update({ mirror: event.target.checked })} /></div>}
      </div>
    </details>
  );
};

const PinnedPropertyControls = ({ element, query, onChange, mediaSources, pinnedPaths, pinnedKeys, onTogglePin, onPickObjectReference }) => {
  const defaults = defaultPinnedPathsFor(element);
  const isPreview = isMediaStreamElement(element)
    && normalizeMediaStreamConfig(element.customData?.underscoreMediaStream).kind === MEDIA_STREAM_KINDS.PREVIEW;
  const isFrame = element?.type === "frame";
  const paths = [...defaults, ...pinnedPaths.map(key => key.split("."))]
    .filter(path => !isPreview || !pathKey(path).startsWith("customData.underscoreMediaStream."))
    .filter(path => !isFrame || !pathKey(path).startsWith("customData.underscoreFrame."))
    .filter((path, index, values) => values.findIndex(candidate => pathKey(candidate) === pathKey(path)) === index)
    .filter(path => readPath(propertyTreeValue(element), path) !== undefined)
    .filter(path => !query?.needle || pathMatches(path, query));
  if (!paths.length) return null;
  return <details className="properties-group properties-pinned-group" open>
    <summary><span>pinned properties</span><small>{paths.length}</small></summary>
    <div className="properties-children">
      {paths.map(path => <PropertyNode
        key={pathKey(path)}
        name={path.at(-1)}
        value={readPath(propertyTreeValue(element), path)}
        path={path}
        query={query}
        onChange={onChange}
        mediaSources={mediaSources}
        pinnedKeys={pinnedKeys}
        onTogglePin={onTogglePin}
        showPin
        ownerElement={element}
        onPickObjectReference={onPickObjectReference}
      />)}
    </div>
  </details>;
};

const SvgObjectControls = ({
  element,
  query,
  onChange,
  selectedSvgNode,
  onSelectSvgNode,
  onExtractSvgSubpath,
  onAssignSvgNodeRole,
  onBindSvgNodeCurve,
  svgCurveOptions = [],
  onToggleSvgPathClosed,
  onReverseSvgPath,
  onTransformSvgPath,
  onInsertSvgAnchor,
  onDeleteSvgAnchor,
  svgPathSelectedAnchor = null,
  svgJointConnectionCount = 0,
  svgJointDetachArmed = false,
  onDetachSvgJoint,
}) => {
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newAttributeValue, setNewAttributeValue] = useState("");
  if (!isSvgObjectElement(element)) return null;
  const svg = normalizeSvgObject(element.customData.underscoreSvg);
  const analysis = analyzeSvgSource(svg.source);
  const timingGraph = buildSvgTimingGraph(svg.source);
  const pathsByNodeIndex = new Map(getEditableSvgPathNodes(svg.source).map(path => [path.node.index, path]));
  const selectedNodeIndex = selectedSvgNode?.elementId === element.id ? selectedSvgNode.nodeIndex : 0;
  const selectedSubpathIndex = selectedSvgNode?.elementId === element.id && Number.isInteger(selectedSvgNode?.subpathIndex)
    ? selectedSvgNode.subpathIndex
    : null;
  const selectedNode = analysis.nodes[selectedNodeIndex] || analysis.nodes[0] || null;
  const selectedStyleCascade = selectedNode
    ? getSvgNodeStyleCascade(svg.source, selectedNodeIndex)
    : null;
  const selectedSubpath = Number.isInteger(selectedSubpathIndex)
    ? pathsByNodeIndex.get(selectedNodeIndex)?.subpaths?.find(subpath => subpath.index === selectedSubpathIndex)
    : null;
  const selectedNodeData = selectedNode?.underscoreId
    ? svg.metadataMirror?.nodes?.[selectedNode.underscoreId] || {}
    : {};
  const matches = name => !query?.needle || [
    "svg", "document", "name", "width", "height", "viewbox", "geometry", "element", "attribute",
    name,
    ...analysis.nodes.flatMap(node => [node.tag, node.id, node.label, ...Object.keys(node.attributes), ...Object.values(node.attributes)]),
  ].some(value => String(value || "").toLowerCase().includes(query.needle));
  if (query?.needle && !matches("svg")) return null;
  const stopCanvasKeys = event => {
    event.stopPropagation();
    if (["Delete", "Backspace", "Escape"].includes(event.key)) event.nativeEvent?.stopImmediatePropagation?.();
  };
  const update = patch => onChange(
    ["customData", "underscoreSvg"],
    normalizeSvgObject({ ...svg, ...patch, revision: svg.revision + 1 }),
  );
  const updateSource = source => update({ source });
  const patchNodeAttribute = (attribute, value) => {
    updateSource(updateStructuredSvgNodeAttribute(svg.source, selectedNodeIndex, attribute, value));
  };
  const patchLooomVariable = (nodeIndex, property, value) => {
    const node = analysis.nodes[nodeIndex];
    const style = String(node?.attributes?.style || "");
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`(^|;)\\s*${escaped}\\s*:[^;]*`);
    const declaration = `${property}:${value}`;
    const nextStyle = expression.test(style)
      ? style.replace(expression, (match, prefix) => `${prefix}${declaration}`)
      : `${style}${style.trim() && !style.trim().endsWith(";") ? ";" : ""}${declaration}`;
    updateSource(updateStructuredSvgNodeAttribute(svg.source, nodeIndex, "style", nextStyle));
  };
  const addAttribute = () => {
    const attribute = newAttributeName.trim();
    if (!attribute || !selectedNode) return;
    patchNodeAttribute(attribute, newAttributeValue);
    setNewAttributeName("");
    setNewAttributeValue("");
  };
  return (
    <details className="properties-group properties-svg-group" open>
      <summary><span>SVG document</span><small>{analysis.nodeCount} nodes</small></summary>
      <div className="properties-children">
        {matches("name") && <div className="properties-row editable"><span>name</span><input type="text" value={svg.name} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ name: event.target.value })} /></div>}
        {matches("width") && <div className="properties-row editable"><span>width</span><NumericInput min="1" max="16384" value={analysis.width} defaultValue={1} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onCommit={width => updateSource(updateStructuredSvgRootDocument(svg.source, { width }))} /></div>}
        {matches("height") && <div className="properties-row editable"><span>height</span><NumericInput min="1" max="16384" value={analysis.height} defaultValue={1} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onCommit={height => updateSource(updateStructuredSvgRootDocument(svg.source, { height }))} /></div>}
        {matches("viewbox") && <div className="properties-row editable"><span>viewBox</span><input type="text" value={analysis.viewBox.join(" ")} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgRootDocument(svg.source, { viewBox: event.target.value }))} /></div>}
        {matches("animation") && <details className="properties-svg-editor-section" open={timingGraph.lanes.length > 0}>
          <summary><span>Animation</span><small>{timingGraph.lanes.length} lanes</small></summary>
          <div className="properties-children">
            <div className="properties-row editable">
              <span>clock</span>
              <select
                value={svg.runtime.clock}
                onKeyDown={stopCanvasKeys}
                onChange={event => update({ runtime: { ...svg.runtime, clock: event.target.value } })}
              >
                <option value="transport">Underscore transport</option>
                <option value="free">Free run</option>
              </select>
            </div>
            {timingGraph.lanes.map(lane => <div
              className={`properties-svg-animation-lane kind-${lane.kind}`}
              key={lane.id}
              title={`${lane.kind.toUpperCase()} · ${lane.property || lane.name || "animation"}`}
            >
              <button type="button" onClick={() => Number.isInteger(lane.animationNodeIndex) && onSelectSvgNode?.(element.id, lane.animationNodeIndex)}>
                <span>{lane.kind}</span>
                <strong>{lane.property || lane.name || "animation"}</strong>
                <small>{Number.isFinite(lane.duration) ? `${lane.duration.toFixed(3).replace(/\.?0+$/, "")} s` : "∞"}</small>
              </button>
              {lane.kind === "smil" && Number.isInteger(lane.animationNodeIndex) && <div className="properties-svg-animation-fields">
                <label><span>begin</span><input aria-label="SVG animation begin" value={analysis.nodes[lane.animationNodeIndex]?.attributes?.begin || "0s"} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgNodeAttribute(svg.source, lane.animationNodeIndex, "begin", event.target.value))} /></label>
                <label><span>duration</span><input aria-label="SVG animation duration" value={analysis.nodes[lane.animationNodeIndex]?.attributes?.dur || ""} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgNodeAttribute(svg.source, lane.animationNodeIndex, "dur", event.target.value))} /></label>
                <label><span>repeat</span><input aria-label="SVG animation repeat count" value={analysis.nodes[lane.animationNodeIndex]?.attributes?.repeatCount || "1"} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgNodeAttribute(svg.source, lane.animationNodeIndex, "repeatCount", event.target.value))} /></label>
              </div>}
              {lane.kind === "css" && Number.isInteger(lane.styleNodeIndex) && <div className="properties-svg-animation-fields">
                <label><span>duration</span><input aria-label="CSS animation duration" value={`${lane.duration}s`} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgStyleDeclaration(svg.source, lane.styleNodeIndex, lane.selector, "animation-duration", event.target.value))} /></label>
                <label><span>delay</span><input aria-label="CSS animation delay" value={`${lane.begin}s`} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgStyleDeclaration(svg.source, lane.styleNodeIndex, lane.selector, "animation-delay", event.target.value))} /></label>
                <label><span>repeat</span><input aria-label="CSS animation iteration count" value={lane.repeatCount} onKeyDown={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgStyleDeclaration(svg.source, lane.styleNodeIndex, lane.selector, "animation-iteration-count", event.target.value))} /></label>
              </div>}
              {lane.kind === "looom" && Number.isInteger(lane.nodeIndex) && <div className="properties-svg-animation-fields">
                <label><span>fps</span><NumericInput min="0.001" step="1" aria-label="Looom thread speed" value={lane.speed} defaultValue={1} onKeyDown={stopCanvasKeys} onCommit={value => patchLooomVariable(lane.nodeIndex, "--speed", value)} /></label>
                <label><span>offset</span><NumericInput step="1" aria-label="Looom thread offset" value={Math.round(lane.begin * lane.speed)} defaultValue={0} onKeyDown={stopCanvasKeys} onCommit={value => patchLooomVariable(lane.nodeIndex, "--timeOffset", value)} /></label>
                <label><span>play mode</span><NumericInput step="1" aria-label="Looom thread play mode" value={lane.playMode} defaultValue={0} onKeyDown={stopCanvasKeys} onCommit={value => patchLooomVariable(lane.nodeIndex, "--playMode", value)} /></label>
              </div>}
            </div>)}
            {analysis.hasScript && <>
              <label className="properties-row editable">
                <span>trusted scripts</span>
                <input
                  type="checkbox"
                  checked={svg.runtime.trustedScripts}
                  onChange={event => {
                    const trustedScripts = event.target.checked
                      ? window.confirm("Run this SVG’s embedded scripts in an isolated sandbox? Network access remains blocked.")
                      : false;
                    update({ runtime: { ...svg.runtime, trustedScripts } });
                  }}
                />
              </label>
              {svg.runtime.trustedScripts && <label className="properties-row editable">
                <span>network</span>
                <input
                  type="checkbox"
                  checked={svg.runtime.allowNetwork}
                  onChange={event => update({ runtime: { ...svg.runtime, allowNetwork: event.target.checked } })}
                />
              </label>}
              <p className="properties-p5-note">{svg.runtime.trustedScripts
                ? "Scripts run in a sandboxed, cross-origin iframe. They cannot access Underscore or mutate canonical source; only the limited cue/log/MIDI bridge is exposed."
                : "Embedded scripts are preserved but inert until explicitly trusted."}</p>
            </>}
          </div>
        </details>}
        {matches("geometry") && <div className="properties-svg-tree" role="tree" aria-label="SVG geometry">
          {analysis.nodes.map(node => {
            const path = pathsByNodeIndex.get(node.index);
            const subpaths = path?.subpaths || [];
            const hasSubpathChildren = subpaths.length > 1;
            const nodeIsSelected = selectedNodeIndex === node.index
              && (!Number.isInteger(selectedSubpathIndex) || !hasSubpathChildren);
            return (
              <div className="properties-svg-node-group" key={`${node.index}-${node.label}`}>
                <button
                  type="button"
                  role="treeitem"
                  aria-expanded={hasSubpathChildren ? true : undefined}
                  aria-selected={nodeIsSelected}
                  className={nodeIsSelected ? "selected" : ""}
                  style={{ "--svg-node-depth": node.depth }}
                  onClick={() => onSelectSvgNode?.(element.id, node.index, subpaths.length === 1 ? 0 : null)}
                  title={node.tag.toLowerCase() === "path"
                    ? `${node.label} · ${hasSubpathChildren ? `${subpaths.length} subpaths` : "select and edit on canvas"}`
                    : `${node.label} · select SVG component`}
                >
                  <span className={`properties-svg-node-icon tag-${node.tag.toLowerCase()}`} />
                  <span>{node.label}{hasSubpathChildren ? ` · ${subpaths.length}` : ""}</span>
                </button>
                {hasSubpathChildren && <div role="group" aria-label={`${node.label} subpaths`}>
                  {subpaths.map(subpath => {
                    const isSelected = selectedNodeIndex === node.index && selectedSubpathIndex === subpath.index;
                    return <button
                      type="button"
                      role="treeitem"
                      aria-selected={isSelected}
                      className={`properties-svg-subpath ${isSelected ? "selected" : ""} ${subpath.valid ? "" : "invalid"}`}
                      style={{ "--svg-node-depth": node.depth + 1 }}
                      key={`${node.index}-${subpath.index}`}
                      onClick={() => onSelectSvgNode?.(element.id, node.index, subpath.index)}
                      title={subpath.valid ? `Edit subpath ${subpath.index + 1} on canvas` : subpath.error}
                    >
                      <span className="properties-svg-subpath-branch">↳</span>
                      <span>Subpath {subpath.index + 1}</span>
                    </button>;
                  })}
                </div>}
              </div>
            );
          })}
        </div>}
        {selectedSubpath?.valid && matches("geometry") && <div className="properties-svg-subpath-actions" aria-label="Selected SVG subpath actions">
          {svgJointConnectionCount > 1 && <button
            type="button"
            className={svgJointDetachArmed ? "active" : ""}
            onClick={() => onDetachSvgJoint?.()}
            title="By default, coincident subpath endpoints move as one joint. Detach arms this endpoint to move independently on its next drag."
          >{svgJointDetachArmed ? "Drag to detach" : `Detach joint · ${svgJointConnectionCount}`}</button>}
          <button type="button" onClick={() => onToggleSvgPathClosed?.()}>{selectedSubpath.geometry.closed ? "Open path" : "Close path"}</button>
          <button type="button" onClick={() => onReverseSvgPath?.()}>Reverse path</button>
          <button type="button" onClick={() => onTransformSvgPath?.("simplify")} title="Reduce the selected path to the fewest straight anchors within a small tolerance.">Simplify</button>
          <button type="button" onClick={() => onTransformSvgPath?.("resample")} title="Redistribute the existing number of anchors evenly along the selected path.">Resample</button>
          <button type="button" onClick={() => onTransformSvgPath?.("straighten")} title="Remove Bézier handles and retain the selected anchor positions.">Straighten</button>
          <button type="button" onClick={() => onTransformSvgPath?.("smooth")} title="Create smooth cubic handles through the selected anchors.">Smooth</button>
          <button type="button" onClick={() => onTransformSvgPath?.("relax")} title="Gently average interior anchors and shorten Bézier handles. Repeat to progressively reduce curvature.">Relax</button>
          <button type="button" onClick={() => onTransformSvgPath?.("round-integers")} title="Round anchors and handle positions to whole SVG coordinates.">Round 1</button>
          <button type="button" onClick={() => onTransformSvgPath?.("round-tenths")} title="Round anchors and handle positions to one decimal place.">Round 0.1</button>
          <button
            type="button"
            disabled={!Number.isInteger(svgPathSelectedAnchor)}
            onClick={() => onInsertSvgAnchor?.()}
            title="Insert a point halfway along the segment after the selected point. Double-clicking a segment inserts at the clicked position."
          >Insert point</button>
          <button
            type="button"
            disabled={!Number.isInteger(svgPathSelectedAnchor) || selectedSubpath.geometry.anchors.length <= 2}
            onClick={() => onDeleteSvgAnchor?.()}
            title="Remove the selected point while preserving the path. Delete or Backspace uses the same action."
          >Remove point</button>
          <button type="button" onClick={() => onExtractSvgSubpath?.(element.id, selectedNodeIndex, selectedSubpathIndex)}>Extract spline</button>
          <button type="button" onClick={() => onAssignSvgNodeRole?.(element.id, selectedNodeIndex, selectedSubpathIndex, "curve")}>Assign curve</button>
          <button type="button" onClick={() => onAssignSvgNodeRole?.(element.id, selectedNodeIndex, selectedSubpathIndex, "cursor")}>Assign cursor</button>
          <button type="button" onClick={() => onAssignSvgNodeRole?.(element.id, selectedNodeIndex, selectedSubpathIndex, "trigger")}>Assign trigger</button>
          {selectedNodeData.iannix?.role && <button type="button" onClick={() => onAssignSvgNodeRole?.(element.id, selectedNodeIndex, selectedSubpathIndex, null)}>Clear role · {selectedNodeData.iannix.role}</button>}
          <button type="button" onClick={() => onExtractSvgSubpath?.(element.id, selectedNodeIndex, selectedSubpathIndex, "curve")}>Extract as curve</button>
          <button type="button" onClick={() => onExtractSvgSubpath?.(element.id, selectedNodeIndex, selectedSubpathIndex, "cursor")}>Extract as cursor</button>
          <button type="button" onClick={() => onExtractSvgSubpath?.(element.id, selectedNodeIndex, selectedSubpathIndex, "trigger")}>Extract as trigger</button>
        </div>}
        {selectedNodeData.iannix?.role === "cursor" && matches("curve") && <div className="properties-row editable">
          <span>support curve</span>
          <select
            aria-label="SVG cursor support curve"
            value={selectedNodeData.iannix?.cursor?.curveRef ? JSON.stringify(selectedNodeData.iannix.cursor.curveRef) : ""}
            onKeyDown={stopCanvasKeys}
            onChange={event => onBindSvgNodeCurve?.(
              element.id,
              selectedNodeIndex,
              selectedSubpathIndex,
              event.target.value ? JSON.parse(event.target.value) : null,
            )}
          >
            <option value="">None</option>
            {svgCurveOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>}
        {selectedNode && matches("attribute") && <div className="properties-svg-attributes">
          {Object.entries(selectedNode.attributes).map(([attribute, value]) => <div className="properties-row editable" key={attribute}>
            <span title={attribute}>{attribute}</span>
            <input type="text" value={value} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => patchNodeAttribute(attribute, event.target.value)} />
          </div>)}
          <div className="properties-svg-add-attribute">
            <input type="text" value={newAttributeName} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => setNewAttributeName(event.target.value)} placeholder="attribute" aria-label="New SVG attribute name" />
            <input type="text" value={newAttributeValue} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => setNewAttributeValue(event.target.value)} placeholder="value" aria-label="New SVG attribute value" />
            <button type="button" onClick={addAttribute} disabled={!newAttributeName.trim()}>Add</button>
          </div>
        </div>}
        {selectedNode && selectedStyleCascade?.matchedRules?.length > 0 && matches("style") && <details className="properties-svg-editor-section" open>
          <summary><span>Matched styles</span><small>{selectedStyleCascade.matchedRules.length}</small></summary>
          <div className="properties-children">
            {selectedStyleCascade.matchedRules.map(rule => <div className="properties-svg-style-rule" key={`${rule.styleNodeIndex}-${rule.selector}`}>
              <code>{rule.selector}</code>
              {Object.entries(rule.declarations).map(([property, value]) => <div className="properties-row editable" key={property}>
                <span>{property}</span>
                <input
                  type="text"
                  value={value}
                  onKeyDown={stopCanvasKeys}
                  onKeyUp={stopCanvasKeys}
                  onChange={event => updateSource(updateStructuredSvgStyleDeclaration(
                    svg.source,
                    rule.styleNodeIndex,
                    rule.selector,
                    property,
                    event.target.value,
                  ))}
                />
              </div>)}
            </div>)}
          </div>
        </details>}
        {!query?.needle && <p className="properties-svg-note">Select a path or subpath for canvas editing. Score roles can live directly on SVG nodes; extraction creates a separate native Underscore spline. Canonical source remains editable from the SVG type in Script.</p>}
      </div>
    </details>
  );
};

const embedMatchesQuery = (element, query) => {
  if (element?.type !== "embeddable") return false;
  if (!query?.needle) return true;
  return ["embed", "link", "url", "provider", "enabled", "display", "interaction", "crop", "css", "reload"]
    .some(value => value.includes(query.needle));
};

const p5MatchesQuery = (element, query) => {
  if (!isP5FrameElement(element)) return false;
  if (!query?.needle) return true;
  return ["p5", "sketch", "mode", "classic", "global", "runtime", "cdn", "autoplay", "fps", "transparent", "interaction", "reload", "source"]
    .some(value => value.includes(query.needle));
};

const svgMatchesQuery = (element, query) => {
  if (!isSvgObjectElement(element)) return false;
  if (!query?.needle) return true;
  const svg = normalizeSvgObject(element.customData.underscoreSvg);
  const analysis = analyzeSvgSource(svg.source);
  return ["svg", "document", "name", "width", "height", "viewbox", "geometry", "element", "attribute", "style", "animation", svg.name,
    ...analysis.nodes.flatMap(node => [node.tag, node.id, node.label, ...Object.keys(node.attributes), ...Object.values(node.attributes)]),
  ].some(value => String(value || "").toLowerCase().includes(query.needle));
};

const propertyTreeValue = element => {
  const customData = getInspectableCustomData(element.customData);
  if (!isSvgObjectElement(element) && element?.type !== "frame") return { ...element, customData };
  if (element?.type !== "frame") return { ...element, customData };
  // A frame's renderer ignores roundness. Omitting the inert field prevents
  // the raw inspector from suggesting a control that has no visual effect.
  const { roundness: _roundness, ...frameValue } = element;
  return { ...frameValue, customData };
};

const physicsBodyMatchesQuery = (body, query) => {
  if (!body || !query?.needle) return Boolean(body);
  return [
    "physics", "body", "enabled", "type", "name", "tags", "sensor", "collider",
    "friction", "bounce", "restitution", "density", "damping", "angular damping", "collision skin", "collision layers", "layers", "object note", "note",
    "trail", "trajectory", "color", "time length", "duration", "opacity",
    body.name, body.bodyType, body.collisionTags.join(" "), body.collider.kind,
  ].some(value => String(value || "").toLowerCase().includes(query.needle));
};

const physicsBodyFieldCount = (body, query) => physicsBodyMatchesQuery(body, query) ? 12 : 0;

const physicsConstraintLabel = kind => ({
  fixate: "Weld",
  axle: "Axle",
  spring: "Spring",
  distance: "Distance",
  pin: "Pin",
  revolute: "Revolute",
  weld: "Weld",
  attractor: "Attractor",
  thruster: "Thruster",
  tracer: "Tracer",
  chain: "Chain",
}[kind] || "Constraint");

const physicsConstraintMatchesQuery = (constraint, query) => {
  if (!constraint) return false;
  if (!query?.needle) return true;
  const label = physicsConstraintLabel(constraint.kind).toLowerCase();
  return [
    "physics", "constraint", "role", "name", "kind", "connect", "endpoint", "enabled",
    "collide", "self collisions", "rest length", "stiffness", "damping", "motor", "speed", "torque", "limit", "lower", "upper", "break",
    "trail", "trajectory", "color", "time length", "duration", "opacity", label,
    constraint.name, constraint.kind,
  ].some(value => String(value || "").toLowerCase().includes(query.needle));
};

const physicsConstraintFieldCount = (constraint, query) => physicsConstraintMatchesQuery(constraint, query)
  ? 13 + (constraint?.kind === "rope" ? 1 : 0)
  : 0;

const constraintEndpointElementId = endpoint => endpoint?.kind === "object" ? endpoint.objectRef?.elementId || "" : "";
const constraintEndpointSelectionValue = endpoint => {
  if (endpoint?.kind === "none") return "none";
  if (endpoint?.kind === "world") return "world";
  if (endpoint?.kind === "rope") return endpoint.constraintId ? `rope:${endpoint.constraintId}` : "";
  return constraintEndpointElementId(endpoint);
};

const PhysicsConstraintControls = ({
  constraint: constraintValue,
  physicsBodies = [],
  physicsConstraints = [],
  availableElements = [],
  collisionLayers = [],
  query,
  onChange,
  onEndpointChange,
  onEndpointPick,
  onRemove,
}) => {
  const constraint = constraintValue ? normalizePhysicsConstraint(constraintValue) : null;
  if (!physicsConstraintMatchesQuery(constraint, query)) return null;
  const matches = name => !query?.needle || name.includes(query.needle) || String(constraint.kind).includes(query.needle);
  const label = physicsConstraintLabel(constraint.kind);
  const isSpring = ["spring", "distance"].includes(constraint.kind);
  const isRope = constraint.kind === "rope";
  const isTracer = constraint.kind === "tracer";
  const isHinge = ["axle", "pin", "revolute"].includes(constraint.kind);
  const supportsTrail = isTracer || isHinge || ["weld", "fixate"].includes(constraint.kind);
  const elementById = new Map(availableElements.map(element => [element.id, element]));
  const bodyEndpointOptions = physicsBodies
    .filter(body => (
      body.systemId === constraint.systemId
      && body.objectRef?.kind === "element"
      && body.objectRef.elementId !== constraint.objectRef?.elementId
    ))
    .map(body => {
      const id = body.objectRef.elementId;
      const element = elementById.get(id);
      const name = getOutlinerElementLabel(element) || id;
      return { key: id, id, kind: "body", label: name };
    });
  const ropeEndpointOptions = physicsConstraints
    .filter(candidate => (
      candidate?.enabled !== false
      && candidate?.kind === "rope"
      && candidate.systemId === constraint.systemId
      && candidate.objectRef?.kind === "element"
      && candidate.objectRef.elementId !== constraint.objectRef?.elementId
      && candidate.pathPoints?.length >= 2
    ))
    .map(candidate => {
      const id = candidate.objectRef.elementId;
      const element = elementById.get(id);
      const name = getOutlinerElementLabel(element) || id;
      return { key: `rope:${candidate.id}`, id, kind: "rope", constraintId: candidate.id, label: name };
    });
  const endpointOptions = [...bodyEndpointOptions, ...ropeEndpointOptions];
  const endpointPicker = side => <button type="button" className="properties-object-picker" onClick={() => onEndpointPick?.(side)} title="Pick connection target from canvas" aria-label={`Pick connection target ${side.toUpperCase()} from canvas`}>⌖</button>;
  const setLimitsEnabled = enabled => onChange(enabled
    ? { limitsEnabled: true, lowerLimit: constraint.lowerLimit ?? -Math.PI, upperLimit: constraint.upperLimit ?? Math.PI }
    : { limitsEnabled: false, lowerLimit: null, upperLimit: null });
  const limitDegrees = radians => Number((radians * 180 / Math.PI).toFixed(2));
  const kindOptions = [
    ["fixate", "Weld"], ["axle", "Axle"], ["spring", "Spring"], ["rope", "Rope"], ["distance", "Distance"],
    ["pin", "Pin"], ["revolute", "Revolute"], ["weld", "Weld"], ["attractor", "Attractor"],
    ["thruster", "Thruster"], ["tracer", "Tracer"], ["chain", "Chain"],
  ];
  const resetSpringRestLength = () => {
    const restLength = getSpringGeometricLength(availableElements.find(element => element.id === constraint.objectRef?.elementId));
    if (restLength === null) return;
    onChange({ restLength });
  };
  return <>
    <details className="properties-group properties-physics-group" open>
      <summary><span>Physics role</span><small>{label}</small></summary>
      <div className="properties-children">
        {matches("role") && <div className="properties-row editable"><span>role</span><select value={constraint.kind} onChange={event => onChange({ kind: event.target.value })}>
          {kindOptions.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
        </select></div>}
      </div>
    </details>
    <details className="properties-group properties-physics-group" open>
      <summary><span>Constraint pivot</span><small>{label} · {constraint.enabled ? "enabled" : "disabled"}</small></summary>
      <div className="properties-children">
        {matches("name") && <div className="properties-row editable"><span>name</span><input type="text" value={constraint.name} onChange={event => onChange({ name: event.target.value })} /></div>}
        {!isRope && matches("connect") && <>
          <div className="properties-row editable"><span>connect A</span><div className="properties-row-action"><select value={constraintEndpointSelectionValue(constraint.a)} onChange={event => onEndpointChange?.("a", event.target.value)}>
            <option value="none">None</option>
            <option value="world">World</option>
            <option value="" disabled>Choose object</option>
            {endpointOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>{endpointPicker("a")}</div></div>
          {!isTracer && <div className="properties-row editable"><span>connect B</span><div className="properties-row-action"><select value={constraintEndpointSelectionValue(constraint.b)} onChange={event => onEndpointChange?.("b", event.target.value)}>
            <option value="none">None</option>
            <option value="world">World</option>
            <option value="" disabled>Choose object</option>
            {endpointOptions.filter(option => option.key !== constraintEndpointSelectionValue(constraint.a)).map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>{endpointPicker("b")}</div></div>}
        </>}
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={constraint.enabled} onChange={event => onChange({ enabled: event.target.checked })} /></div>}
        {isRope && matches("collision layers") && <CollisionLayerMembershipControl layers={collisionLayers} value={constraint.collisionLayers} onChange={layers => onChange({ collisionLayers: layers })} />}
        {isRope && matches("self collisions") && <div className="properties-row editable" {...infoProps("Self collisions", "Allow non-adjacent links in this rope to collide with one another. Leave this off for a lighter, more stable rope; layer-pair settings still control rope-to-body contact.")}><span>self collisions</span><input type="checkbox" checked={constraint.selfCollisions === true} onChange={event => onChange({ selfCollisions: event.target.checked })} /></div>}
        {!isTracer && matches("collide") && <div className="properties-row editable" {...infoProps("Collide while connected", "Controls only colliders joined directly by this pivot. It does not assign collision layers and it does not enable a rope to collide with every other link.")}><span>collide while connected</span><input type="checkbox" checked={constraint.collideConnected} onChange={event => onChange({ collideConnected: event.target.checked })} /></div>}
        {supportsTrail && <PhysicsTrailControls trail={constraint.trail} joint={isHinge || ["weld", "fixate"].includes(constraint.kind)} query={query} onChange={trail => onChange({ trail })} />}
        {isSpring && <>
          {matches("rest length") && <div className="properties-row editable properties-row-with-action"><span>rest length</span><div className="properties-row-action"><NumericInput min="0" step="any" value={constraint.restLength} defaultValue={100} onCommit={restLength => onChange({ restLength })} /><button type="button" className="iannix-flat-button geometry-reset-button" onClick={resetSpringRestLength} title="Set to current geometry" aria-label="Set rest length to current geometry"><GeometryResetIcon /></button></div></div>}
          {matches("stiffness") && <div className="properties-row editable"><span>stiffness</span><NumericInput min="0" step="any" value={constraint.stiffness} defaultValue={40} onCommit={stiffness => onChange({ stiffness })} /></div>}
          {matches("damping") && <div className="properties-row editable"><span>damping</span><NumericInput min="0" step="any" value={constraint.damping} defaultValue={4} onCommit={damping => onChange({ damping })} /></div>}
        </>}
        {isHinge && <>
          {matches("motor") && <div className="properties-row editable"><span>motor enabled</span><input type="checkbox" checked={constraint.motorEnabled === true} onChange={event => onChange({ motorEnabled: event.target.checked })} /></div>}
          {matches("speed") && <div className="properties-row editable"><span>motor speed (°/s)</span><NumericInput step="any" value={constraint.motorSpeed} defaultValue={0} onCommit={motorSpeed => onChange({ motorSpeed })} /></div>}
          {matches("torque") && <div className="properties-row editable"><span>motor torque</span><NumericInput min="0" step="any" value={constraint.motorTorque} defaultValue={10} onCommit={motorTorque => onChange({ motorTorque })} /></div>}
          {matches("limit") && <div className="properties-row editable"><span>limit rotation</span><input type="checkbox" checked={constraint.limitsEnabled === true} onChange={event => setLimitsEnabled(event.target.checked)} /></div>}
          <>
            {matches("lower") && <div className="properties-row editable"><span>lower limit (°)</span><NumericInput step="1" disabled={!constraint.limitsEnabled} value={constraint.lowerLimit === null ? "" : limitDegrees(constraint.lowerLimit)} emptyValue={null} onCommit={lowerLimit => onChange({ limitsEnabled: true, lowerLimit: lowerLimit === null ? null : lowerLimit * Math.PI / 180 })} /></div>}
            {matches("upper") && <div className="properties-row editable"><span>upper limit (°)</span><NumericInput step="1" disabled={!constraint.limitsEnabled} value={constraint.upperLimit === null ? "" : limitDegrees(constraint.upperLimit)} emptyValue={null} onCommit={upperLimit => onChange({ limitsEnabled: true, upperLimit: upperLimit === null ? null : upperLimit * Math.PI / 180 })} /></div>}
          </>
        </>}
        {!isTracer && matches("break") && <div className="properties-row editable"><span>break force</span><NumericInput min="0" step="1" value={constraint.breakForce ?? ""} emptyValue={null} placeholder="unlimited" onCommit={breakForce => onChange({ breakForce })} /></div>}
        <button type="button" className="iannix-flat-button" onClick={() => onRemove?.()}>Remove {label.toLowerCase()}</button>
      </div>
    </details>
  </>;
};

const CollisionLayerMembershipControl = ({ layers = [], value, onChange, label = "belongs to layers" }) => {
  // `null` means an older body that still uses raw Rapier masks. Present it as
  // Default until the user edits it; an explicit empty array means no layers.
  const selected = new Set(Array.isArray(value) ? value : [layers[0]?.id].filter(Boolean));
  if (!layers.length) return null;
  return <div className="properties-row editable properties-collision-layers" {...infoProps("Collision-layer membership", "These checkboxes assign the object to one or more layers. The world matrix controls which layer pairs make contact.")}>
    <span>{label}</span>
    <div className="properties-collision-layer-list" role="group" aria-label={label}>
      {layers.map(layer => <label key={layer.id} title={`Belongs to ${layer.name}`}>
        <input
          type="checkbox"
          checked={selected.has(layer.id)}
          onChange={event => {
            const next = new Set(selected);
            if (event.target.checked) next.add(layer.id);
            else next.delete(layer.id);
            onChange?.([...next]);
          }}
        />
        <span>{layer.name}</span>
      </label>)}
    </div>
  </div>;
};

const PhysicsTrailControls = ({ trail, joint = false, query, onChange }) => {
  const matches = name => !query?.needle || name.includes(query.needle);
  const value = trail || { enabled: false, color: "#4f8cff", duration: 4, opacity: 0.75 };
  const patch = next => onChange?.({ ...value, ...next });
  const color = /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : "#4f8cff";
  return <>
    {(matches("trail") || matches("trajectory")) && <div className="properties-row editable" {...infoProps(joint ? "Attachment trails" : "Trajectory trail", joint ? "Plot the A and B attachment anchors independently. A stable joint produces one overlapping path; joint drift visibly forks the paths." : "Draw a runtime-only centre-of-mass trajectory. Diagnostic trails are never exported as scene geometry.")}><span>{joint ? "attachment trails (A + B)" : "trail"}</span><input type="checkbox" checked={value.enabled === true} onChange={event => patch({ enabled: event.target.checked })} /></div>}
    {matches("color") && <div className="properties-row editable"><span>trail color</span><input type="color" value={color} onChange={event => patch({ color: event.target.value })} /></div>}
    {(matches("time length") || matches("duration")) && <div className="properties-row editable"><span>time length (s)</span><NumericInput min="0.1" max="120" step="0.25" value={value.duration} defaultValue={4} onCommit={duration => patch({ duration })} /></div>}
    {matches("opacity") && <div className="properties-row editable"><span>trail opacity</span><NumericInput min="0" max="1" step="0.05" value={value.opacity} defaultValue={0.75} onCommit={opacity => patch({ opacity })} /></div>}
  </>;
};

const PhysicsRoleControls = ({ body, element, query, onChange, onColliderKindChange, onRemove, collisionLayers = [] }) => {
  if (!physicsBodyMatchesQuery(body, query)) return null;
  const matches = name => !query?.needle || name.includes(query.needle);
  const supportsColliderChoices = Boolean(element);
  const supportsPathCollider = ["freedraw", "line", "arrow"].includes(element?.type)
    || element?.customData?.underscoreGeometry?.kind === "cubicBezierPath";
  const updateMaterial = patch => onChange({ material: patch });
  const updateCollider = patch => onChange({ collider: patch });
  return (
    <details className="properties-group properties-physics-group" open>
      <summary><span>Physics role</span><small>{body.bodyType}</small></summary>
      <div className="properties-children">
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={body.enabled} onChange={event => onChange({ enabled: event.target.checked })} /></div>}
        {matches("type") && <div className="properties-row editable"><span>body type</span><select value={body.bodyType} onChange={event => onChange({ bodyType: event.target.value })}><option value="dynamic">Dynamic</option><option value="kinematic">Kinematic</option><option value="fixed">Fixed</option></select></div>}
        {matches("sensor") && <div className="properties-row editable"><span>sensor</span><input type="checkbox" checked={body.collider.sensor} onChange={event => updateCollider({ sensor: event.target.checked })} /></div>}
        {matches("name") && <div className="properties-row editable"><span>name</span><input type="text" value={body.name} onChange={event => onChange({ name: event.target.value })} /></div>}
        {matches("tags") && <div className="properties-row editable"><span>tags</span><input type="text" value={body.collisionTags.join(", ")} onChange={event => onChange({ collisionTags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} /></div>}
        {matches("collision layers") && <CollisionLayerMembershipControl layers={collisionLayers} value={body.collisionLayers} onChange={layers => onChange({ collisionLayers: layers })} />}
        {matches("note") && <div className="properties-row editable"><span>object note</span><NumericInput min="0" max="127" step="1" value={body.mappingValues.note} defaultValue={60} onCommit={note => onChange({ mappingValues: { note } })} /></div>}
        {supportsColliderChoices && matches("collider") && <div className="properties-row editable"><span>collider</span><select value={getPhysicsColliderSelectionValue(body.collider, { allowPath: Boolean(supportsPathCollider) })} onChange={event => onColliderKindChange?.(event.target.value)}><option value="box">Bounding box</option><option value="ellipse">Bounding ellipse</option><option value="convex">Convex hull</option>{supportsPathCollider && <option value="chain">Path chain</option>}</select></div>}
        <div className="properties-two-column">
          {matches("friction") && <div className="properties-row editable"><span>friction</span><NumericInput min="0" max="10" step="0.05" value={body.material.friction} defaultValue={0.2} onCommit={friction => updateMaterial({ friction })} /></div>}
          {matches("bounce") && <div className="properties-row editable"><span>bounce</span><NumericInput min="0" max="2" step="0.05" value={body.material.restitution} defaultValue={0.5} onCommit={restitution => updateMaterial({ restitution })} /></div>}
          {matches("density") && <div className="properties-row editable"><span>density</span><NumericInput min="0.01" max="100" step="0.1" value={body.material.density} defaultValue={1} onCommit={density => updateMaterial({ density })} /></div>}
          {matches("damping") && <div className="properties-row editable"><span>damping</span><NumericInput min="0" max="100" step="0.05" value={body.material.linearDamping} defaultValue={0.01} onCommit={linearDamping => updateMaterial({ linearDamping })} /></div>}
        </div>
        {matches("collision skin") && <div className="properties-row editable"><span>collision skin</span><NumericInput min="0" max="64" step="0.5" value={body.collider.contactSkin} defaultValue={0} onCommit={contactSkin => updateCollider({ contactSkin })} /></div>}
        <PhysicsTrailControls trail={body.trail} query={query} onChange={trail => onChange({ trail })} />
        <button type="button" className="iannix-flat-button" onClick={() => onRemove?.()}>Remove physics role</button>
      </div>
    </details>
  );
};

const sharedValue = (bodies, select) => {
  const value = select(bodies[0]);
  return bodies.every(body => Object.is(select(body), value)) ? value : null;
};

const SharedPhysicsControls = ({ elements, physicsBodies, query, onChange, collisionLayers = [] }) => {
  if (elements.length < 2 || !physicsBodyMatchesQuery(physicsBodies[0], query)) return null;
  const matches = name => !query?.needle || name.includes(query.needle);
  const supportsPathCollider = elements.every(element => (
    ["freedraw", "line", "arrow"].includes(element?.type)
    || element?.customData?.underscoreGeometry?.kind === "cubicBezierPath"
  ));
  const colliderValue = sharedValue(physicsBodies, body => getPhysicsColliderSelectionValue(body.collider, {
    allowPath: supportsPathCollider,
  }));
  const bodyType = sharedValue(physicsBodies, body => body.bodyType);
  const enabled = sharedValue(physicsBodies, body => body.enabled);
  const sensor = sharedValue(physicsBodies, body => body.collider.sensor);
  const tags = sharedValue(physicsBodies, body => body.collisionTags.join(", "));
  const note = sharedValue(physicsBodies, body => body.mappingValues.note);
  const friction = sharedValue(physicsBodies, body => body.material.friction);
  const restitution = sharedValue(physicsBodies, body => body.material.restitution);
  const density = sharedValue(physicsBodies, body => body.material.density);
  const damping = sharedValue(physicsBodies, body => body.material.linearDamping);
  const contactSkin = sharedValue(physicsBodies, body => body.collider.contactSkin);
  const commonLayerIds = collisionLayers.filter(layer => physicsBodies.every(body => {
    const memberships = Array.isArray(body.collisionLayers) ? body.collisionLayers : [collisionLayers[0]?.id];
    return memberships.includes(layer.id);
  })).map(layer => layer.id);
  return (
    <details className="properties-group properties-physics-group properties-shared-physics-group" open>
      <summary><span>Shared physics</span><small>{physicsBodies.length} objects</small></summary>
      <div className="properties-children">
        {matches("enabled") && <div className="properties-row editable">
          <span>enabled</span>
          <input type="checkbox" checked={enabled === true} aria-label={`Enabled for ${physicsBodies.length} selected objects`} onChange={event => onChange?.({ enabled: event.target.checked })} />
        </div>}
        {matches("type") && <div className="properties-row editable">
          <span>body type</span>
          <select value={bodyType || "mixed"} aria-label={`Body type for ${physicsBodies.length} selected objects`} onChange={event => onChange?.({ bodyType: event.target.value })}>
            {!bodyType && <option value="mixed" disabled>Mixed body type</option>}
            <option value="dynamic">Dynamic</option>
            <option value="kinematic">Kinematic</option>
            <option value="fixed">Fixed</option>
          </select>
        </div>}
        {matches("sensor") && <div className="properties-row editable">
          <span>sensor</span>
          <input type="checkbox" checked={sensor === true} aria-label={`Sensor for ${physicsBodies.length} selected objects`} onChange={event => onChange?.({ collider: { sensor: event.target.checked } })} />
        </div>}
        {matches("tags") && <div className="properties-row editable">
          <span>tags</span>
          <input type="text" value={tags ?? ""} placeholder={tags === null ? "Mixed tags" : undefined} aria-label={`Tags for ${physicsBodies.length} selected objects`} onChange={event => onChange?.({ collisionTags: event.target.value.split(",").map(value => value.trim()).filter(Boolean) })} />
        </div>}
        {matches("collision layers") && <CollisionLayerMembershipControl layers={collisionLayers} value={commonLayerIds} onChange={layers => onChange?.({ collisionLayers: layers })} />}
        {matches("note") && <div className="properties-row editable">
          <span>object note</span>
          <NumericInput min="0" max="127" step="1" value={note ?? ""} defaultValue={60} placeholder={note === null ? "Mixed" : undefined} aria-label={`Object note for ${physicsBodies.length} selected objects`} onCommit={note => onChange?.({ mappingValues: { note } })} />
        </div>}
        {matches("collider") && <div className="properties-row editable">
          <span>collider</span>
          <select
            value={colliderValue || "mixed"}
            aria-label={`Collider for ${physicsBodies.length} selected objects`}
            onChange={event => onChange?.({ colliderKind: event.target.value })}
          >
            {!colliderValue && <option value="mixed" disabled>Mixed collider</option>}
            <option value="box">Bounding box</option>
            <option value="ellipse">Bounding ellipse</option>
            <option value="convex">Convex hull</option>
            {supportsPathCollider && <option value="chain">Path chain</option>}
          </select>
        </div>}
        <div className="properties-two-column">
          {matches("friction") && <div className="properties-row editable"><span>friction</span><NumericInput min="0" max="10" step="0.05" value={friction ?? ""} defaultValue={0.2} placeholder={friction === null ? "Mixed" : undefined} aria-label={`Friction for ${physicsBodies.length} selected objects`} onCommit={friction => onChange?.({ material: { friction } })} /></div>}
          {matches("bounce") && <div className="properties-row editable"><span>bounce</span><NumericInput min="0" max="2" step="0.05" value={restitution ?? ""} defaultValue={0.5} placeholder={restitution === null ? "Mixed" : undefined} aria-label={`Bounce for ${physicsBodies.length} selected objects`} onCommit={restitution => onChange?.({ material: { restitution } })} /></div>}
          {matches("density") && <div className="properties-row editable"><span>density</span><NumericInput min="0.0001" max="100" step="0.1" value={density ?? ""} defaultValue={1} placeholder={density === null ? "Mixed" : undefined} aria-label={`Density for ${physicsBodies.length} selected objects`} onCommit={density => onChange?.({ material: { density } })} /></div>}
          {matches("damping") && <div className="properties-row editable"><span>damping</span><NumericInput min="0" max="100" step="0.05" value={damping ?? ""} defaultValue={0.01} placeholder={damping === null ? "Mixed" : undefined} aria-label={`Damping for ${physicsBodies.length} selected objects`} onCommit={linearDamping => onChange?.({ material: { linearDamping } })} /></div>}
        </div>
        {matches("collision skin") && <div className="properties-row editable"><span>collision skin</span><NumericInput min="0" max="64" step="0.5" value={contactSkin ?? ""} defaultValue={0} placeholder={contactSkin === null ? "Mixed" : undefined} aria-label={`Collision skin for ${physicsBodies.length} selected objects`} onCommit={contactSkin => onChange?.({ collider: { contactSkin } })} /></div>}
      </div>
    </details>
  );
};

const scoreRoleMatchesQuery = (data, query) => {
  if (!data?.role) return false;
  if (!query?.needle) return true;
  return ["score", "role", "label", "active", data.role]
    .some(name => String(name).toLowerCase().includes(query.needle));
};

const scoreRoleFieldCount = (element, query) => scoreRoleMatchesQuery(getScoreData(element), query) ? 3 : 0;

const ScoreRoleControls = ({ element, query, onChange }) => {
  const data = getScoreData(element);
  if (!data?.role) return null;
  const matches = name => !query?.needle || name.includes(query.needle) || String(data.role).includes(query.needle);
  if (!scoreRoleMatchesQuery(data, query)) return null;
  return (
    <details className="properties-group" open>
      <summary><span>Score role</span><small>{data.role}</small></summary>
      <div className="properties-children">
        <div className="properties-row editable"><span>role</span><select value={data.role} onChange={event => onChange({ role: event.target.value || null })}><option value="">None</option><option value="curve">Curve</option><option value="cursor">Cursor</option><option value="trigger">Trigger</option></select></div>
        {matches("label") && <div className="properties-row editable"><span>label</span><input type="text" value={data.label || ""} onChange={event => onChange({ label: event.target.value })} /></div>}
        {matches("active") && <div className="properties-row editable"><span>active</span><input type="checkbox" checked={data.active !== false} onChange={event => onChange({ active: event.target.checked })} /></div>}
      </div>
    </details>
  );
};

const svgFieldCount = element => {
  if (!isSvgObjectElement(element)) return 0;
  const svg = normalizeSvgObject(element.customData.underscoreSvg);
  const analysis = analyzeSvgSource(svg.source);
  return 4 + analysis.nodeCount + analysis.nodes.reduce((count, node) => count + Object.keys(node.attributes).length, 0);
};

const PropertiesPanel = memo(function PropertiesPanel({
  elements = [],
  availableElements = elements,
  physicsBodies = [],
  physicsCollisionLayers = [],
  physicsConstraints = [],
  onPhysicsBodyChange,
  onPhysicsBodiesChange,
  onPhysicsBodyRemove,
  onPhysicsConstraintChange,
  onPhysicsConstraintRemove,
  onPhysicsConstraintEndpointChange,
  onPhysicsConstraintEndpointPick,
  onScoreChange,
  selectedSvgNode = null,
  onChange,
  onRename,
  onSelectSvgNode,
  onExtractSvgSubpath,
  onAssignSvgNodeRole,
  onBindSvgNodeCurve,
  onToggleSvgPathClosed,
  onReverseSvgPath,
  onTransformSvgPath,
  onInsertSvgAnchor,
  onDeleteSvgAnchor,
  svgPathSelectedAnchor = null,
  svgJointConnectionCount = 0,
  svgJointDetachArmed = false,
  onDetachSvgJoint,
  mediaSources = [],
  onFocusMediaSource,
  onPickObjectReference,
}) {
  const [filter, setFilter] = useState("");
  const [pinnedPaths, setPinnedPaths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PROPERTIES_PINS_STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(value => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [activeObjectId, setActiveObjectId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const editingRef = useRef(null);
  const query = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return { needle: "", exactOnly: false };
    const paths = elements.flatMap(element => collectLeafPaths(propertyTreeValue(element)));
    const exactOnly = paths.some(path => {
      const segments = path.map(segment => String(segment).toLowerCase());
      return segments.includes(needle) || segments.join(".") === needle;
    });
    return { needle, exactOnly };
  }, [elements, filter]);
  const matchingFieldCount = useMemo(() => elements.reduce((count, element) => (
    count
      + collectLeafEntries(propertyTreeValue(element)).filter(entry => leafMatches(entry.value, entry.path, query)).length
      + scoreRoleFieldCount(element, query)
      + physicsBodyFieldCount(physicsBodies.find(body => body.objectRef?.kind === "element" && body.objectRef.elementId === element.id), query)
      + physicsConstraintFieldCount(physicsConstraints.find(constraint => constraint.objectRef?.kind === "element" && constraint.objectRef.elementId === element.id), query)
      + (embedMatchesQuery(element, query) ? 4 : 0)
      + (p5MatchesQuery(element, query) ? 6 : 0)
      + (svgMatchesQuery(element, query) ? svgFieldCount(element) : 0)
  ), 0), [elements, physicsBodies, physicsConstraints, query]);
  const sharedPath = path => isSharedEditablePath(elements, path);
  const selectedPhysicsBodies = useMemo(() => elements.map(element => physicsBodies.find(body => (
    body.objectRef?.kind === "element" && body.objectRef.elementId === element.id
  ))).filter(Boolean), [elements, physicsBodies]);
  // A canvas selection may include objects without a physics role. Shared
  // physics fields still apply to every selected object that does have one.
  const hasSharedPhysics = selectedPhysicsBodies.length >= 2;
  const pinnedKeys = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);
  const togglePinnedPath = path => {
    const key = pathKey(path);
    setPinnedPaths(previous => {
      const next = previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key];
      try { localStorage.setItem(PROPERTIES_PINS_STORAGE_KEY, JSON.stringify(next)); } catch { /* local preference only */ }
      return next;
    });
  };
  const svgCurveOptions = useMemo(() => (availableElements || []).flatMap(element => {
    if (element?.isDeleted) return [];
    if (getScoreData(element)?.role === "curve") {
      return [{
        value: JSON.stringify({ kind: "element", elementId: element.id }),
        label: getScoreData(element).label || element.id,
      }];
    }
    if (!isSvgObjectElement(element)) return [];
    const svg = normalizeSvgObject(element.customData.underscoreSvg);
    const nodes = analyzeSvgSource(svg.source).nodes;
    return Object.entries(svg.metadataMirror?.nodes || {}).flatMap(([nodeId, data]) => {
      const scoreData = data?.score || data?.iannix;
      if (scoreData?.role !== "curve") return [];
      const node = nodes.find(candidate => candidate.underscoreId === nodeId);
      const ref = {
        kind: "svg-node",
        elementId: element.id,
        nodeId,
        ...(data.subpathId !== undefined ? { subpathId: data.subpathId } : {}),
      };
      return [{
        value: JSON.stringify(ref),
        label: scoreData.label || `${getScoreData(element)?.label || svg.name} · ${node?.label || nodeId}`,
      }];
    });
  }), [availableElements]);

  const beginRename = element => {
    setActiveObjectId(element.id);
    setEditingId(element.id);
    setEditingValue(getElementName(element));
    requestAnimationFrame(() => editingRef.current?.focus());
  };

  const finishRename = (element, commit = true) => {
    if (commit) onRename?.(element.id, editingValue.trim());
    setEditingId(null);
  };

  const handleKeyDown = event => {
    if (event.key !== "F2" || editingId) return;
    const element = elements.find(item => item.id === activeObjectId) || elements[0];
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    beginRename(element);
  };

  if (!elements.length) return <div className="scene-panel-empty">Select an object to inspect its properties.</div>;
  return (
    <div className="properties-panel" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="properties-toolbar">
        <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter properties" aria-label="Filter object properties" />
        <span title={`${matchingFieldCount} matching fields`}>{matchingFieldCount}</span>
      </div>
      <div className="properties-list">
        {hasSharedPhysics && (
          <SharedPhysicsControls
            elements={elements}
            physicsBodies={selectedPhysicsBodies}
            collisionLayers={physicsCollisionLayers}
            query={query}
            onChange={patch => onPhysicsBodiesChange?.(
              selectedPhysicsBodies.map(body => body.id),
              patch,
            )}
          />
        )}
        {matchingFieldCount ? elements.map(element => {
          const elementValue = propertyTreeValue(element);
          const elementMatchCount = collectLeafEntries(elementValue).filter(entry => leafMatches(entry.value, entry.path, query)).length
            + scoreRoleFieldCount(element, query)
            + physicsBodyFieldCount(physicsBodies.find(body => body.objectRef?.kind === "element" && body.objectRef.elementId === element.id), query)
            + physicsConstraintFieldCount(physicsConstraints.find(constraint => constraint.objectRef?.kind === "element" && constraint.objectRef.elementId === element.id), query)
            + (embedMatchesQuery(element, query) ? 4 : 0)
            + (p5MatchesQuery(element, query) ? 6 : 0)
            + (svgMatchesQuery(element, query) ? svgFieldCount(element) : 0);
          if (!elementMatchCount) return null;
          const label = getElementName(element);
          return (
            <section className="properties-object" key={element.id} onMouseDown={() => setActiveObjectId(element.id)}>
              <div className="properties-object-heading" onDoubleClick={() => beginRename(element)} title="Double-click or press F2 to rename">
                <span className={`outliner-type type-${isSvgObjectElement(element) ? "svg" : element.type}`}>{isSvgObjectElement(element) ? "S" : element.type.slice(0, 1).toUpperCase()}</span>
                <div className="properties-object-name">
                  {editingId === element.id ? (
                    <input ref={editingRef} className="outliner-label-input" value={editingValue} placeholder={element.id} onChange={event => setEditingValue(event.target.value)} onBlur={() => finishRename(element)} onKeyDown={event => {
                      if (event.key === "Enter") { event.preventDefault(); finishRename(element); }
                      if (event.key === "Escape") { event.preventDefault(); finishRename(element, false); }
                    }} aria-label={`Rename ${element.id}`} />
                  ) : <strong>{label || element.id}</strong>}
                  <code>{element.type}{label ? ` · ${element.id}` : ""}</code>
                </div>
              </div>
              <FrameControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <P5FrameControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <MediaPreviewControls
                element={element}
                query={query}
                onChange={(path, value) => onChange([element.id], path, value)}
                mediaSources={mediaSources}
                onFocusMediaSource={onFocusMediaSource}
              />
              <PinnedPropertyControls
                element={element}
                query={query}
                onChange={(path, value) => onChange([element.id], path, value)}
                mediaSources={mediaSources}
                pinnedPaths={pinnedPaths}
                pinnedKeys={pinnedKeys}
                onTogglePin={togglePinnedPath}
                onPickObjectReference={path => onPickObjectReference?.(element.id, path)}
              />
              <SvgObjectControls
                element={element}
                query={query}
                onChange={(path, value) => onChange([element.id], path, value)}
                selectedSvgNode={selectedSvgNode}
                onSelectSvgNode={onSelectSvgNode}
                onExtractSvgSubpath={onExtractSvgSubpath}
                onAssignSvgNodeRole={onAssignSvgNodeRole}
                onBindSvgNodeCurve={onBindSvgNodeCurve}
                svgCurveOptions={svgCurveOptions}
                onToggleSvgPathClosed={onToggleSvgPathClosed}
                onReverseSvgPath={onReverseSvgPath}
                onTransformSvgPath={onTransformSvgPath}
                onInsertSvgAnchor={onInsertSvgAnchor}
                onDeleteSvgAnchor={onDeleteSvgAnchor}
                svgPathSelectedAnchor={svgPathSelectedAnchor}
                svgJointConnectionCount={svgJointConnectionCount}
                svgJointDetachArmed={svgJointDetachArmed}
                onDetachSvgJoint={onDetachSvgJoint}
              />
              <ScoreRoleControls
                element={element}
                query={query}
                onChange={patch => onScoreChange?.(element.id, patch)}
              />
              <PhysicsRoleControls
                body={physicsBodies.find(body => body.objectRef?.kind === "element" && body.objectRef.elementId === element.id)}
                element={element}
                query={query}
                collisionLayers={physicsCollisionLayers}
                onChange={patch => {
                  const body = physicsBodies.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (!body) return;
                  if (selectedPhysicsBodies.length > 1) onPhysicsBodiesChange?.(selectedPhysicsBodies.map(candidate => candidate.id), patch);
                  else onPhysicsBodyChange?.(body.id, patch);
                }}
                onColliderKindChange={kind => {
                  const body = physicsBodies.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (!body) return;
                  if (selectedPhysicsBodies.length > 1) onPhysicsBodiesChange?.(selectedPhysicsBodies.map(candidate => candidate.id), { colliderKind: kind });
                  else onPhysicsBodyChange?.(body.id, { colliderKind: kind });
                }}
                onRemove={() => {
                  const body = physicsBodies.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (body) onPhysicsBodyRemove?.(body.id);
                }}
              />
              <PhysicsConstraintControls
                constraint={physicsConstraints.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id)}
                physicsBodies={physicsBodies}
                physicsConstraints={physicsConstraints}
                availableElements={availableElements}
                collisionLayers={physicsCollisionLayers}
                query={query}
                onChange={patch => {
                  const constraint = physicsConstraints.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (constraint) onPhysicsConstraintChange?.(constraint.id, patch);
                }}
                onEndpointChange={(side, endpointElementId) => {
                  const constraint = physicsConstraints.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (constraint) onPhysicsConstraintEndpointChange?.(constraint.id, side, endpointElementId);
                }}
                onEndpointPick={(side) => {
                  const constraint = physicsConstraints.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (constraint) onPhysicsConstraintEndpointPick?.(constraint.id, side);
                }}
                onRemove={() => {
                  const constraint = physicsConstraints.find(candidate => candidate.objectRef?.kind === "element" && candidate.objectRef.elementId === element.id);
                  if (constraint) onPhysicsConstraintRemove?.(constraint.id);
                }}
              />
              <EmbedControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <PropertyNode
                name="object"
                value={elementValue}
                query={query}
                isSharedPath={sharedPath}
                mediaSources={mediaSources}
                pinnedKeys={pinnedKeys}
                onTogglePin={togglePinnedPath}
                ownerElement={element}
                onPickObjectReference={path => onPickObjectReference?.(element.id, path)}
                onChange={(path, value, shared) => onChange(shared ? elements.map(item => item.id) : [element.id], path, value)}
              />
            </section>
          );
        }) : <div className="scene-panel-empty compact">No matching properties.</div>}
      </div>
    </div>
  );
});

export default PropertiesPanel;
