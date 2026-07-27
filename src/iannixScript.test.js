import assert from "node:assert/strict";
import test from "node:test";
import { buildIannixObjectModel, executeTrustedIannixScript, getIannixCursorCanvasLength, getIannixCursorDuration, getIannixCursorLoopMode, getIannixCurvePathLength, getIannixCurveStartAngle, serializeBezierElementToIannixCommands, tokenizeIannixCommand } from "./iannixScript.js";
import { createBezierHostGeometry } from "./bezierGeometry.js";

test("tokenizes quoted IanniX command arguments", () => {
  assert.deepEqual(tokenizeIannixCommand('setLabel current "Main curve"'), ["setLabel", "current", "Main curve"]);
});

test("standalone IanniX commands can inherit the current object", () => {
  const result = executeTrustedIannixScript('run("setLabel current Updated label");', {
    trusted: true,
    currentId: "curve-12",
  });
  assert.deepEqual(result.operations, [{ type: "label", externalId: "curve-12", value: "Updated label" }]);
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

  const overridden = executeTrustedIannixScript(source, {
    trusted: true,
    parameters: { indexMax: 2 },
  });
  const overriddenModel = buildIannixObjectModel(overridden.operations);
  assert.equal(overriddenModel.objects.length, 6);
  assert.equal(overridden.parameters[0].value, 2);
});

test("runs saved GUI lifecycle and samples equation curves", () => {
  const source = `
    function makeWithScript() { run("clear"); }
    function madeThroughGUI() {
      run("add curve 3");
      run("setEquation current cartesian (param1+1)*cos(t*2*PI),(param1+1)*sin(t*2*PI),0");
      run("setEquationParam current param1 1");
      run("setEquationNbPoints current 8");
      run("setColorActive current 44 167 218 128");
      run("add cursor 54");
      run("setCurve current lastCurve");
      run("add trigger 7");
      run("setTriggerOff current 1");
    }
  `;
  const result = executeTrustedIannixScript(source, { trusted: true });
  const model = buildIannixObjectModel(result.operations);
  const curve = model.objects.find(object => object.role === "curve");
  const trigger = model.objects.find(object => object.role === "trigger");
  assert.equal(model.objects.length, 3);
  assert.equal(curve.points.length, 9);
  assert.ok(Math.abs(curve.points[0][0] - 2) < 1e-9);
  assert.ok(Math.abs(curve.points[4][0] + 2) < 1e-9);
  assert.deepEqual(curve.color, [44, 167, 218, 128]);
  assert.equal(trigger.triggerOff, true);
  assert.equal(result.unsupported.length, 0);
});

test("uses a readable default width for unstyled IanniX objects", () => {
  const result = executeTrustedIannixScript('run("add curve visible");', { trusted: true });
  const curve = buildIannixObjectModel(result.operations).objects[0];
  assert.equal(curve.width, 2);
});

test("applies IanniX group colours without creating a phantom group object", () => {
  const result = executeTrustedIannixScript(`
    run("add curve first");
    run("setGroup current lines");
    run("add curve second");
    run("setGroup current lines");
    run("setColor lines 0 187 255 255");
    run("setColorHue second 300 255 128 255");
  `, { trusted: true });
  const model = buildIannixObjectModel(result.operations);
  assert.equal(model.objects.length, 2);
  assert.deepEqual(model.objects.find(object => object.externalId === "first").color, [0, 187, 255, 255]);
  // Individual object colour takes precedence over its group default.
  assert.deepEqual(model.objects.find(object => object.externalId === "second").colorHue, [300, 255, 128, 255]);
  assert.equal(model.objects.find(object => object.externalId === "second").color, undefined);
});

test("derives imported cursor rotation from its linked curve start tangent", () => {
  const horizontal = { points: [[0, 0, 0], [10, 0, 0]] };
  const rising = { points: [[0, 0, 0], [10, 10, 0]] };
  const vertical = { points: [[0, 0, 0], [0, 10, 0]] };
  assert.equal(getIannixCurveStartAngle(horizontal), 0);
  assert.equal(getIannixCurveStartAngle(rising), -Math.PI / 4);
  assert.equal(getIannixCurveStartAngle(vertical), -Math.PI / 2);
  assert.equal(getIannixCurveStartAngle({ points: [[0, 0, 0], [10, 10, 0]], controls: [null, { c1: [0, 4, 0] }] }), -Math.PI / 2);
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

test("maps IanniX cursor traversal patterns to Drawerator loop modes", () => {
  assert.equal(getIannixCursorLoopMode({ pattern: "0 0 1" }), "loop");
  assert.equal(getIannixCursorLoopMode({ pattern: "0 0 1 -1" }), "pingPong");
  assert.equal(getIannixCursorLoopMode({ pattern: "0 0 1 1" }), "loop");
  assert.equal(getIannixCursorLoopMode({ pattern: "0 0 1 0" }), "once");
});

test("preserves explicit IanniX cubic controls", () => {
  const result = executeTrustedIannixScript(`
    run("add curve 7");
    run("setPointAt 7 0 0 0 0 0 0 0 0 0 0");
    run("setPointAt 7 1 10 5 0 3 4 0 -2 1 0");
  `, { trusted: true });
  const curve = buildIannixObjectModel(result.operations).objects[0];
  assert.deepEqual(curve.controls[1].c1, [3, 4, 0]);
  assert.deepEqual(curve.controls[1].c2, [-2, 1, 0]);
  assert.ok(getIannixCurvePathLength(curve) > Math.hypot(10, 5));

  const twoDimensional = executeTrustedIannixScript(`run("add curve 8"); run("setPointAt 8 0 2 3 4 5 6 7");`, { trusted: true });
  const point2d = buildIannixObjectModel(twoDimensional.operations).objects[0];
  assert.deepEqual(point2d.points[0], [2, 3, 0]);
  assert.deepEqual(point2d.controls[0].c1, [4, 5, 0]);
  assert.deepEqual(point2d.controls[0].c2, [6, 7, 0]);
});

test("exports canonical handles with IanniX endpoint control semantics", () => {
  const host = createBezierHostGeometry([
    { x: 0, y: 0, out: [3, -4], mode: "corner" },
    { x: 10, y: 5, in: [-2, -1], mode: "corner" },
  ]);
  const element = { id: "curve", ...host.bounds, angle: 0, customData: { draweratorGeometry: host.geometry } };
  const commands = serializeBezierElementToIannixCommands(element, { externalId: 7 });
  assert.equal(commands[0], "add curve 7");
  assert.match(commands[2], /setPointAt 7 1 10 -5 0 3 4 0 -2 1 0/);
});

test("reports unsupported commands instead of discarding them", () => {
  const result = executeTrustedIannixScript('run("registerTexture background foo.png");', { trusted: true });
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /Unsupported/);
});

test("refuses script execution without explicit trust", () => {
  assert.throws(() => executeTrustedIannixScript("", {}), /explicit trusted/);
});
