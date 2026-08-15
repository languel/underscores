import test from "node:test";
import assert from "node:assert/strict";
import {
  captureLivecodeFrameSnapshot,
  clearLivecodeFrameSnapshot,
  getLivecodeFrameSnapshot,
} from "./livecodeFrameSnapshot.js";

test("Livecode frame snapshots are bounded and kept out of scene data", () => {
  const drawCalls = [];
  const target = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => drawCalls.push(args) }),
    toDataURL: () => "data:image/png;base64,thumbnail",
  };
  const source = {
    width: 1280,
    height: 720,
    toDataURL: () => "data:image/png;base64,source",
  };
  const root = {
    querySelectorAll: () => [{
      getAttribute: () => "node-1",
      querySelector: () => source,
    }],
    createElement: () => target,
  };

  const result = captureLivecodeFrameSnapshot("node-1", { root, maxDimension: 640 });
  assert.equal(result, "data:image/png;base64,thumbnail");
  assert.equal(target.width, 640);
  assert.equal(target.height, 360);
  assert.deepEqual(drawCalls, [[source, 0, 0, 640, 360]]);
  assert.equal(getLivecodeFrameSnapshot("node-1"), result);

  clearLivecodeFrameSnapshot("node-1");
  assert.equal(getLivecodeFrameSnapshot("node-1"), "");
});

test("snapshot capture is a no-op when the live node has no canvas", () => {
  const root = {
    querySelectorAll: () => [{ getAttribute: () => "node-2", querySelector: () => null }],
    createElement: () => { throw new Error("should not allocate"); },
  };
  assert.equal(captureLivecodeFrameSnapshot("node-2", { root }), "");
  assert.equal(getLivecodeFrameSnapshot("node-2"), "");
});

