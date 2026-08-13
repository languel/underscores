import test from "node:test";
import assert from "node:assert/strict";
import { SCRIPT_AUTHORING_GUIDES, formatAIScriptSource, validateAIBrushSource, validateAIIannixSource } from "./scriptAuthoring.js";

test("formats compact AI source without altering strings or for-loop headers", () => {
  const formatted = formatAIScriptSource('function makeWithScript() { run("add curve orbit"); for (let i = 0; i < 2; i += 1) { run(`setPointAt current ${i} ${i * 2} 0`); } }');
  assert.equal(formatted, [
    "function makeWithScript() {",
    '  run("add curve orbit");',
    "  for (let i = 0; i < 2; i += 1) {",
    "    run(`setPointAt current ${i} ${i * 2} 0`);",
    "  }",
    "}",
  ].join("\n"));
});

test("IanniX authoring guide distinguishes model units from canvas pixels", () => {
  assert.match(SCRIPT_AUTHORING_GUIDES.iannix, /model units, not canvas pixels/i);
  assert.match(SCRIPT_AUTHORING_GUIDES.iannix, /setPos current 12 -8 0/);
  assert.match(SCRIPT_AUTHORING_GUIDES.iannix, /480 or 960/);
  assert.match(SCRIPT_AUTHORING_GUIDES.iannix, /setWidth current 2/);
  assert.match(SCRIPT_AUTHORING_GUIDES.iannix, /setColor current 201 205 210 255/);
});

test("accepts deterministic IanniX lifecycle scripts with supported run commands", () => {
  const validation = validateAIIannixSource(`
    function makeWithScript() {
      run("clear");
      run("add curve orbit");
      run("setPointsEllipse current 240 240");
      run("add cursor traveler");
      run("setCurve current lastCurve");
    }
  `);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.commands, ["clear", "add", "setpointsellipse", "setcurve"]);
});

test("rejects generic JavaScript instead of storing it as an IanniX score", () => {
  const validation = validateAIIannixSource(`
    const planets = [{ radius: 200, speed: 0.001 }];
    return planets.map(p => ({ x: Math.cos(Date.now() * p.speed), y: p.radius }));
  `);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /Date/);
  assert.match(validation.errors.join(" "), /makeWithScript/);
  assert.match(validation.errors.join(" "), /run/);
});

test("rejects unsupported IanniX command names before execution", () => {
  const validation = validateAIIannixSource(`
    function makeWithScript() {
      run("registerTexture background stars.png");
    }
  `);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /Unsupported IanniX command/);
});

test("rejects dynamic IanniX command dispatch that cannot be preflighted", () => {
  const validation = validateAIIannixSource(`
    function makeWithScript() {
      const command = "add curve orbit";
      run(command);
    }
  `);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /literal supported IanniX command/);
});

test("accepts literal-command template strings while rejecting a dynamic command prefix", () => {
  const valid = validateAIIannixSource(`
    function makeWithScript() {
      for (let index = 0; index < 2; index += 1) {
        run(\`setPointAt current \${index} \${index * 100} 0\`);
      }
    }
  `);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.commands, ["setpointat"]);

  const invalid = validateAIIannixSource(`
    function makeWithScript() {
      const command = "setPointAt";
      run(\`\${command} current 0 0 0\`);
    }
  `);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /literal supported IanniX command/);
});

test("preflights common native-IanniX command shapes Underscore does not implement", () => {
  const validation = validateAIIannixSource(`
    function makeWithScript() {
      run("setPointsEllipse current 400 300 120 80");
      run("presentation center 400 300 0");
    }
  `);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /setPointsEllipse uses only radii/);
  assert.match(validation.errors.join(" "), /Unsupported IanniX command/);
});

test("validates Brush / modifier source shape without executing it", () => {
  assert.equal(validateAIBrushSource("(points, globals) => [points]").valid, true);
  const invalid = validateAIBrushSource("() => [points]");
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /first argument is points/);
});
