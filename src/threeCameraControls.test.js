import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyThreeWheelGesture,
  resolveThreePointerDragMode,
} from "./threeCameraControls.js";

test("Three.js camera pointer gestures follow the Blender trackpad convention", () => {
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true }), "orbit");
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true, shiftKey: true }), "pan");
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true, ctrlKey: true }), "zoom");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4 }), "orbit");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4, shiftKey: true }), "pan");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4, ctrlKey: true }), "zoom");
});

test("Three.js camera wheel streams distinguish trackpad orbit, pan, and zoom", () => {
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 16, deltaY: 4 }), "orbit");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 0, deltaY: 4, shiftKey: true }), "pan");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 0, deltaY: 4, ctrlKey: true }), "zoom");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 1, deltaX: 0, deltaY: 3 }), "zoom");
});
