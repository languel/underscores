import test from "node:test";
import assert from "node:assert/strict";
import { isRegisteredWalkthroughTarget, resolveWalkthroughTarget } from "./walkthroughTargets.js";

test("walkthrough target registry rejects selectors and script access", () => {
  assert.equal(isRegisteredWalkthroughTarget("panel.script"), true);
  assert.equal(isRegisteredWalkthroughTarget("canvas.element:node-1"), true);
  assert.equal(isRegisteredWalkthroughTarget(".script-panel"), false);
  assert.equal(isRegisteredWalkthroughTarget("document.body"), false);
  assert.equal(isRegisteredWalkthroughTarget("javascript:alert(1)"), false);
});

test("canvas element targets resolve through scene coordinates", () => {
  const api = {
    getSceneElementsIncludingDeleted: () => [{ id: "node-1", x: 10, y: 20, width: 30, height: 40 }],
    getAppState: () => ({}),
  };
  const target = resolveWalkthroughTarget("canvas.element:node-1", {
    documentRef: null,
    getCanvasApi: () => api,
    sceneToViewport: ({ sceneX, sceneY }) => ({ x: sceneX + 5, y: sceneY + 6 }),
  });
  assert.equal(target.rect.left, 30);
  assert.equal(target.rect.top, 46);
});
