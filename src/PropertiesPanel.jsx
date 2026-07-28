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

const READ_ONLY_KEYS = new Set([
  "id", "type", "width", "height", "version", "versionNonce", "updated", "index", "seed",
  "points", "pressures", "originalPoints", "boundElements", "groupIds", "frameId", "containerId",
  "startBinding", "endBinding", "isDeleted", "excalidrawVersion", "lastWidth", "lastHeight",
]);

const primitiveText = value => {
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
};

const canEditPath = path => !path.some(segment => READ_ONLY_KEYS.has(String(segment)));

const readPath = (value, path) => path.reduce((current, segment) => (
  current != null && Object.prototype.hasOwnProperty.call(current, segment) ? current[segment] : undefined
), value);

const isSharedEditablePath = (elements, path) => {
  if (elements.length < 2 || !canEditPath(path)) return false;
  const values = elements.map(element => readPath(element, path));
  if (values.some(value => value === undefined)) return false;
  const types = new Set(values.map(value => typeof value));
  return types.size === 1 && (["boolean", "number", "string"].includes(values[0]) || Boolean(enumOptionsForPath(path)));
};

const enumOptionsForPath = path => {
  const key = String(path.at(-1) || "");
  const joined = path.map(String).join(".");
  if (joined === "customData.iannix.role") return [
    [null, "None"], ["curve", "Curve"], ["cursor", "Cursor"], ["trigger", "Trigger"],
  ];
  if (joined === "customData.iannix.time.loopMode") return [
    ["once", "Once / hold"], ["loop", "Loop"], ["pingPong", "Ping-pong"],
  ];
  if (joined === "customData.iannix.time.startMode") return [["manual", "Manual"], ["curve", "Curve"]];
  if (joined === "customData.iannix.time.durationMode") return [
    ["geometry", "Geometry"], ["manual", "Manual"], ["curve", "Curve"], ["ratio", "Ratio"],
  ];
  if (joined === "customData.iannix.gridBinding.metric") return [
    ["auto", "Auto"], ["xSpan", "X span"], ["ySpan", "Y span"], ["arcLength", "Arc length"], ["manhattan", "Manhattan"],
  ];
  if (joined === "customData.iannix.trigger.behavior") return [["pulse", "Pulse"], ["glissando", "Continuous glissando"]];
  if (joined === "customData.iannix.trigger.midiBaseSource") return [["cursor", "Cursor"], ["curve", "Curve"]];
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

const EditableValue = ({ value, path, onChange }) => {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(() => value == null ? "" : String(value));
  useEffect(() => {
    if (typeof document === "undefined" || document.activeElement !== inputRef.current) {
      setDraft(value == null ? "" : String(value));
    }
  }, [value]);
  const enumOptions = enumOptionsForPath(path);
  if (enumOptions) return (
    <select value={value ?? ""} onChange={event => {
      const option = enumOptions.find(([candidate]) => String(candidate ?? "") === event.target.value);
      if (option) onChange(option[0]);
    }}>
      {enumOptions.map(([optionValue, label]) => <option key={String(optionValue ?? "none")} value={optionValue ?? ""}>{label}</option>)}
    </select>
  );
  if (typeof value === "boolean") return <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />;
  if (typeof value === "number") return <input ref={inputRef} type="number" value={draft} onChange={event => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const next = Number(nextDraft);
    if (nextDraft.trim() && Number.isFinite(next) && next !== value) onChange(next);
  }} onBlur={() => {
    if (!draft.trim() || !Number.isFinite(Number(draft))) setDraft(String(value));
  }} />;
  if (typeof value === "string") return <input ref={inputRef} type="text" value={draft} onChange={event => {
    const next = event.target.value;
    setDraft(next);
    if (next !== value) onChange(next);
  }} />;
  return <code>{primitiveText(value)}</code>;
};

const PropertyNode = ({ name, value, depth = 0, path = [], query, onChange, isSharedPath }) => {
  const nested = value !== null && typeof value === "object";
  if (!nested) {
    if (!leafMatches(value, path, query)) return null;
    const editable = canEditPath(path) && (Boolean(enumOptionsForPath(path)) || ["boolean", "number", "string"].includes(typeof value));
    return <div className={`properties-row ${editable ? "editable" : "readonly"}`}><span>{name}</span>{editable
      ? <EditableValue value={value} path={path} onChange={next => onChange(path, next, isSharedPath?.(path))} />
      : <code>{primitiveText(value)}</code>}</div>;
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
        {visibleEntries.map(([key, item]) => <PropertyNode key={key} name={String(key)} value={item} depth={depth + 1} path={[...path, key]} query={query} onChange={onChange} isSharedPath={isSharedPath} />)}
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
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>content</span><button type="button" className="iannix-flat-button" onClick={() => onChange(["customData", "draweratorEmbed", "reloadNonce"], Date.now())}>Reload embed</button></div>}
        {matches("enabled") && <div className="properties-row editable"><span>enabled</span><input type="checkbox" checked={policy.enabled} onChange={event => onChange(["customData", "draweratorEmbed", "enabled"], event.target.checked)} /></div>}
        {matches("display") && <div className="properties-row editable"><span>display</span><select value={policy.display} onChange={event => onChange(["customData", "draweratorEmbed", "display"], event.target.value)}>{EMBED_DISPLAY_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={policy.allowInteraction} onChange={event => onChange(["customData", "draweratorEmbed", "allowInteraction"], event.target.checked)} /></div>}
        {matches("crop") && [["cropTop", "crop top"], ["cropRight", "crop right"], ["cropBottom", "crop bottom"], ["cropLeft", "crop left"]].map(([key, label]) => <div className="properties-row editable" key={key}><span>{label} px</span><input type="number" min="0" step="1" value={policy[key]} onChange={event => onChange(["customData", "draweratorEmbed", key], Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : 0)} /></div>)}
        {matches("css") && <div className="properties-row properties-embed-css editable"><span>inject CSS</span><textarea value={policy.css} onChange={event => onChange(["customData", "draweratorEmbed", "css"], event.target.value)} placeholder="body { margin: 0; }" /></div>}
        {!query?.needle && <p className="properties-embed-note">HTTP(S) only. “Presentation only” embeds appear when Live presentation mode is enabled. Interact passes mouse input to the page; turn it off to select or transform the embed. Crop hides fixed page chrome. CSS is injected only into same-origin embeds—browser security prevents it for external sites such as p5.js.</p>}
      </div>
    </details>
  );
};

const P5FrameControls = ({ element, query, onChange }) => {
  if (!isP5FrameElement(element)) return null;
  const frame = normalizeP5Frame(element.customData?.draweratorP5);
  const matches = name => !query?.needle || ["p5", "sketch", "mode", "classic", "global", "runtime", "cdn", "autoplay", "fps", "transparent", "interaction", "reload", "source", name]
    .some(value => value.includes(query.needle));
  if (query?.needle && !matches("p5")) return null;
  const stopCanvasKeys = event => {
    event.stopPropagation();
    if (["Delete", "Backspace", "Escape"].includes(event.key)) event.nativeEvent?.stopImmediatePropagation?.();
  };
  const update = patch => onChange(["customData", "draweratorP5"], normalizeP5Frame({ ...frame, ...patch }));
  return (
    <details className="properties-group properties-p5-group" open>
      <summary><span>p5 sketch</span><small>{resolveP5SourceMode(frame)} · {frame.runtime}</small></summary>
      <div className="properties-children">
        {matches("mode") && <div className="properties-row editable"><span>source mode</span><select value={frame.mode} onChange={event => update({ mode: event.target.value })}><option value="auto">Auto detect</option><option value="instance">Instance mode (p.*)</option><option value="global">Classic global mode</option></select></div>}
        {matches("runtime") && <div className="properties-row editable"><span>runtime</span><select value={frame.runtime} onChange={event => update({ runtime: event.target.value })}><option value="bundled">Bundled p5</option><option value="cdn">CDN URL</option></select></div>}
        {frame.runtime === "cdn" && matches("cdn") && <div className="properties-row editable"><span>cdn url</span><input type="url" value={frame.cdnUrl || DEFAULT_P5_CDN_URL} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ cdnUrl: event.target.value })} /></div>}
        {matches("autoplay") && <div className="properties-row editable"><span>autoplay</span><input type="checkbox" checked={frame.autoplay} onChange={event => update({ autoplay: event.target.checked })} /></div>}
        {matches("fps") && <div className="properties-row editable"><span>fps</span><input type="number" min="1" max="120" step="1" value={frame.fps} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ fps: event.target.valueAsNumber })} /></div>}
        {matches("transparent") && <div className="properties-row editable"><span>transparent</span><input type="checkbox" checked={frame.transparent} onChange={event => update({ transparent: event.target.checked })} /></div>}
        {matches("interaction") && <div className="properties-row editable"><span>interact</span><input type="checkbox" checked={frame.allowInteraction} onChange={event => update({ allowInteraction: event.target.checked })} /></div>}
        {matches("reload") && <div className="properties-row properties-embed-reload"><span>preview</span><button type="button" className="iannix-flat-button" onClick={() => update({ reloadNonce: Date.now() })}>Reload sketch</button></div>}
        {matches("source") && <div className="properties-row properties-p5-source editable"><span>source</span><textarea value={frame.source} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => update({ source: event.target.value })} spellCheck="false" /></div>}
        {!query?.needle && <p className="properties-p5-note">Trusted local code: this sketch runs directly in Drawerator with full page access. Use only scripts you trust. Bundled p5 is included with Drawerator; CDN mode loads a compatible runtime from the URL above.</p>}
      </div>
    </details>
  );
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
  const svg = normalizeSvgObject(element.customData.draweratorSvg);
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
  const selectedNodeData = selectedNode?.draweratorId
    ? svg.metadataMirror?.nodes?.[selectedNode.draweratorId] || {}
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
    ["customData", "draweratorSvg"],
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
        {matches("width") && <div className="properties-row editable"><span>width</span><input type="number" min="1" max="16384" value={analysis.width} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgRootDocument(svg.source, { width: event.target.value }))} /></div>}
        {matches("height") && <div className="properties-row editable"><span>height</span><input type="number" min="1" max="16384" value={analysis.height} onKeyDown={stopCanvasKeys} onKeyUp={stopCanvasKeys} onChange={event => updateSource(updateStructuredSvgRootDocument(svg.source, { height: event.target.value }))} /></div>}
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
                <option value="transport">Drawerator transport</option>
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
                <label><span>fps</span><input type="number" min="0.001" step="1" aria-label="Looom thread speed" value={lane.speed} onKeyDown={stopCanvasKeys} onChange={event => patchLooomVariable(lane.nodeIndex, "--speed", event.target.value)} /></label>
                <label><span>offset</span><input type="number" step="1" aria-label="Looom thread offset" value={Math.round(lane.begin * lane.speed)} onKeyDown={stopCanvasKeys} onChange={event => patchLooomVariable(lane.nodeIndex, "--timeOffset", event.target.value)} /></label>
                <label><span>play mode</span><input type="number" step="1" aria-label="Looom thread play mode" value={lane.playMode} onKeyDown={stopCanvasKeys} onChange={event => patchLooomVariable(lane.nodeIndex, "--playMode", event.target.value)} /></label>
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
                ? "Scripts run in a sandboxed, cross-origin iframe. They cannot access Drawerator or mutate canonical source; only the limited cue/log/MIDI bridge is exposed."
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
        {!query?.needle && <p className="properties-svg-note">Select a path or subpath for canvas editing. Score roles can live directly on SVG nodes; extraction creates a separate native Drawerator spline. Canonical source remains editable from the SVG type in Script.</p>}
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
  const svg = normalizeSvgObject(element.customData.draweratorSvg);
  const analysis = analyzeSvgSource(svg.source);
  return ["svg", "document", "name", "width", "height", "viewbox", "geometry", "element", "attribute", "style", "animation", svg.name,
    ...analysis.nodes.flatMap(node => [node.tag, node.id, node.label, ...Object.keys(node.attributes), ...Object.values(node.attributes)]),
  ].some(value => String(value || "").toLowerCase().includes(query.needle));
};

const propertyTreeValue = element => {
  if (!isSvgObjectElement(element)) return element;
  const customData = { ...(element.customData || {}) };
  delete customData.draweratorSvg;
  return { ...element, customData };
};

const svgFieldCount = element => {
  if (!isSvgObjectElement(element)) return 0;
  const svg = normalizeSvgObject(element.customData.draweratorSvg);
  const analysis = analyzeSvgSource(svg.source);
  return 4 + analysis.nodeCount + analysis.nodes.reduce((count, node) => count + Object.keys(node.attributes).length, 0);
};

const PropertiesPanel = memo(function PropertiesPanel({
  elements = [],
  availableElements = elements,
  selectedSvgNode = null,
  onChange,
  onRename,
  onSelectSvgNode,
  onExtractSvgSubpath,
  onAssignSvgNodeRole,
  onBindSvgNodeCurve,
  onToggleSvgPathClosed,
  onReverseSvgPath,
  onInsertSvgAnchor,
  onDeleteSvgAnchor,
  svgPathSelectedAnchor = null,
  svgJointConnectionCount = 0,
  svgJointDetachArmed = false,
  onDetachSvgJoint,
}) {
  const [filter, setFilter] = useState("");
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
      + (embedMatchesQuery(element, query) ? 4 : 0)
      + (p5MatchesQuery(element, query) ? 6 : 0)
      + (svgMatchesQuery(element, query) ? svgFieldCount(element) : 0)
  ), 0), [elements, query]);
  const sharedPath = path => isSharedEditablePath(elements, path);
  const svgCurveOptions = useMemo(() => (availableElements || []).flatMap(element => {
    if (element?.isDeleted) return [];
    if (element.customData?.iannix?.role === "curve") {
      return [{
        value: JSON.stringify({ kind: "element", elementId: element.id }),
        label: element.customData.iannix.label || element.id,
      }];
    }
    if (!isSvgObjectElement(element)) return [];
    const svg = normalizeSvgObject(element.customData.draweratorSvg);
    const nodes = analyzeSvgSource(svg.source).nodes;
    return Object.entries(svg.metadataMirror?.nodes || {}).flatMap(([nodeId, data]) => {
      if (data?.iannix?.role !== "curve") return [];
      const node = nodes.find(candidate => candidate.draweratorId === nodeId);
      const ref = {
        kind: "svg-node",
        elementId: element.id,
        nodeId,
        ...(data.subpathId !== undefined ? { subpathId: data.subpathId } : {}),
      };
      return [{
        value: JSON.stringify(ref),
        label: data.iannix.label || `${element.customData?.iannix?.label || svg.name} · ${node?.label || nodeId}`,
      }];
    });
  }), [availableElements]);

  const beginRename = element => {
    setActiveObjectId(element.id);
    setEditingId(element.id);
    setEditingValue(element.customData?.iannix?.label || "");
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
        {matchingFieldCount ? elements.map(element => {
          const elementValue = propertyTreeValue(element);
          const elementMatchCount = collectLeafEntries(elementValue).filter(entry => leafMatches(entry.value, entry.path, query)).length
            + (embedMatchesQuery(element, query) ? 4 : 0)
            + (p5MatchesQuery(element, query) ? 6 : 0)
            + (svgMatchesQuery(element, query) ? svgFieldCount(element) : 0);
          if (!elementMatchCount) return null;
          const label = element.customData?.iannix?.label;
          return (
            <section className="properties-object" key={element.id} onMouseDown={() => setActiveObjectId(element.id)}>
              <div className="properties-object-heading" onDoubleClick={() => beginRename(element)} title="Press F2 to edit the score label">
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
              <P5FrameControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
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
                onInsertSvgAnchor={onInsertSvgAnchor}
                onDeleteSvgAnchor={onDeleteSvgAnchor}
                svgPathSelectedAnchor={svgPathSelectedAnchor}
                svgJointConnectionCount={svgJointConnectionCount}
                svgJointDetachArmed={svgJointDetachArmed}
                onDetachSvgJoint={onDetachSvgJoint}
              />
              <EmbedControls element={element} query={query} onChange={(path, value) => onChange([element.id], path, value)} />
              <PropertyNode
                name="object"
                value={elementValue}
                query={query}
                isSharedPath={sharedPath}
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
