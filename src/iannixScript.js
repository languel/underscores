import { getBezierPathLengthFromAnchors, getBezierWorldAnchors, hasCubicBezierGeometry } from "./bezierGeometry.js";

const TOKEN_PATTERN = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+)/g;

export const tokenizeIannixCommand = command => {
  const tokens = [];
  const source = String(command || "").trim();
  let match;
  while ((match = TOKEN_PATTERN.exec(source))) {
    tokens.push((match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, "$1"));
  }
  return tokens;
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitTopLevelCommaList = source => {
  const values = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  const text = String(source || "");
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
};

const targetId = (state, value) => {
  if (!value || value.toLowerCase() === "current") return state.currentId;
  if (value.toLowerCase() === "lastcurve") return state.lastCurveId;
  return String(value);
};

const seededRandom = seed => {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

export const getIannixCurveStartAngle = curveObject => {
  if (!curveObject) return 0;
  let points = (curveObject.points || []).filter(Boolean);
  if (curveObject.ellipse) {
    const [radiusX = 1, radiusY = radiusX] = curveObject.ellipse;
    const step = Math.PI / 24;
    points = [
      [radiusX, 0, 0],
      [Math.cos(step) * radiusX, Math.sin(step) * radiusY, 0],
    ];
  }
  for (let index = 1; index < points.length; index++) {
    const controls = curveObject.controls?.[index];
    const outgoing = controls?.c1 || [0, 0, 0];
    const hasOutgoing = Math.hypot(number(outgoing[0]), number(outgoing[1])) > 0.000001;
    const dx = hasOutgoing ? number(outgoing[0]) : number(points[index]?.[0]) - number(points[index - 1]?.[0]);
    // IanniX is Y-up while the Drawerator canvas is Y-down.
    const dy = -(hasOutgoing ? number(outgoing[1]) : number(points[index]?.[1]) - number(points[index - 1]?.[1]));
    if (Math.hypot(dx, dy) > 0.000001) return Math.atan2(dy, dx) || 0;
  }
  return 0;
};

export const getIannixCursorCanvasLength = (cursorObject, scale = 1) => {
  const width = Math.abs(number(cursorObject?.width, 1));
  const canvasScale = Math.abs(number(scale, 1));
  return Math.max(0.001, width * canvasScale);
};

export const getIannixCursorLoopMode = cursorObject => {
  const values = String(cursorObject?.pattern || "")
    .trim()
    .split(/\s+/)
    .map(value => Number(value))
    .filter(Number.isFinite);
  // IanniX setPattern is NxCursor.setStart: the first two values are easing
  // metadata and the remainder is the traversal sequence. The sequence is
  // cyclic unless it contains a terminating zero (the IanniX default is
  // `0 0 1 0`, while scripts commonly use `0 0 1` for endless traversal).
  // A negative pass sends the cursor back along its support curve.
  const traversal = values.slice(2);
  if (traversal.some(value => value < 0)) return "pingPong";
  if (traversal.length > 0 && !traversal.includes(0)) return "loop";
  return "once";
};

export const getIannixCurvePathLength = curveObject => {
  if (!curveObject) return 0.001;
  if (curveObject.ellipse) {
    const [radiusX = 1, radiusY = radiusX] = curveObject.ellipse.map(value => Math.abs(number(value, 1)));
    return Math.max(0.001, Math.PI * Math.sqrt(2 * (radiusX * radiusX + radiusY * radiusY)));
  }
  const indexedPoints = (curveObject.points || []).map((value, index) => ({ value, index })).filter(entry => entry.value);
  const points = indexedPoints.map(entry => entry.value);
  if (points.length >= 2 && curveObject.controls) {
    const anchors = points.map(value => ({ x: number(value[0]), y: number(value[1]), in: null, out: null, mode: "corner" }));
    for (let destination = 1; destination < indexedPoints.length; destination += 1) {
      const controls = curveObject.controls[indexedPoints[destination].index];
      if (!controls) continue;
      const c1 = controls.c1 || [0, 0];
      const c2 = controls.c2 || [0, 0];
      if (Math.hypot(number(c1[0]), number(c1[1])) > 0.000001) anchors[destination - 1].out = [number(c1[0]), number(c1[1])];
      if (Math.hypot(number(c2[0]), number(c2[1])) > 0.000001) anchors[destination].in = [number(c2[0]), number(c2[1])];
      if (controls.smooth) anchors[destination].mode = "smooth";
    }
    return Math.max(0.001, getBezierPathLengthFromAnchors(anchors, curveObject.closed));
  }
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(
      number(points[index]?.[0]) - number(points[index - 1]?.[0]),
      number(points[index]?.[1]) - number(points[index - 1]?.[1]),
      number(points[index]?.[2]) - number(points[index - 1]?.[2]),
    );
  }
  if (curveObject.closed && points.length > 2) {
    length += Math.hypot(
      number(points[0]?.[0]) - number(points.at(-1)?.[0]),
      number(points[0]?.[1]) - number(points.at(-1)?.[1]),
      number(points[0]?.[2]) - number(points.at(-1)?.[2]),
    );
  }
  return Math.max(0.001, length);
};

export const getIannixCursorDuration = (cursorObject, curveObject) => {
  const pathLength = getIannixCurvePathLength(curveObject);
  if (!Number.isFinite(Number(cursorObject?.speed))) return pathLength;
  const speed = Math.abs(Number(cursorObject.speed));
  if (["auto", "autolock"].includes(String(cursorObject.speedMode || "").toLowerCase())) {
    return Math.max(0.001, speed);
  }
  if (speed <= 0.000001) return Number.MAX_SAFE_INTEGER;
  return Math.max(0.001, pathLength / speed);
};

export const createIannixCommandCollector = (options = {}) => {
  const state = {
    currentId: options.currentId == null ? null : String(options.currentId),
    lastCurveId: options.lastCurveId == null ? null : String(options.lastCurveId),
    operations: [],
    unsupported: [],
  };

  const run = source => {
    const raw = String(source || "").trim();
    const tokens = tokenizeIannixCommand(raw);
    if (!tokens.length) return null;
    const command = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    if (command === "add" && ["curve", "cursor", "trigger"].includes(args[0]?.toLowerCase())) {
      const role = args[0].toLowerCase();
      const externalId = String(args[1] ?? `${role}-${state.operations.length + 1}`);
      state.currentId = externalId;
      if (role === "curve") state.lastCurveId = externalId;
      state.operations.push({ type: "add", role, externalId });
      return externalId;
    }

    if (command === "clear") {
      state.operations.push({ type: "clear" });
      state.currentId = null;
      state.lastCurveId = null;
      return true;
    }

    const id = targetId(state, args[0]);
    if (["setpointat", "setsmoothpointat"].includes(command) && id) {
      const values = args.slice(2).map(value => number(value));
      const has3dControls = values.length >= 9;
      const has2dControls = !has3dControls && values.length >= 6;
      const pointValue = [values[0] || 0, values[1] || 0, has3dControls || values.length === 3 ? values[2] || 0 : 0];
      const c1 = has3dControls ? [values[3] || 0, values[4] || 0, values[5] || 0]
        : has2dControls ? [values[2] || 0, values[3] || 0, 0] : [0, 0, 0];
      const c2 = has3dControls ? [values[6] || 0, values[7] || 0, values[8] || 0]
        : has2dControls ? [values[4] || 0, values[5] || 0, 0] : [0, 0, 0];
      state.operations.push({
        type: "point",
        externalId: id,
        index: Math.max(0, Math.round(number(args[1]))),
        point: pointValue,
        c1,
        c2,
        smooth: command === "setsmoothpointat",
      });
      return true;
    }
    if (command === "setpointslines" && id) {
      const values = args.slice(2).map(value => number(value));
      const points = [];
      for (let index = 0; index + 1 < values.length; index += 3) {
        points.push([values[index], values[index + 1], values[index + 2] || 0]);
      }
      state.operations.push({ type: "points", externalId: id, points, closed: number(args[1]) === 1 });
      return true;
    }
    if (command === "setpointsellipse" && id) {
      state.operations.push({ type: "ellipse", externalId: id, radii: [Math.abs(number(args[1], 1)), Math.abs(number(args[2], number(args[1], 1)))] });
      return true;
    }
    if (command === "setequation" && id) {
      const equationType = String(args[1] || "cartesian").toLowerCase();
      const expressions = splitTopLevelCommaList(args.slice(2).join(" "));
      if (expressions.length !== 3 || expressions.some(expression => !expression)) {
        state.unsupported.push({ command: raw, reason: "IanniX equation must contain three coordinate expressions." });
        return null;
      }
      state.operations.push({ type: "equation", externalId: id, equationType, expressions });
      return true;
    }
    if (command === "setequationparam" && id) {
      state.operations.push({ type: "equationParam", externalId: id, name: String(args[1] || ""), value: number(args[2]) });
      return true;
    }
    if (["setequationnbpoints", "setequationpoints"].includes(command) && id) {
      state.operations.push({ type: "equationPoints", externalId: id, value: Math.min(10000, Math.max(2, Math.round(number(args[1], 400)))) });
      return true;
    }
    if (command === "setpos" && id) {
      state.operations.push({ type: "position", externalId: id, position: [number(args[1]), number(args[2]), number(args[3])] });
      return true;
    }
    if (command === "setcurve" && id) {
      state.operations.push({ type: "curve", externalId: id, curveExternalId: targetId(state, args[1]) });
      return true;
    }
    if (command === "setspeed" && id) {
      const candidate = args[2] ?? args[1];
      state.operations.push({ type: "speed", externalId: id, value: Math.max(0.001, number(candidate, 5)), mode: args.length > 2 ? args[1] : "absolute" });
      return true;
    }
    if (["setboundssource", "setboundstarget"].includes(command) && id) {
      state.operations.push({
        type: command === "setboundssource" ? "boundsSource" : "boundsTarget",
        externalId: id,
        value: args.slice(1, 7).map(value => number(value)),
      });
      return true;
    }
    if (["setsize", "setwidth"].includes(command) && id) {
      state.operations.push({ type: command === "setsize" ? "size" : "width", externalId: id, value: Math.max(0, number(args[1], 1)) });
      return true;
    }
    if (command === "setgroup" && id) {
      state.operations.push({ type: "group", externalId: id, value: args.slice(1).join(" ") });
      return true;
    }
    if (["setlabel", "setname"].includes(command) && id) {
      state.operations.push({ type: "label", externalId: id, value: args.slice(1).join(" ") });
      return true;
    }
    if (command === "setactive" && id) {
      state.operations.push({ type: "active", externalId: id, value: !["0", "false", "off"].includes(String(args[1]).toLowerCase()) });
      return true;
    }
    if (["setcolor", "setcolorhue"].includes(command) && id) {
      state.operations.push({ type: command === "setcolor" ? "color" : "colorHue", externalId: id, value: args.slice(1, 5).map(value => number(value)) });
      return true;
    }
    if (command === "setcoloractive" && id) {
      state.operations.push({ type: "color", externalId: id, value: args.slice(1, 5).map(value => number(value)) });
      return true;
    }
    if (command === "setoffset" && id) {
      state.operations.push({ type: "offset", externalId: id, value: args.slice(1).join(" ") });
      return true;
    }
    if (command === "settriggeroff" && id) {
      state.operations.push({ type: "triggerOff", externalId: id, value: !["0", "false", "off"].includes(String(args[1]).toLowerCase()) });
      return true;
    }
    if (["setmessage", "setpattern"].includes(command) && id) {
      state.operations.push({ type: command === "setmessage" ? "message" : "pattern", externalId: id, value: args.slice(1).join(" ") });
      return true;
    }
    if (["center", "zoom", "rotate"].includes(command)) {
      state.operations.push({ type: "presentation", command, args: args.map(value => number(value, value)) });
      return true;
    }

    state.unsupported.push({ command: raw, reason: `Unsupported IanniX command: ${tokens[0]}` });
    return null;
  };

  return { run, state };
};

const createHelpers = randomSource => {
  const linexp = (value, factor) => !factor
    ? value
    : (Math.exp(factor * value - factor) - Math.exp(-factor)) / (1 - Math.exp(-factor));
  const random = (low, high) => low === undefined || high === undefined
    ? randomSource()
    : low + randomSource() * (high - low);
  const norm = (value, low, high, factor) => high === low ? 0 : linexp((value - low) / (high - low), factor);
  const range = (value, low, high, factor) => low + linexp(value, factor) * (high - low);
  const rangeMid = (value, low, mid, high, factor) => {
    const scaled = linexp(value, factor);
    return scaled < 0.5
      ? scaled * 2 * (mid - low) + low
      : (scaled - 0.5) * 2 * (high - mid) + mid;
  };
  const map = (value, low1, high1, low2, high2, factor) => range(norm(value, low1, high1, factor), low2, high2);
  return {
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    THIRD_PI: Math.PI / 3,
    QUARTER_PI: Math.PI / 4,
    random,
    range,
    rangeMid,
    norm,
    map,
    linexp,
    constrain: (value, min, max) => Math.min(max, Math.max(min, value)),
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    log: Math.log,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    round: Math.round,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
  };
};

export const executeTrustedIannixScript = (source, options = {}) => {
  if (!options.trusted) throw new Error("IanniX scripts require explicit trusted execution.");
  const collector = createIannixCommandCollector({
    currentId: options.currentId,
    lastCurveId: options.lastCurveId,
  });
  const randomSource = seededRandom(options.seed ?? 1);
  const helpers = createHelpers(randomSource);
  const math = Object.create(null, Object.getOwnPropertyDescriptors(Math));
  Object.defineProperty(math, "random", { value: randomSource, enumerable: false, configurable: true });
  const load = filename => {
    const files = options.files || {};
    if (!(filename in files)) throw new Error(`IanniX load() could not find bundled file: ${filename}`);
    return files[filename];
  };
  const helperNames = Object.keys(helpers);
  const helperValues = Object.values(helpers);
  const scope = Object.assign(Object.create(null), options.parameters || {});
  const requestedParameters = [];
  let scoreTitle = "";
  const ask = (category, label, variable, defaultValue) => {
    const key = String(variable || "").trim();
    if (!key) return defaultValue;
    const value = Object.prototype.hasOwnProperty.call(options.parameters || {}, key)
      ? options.parameters[key]
      : defaultValue;
    scope[key] = value;
    requestedParameters.push({ category, label, variable: key, defaultValue, value });
    return value;
  };
  const title = value => { scoreTitle = String(value || ""); return scoreTitle; };
  const factory = new Function(
    "scope", "run", "ask", "title", "load", "loadJSON", "sessionTime", "Math", ...helperNames,
    `with (scope) {\n${String(source || "")}\n` +
      `if (typeof askUserForParameters === "function") askUserForParameters();\n` +
      `if (typeof makeWithScript === "function") makeWithScript();\n` +
      `if (typeof madeThroughGUI === "function") madeThroughGUI();\n` +
      `return typeof onIncomingMessage === "function" ? onIncomingMessage : null;\n}`,
  );
  const onIncomingMessage = factory(
    scope,
    collector.run,
    ask,
    title,
    load,
    filename => JSON.parse(load(filename)),
    Number(options.sessionTime) || 0,
    math,
    ...helperValues,
  );
  return {
    operations: collector.state.operations,
    unsupported: collector.state.unsupported,
    onIncomingMessage,
    seed: options.seed ?? 1,
    title: scoreTitle,
    parameters: requestedParameters,
  };
};

export const buildIannixObjectModel = operations => {
  const objects = new Map();
  let clear = false;
  const presentation = [];
  const ensure = externalId => {
    if (!objects.has(externalId)) objects.set(externalId, { externalId, role: null, position: [0, 0, 0], points: [], controls: [], size: 1, width: 1, active: true, equationParams: {} });
    return objects.get(externalId);
  };
  for (const operation of operations || []) {
    if (operation.type === "clear") { clear = true; objects.clear(); continue; }
    if (operation.type === "presentation") { presentation.push(operation); continue; }
    const object = ensure(operation.externalId);
    if (operation.type === "add") {
      object.role = operation.role;
      if (operation.role === "curve" && object.points.length === 0) object.points[0] = [0, 0, 0];
    }
    else if (operation.type === "point") {
      object.points[operation.index] = operation.point;
      object.controls[operation.index] = { c1: operation.c1 || [0, 0, 0], c2: operation.c2 || [0, 0, 0], smooth: operation.smooth === true };
    }
    else if (operation.type === "points") { object.points = operation.points; object.controls = []; object.closed = operation.closed; }
    else if (operation.type === "ellipse") object.ellipse = operation.radii;
    else if (operation.type === "equation") {
      object.equationType = operation.equationType;
      object.equationExpressions = operation.expressions;
    }
    else if (operation.type === "equationParam") object.equationParams[operation.name] = operation.value;
    else if (operation.type === "equationPoints") object.equationPoints = operation.value;
    else if (operation.type === "position") object.position = operation.position;
    else if (operation.type === "curve") object.curveExternalId = operation.curveExternalId;
    else if (operation.type === "speed") {
      object.speed = operation.value;
      object.speedMode = operation.mode;
    }
    else if (operation.type === "boundsSource") object.boundsSource = operation.value;
    else if (operation.type === "boundsTarget") object.boundsTarget = operation.value;
    else if (operation.type === "size") object.size = operation.value;
    else if (operation.type === "width") object.width = operation.value;
    else if (operation.type === "group") object.group = operation.value;
    else if (operation.type === "label") object.label = operation.value;
    else if (operation.type === "active") object.active = operation.value;
    else if (operation.type === "color" || operation.type === "colorHue") object[operation.type] = operation.value;
    else if (operation.type === "message" || operation.type === "pattern") object[operation.type] = operation.value;
    else if (operation.type === "offset" || operation.type === "triggerOff") object[operation.type] = operation.value;
  }
  for (const object of objects.values()) {
    if (object.role !== "curve" || !object.equationExpressions) continue;
    const parameters = object.equationParams || {};
    const names = Object.keys(parameters);
    let evaluators;
    try {
      evaluators = object.equationExpressions.map(expression => new Function(
        "t", ...names,
        `with (Math) { return Number(${expression}); }`,
      ));
    } catch (error) {
      throw new Error(`IanniX curve ${object.externalId} equation could not be parsed: ${error.message}`);
    }
    const count = Math.min(10000, Math.max(2, Math.round(number(object.equationPoints, 400))));
    const parameterValues = names.map(name => parameters[name]);
    object.points = [];
    object.controls = [];
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      let values;
      try {
        values = evaluators.map(evaluate => evaluate(t, ...parameterValues));
      } catch (error) {
        throw new Error(`IanniX curve ${object.externalId} equation failed at t=${t.toFixed(4)}: ${error.message}`);
      }
      if (!values.every(Number.isFinite)) {
        throw new Error(`IanniX curve ${object.externalId} equation returned a non-finite coordinate at t=${t.toFixed(4)}.`);
      }
      object.points.push(object.equationType === "polar"
        ? [values[0] * Math.sin(values[1]) * Math.cos(values[2]), values[0] * Math.cos(values[1]), values[0] * Math.sin(values[1]) * Math.sin(values[2])]
        : values);
    }
  }
  for (const object of objects.values()) {
    if (object.role !== "curve" || !object.controls.some(control => control?.smooth)) continue;
    const points = object.points;
    const isLoop = points.length > 2 && points[0] && points.at(-1) && points[0].every((value, index) => Math.abs(number(value) - number(points.at(-1)[index])) < 0.000001);
    for (let index = 0; index < points.length; index += 1) {
      if (!points[index] || !object.controls[index]?.smooth) continue;
      const factor = 5;
      if (index === 0 && points[1]) {
        const before = isLoop ? points.at(-2) : points[0];
        object.controls[1] ||= { c1: [0, 0, 0], c2: [0, 0, 0], smooth: false };
        object.controls[1].c1 = points[1].map((value, axis) => (number(value) - number(before?.[axis])) / factor);
      } else if (index === points.length - 1 && points[index - 1]) {
        const after = isLoop ? points[1] : points[index];
        object.controls[index].c2 = after.map((value, axis) => -(number(value) - number(points[index - 1]?.[axis])) / factor);
      } else if (points[index - 1] && points[index + 1]) {
        const tangent = points[index + 1].map((value, axis) => (number(value) - number(points[index - 1]?.[axis])) / factor);
        object.controls[index].c2 = tangent.map(value => -value);
        object.controls[index + 1] ||= { c1: [0, 0, 0], c2: [0, 0, 0], smooth: false };
        object.controls[index + 1].c1 = tangent;
      }
    }
  }
  return { clear, objects: [...objects.values()].filter(object => object.role), presentation };
};

export const serializeBezierElementToIannixCommands = (element, options = {}) => {
  if (!hasCubicBezierGeometry(element)) return [];
  const id = String(options.externalId ?? element.customData?.iannixImport?.externalId ?? element.id).replace(/\s+/g, "_");
  const scale = Math.max(0.000001, Math.abs(number(options.scale, 1)));
  const anchor = options.anchor || [0, 0];
  const geometry = element.customData.draweratorGeometry;
  const controls = getBezierWorldAnchors(element);
  const entries = geometry.closed ? [...controls, controls[0]] : controls;
  const format = value => Number(value.toFixed(8)).toString();
  const toIannixPoint = value => [(value[0] - number(anchor[0])) / scale, -(value[1] - number(anchor[1])) / scale];
  const toIannixVector = value => [value[0] / scale, -value[1] / scale];
  const commands = [`add curve ${id}`];
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index];
    const previous = index === 0 ? null : entries[index - 1];
    const target = toIannixPoint(current.anchor);
    const c1 = previous?.out ? toIannixVector([previous.out[0] - previous.anchor[0], previous.out[1] - previous.anchor[1]]) : [0, 0];
    const c2 = current.in ? toIannixVector([current.in[0] - current.anchor[0], current.in[1] - current.anchor[1]]) : [0, 0];
    commands.push(`setPointAt ${id} ${index} ${format(target[0])} ${format(target[1])} 0 ${format(c1[0])} ${format(c1[1])} 0 ${format(c2[0])} ${format(c2[1])} 0`);
  }
  return commands;
};
