import {
  normalizeRelationshipGraph,
  normalizeRelationshipMapping,
} from "./relationshipGraph.js";
import { compileMappingExpression } from "./mappingExpression.js";

const clone = value => value === undefined ? undefined : structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tagsMatch = (required, actual) => !required.length || required.some(tag => actual.includes(tag));
const pairFor = event => [event?.a?.id, event?.b?.id].filter(Boolean).sort().join(":") || "unpaired";
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const fieldValue = (event, field) => {
  switch (field) {
    case "relativeSpeed": return finite(event?.relativeSpeed);
    case "contactX": return finite(event?.point?.[0]);
    case "contactY": return finite(event?.point?.[1]);
    case "normalX": return finite(event?.normal?.[0]);
    case "normalY": return finite(event?.normal?.[1]);
    case "impulse":
    default: return finite(event?.impulse);
  }
};

const environmentFor = (event, raw, norm, value) => ({
  raw,
  norm,
  value,
  impulse: finite(event?.impulse),
  speed: finite(event?.relativeSpeed),
  x: finite(event?.point?.[0]),
  y: finite(event?.point?.[1]),
  normalX: finite(event?.normal?.[0]),
  normalY: finite(event?.normal?.[1]),
});

const targetExpressions = target => {
  switch (target.kind) {
    case "midi-note": return { note: target.noteExpression, velocity: target.velocityExpression };
    case "midi-cc": return { value: target.valueExpression };
    case "midi-bend": return { value: target.valueExpression };
    case "expressive-voice": return {
      note: target.noteExpression,
      gain: target.gainExpression,
      pressure: target.pressureExpression,
      brightness: target.brightnessExpression,
      pan: target.panExpression,
    };
    default: return {};
  }
};

export class PhysicsMappingRuntime {
  constructor({ now = () => performance.now(), onError = null, maxDepth = 4 } = {}) {
    this.now = now;
    this.onError = onError;
    this.maxDepth = maxDepth;
    this.graph = normalizeRelationshipGraph(null);
    this.compiled = new Map();
    this.lastFired = new Map();
    this.activeGates = new Map();
    this.lastErrors = new Map();
    this.depth = 0;
  }

  setGraph(graphValue, release = null) {
    const next = normalizeRelationshipGraph(graphValue);
    const nextById = new Map(next.mappings.filter(mapping => mapping.enabled).map(mapping => [mapping.id, JSON.stringify(mapping)]));
    this.releaseAll(release, record => nextById.get(record.mapping.id) !== JSON.stringify(record.mapping));
    this.graph = next;
    this.compiled.clear();
    for (const mapping of next.mappings) this.compiled.set(mapping.id, this.#compile(mapping));
    return next;
  }

  #compile(mappingValue) {
    const mapping = normalizeRelationshipMapping(mappingValue);
    const fields = {
      filter: compileMappingExpression(mapping.filter.expression),
      transform: compileMappingExpression(mapping.transform.expression),
    };
    for (const [key, expression] of Object.entries(targetExpressions(mapping.target))) fields[`target:${key}`] = compileMappingExpression(expression);
    return { mapping, fields, error: Object.values(fields).find(field => field.error)?.error || null };
  }

  errors() {
    return this.graph.mappings.flatMap(mapping => {
      const compiled = this.compiled.get(mapping.id);
      return compiled?.error ? [{ mappingId: mapping.id, message: compiled.error }] : [];
    });
  }

  #reportError(mapping, message, event) {
    const key = `${mapping.id}:${message}`;
    const now = this.now();
    if (now - (this.lastErrors.get(key) ?? -Infinity) < 1000) return;
    this.lastErrors.set(key, now);
    this.onError?.({ mappingId: mapping.id, name: mapping.name, message, event: clone(event) });
  }

  #sourceMatches(mapping, event, { allowGateEnd = false } = {}) {
    const source = mapping.source;
    if (!mapping.enabled || source.kind !== "physics-collision") return false;
    if (source.systemId && source.systemId !== event?.systemId) return false;
    const phase = String(event?.phase || "");
    if (!allowGateEnd && source.phases.length && !source.phases.includes(phase)) return false;
    if (source.classes.length && !source.classes.includes(String(event?.collisionClass || ""))) return false;
    if (!tagsMatch(source.tagsA, (event?.a?.tags || []).map(String))) return false;
    if (!tagsMatch(source.tagsB, (event?.b?.tags || []).map(String))) return false;
    return true;
  }

  #values(compiled, event) {
    const { mapping, fields } = compiled;
    if (compiled.error) throw new Error(compiled.error);
    const raw = fieldValue(event, mapping.source.field);
    const range = mapping.source.range;
    const span = range.max - range.min;
    const norm = span === 0 ? 0 : (raw - range.min) / span;
    const initialValue = mapping.transform.outputMin + (mapping.transform.outputMax - mapping.transform.outputMin) * norm;
    let value = initialValue * mapping.transform.scale + mapping.transform.offset;
    let environment = environmentFor(event, raw, norm, value);
    if (mapping.filter.min !== null && raw < mapping.filter.min) return null;
    if (mapping.filter.max !== null && raw > mapping.filter.max) return null;
    if (mapping.filter.expression && !fields.filter.evaluate(environment)) return null;
    if (mapping.transform.expression) value = fields.transform.evaluate(environment);
    if (mapping.transform.clamp) value = clamp(value, Math.min(mapping.transform.outputMin, mapping.transform.outputMax), Math.max(mapping.transform.outputMin, mapping.transform.outputMax));
    environment = environmentFor(event, raw, norm, value);
    const targetValues = {};
    for (const [key, field] of Object.entries(fields)) {
      if (!key.startsWith("target:")) continue;
      targetValues[key.slice(7)] = field.evaluate(environment);
    }
    return { raw, norm, value, environment, targetValues };
  }

  #gateEndPhase(mapping, phase) {
    if (mapping.target.mode !== "gate") return false;
    return phase === "end" || phase === "exit";
  }

  #gateStartPhase(mapping, phase) {
    if (mapping.target.mode !== "gate") return false;
    return phase === "begin" || phase === "enter";
  }

  route(event, dispatch) {
    if (this.depth >= this.maxDepth) return 0;
    let count = 0;
    for (const mapping of this.graph.mappings) {
      const compiled = this.compiled.get(mapping.id) || this.#compile(mapping);
      const pairKey = pairFor(event);
      const gateKey = `${mapping.id}:${pairKey}`;
      const phase = String(event?.phase || "");
      const gateEnd = this.#gateEndPhase(mapping, phase);
      if (!this.#sourceMatches(mapping, event, { allowGateEnd: gateEnd })) continue;
      if (gateEnd) {
        const active = this.activeGates.get(gateKey);
        if (active) {
          this.activeGates.delete(gateKey);
          this.#dispatch(dispatch, { operation: "release", mapping, target: mapping.target, event, values: active.values, pairKey, gateKey });
          count += 1;
        }
        continue;
      }
      let values;
      try { values = this.#values(compiled, event); }
      catch (error) { this.#reportError(mapping, error?.message || "Invalid mapping expression.", event); continue; }
      if (!values) continue;
      const cooldownKey = mapping.perPair ? `${mapping.id}:${pairKey}` : mapping.id;
      const now = this.now();
      if (!this.#gateStartPhase(mapping, phase) && phase !== "stay" && now - (this.lastFired.get(cooldownKey) ?? -Infinity) < mapping.cooldownMs) continue;
      if (!this.#gateStartPhase(mapping, phase) && phase !== "stay") this.lastFired.set(cooldownKey, now);
      if (this.#gateStartPhase(mapping, phase)) {
        if (this.activeGates.has(gateKey)) continue;
        this.activeGates.set(gateKey, { mapping, values, pairKey, gateKey });
        this.#dispatch(dispatch, { operation: "begin", mapping, target: mapping.target, event, values, pairKey, gateKey });
      } else if (mapping.target.mode === "gate" && phase === "stay") {
        if (!this.activeGates.has(gateKey)) continue;
        this.activeGates.set(gateKey, { mapping, values, pairKey, gateKey });
        this.#dispatch(dispatch, { operation: "update", mapping, target: mapping.target, event, values, pairKey, gateKey });
      } else {
        this.#dispatch(dispatch, { operation: "hit", mapping, target: mapping.target, event, values, pairKey, gateKey: `${gateKey}:${event?.step || now}` });
      }
      count += 1;
    }
    return count;
  }

  #dispatch(dispatch, descriptor) {
    if (this.depth >= this.maxDepth) return false;
    this.depth += 1;
    try { dispatch?.(descriptor); return true; }
    finally { this.depth -= 1; }
  }

  releaseAll(dispatch, predicate = () => true) {
    for (const [key, record] of [...this.activeGates]) {
      if (!predicate(record)) continue;
      this.activeGates.delete(key);
      this.#dispatch(dispatch, { operation: "release", mapping: record.mapping, target: record.mapping.target, event: null, values: record.values, pairKey: record.pairKey, gateKey: record.gateKey });
    }
  }
}
