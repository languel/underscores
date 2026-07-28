import assert from "node:assert/strict";
import test from "node:test";
import { getScriptParameterValues, parseScriptParameters } from "./scriptParameters.js";

test("maps IanniX ask declarations to shared slider parameters", () => {
  const parameters = parseScriptParameters('ask("Lines", "Quantity", "indexMax", 30);', {
    includeIannixAsk: true,
  });
  assert.deepEqual(parameters, [{
    name: "indexMax",
    label: "Quantity",
    category: "Lines",
    default: 30,
    min: 0,
    max: 60,
    step: 1,
    source: "iannix-ask",
    value: 30,
  }]);
});

test("lets @param refine an IanniX ask range and restores persisted values", () => {
  const parameters = parseScriptParameters(`
    // @param indexMax = 30 (1..120, step: 5)
    ask('Lines', 'Quantity', 'indexMax', 30);
  `, {
    includeIannixAsk: true,
    values: { indexMax: 45 },
  });
  assert.equal(parameters.length, 1);
  assert.deepEqual(parameters[0], {
    name: "indexMax",
    label: "Quantity",
    category: "Lines",
    default: 30,
    min: 1,
    max: 120,
    step: 5,
    source: "iannix-ask",
    value: 45,
  });
  assert.deepEqual(getScriptParameterValues(parameters), { indexMax: 45 });
});

test("parses object parameters without coercing their canvas references", () => {
  const parameters = parseScriptParameters(`
    // @param driver = "Main curve" (object)
    // @param triggerGroup = pulses (canvas)
    // @param gain = 0.5 (0..1, step: 0.05)
  `, {
    values: { driver: "curve-7", gain: 0.75 },
  });
  assert.deepEqual(parameters[0], {
    name: "driver",
    label: "driver",
    category: "",
    default: "Main curve",
    type: "object",
    source: "param-object",
    value: "curve-7",
  });
  assert.equal(parameters[1].default, "pulses");
  assert.equal(parameters[1].value, "pulses");
  assert.equal(parameters[2].value, 0.75);
  assert.deepEqual(getScriptParameterValues(parameters), {
    driver: "curve-7",
    triggerGroup: "pulses",
    gain: 0.75,
  });
});
