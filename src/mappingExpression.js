// Deliberately small, safe expression evaluator for relationship mappings.
// It accepts values and whitelisted functions only: no JavaScript evaluation,
// member access, assignments, arrays, strings, or user-defined calls.

const TOKEN = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\|\||&&|<=|>=|==|!=|[()+\-*/%,<>!]))/gy;
const scale = (root, degree, ...intervals) => {
  const base = Number(root);
  const indexValue = Number(degree);
  const steps = intervals.map(Number).filter(Number.isFinite);
  if (!Number.isFinite(base) || !Number.isFinite(indexValue)) return 0;
  // A missing interval list is deliberately uninteresting but safe: a single
  // unison degree. Musical presets below make the common cases concise.
  const values = steps.length ? steps : [0];
  const wholeDegree = Math.floor(indexValue);
  const octave = Math.floor(wholeDegree / values.length);
  const index = ((wholeDegree % values.length) + values.length) % values.length;
  return base + octave * 12 + values[index];
};

const FUNCTIONS = Object.freeze({
  if: (condition, whenTrue, whenFalse) => condition ? whenTrue : whenFalse,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  pow: Math.pow,
  // `scale(root, degree, ...semitones)` keeps scale choice in a safe, compact
  // expression rather than exposing arbitrary JavaScript or a separate DSL.
  scale,
  major: (root, degree) => scale(root, degree, 0, 2, 4, 5, 7, 9, 11),
  minor: (root, degree) => scale(root, degree, 0, 2, 3, 5, 7, 8, 10),
  pentatonic: (root, degree) => scale(root, degree, 0, 2, 4, 7, 9),
});

const tokenize = source => {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(source);
    if (!match || match.index !== index) throw new Error(`Unexpected token near “${source.slice(index, index + 12)}”.`);
    index = TOKEN.lastIndex;
    if (match[1]) tokens.push({ type: "number", value: Number(match[1]) });
    else if (match[2]) tokens.push({ type: "identifier", value: match[2] });
    else tokens.push({ type: "operator", value: match[3] });
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
};

const PRECEDENCE = Object.freeze({ "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 });

const binary = (operator, left, right) => {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return right === 0 ? 0 : left / right;
    case "%": return right === 0 ? 0 : left % right;
    case "<": return left < right ? 1 : 0;
    case "<=": return left <= right ? 1 : 0;
    case ">": return left > right ? 1 : 0;
    case ">=": return left >= right ? 1 : 0;
    case "==": return left === right ? 1 : 0;
    case "!=": return left !== right ? 1 : 0;
    case "&&": return left && right ? 1 : 0;
    case "||": return left || right ? 1 : 0;
    default: throw new Error(`Unsupported operator “${operator}”.`);
  }
};

export const compileMappingExpression = sourceValue => {
  const source = String(sourceValue || "").trim();
  if (!source) return { source: "", evaluate: value => value?.value ?? 0, error: null };
  try {
    const tokens = tokenize(source);
    let cursor = 0;
    const current = () => tokens[cursor];
    const consume = value => {
      if (current().value !== value) throw new Error(`Expected “${value}”.`);
      cursor += 1;
    };
    const parsePrimary = () => {
      const token = current();
      if (token.type === "number") { cursor += 1; return () => token.value; }
      if (token.type === "identifier") {
        cursor += 1;
        if (current().value === "(") {
          if (!Object.hasOwn(FUNCTIONS, token.value)) throw new Error(`Unknown function “${token.value}”.`);
          consume("(");
          const args = [];
          if (current().value !== ")") {
            args.push(parseExpression(0));
            while (current().value === ",") {
              consume(",");
              args.push(parseExpression(0));
            }
          }
          consume(")");
          return env => FUNCTIONS[token.value](...args.map(argument => argument(env)));
        }
        return env => {
          if (!Object.hasOwn(env || {}, token.value)) throw new Error(`Unknown value “${token.value}”.`);
          const value = Number(env[token.value]);
          return Number.isFinite(value) ? value : 0;
        };
      }
      if (token.value === "(") {
        consume("(");
        const expression = parseExpression(0);
        consume(")");
        return expression;
      }
      if (["+", "-", "!"].includes(token.value)) {
        cursor += 1;
        const expression = parsePrimary();
        if (token.value === "+") return env => +expression(env);
        if (token.value === "-") return env => -expression(env);
        return env => expression(env) ? 0 : 1;
      }
      throw new Error(`Expected a number, value, or function near “${token.value}”.`);
    };
    const parseExpression = minimum => {
      let left = parsePrimary();
      while (true) {
        const operator = current().value;
        const precedence = PRECEDENCE[operator];
        if (!precedence || precedence < minimum) break;
        cursor += 1;
        const right = parseExpression(precedence + 1);
        const previous = left;
        left = env => binary(operator, previous(env), right(env));
      }
      return left;
    };
    const ast = parseExpression(0);
    if (current().type !== "eof") throw new Error(`Unexpected token “${current().value}”.`);
    return {
      source,
      error: null,
      evaluate: env => {
        const value = Number(ast(env || {}));
        if (!Number.isFinite(value)) throw new Error("Expression did not produce a finite number.");
        return value;
      },
    };
  } catch (error) {
    return { source, error: error?.message || "Invalid expression.", evaluate: null };
  }
};

export const evaluateMappingExpression = (source, environment) => {
  const compiled = compileMappingExpression(source);
  if (compiled.error) return { value: null, error: compiled.error };
  try { return { value: compiled.evaluate(environment), error: null }; }
  catch (error) { return { value: null, error: error?.message || "Could not evaluate expression." }; }
};
