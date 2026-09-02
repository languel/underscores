import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  classifyThreeWheelGesture,
  createThreeCameraControls,
  isThreeCameraResetShortcut,
  resolveThreePointerDragMode,
  resolveThreeKeyboardMove,
} from "./threeCameraControls.js";

test("Three.js camera controls report whether a frame needs repainting", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = new Map();
  const canvas = {
    style: {},
    tabIndex: -1,
    setAttribute() {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    focus() {},
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { activeElement: null };
  try {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 4);
    const controls = createThreeCameraControls({ canvas, camera });
    assert.equal(controls.update(1 / 60), false);
    listeners.get("wheel")({
      preventDefault() {},
      stopPropagation() {},
      deltaMode: 0,
      deltaX: 12,
      deltaY: 4,
    });
    assert.equal(controls.update(1 / 60), true);
    assert.equal(controls.update(1 / 60), false);
    controls.dispose();
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test("Three.js camera pointer gestures follow the Blender trackpad convention", () => {
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true }), "orbit");
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true, shiftKey: true }), "pan");
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true, ctrlKey: true }), "zoom");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4 }), "orbit");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4, shiftKey: true }), "pan");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4, ctrlKey: true }), "zoom");
});

test("Three.js camera zoom gesture is reserved for Ctrl+Option or Ctrl-middle drag", () => {
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, ctrlKey: true }), "orbit");
  assert.equal(resolveThreePointerDragMode({ button: 0, buttons: 1, altKey: true, ctrlKey: true }), "zoom");
  assert.equal(resolveThreePointerDragMode({ button: 1, buttons: 4, ctrlKey: true }), "zoom");
});

test("Three.js Option-Home reset is recognized without consuming ordinary Home", () => {
  assert.equal(isThreeCameraResetShortcut({ key: "Home", altKey: true }), true);
  assert.equal(isThreeCameraResetShortcut({ key: "Home" }), false);
  assert.equal(isThreeCameraResetShortcut({ key: "End", altKey: true }), false);
});

test("Three.js keyboard movement follows the camera basis instead of fixed world axes", () => {
  const delta = resolveThreeKeyboardMove({
    keys: new Set(["w", "d"]),
    forward: new THREE.Vector3(1, 0, 0),
    right: new THREE.Vector3(0, 0, -1),
    step: 2,
  });
  assert.ok(Math.abs(delta.x - Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(delta.z + Math.SQRT2) < 1e-9);
  assert.equal(delta.y, 0);

  const vertical = resolveThreeKeyboardMove({ keys: ["e"], step: 1.5 });
  assert.deepEqual(vertical.toArray(), [0, 1.5, 0]);
});

test("Three.js camera wheel streams distinguish trackpad orbit, pan, and zoom", () => {
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 16, deltaY: 4 }), "orbit");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 0, deltaY: 4, shiftKey: true }), "pan");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 0, deltaX: 0, deltaY: 4, ctrlKey: true }), "zoom");
  assert.equal(classifyThreeWheelGesture({ deltaMode: 1, deltaX: 0, deltaY: 3 }), "zoom");
});
