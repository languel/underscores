import assert from "node:assert/strict";
import test from "node:test";
import { buildIannixObjectModel, executeTrustedIannixScript, getIannixCursorCanvasLength, getIannixCursorDuration, getIannixCurvePathLength, getIannixCurveStartAngle, tokenizeIannixCommand } from "./iannixScript.js";

test("tokenizes quoted IanniX command arguments", () => {
  assert.deepEqual(tokenizeIannixCommand('setLabel current "Main curve"'), ["setLabel", "current", "Main curve"]);
});

test("executes trusted IanniX scripts with deterministic helpers", () => {
  const source = `
    function makeWithScript() {
      run("clear");
      run("add curve 1000");
      run("setPointAt current 0 " + random(0, 10) + " 2 0");
      run("setPointAt current 1 8 4 0");
      run("add cursor 1");
      run("setCurve current lastCurve");
    }
  `;
  const first = executeTrustedIannixScript(source, { trusted: true, seed: 42 });
  const second = executeTrustedIannixScript(source, { trusted: true, seed: 42 });
  assert.deepEqual(first.operations, second.operations);
  const model = buildIannixObjectModel(first.operations);
  assert.equal(model.clear, true);
  assert.equal(model.objects.length, 2);
  assert.equal(model.objects[1].curveExternalId, "1000");
});

test("runs IanniX configure lifecycle and exposes ask defaults to score creation", () => {
  const source = `
    function askUserForParameters() {
      title("Grid fixture");
      ask("Lines", "Quantity", "indexMax", 3);
    }
    function makeWithScript() {
      run("clear");
      for (var index = 0; index < indexMax; index++) {
        run("add curve " + (1000 + index));
        run("setPointAt current 1 " + index + " " + rangeMid(index / indexMax, 0, 40, 0));
        run("add cursor " + index);
        run("setCurve current lastCurve");
        run("add trigger " + (2000 + index));
      }
    }
  `;
  const result = executeTrustedIannixScript(source, { trusted: true });
  const model = buildIannixObjectModel(result.operations);
  assert.equal(model.objects.length, 9);
  assert.equal(model.objects.filter(object => object.role === "curve").length, 3);
  assert.equal(model.objects.filter(object => object.role === "cursor").length, 3);
  assert.equal(model.objects.filter(object => object.role === "trigger").length, 3);
});

test("derives imported cursor rotation from its linked curve start tangent", () => {
  const horizontal = { points: [[0, 0, 0], [10, 0, 0]] };
  const rising = { points: [[0, 0, 0], [10, 10, 0]] };
  const vertical = { points: [[0, 0, 0], [0, 10, 0]] };
  assert.equal(getIannixCurveStartAngle(horizontal), 0);
  assert.equal(getIannixCurveStartAngle(rising), -Math.PI / 4);
  assert.equal(getIannixCurveStartAngle(vertical), -Math.PI / 2);
});

test("maps IanniX cursor width to world-space cursor length", () => {
  assert.equal(getIannixCursorCanvasLength({ width: 2 }, 40), 80);
  assert.equal(getIannixCursorCanvasLength({ width: 1 }, 40), 40);
});

test("derives IanniX cursor duration from curve length and speed mode", () => {
  const firstGridCurve = { points: [[0, 0, 0], [0, 15, 0]] };
  const lastGridCurve = { points: [[0, 0, 0], [29, 0.5, 0]] };
  assert.equal(getIannixCurvePathLength(firstGridCurve), 15);
  assert.equal(getIannixCursorDuration({}, firstGridCurve), 15);
  assert.ok(Math.abs(getIannixCursorDuration({}, lastGridCurve) - Math.hypot(29, 0.5)) < 1e-9);
  assert.equal(getIannixCursorDuration({ speed: 2, speedMode: "absolute" }, firstGridCurve), 7.5);
  assert.equal(getIannixCursorDuration({ speed: 10, speedMode: "auto" }, firstGridCurve), 10);
});

test("reports unsupported commands instead of discarding them", () => {
  const result = executeTrustedIannixScript('run("registerTexture background foo.png");', { trusted: true });
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /Unsupported/);
});

test("refuses script execution without explicit trust", () => {
  assert.throws(() => executeTrustedIannixScript("", {}), /explicit trusted/);
});
