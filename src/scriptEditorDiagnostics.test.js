import test from "node:test";
import assert from "node:assert/strict";
import { validateJavascriptEditorSource } from "./scriptEditorDiagnostics.js";

test("trusted IanniX editor diagnostics accept dynamic run commands", () => {
  const diagnostics = validateJavascriptEditorSource(`
    function makeWithScript() {
      for (let index = 0; index < 3; index += 1) {
        run("setPointAt current " + index + " " + index + " 0");
      }
    }
  `, { label: "IanniX source" });
  assert.deepEqual(diagnostics, []);
});

test("brush editor diagnostics compile source as an expression", () => {
  assert.deepEqual(
    validateJavascriptEditorSource("(points, globals) => [points]", {
      expression: true,
      label: "Brush source",
    }),
    [],
  );
  assert.match(
    validateJavascriptEditorSource("(points) => {", {
      expression: true,
      label: "Brush source",
    })[0].message,
    /does not compile/,
  );
});

test("JavaScript editor diagnostics reject empty source", () => {
  assert.match(validateJavascriptEditorSource("")[0].message, /required/);
});
