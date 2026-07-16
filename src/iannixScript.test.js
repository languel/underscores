import assert from "node:assert/strict";
import test from "node:test";
import { buildIannixObjectModel, executeTrustedIannixScript, tokenizeIannixCommand } from "./iannixScript.js";

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

test("reports unsupported commands instead of discarding them", () => {
  const result = executeTrustedIannixScript('run("registerTexture background foo.png");', { trusted: true });
  assert.equal(result.unsupported.length, 1);
  assert.match(result.unsupported[0].reason, /Unsupported/);
});

test("refuses script execution without explicit trust", () => {
  assert.throws(() => executeTrustedIannixScript("", {}), /explicit trusted/);
});
