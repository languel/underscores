import assert from "node:assert/strict";
import test from "node:test";
import {
  cacheThreeFrameConfig,
  compileThreeSource,
  normalizeThreeFrame,
  THREE_LIVECODE_VERSION,
  validateThreeSource,
} from "./threeFrame.js";

test("Three.js Livecode config stays referentially stable across equivalent normalization", () => {
  const first = cacheThreeFrameConfig(null, {
    source: "scene.add(mesh);",
    parameters: { speed: 1 },
    transparent: true,
  });
  const repeated = cacheThreeFrameConfig(first, {
    source: "scene.add(mesh);",
    parameters: { speed: 1 },
    transparent: true,
  });
  const edited = cacheThreeFrameConfig(repeated, {
    source: "scene.add(otherMesh);",
    parameters: { speed: 1 },
    transparent: true,
  });
  assert.equal(repeated, first);
  assert.notEqual(edited, first);
});

test("Three.js Livecode uses stable renderer defaults", () => {
  const frame = normalizeThreeFrame({ pixelRatio: 8, transparent: false });
  assert.equal(frame.transparent, false);
  assert.equal(frame.pixelRatio, 2);
  assert.equal(frame.allowInteraction, true);
  assert.equal(frame.keepLastFrame, true);
  assert.equal(normalizeThreeFrame({ keepLastFrame: false }).keepLastFrame, false);
  assert.equal(THREE_LIVECODE_VERSION, "0.185.1");
});

test("Three.js source receives the independent scene contract and accepts top-level await", async () => {
  const calls = [];
  const run = compileThreeSource("await Promise.resolve(); tick(({ delta }) => __.params.result.push([THREE.name, __.params.speed, delta]));");
  const tickers = [];
  await run({ name: "Three" }, {}, {}, {}, { params: { speed: 2, result: calls } }, callback => tickers.push(callback), () => {});
  tickers[0]({ delta: 0.5 });
  assert.deepEqual(calls, [["Three", 2, 0.5]]);
  assert.equal(validateThreeSource("const = nope").valid, false);
});
