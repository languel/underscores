import { getCanvasContextMenuCapabilities } from "./canvasContextMenu.js";

const pathSelection = capabilities => capabilities.showPathOperations;
const pointsSelection = capabilities => capabilities.showSnapPoints;
const roundableSelection = capabilities => capabilities.showSharpRound;
const anySelection = capabilities => capabilities.selected.length > 0;

/**
 * The operations exposed by the selection command field. Keep this catalog
 * semantic: it describes what can be done, never how the DOM happens to be
 * laid out. Actions are resolved by App through the command registry.
 */
export const SELECTION_OPERATION_DEFINITIONS = Object.freeze([
  {
    id: "selection.livecode.create",
    commandId: "livecode.node.create",
    name: "New Livecode Node",
    category: "Livecode",
    description: "Create a self-contained livecoding node near the current canvas view.",
    syntax: "new livecode node",
    aliases: ["new livecode", "new livecode node", "create livecode", "/live"],
    matches: anySelection,
  },
  {
    id: "selection.stroke.restore",
    commandId: "restore-original-stroke",
    name: "Restore Original Stroke",
    category: "Brush",
    description: "Restore a generated brush stroke to its original authored path.",
    syntax: "restore original stroke",
    aliases: ["restore stroke", "restore original stroke", "/restore stroke"],
    matches: capabilities => capabilities.paths.some(element => element.id.includes("-brush-") || element.groupIds?.some(id => id.endsWith("-group"))),
  },
  {
    id: "selection.snap.points",
    commandId: "grid.snap.points",
    name: "Snap Points to Grid",
    category: "Grid",
    description: "Snap authored path points while preserving the stroke shape and pressure.",
    syntax: "snap points",
    aliases: ["snap", "snap points", "snap parts", "snap points to grid", "/snap points", "/grid snap points"],
    matches: pointsSelection,
  },
  {
    id: "selection.path.simplify.rdp",
    commandId: "path.simplify.rdp",
    name: "Simplify Path (RDP)",
    category: "Path",
    description: "Reduce path points with a tolerance value in pixels.",
    syntax: "simplify rdp [tolerance]",
    aliases: ["simplify", "simplify path", "simplify rdp", "/simplify rdp"],
    matches: pathSelection,
  },
  {
    id: "selection.path.simplify.vw",
    commandId: "path.simplify.vw",
    name: "Simplify Path (VW)",
    category: "Path",
    description: "Reduce path points with an area tolerance value.",
    syntax: "simplify vw [tolerance]",
    aliases: ["simplify vw", "simplify path vw", "/simplify vw"],
    matches: pathSelection,
  },
  {
    id: "selection.path.smooth",
    commandId: "path.smooth",
    name: "Smooth Path (Laplacian)",
    category: "Path",
    description: "Smooth selected paths. The optional number is the iteration count (1–100).",
    syntax: "smooth [iterations]",
    aliases: ["smooth", "smooth path", "smooth laplacian", "/smooth", "/smooth path"],
    matches: pathSelection,
    acceptsNumber: true,
  },
  {
    id: "selection.path.smooth.taubin",
    commandId: "path.smooth.taubin",
    name: "Smooth Path (Taubin)",
    category: "Path",
    description: "Smooth selected paths without the shrinkage of a simple average.",
    syntax: "smooth taubin [iterations]",
    aliases: ["smooth taubin", "taubin", "/smooth taubin", "/taubin"],
    matches: pathSelection,
    acceptsNumber: true,
  },
  {
    id: "selection.path.resample",
    commandId: "path.resample",
    name: "Resample Path Uniformly",
    category: "Path",
    description: "Space authored points at equal distances along the selected paths.",
    syntax: "resample [point count]",
    aliases: ["resample", "resample path", "resample uniformly", "/resample"],
    matches: pathSelection,
    acceptsNumber: true,
  },
  {
    id: "selection.path.close",
    commandId: "path.close",
    name: "Close Path",
    category: "Path",
    description: "Connect the ends of selected paths and smooth the new joint.",
    syntax: "close path",
    aliases: ["close", "close path", "close and smooth", "/close path"],
    matches: pathSelection,
  },
  {
    id: "selection.roundness.sharp",
    commandId: "selection.roundness.sharp",
    name: "Sharp Corners",
    category: "Geometry",
    description: "Use sharp corners on selected paths, rectangles, and diamonds.",
    syntax: "sharp corners",
    aliases: ["sharp", "sharp corners", "/sharp corners"],
    matches: roundableSelection,
  },
  {
    id: "selection.roundness.round",
    commandId: "selection.roundness.round",
    name: "Rounded Corners",
    category: "Geometry",
    description: "Use rounded corners on selected paths, rectangles, and diamonds.",
    syntax: "round corners",
    aliases: ["round", "round corners", "rounded corners", "/round corners"],
    matches: roundableSelection,
  },
  {
    id: "selection.convert.path",
    commandId: "selection.convert.path",
    name: "Convert to Path",
    category: "Geometry",
    description: "Convert selected basic shapes into editable native paths.",
    syntax: "convert to path",
    aliases: ["convert to path", "to path", "/convert path"],
    matches: capabilities => capabilities.hasShapes,
  },
  {
    id: "selection.convert.line",
    commandId: "selection.convert.line",
    name: "Convert to Line",
    category: "Geometry",
    description: "Convert selected freehand paths or splines to native lines.",
    syntax: "convert to line",
    aliases: ["convert to line", "to line", "/convert line"],
    matches: capabilities => capabilities.paths.some(element => element.type === "freedraw" || Boolean(element.customData?.underscoresGeometry)),
  },
  {
    id: "selection.convert.freehand",
    commandId: "selection.convert.freehand",
    name: "Convert to Freehand",
    category: "Geometry",
    description: "Convert selected paths or shapes to a freehand pencil stroke.",
    syntax: "convert to freehand",
    aliases: ["convert to freehand", "convert to pencil", "to freehand", "/convert freehand"],
    matches: capabilities => capabilities.paths.some(element => element.type === "line" || Boolean(element.customData?.underscoresGeometry)) || capabilities.hasShapes,
  },
  {
    id: "selection.convert.spline",
    commandId: "selection.convert.spline",
    name: "Convert to Spline",
    category: "Geometry",
    description: "Convert selected native paths into a canonical cubic spline.",
    syntax: "convert to spline",
    aliases: ["convert to spline", "to spline", "/convert spline"],
    matches: capabilities => capabilities.paths.some(element => !element.customData?.underscoresGeometry) || capabilities.hasShapes,
  },
  {
    id: "selection.convert.fromSpline",
    commandId: "selection.convert.fromSpline",
    name: "Convert from Spline",
    category: "Geometry",
    description: "Convert selected splines back to native Excalidraw paths.",
    syntax: "convert from spline",
    aliases: ["convert from spline", "from spline", "/convert from spline"],
    matches: capabilities => capabilities.selected.some(element => Boolean(element.customData?.underscoresGeometry)),
  },
  {
    id: "selection.role.cursor",
    commandId: "selection.role.cursor",
    name: "Make Cursor",
    category: "Score",
    description: "Assign the Cursor role to the current selection.",
    syntax: "make cursor",
    aliases: ["make cursor", "cursor", "/make cursor"],
    matches: anySelection,
  },
  {
    id: "selection.role.curve",
    commandId: "selection.role.curve",
    name: "Make Curve",
    category: "Score",
    description: "Assign the Curve role to the current selection.",
    syntax: "make curve",
    aliases: ["make curve", "curve", "/make curve"],
    matches: anySelection,
  },
  {
    id: "selection.role.trigger",
    commandId: "selection.role.trigger",
    name: "Make Trigger",
    category: "Score",
    description: "Assign the Trigger role to the current selection.",
    syntax: "make trigger",
    aliases: ["make trigger", "trigger", "/make trigger"],
    matches: anySelection,
  },
  {
    id: "selection.add.cursor",
    commandId: "iannix.cursor.addToSelectedCurves",
    name: "Add Cursor to Selected Curves",
    category: "Score",
    description: "Mark selected paths as curves and attach runtime cursors.",
    syntax: "add cursor",
    aliases: ["add cursor", "add cursor to selected curves", "/add cursor"],
    matches: anySelection,
  },
  {
    id: "selection.physics.body",
    commandId: "physics.body.make",
    name: "Make Physics Body",
    category: "Physics",
    description: "Attach a dynamic physics body to the current selection.",
    syntax: "make physics body",
    aliases: ["make physics body", "make body", "physics body", "/make body"],
    matches: anySelection,
  },
  {
    id: "selection.livecode.p5.attach",
    commandId: "p5.frame.attach",
    name: "Attach p5 Sketch",
    category: "Livecode",
    description: "Turn selected rectangles or frames into live p5 sketch hosts.",
    syntax: "attach p5",
    aliases: ["attach p5", "p5 attach", "/attach p5"],
    matches: capabilities => capabilities.selected.some(element => ["rectangle", "frame"].includes(element.type)),
  },
  {
    id: "selection.svg.attach",
    commandId: "selection.svg.attach",
    name: "Attach SVG Code",
    category: "SVG",
    description: "Attach a blank editable SVG source to the selected rectangle.",
    syntax: "attach svg code",
    aliases: ["attach svg", "attach svg code", "/attach svg"],
    matches: capabilities => capabilities.selected.length === 1 && capabilities.selected[0].type === "rectangle",
  },
  {
    id: "selection.livecode.migrate",
    commandId: "livecode.node.migrate",
    name: "Migrate to Livecode Node",
    category: "Livecode",
    description: "Migrate a selected legacy p5 or Play Core host to Livecode.",
    syntax: "migrate to livecode",
    aliases: ["migrate to livecode", "migrate livecode", "/migrate livecode"],
    matches: capabilities => capabilities.selected.some(element => ["p5", "playcore"].includes(element.customData?.underscoresLivecode?.kind) || element.customData?.p5 || element.customData?.playCore),
  },
  {
    id: "selection.svg.convert",
    commandId: "selection.convert.svg",
    name: "Convert Selection to SVG",
    category: "SVG",
    description: "Replace selected native objects with a source-preserving SVG object.",
    syntax: "convert to svg",
    aliases: ["convert to svg", "bake to svg", "/svg from selection"],
    matches: anySelection,
  },
  {
    id: "selection.media.preview",
    commandId: "media.preview.make",
    name: "Make Preview",
    category: "Media",
    description: "Turn the selected rectangle or frame into a preview for the active media source.",
    syntax: "make preview",
    aliases: ["make preview", "preview", "/preview"],
    matches: capabilities => capabilities.selected.length === 1 && ["rectangle", "frame"].includes(capabilities.selected[0].type),
  },
  {
    id: "selection.viewport.fit",
    commandId: "selection.viewport.fit",
    name: "Fit Selection to Viewport",
    category: "Canvas",
    description: "Scale and center the selected rectangle or frame inside the viewport.",
    syntax: "fit to viewport",
    aliases: ["fit to viewport", "fit viewport", "/fit viewport"],
    matches: capabilities => capabilities.selected.length === 1 && ["rectangle", "frame"].includes(capabilities.selected[0].type),
  },
  {
    id: "selection.viewport.pip",
    commandId: "selection.viewport.pip",
    name: "Fit Selection to PIP",
    category: "Canvas",
    description: "Place the selected rectangle or frame as a small bottom-right picture-in-picture.",
    syntax: "fit to pip",
    aliases: ["fit to pip", "pip", "/fit pip"],
    matches: capabilities => capabilities.selected.length === 1 && ["rectangle", "frame"].includes(capabilities.selected[0].type),
  },
]);

const normalized = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export const getSelectionOperationSuggestions = elements => {
  const capabilities = getCanvasContextMenuCapabilities(elements);
  return SELECTION_OPERATION_DEFINITIONS
    .filter(operation => operation.matches(capabilities))
    .map(operation => ({ ...operation, capabilities }));
};

export const filterSelectionOperationSuggestions = (input, suggestions = []) => {
  const query = normalized(input).replace(/^\//, "");
  if (!query) return Array.isArray(suggestions) ? suggestions : [];
  const operationQuery = query.replace(/\s+\d+(?:\.\d+)?$/, "").trim();
  return (Array.isArray(suggestions) ? suggestions : []).filter(operation => {
    const primary = [operation.name, operation.syntax]
      .map(value => normalized(value).replace(/^\//, ""));
    if (primary.some(value => value.includes(query) || (operationQuery && value.includes(operationQuery)))) return true;
    return (operation.aliases || [])
      .map(value => normalized(value).replace(/^\//, ""))
      .some(value => value === query || value.startsWith(query) || (operationQuery && (value === operationQuery || value.startsWith(operationQuery))));
  });
};

const parsePositiveNumber = (value, { max = 100 } = {}) => {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.min(max, number)) : null;
};

/** Resolve the compact free-form syntax used by the contextual field. */
export const parseSelectionOperation = input => {
  const text = normalized(input).replace(/^\//, "");
  if (!text) return null;
  let match = text.match(/^smooth(?:\s+path)?(?:\s+(\d+(?:\.\d+)?))?$/);
  if (match) {
    const amount = parsePositiveNumber(match[1]);
    return amount === null ? null : { operationId: "selection.path.smooth", commandId: "path.smooth", args: amount == null ? {} : { amount } };
  }
  match = text.match(/^smooth\s+taubin(?:\s+(\d+(?:\.\d+)?))?$/);
  if (match) {
    const amount = parsePositiveNumber(match[1]);
    return amount === null ? null : { operationId: "selection.path.smooth.taubin", commandId: "path.smooth.taubin", args: amount == null ? {} : { amount } };
  }
  match = text.match(/^taubin(?:\s+(\d+(?:\.\d+)?))?$/);
  if (match) {
    const amount = parsePositiveNumber(match[1]);
    return amount === null ? null : { operationId: "selection.path.smooth.taubin", commandId: "path.smooth.taubin", args: amount == null ? {} : { amount } };
  }
  match = text.match(/^simplify\s+(rdp|vw)(?:\s+(\d+(?:\.\d+)?))?$/);
  if (match) {
    const tolerance = parsePositiveNumber(match[2], { max: match[1] === "vw" ? 1000 : 100 });
    const operationId = `selection.path.simplify.${match[1]}`;
    return tolerance === null ? null : { operationId, commandId: `path.simplify.${match[1]}`, args: tolerance == null ? {} : { tolerance } };
  }
  match = text.match(/^resample(?:\s+(\d+(?:\.\d+)?))?$/);
  if (match) {
    const count = parsePositiveNumber(match[1], { max: 10000 });
    return count === null ? null : { operationId: "selection.path.resample", commandId: "path.resample", args: count == null ? {} : { count: Math.round(count) } };
  }
  const exact = SELECTION_OPERATION_DEFINITIONS.find(operation => (operation.aliases || []).some(alias => normalized(alias).replace(/^\//, "") === text));
  return exact ? { operationId: exact.id, commandId: exact.commandId, args: {} } : null;
};
