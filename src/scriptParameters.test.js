import assert from "node:assert/strict";
import test from "node:test";
import { getScriptParameterValues, parseScriptParameters, resolveScriptColorReference } from "./scriptParameters.js";

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

test("parses typed string, color, boolean, and JSON parameters", () => {
  const parameters = parseScriptParameters(`
    // @param title = "Hello" (string)
    // @param tint = "#ff3366" (color)
    // @param enabled = true (boolean)
    // @param options = {"mode":"soft","amount":0.5} (json)
  `, {
    values: {
      title: "Updated",
      tint: "#00ff00",
      enabled: false,
      options: { mode: "hard", amount: 0.75 },
    },
  });
  assert.deepEqual(parameters.map(({ name, type, default: defaultValue, value }) => ({ name, type, default: defaultValue, value })), [
    { name: "title", type: "string", default: "Hello", value: "Updated" },
    { name: "tint", type: "color", default: "#ff3366", value: "#00ff00" },
    { name: "enabled", type: "boolean", default: true, value: false },
    { name: "options", type: "json", default: { mode: "soft", amount: 0.5 }, value: { mode: "hard", amount: 0.75 } },
  ]);
  assert.deepEqual(getScriptParameterValues(parameters), {
    title: "Updated",
    tint: "#00ff00",
    enabled: false,
    options: { mode: "hard", amount: 0.75 },
  });
});

test("preserves explicit false, zero, and null parameter values", () => {
  const parameters = parseScriptParameters(`
    // @param enabled = true (boolean)
    // @param amount = 4 (0..10)
    // @param payload = null (json)
  `, {
    values: { enabled: false, amount: 0, payload: null },
  });
  assert.deepEqual(parameters.map(parameter => parameter.value), [false, 0, null]);
});

test("keeps parsed JSON string values as strings", () => {
  const parameters = parseScriptParameters(`
    // @param message = "hello" (json)
    // @param empty = "fallback" (json)
  `, {
    values: { message: "world", empty: "" },
  });
  assert.deepEqual(parameters.map(parameter => parameter.value), ["world", ""]);
  assert.deepEqual(getScriptParameterValues(parameters), { message: "world", empty: "" });
});

test("resolves live theme color references while preserving ordinary CSS values", () => {
  const appearance = {
    currentColor: "rgba(240, 240, 240, 1)",
    colors: {
      foreground: { color: "#f0f0f0", css: "rgba(240, 240, 240, 1)" },
      accent: { color: "#ff3366", css: "#ff3366" },
    },
  };
  assert.equal(resolveScriptColorReference("__.currentColor", appearance), "rgba(240, 240, 240, 1)");
  assert.equal(resolveScriptColorReference("__.colors.accent.css", appearance), "#ff3366");
  assert.equal(resolveScriptColorReference("accent", appearance), "#ff3366");
  assert.equal(resolveScriptColorReference("rebeccapurple", appearance), "rebeccapurple");
});

test("resolves live Excalidraw foreground, background, and palette references", () => {
  const appearance = {
    currentColor: "#123456",
    currentBackgroundColor: "#abcdef",
    colors: {
      excalidraw: {
        foreground: { color: "#123456", css: "rgba(18, 52, 86, 1)" },
        background: { color: "#abcdef", css: "rgba(171, 205, 239, 1)" },
        strokePalette: ["#1e1e1e", "#e03131"],
      },
    },
  };
  assert.equal(resolveScriptColorReference("__.currentColor", appearance), "#123456");
  assert.equal(resolveScriptColorReference("__.currentBackgroundColor", appearance), "#abcdef");
  assert.equal(resolveScriptColorReference("__.colors.excalidraw.foreground.css", appearance), "rgba(18, 52, 86, 1)");
  assert.equal(resolveScriptColorReference("__.colors.excalidraw.background", appearance), "rgba(171, 205, 239, 1)");
  assert.equal(resolveScriptColorReference("__.colors.excalidraw.strokePalette.1", appearance), "#e03131");
});
