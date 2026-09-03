import test from "node:test";
import assert from "node:assert/strict";
import { applyMediaKey, DEFAULT_MEDIA_KEY, normalizeMediaKey } from "./mediaKeying.js";

test("media key defaults normalize colors and safe ranges", () => {
  assert.deepEqual(normalizeMediaKey(), DEFAULT_MEDIA_KEY);
  assert.deepEqual(normalizeMediaKey({ mode: "color", color: "#0f0", threshold: -1, softness: 4 }), {
    mode: "color",
    color: "#00ff00",
    threshold: 0,
    softness: 1,
  });
  assert.equal(normalizeMediaKey({ mode: "invalid" }).mode, "off");
});

test("media key removes matching pixels and preserves unrelated pixels", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 0, 0, 255,
  ]);
  let written = null;
  const context = {
    getImageData: () => ({ data: pixels }),
    putImageData: image => { written = image; },
  };
  assert.equal(applyMediaKey(context, 2, 1, { mode: "black", threshold: 0.01, softness: 0.01 }), true);
  assert.equal(written.data[3], 0);
  assert.equal(written.data[7], 255);
});

test("green and picked-color keys use the same normalized distance", () => {
  const pixels = new Uint8ClampedArray([
    0, 255, 0, 255,
    0, 0, 255, 255,
  ]);
  let written = null;
  const context = {
    getImageData: () => ({ data: pixels }),
    putImageData: image => { written = image; },
  };
  assert.equal(applyMediaKey(context, 2, 1, { mode: "green", threshold: 0.01, softness: 0.01 }), true);
  assert.equal(written.data[3], 0);
  assert.equal(written.data[7], 255);
  assert.equal(applyMediaKey(context, 2, 1, { mode: "color", color: "#0000ff", threshold: 0.01, softness: 0.01 }), true);
  assert.equal(written.data[7], 0);
});

test("media key off leaves the canvas untouched", () => {
  let reads = 0;
  const context = { getImageData: () => { reads += 1; } };
  assert.equal(applyMediaKey(context, 10, 10, DEFAULT_MEDIA_KEY), false);
  assert.equal(reads, 0);
});
