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

export const createIannixCommandCollector = () => {
  const state = {
    currentId: null,
    lastCurveId: null,
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
      state.operations.push({
        type: "point",
        externalId: id,
        index: Math.max(0, Math.round(number(args[1]))),
        point: [number(args[2]), number(args[3]), number(args[4])],
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
  const random = (low, high) => low === undefined || high === undefined
    ? randomSource()
    : low + randomSource() * (high - low);
  const norm = (value, low, high) => high === low ? 0 : (value - low) / (high - low);
  const range = (value, low, high) => low + value * (high - low);
  const map = (value, low1, high1, low2, high2) => range(norm(value, low1, high1), low2, high2);
  return {
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    QUARTER_PI: Math.PI / 4,
    random,
    range,
    norm,
    map,
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
  const collector = createIannixCommandCollector();
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
  const factory = new Function(
    "run", "load", "loadJSON", "sessionTime", "Math", ...helperNames,
    `"use strict";\n${String(source || "")}\n` +
      `if (typeof makeWithScript === "function") makeWithScript();\n` +
      `return typeof onIncomingMessage === "function" ? onIncomingMessage : null;`,
  );
  const onIncomingMessage = factory(
    collector.run,
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
  };
};

export const buildIannixObjectModel = operations => {
  const objects = new Map();
  let clear = false;
  const presentation = [];
  const ensure = externalId => {
    if (!objects.has(externalId)) objects.set(externalId, { externalId, role: null, position: [0, 0, 0], points: [], size: 1, width: 1, active: true });
    return objects.get(externalId);
  };
  for (const operation of operations || []) {
    if (operation.type === "clear") { clear = true; objects.clear(); continue; }
    if (operation.type === "presentation") { presentation.push(operation); continue; }
    const object = ensure(operation.externalId);
    if (operation.type === "add") object.role = operation.role;
    else if (operation.type === "point") object.points[operation.index] = operation.point;
    else if (operation.type === "points") { object.points = operation.points; object.closed = operation.closed; }
    else if (operation.type === "ellipse") object.ellipse = operation.radii;
    else if (operation.type === "position") object.position = operation.position;
    else if (operation.type === "curve") object.curveExternalId = operation.curveExternalId;
    else if (operation.type === "speed") object.speed = operation.value;
    else if (operation.type === "size") object.size = operation.value;
    else if (operation.type === "width") object.width = operation.value;
    else if (operation.type === "group") object.group = operation.value;
    else if (operation.type === "label") object.label = operation.value;
    else if (operation.type === "active") object.active = operation.value;
    else if (operation.type === "color" || operation.type === "colorHue") object[operation.type] = operation.value;
    else if (operation.type === "message" || operation.type === "pattern") object[operation.type] = operation.value;
  }
  return { clear, objects: [...objects.values()].filter(object => object.role), presentation };
};
