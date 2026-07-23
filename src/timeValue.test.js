import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustTimeValue,
  createTimeValue,
  formatSecondsAsBBU,
  formatTimeValueForDisplay,
  parseTimeValue,
  quantizeTimeValue,
  resolveTimeValue,
  timeValueDependencies,
  validateTimeValue,
} from "./timeValue.js";

const context = {
  tempo: 120,
  signature: { numerator: 4, denominator: 4 },
  fps: 30,
  sampleRate: 48000,
};

test("parses fixed, frame, sample, frequency, and clock expressions", () => {
  assert.equal(resolveTimeValue("17", context), 17);
  assert.equal(resolveTimeValue("17 Seconds", context), 17);
  assert.equal(resolveTimeValue("333 ms", context), 0.333);
  assert.equal(resolveTimeValue("34 f", context), 34 / 30);
  assert.equal(resolveTimeValue("48000 samples", context), 1);
  assert.equal(resolveTimeValue("5 hz", context), 0.2);
  assert.equal(resolveTimeValue("1:15", context), 75);
  assert.equal(resolveTimeValue("01:03:45.250", context), 3825.25);
  assert.equal(resolveTimeValue("01:03:45:15", context), 3825.5);
  assert.equal(resolveTimeValue("1 3 45 250 hh:mm:ss", context), 3825.25);
});

test("parses elapsed BBU, bars, beats, and Cycling note values", () => {
  assert.equal(resolveTimeValue("4.0.0", context), 8);
  assert.equal(resolveTimeValue("2 4 240 bbu", context), 6.25);
  assert.equal(resolveTimeValue("2 bars", context), 4);
  assert.equal(resolveTimeValue("3 beats", context), 1.5);
  assert.equal(resolveTimeValue("4n", context), 0.5);
  assert.equal(resolveTimeValue("2 4n", context), 1);
  assert.equal(resolveTimeValue("4nt", context), 1 / 3);
  assert.equal(resolveTimeValue("1nd", context), 3);
  assert.equal(resolveTimeValue("128n", context), 1 / 64);
});

test("meter beats honor the denominator while note values remain quarter-relative", () => {
  const sixEight = { ...context, signature: { numerator: 6, denominator: 8 } };
  const sevenEight = { ...context, signature: { numerator: 7, denominator: 8 } };
  assert.equal(resolveTimeValue("1 beat", sixEight), 0.25);
  assert.equal(resolveTimeValue("1 bar", sixEight), 1.5);
  assert.equal(resolveTimeValue("4n", sixEight), 0.5);
  assert.equal(resolveTimeValue("1 bar", sevenEight), 1.75);
});

test("dependencies are explicit and fixed units remain fixed", () => {
  assert.deepEqual(timeValueDependencies("4n", context), ["tempo"]);
  assert.deepEqual(timeValueDependencies("2 bars", context), ["tempo", "signature"]);
  assert.deepEqual(timeValueDependencies("34 f", context), ["fps"]);
  assert.deepEqual(timeValueDependencies("100 samples", context), ["sampleRate"]);
  assert.deepEqual(timeValueDependencies("333 ms", context), []);
  assert.equal(resolveTimeValue("4n", { ...context, tempo: 60 }), 1);
  assert.equal(resolveTimeValue("333 ms", { ...context, tempo: 60 }), 0.333);
});

test("invalid expressions preserve fallback and ticks remain reserved", () => {
  const prior = createTimeValue("3 s", 3, context);
  const invalid = { ...prior, expression: "not time" };
  assert.equal(validateTimeValue(invalid, context), false);
  assert.equal(resolveTimeValue(invalid, context), 3);
  assert.match(parseTimeValue("100 ticks", context).error, /reserved/i);
});

test("drag adjustment retains the authored family and finer subunit", () => {
  assert.equal(adjustTimeValue("17 s", 1, { context }).expression, "18 s");
  assert.equal(adjustTimeValue("17 s", 1, { context, fine: true }).expression, "17.001 s");
  assert.equal(adjustTimeValue("333 ms", -1, { context }).expression, "332 ms");
  assert.equal(adjustTimeValue("34 f", 1, { context, fine: true }).expression, "35 f");
  assert.equal(adjustTimeValue("1000 samples", 1, { context }).expression, "1001 samples");
  assert.equal(adjustTimeValue("5 hz", 1, { context, fine: true }).expression, "5.1 hz");
  assert.equal(adjustTimeValue("1:15", 1, { context }).expression, "2:15");
  assert.equal(adjustTimeValue("1:15", 1, { context, fine: true }).expression, "1:16");
  assert.equal(adjustTimeValue("4.0.0", 1, { context }).expression, "5.0.0");
  assert.equal(adjustTimeValue("4.0.0", 1, { context, fine: true }).expression, "4.1.0");
  assert.equal(adjustTimeValue("4n", 1, { context }).expression, "2 4n");
  assert.equal(adjustTimeValue("4n", 1, { context, fine: true }).expression, "1.5 4n");
  assert.equal(adjustTimeValue("0 s", -1, { context }).expression, "-1 s");
});

test("quantization rewrites the coefficient in the authored family", () => {
  assert.equal(quantizeTimeValue("1.24 s", "250 ms", context).expression, "1.25 s");
  assert.equal(quantizeTimeValue("2.4 beats", "1 beat", context).expression, "2 beats");
  assert.equal(quantizeTimeValue("1.6 4n", "4n", context).expression, "2 4n");
});

test("seconds format to elapsed BBU with stable boundary carry", () => {
  assert.equal(formatSecondsAsBBU(0, context), "0.0.0");
  assert.equal(formatSecondsAsBBU(2.5, context), "1.1.0");
  assert.equal(formatSecondsAsBBU(1.9999999, context), "1.0.0");
});

test("display formatting rounds floating point noise without changing structured time syntax", () => {
  assert.equal(formatTimeValueForDisplay("2.941810344827586 s"), "2.942 s");
  assert.equal(formatTimeValueForDisplay("0.32000000000000006"), "0.32");
  assert.equal(formatTimeValueForDisplay("2.4.240"), "2.4.240");
  assert.equal(formatTimeValueForDisplay("01:03:45.2500"), "01:03:45.25");
});
