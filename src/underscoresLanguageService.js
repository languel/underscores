// Browser-local reference data for the trusted JavaScript bridge shared by
// Underscores livecode runtimes. Keeping this separate from any one adapter
// lets p5, Strudel, Play Core, and future JavaScript nodes share the same
// signatures and Info-panel descriptions without a network lookup.

const bridgeApi = (name, signature, description, example, type = "property", boost = 80) => Object.freeze({
  name,
  signature,
  description,
  example,
  type,
  boost,
  referenceSource: "Underscores API",
});

export const UNDERSCORES_API = Object.freeze([
  bridgeApi("__", "LiveFrameBridge", "Shared read-only access to the current node, scene, parameters, events, appearance, and transport.", "const { width, height } = __.element;", "variable", 100),
  bridgeApi("__.element", "{ id, width, height }", "The live node host snapshot. Width and height are the logical drawing surface dimensions.", "createCanvas(__.element.width, __.element.height);", "property", 98),
  bridgeApi("__.object", "CanvasObjectSnapshot | null", "The current scene snapshot for this live node, or null when its host object is unavailable.", "const host = __.object;", "property", 88),
  bridgeApi("__.frame", "LivecodeNodeRecord", "The persisted livecode node configuration, including kind, source, view, clock, and runtime settings.", "const kind = __.frame.kind;", "property", 82),
  bridgeApi("__.params", "Record<string, unknown>", "Values declared with // @param. Values can be numeric, string, boolean, JSON, CSS color, or live canvas-object references.", "const amount = __.params.amount ?? 0.5;", "property", 96),
  bridgeApi("__.currentColor", "string", "Theme-matched display stroke color for an unfiltered live surface.", "stroke(__.currentColor);", "property", 90),
  bridgeApi("__.currentStroke", "string", "Short alias for the current theme-matched display stroke color.", "stroke(__.currentStroke);", "property", 88),
  bridgeApi("__.currentFill", "string", "Short alias for the current theme-matched display fill color.", "fill(__.currentFill);", "property", 88),
  bridgeApi("__.currentBackgroundColor", "string", "Theme-matched display background color for the current Excalidraw style.", "background(__.currentBackgroundColor);", "property", 84),
  bridgeApi("__.currentOpacity", "number", "Current Excalidraw opacity as a percentage.", "const alpha = __.currentOpacity;", "property", 78),
  bridgeApi("__.currentStrokeWidth", "number", "Current Excalidraw stroke width.", "strokeWeight(__.currentStrokeWidth);", "property", 82),
  bridgeApi("__.currentFillStyle", "string", "Current Excalidraw fill style, such as solid, hachure, or cross-hatch.", "if (__.currentFillStyle === \"solid\") fill(__.currentFill);", "property", 72),
  bridgeApi("__.currentStrokeStyle", "string", "Current Excalidraw stroke style, such as solid or dashed.", "const style = __.currentStrokeStyle;", "property", 72),
  bridgeApi("__.currentRawColor", "string", "Authored Excalidraw stroke color before dark/light display remapping.", "const authored = __.currentRawColor;", "property", 70),
  bridgeApi("__.currentRawBackgroundColor", "string", "Authored Excalidraw background color before display remapping.", "const authored = __.currentRawBackgroundColor;", "property", 68),
  bridgeApi("__.colors", "ThemeColors", "Theme colors and Excalidraw raw/display palettes. Each interface color includes color, opacity, and composited css values.", "const ink = __.colors.foreground.css;", "property", 86),
  bridgeApi("__.appearance", "AppearanceSnapshot", "Full live appearance snapshot, including theme, colors, authored style, active tool, zoom, and scroll.", "const theme = __.appearance.theme;", "property", 76),
  bridgeApi("__.appState", "Readonly<AppState>", "Read-only Excalidraw application state for values not covered by the convenience aliases.", "const tool = __.appState.activeTool;", "property", 72),
  bridgeApi("__.canvas", "CanvasQueryApi", "Read-only scene queries for all objects, lookup by id/label/group, predicates, and current selection.", "const cursor = __.canvas.selected()[0];", "property", 96),
  bridgeApi("__.objects", "CanvasQueryApi", "Alias for __.canvas.", "const objects = __.objects.all();", "property", 76),
  bridgeApi("__.canvas.all", "all()", "Return non-deleted snapshots for every object in the scene.", "const objects = __.canvas.all();", "method", 82),
  bridgeApi("__.canvas.get", "get(reference)", "Resolve one object by element id, label, Score group, or canonical object path.", "const curve = __.canvas.get(\"curve-1\");", "method", 84),
  bridgeApi("__.canvas.find", "find(query)", "Find objects by text or by a predicate over object snapshots.", "const cursors = __.canvas.find({ role: \"Cursor\" });", "method", 76),
  bridgeApi("__.canvas.selected", "selected()", "Return the current Excalidraw selection as read-only object snapshots.", "const selected = __.canvas.selected();", "method", 84),
  bridgeApi("__.events", "EventApi", "Inspect recent events and subscribe to matching event patterns from the shared event stream.", "const latest = __.events.latest(\"media.*\");", "property", 94),
  bridgeApi("__.events.recent", "recent(limit?)", "Return the most recent captured events.", "const events = __.events.recent(8);", "method", 76),
  bridgeApi("__.events.latest", "latest(pattern?)", "Return the newest event matching an optional pattern, or null.", "const frame = __.events.latest(\"media.holistic.frame\");", "method", 78),
  bridgeApi("__.events.on", "on(pattern, listener)", "Subscribe to matching events and receive an unsubscribe function.", "const off = __.events.on(\"input.*\", event => console.log(event));", "method", 78),
  bridgeApi("__.streams", "MediaStreamApi", "Read-only semantic media-stream queries and subscriptions.", "const hand = __.streams.get(\"Holistic\");", "property", 74),
  bridgeApi("__.art", "ArtApi", "Shared artistic generators, including the Unicursal portrait engine.", "const presets = __.art.unicursal.presets();", "property", 68),
  bridgeApi("__.transport", "TransportSnapshot", "Linked score time, frame, tempo, loop, and playing state.", "if (__.transport.playing) draw();", "property", 94),
  bridgeApi("__.time", "TransportTime", "Alias for the current transport timing context.", "const seconds = __.time.seconds;", "property", 70),
  bridgeApi("__.api", "UnderscoresApi", "Versioned application API for deliberate commands, scene/time/grid, history, media, physics, relations, mixer, inputs, and streams.", "await __.api.commands.execute(\"grid.global.update\", { patch: { enabled: true } });", "property", 98),
  bridgeApi("__.api.commands", "CommandsApi", "List, describe, execute, and subscribe to public application commands.", "const commands = __.api.commands.list();", "property", 82),
  bridgeApi("__.api.scene", "SceneApi", "Read the scene and the current Excalidraw application state.", "const scene = __.api.scene.get();", "property", 70),
  bridgeApi("__.api.time", "TimeApi", "Parse, resolve, format, and quantize transport time expressions.", "const seconds = __.api.time.resolve(\"2 bars\");", "property", 70),
  bridgeApi("__.api.grid", "GridApi", "Read and update global grid settings and convert between grid values and seconds.", "const grid = __.api.grid.getGlobal();", "property", 70),
  bridgeApi("__.api.history", "HistoryApi", "Record, load, play, seek, export, and import performance history sessions.", "const session = __.api.history.get();", "property", 66),
  bridgeApi("__.api.inputs", "InputsApi", "Register adapters and emit normalized input samples.", "__.api.inputs.emit({ type: \"pointer\", x: 0.5, y: 0.5 });", "property", 64),
  bridgeApi("__.api.relations", "RelationsApi", "Read and edit the source/filter/transform/target relationship graph.", "const graph = __.api.relations.get();", "property", 64),
  bridgeApi("__.api.physics", "PhysicsApi", "Control and inspect the solver-independent physics world, bodies, constraints, poses, and telemetry.", "const snapshot = __.api.physics.snapshot();", "property", 64),
  bridgeApi("__.api.mixer", "MixerApi", "Read and update audio mixer tracks and routing.", "const mixer = __.api.mixer.get();", "property", 64),
]);

const isIdentifierCharacter = character => /[A-Za-z0-9_$]/.test(character || "");

const pathAt = (source, position) => {
  const text = String(source || "");
  const cursor = Math.max(0, Math.min(text.length, Number(position) || 0));
  const current = text[cursor] || "";
  const previous = text[cursor - 1] || "";
  if (!isIdentifierCharacter(current) && !isIdentifierCharacter(previous)) return null;

  let from = cursor;
  let to = cursor;
  while (from > 0 && isIdentifierCharacter(text[from - 1])) from -= 1;
  while (to < text.length && isIdentifierCharacter(text[to])) to += 1;

  while (from > 0 && text[from - 1] === ".") {
    const segmentEnd = from - 1;
    let segmentStart = segmentEnd;
    while (segmentStart > 0 && isIdentifierCharacter(text[segmentStart - 1])) segmentStart -= 1;
    if (segmentStart === segmentEnd) break;
    from = segmentStart;
  }

  const path = text.slice(from, to);
  if (!path.startsWith("__")) return null;
  return { from, to, path };
};

const entryForPath = path => {
  if (!path) return null;
  const exact = UNDERSCORES_API.find(entry => entry.name === path);
  if (exact) return exact;
  const segments = path.split(".");
  while (segments.length > 1) {
    segments.pop();
    const parent = UNDERSCORES_API.find(entry => entry.name === segments.join("."));
    if (parent) return parent;
  }
  return null;
};

const selectionPathAt = (source, from, to) => {
  const text = String(source || "");
  const start = Math.max(0, Math.min(text.length, Number(from) || 0));
  const end = Math.max(start, Math.min(text.length, Number(to) || start));
  const selected = text.slice(start, end).trim();
  if (!selected) return null;
  if (selected.startsWith("__")) return { from: start, to: end, path: selected };
  const prefix = text.slice(0, start).match(/(__(?:\.[A-Za-z0-9_$]+)*)\.$/);
  if (!prefix) return null;
  return { from: prefix.index, to: end, path: `${prefix[1]}${selected}` };
};

export const getUnderscoresHover = (source, position, selectionEnd) => {
  const token = Number.isFinite(selectionEnd) && selectionEnd > position
    ? selectionPathAt(source, position, selectionEnd)
    : pathAt(source, position);
  const entry = entryForPath(token?.path);
  if (!token || !entry) return null;
  return { from: token.from, to: token.to, ...entry };
};

export const getUnderscoresReference = () => UNDERSCORES_API;

export const getUnderscoresCompletions = () => UNDERSCORES_API.map(entry => ({
  label: entry.name,
  detail: entry.signature,
  info: `${entry.description}\n\nExample: ${entry.example}`,
  type: entry.type,
  boost: entry.boost,
}));
