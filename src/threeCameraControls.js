import * as THREE from "three";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Browsers are inconsistent about how an auxiliary Mac trackpad gesture is
// represented. Some report button=1, while others keep button=0 and expose
// the middle-button bit (4) on buttons. Keep this mapping pure so the runtime
// and its input tests share one definition. The modifier mapping follows the
// Blender-style trackpad convention used by the Three.js surface.
export const resolveThreePointerDragMode = event => {
  const buttons = Number(event?.buttons) || 0;
  const auxiliary = event?.button === 1 || Boolean(buttons & 4);
  const secondary = event?.button === 2 || Boolean(buttons & 2);
  if (event?.altKey && event?.shiftKey) return "pan";
  if (event?.altKey && event?.ctrlKey) return "zoom";
  if (event?.altKey) return "orbit";
  if (event?.ctrlKey && auxiliary) return "zoom";
  if (event?.shiftKey && (auxiliary || secondary)) return "pan";
  if (auxiliary) return "orbit";
  if (secondary) return "pan";
  // Keep a plain primary drag useful as a fallback for a mouse without an
  // Option key, while Option-drag remains the documented orbit gesture.
  return "orbit";
};

// A Mac two-finger drag arrives as a smooth pixel-mode wheel stream, whereas
// ordinary mouse wheels usually arrive as larger, discrete deltas. Smooth
// streams orbit; Ctrl/Meta turns the same gesture into zoom, and Shift keeps a
// useful pan escape hatch for keyboards that cannot synthesize Option-drag.
export const classifyThreeWheelGesture = event => {
  if (event?.ctrlKey || event?.metaKey) return "zoom";
  if (event?.shiftKey) return "pan";
  const deltaMode = Number(event?.deltaMode) || 0;
  const deltaX = Math.abs(Number(event?.deltaX) || 0);
  const deltaY = Math.abs(Number(event?.deltaY) || 0);
  return deltaMode === 0 && (deltaX > 0.01 || deltaY < 70) ? "orbit" : "zoom";
};

// A deliberately small, local camera controller for Three.js Livecode nodes.
// It keeps camera state ephemeral (never in the patch) and leaves authored
// camera animation alone until the learner interacts with the surface.
export const createThreeCameraControls = ({ canvas, camera, target = new THREE.Vector3() } = {}) => {
  if (!canvas || !camera) return { update: () => {}, dispose: () => {}, reset: () => {} };

  const focusTarget = new THREE.Vector3().copy(target);
  const offset = new THREE.Vector3().subVectors(camera.position, focusTarget);
  const initialRadius = Math.max(0.1, offset.length() || 4);
  const spherical = new THREE.Spherical(initialRadius, Math.acos(clamp(offset.y / initialRadius, -1, 1)), Math.atan2(offset.x, offset.z));
  const keys = new Set();
  let dirty = true;
  let pointerInside = false;
  let drag = null;
  let wheelMode = null;
  let wheelModeUntil = 0;

  const apply = () => {
    spherical.radius = clamp(spherical.radius, 1, 25);
    spherical.phi = clamp(spherical.phi, 0.08, Math.PI - 0.08);
    camera.position.setFromSpherical(spherical).add(focusTarget);
    camera.lookAt(focusTarget);
    dirty = false;
  };

  const orbit = (dx, dy) => {
    spherical.theta -= dx * 0.01;
    spherical.phi -= dy * 0.01;
    dirty = true;
  };

  const pan = (dx, dy) => {
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const scale = spherical.radius * 0.0022;
    focusTarget.addScaledVector(right, -dx * scale);
    focusTarget.addScaledVector(up, dy * scale);
    dirty = true;
  };

  const onPointerEnter = () => { pointerInside = true; };
  const onPointerLeave = () => { pointerInside = false; };
  const onPointerDown = event => {
    const buttons = Number(event.buttons) || 0;
    if (![0, 1, 2].includes(event.button) && !(buttons & 4)) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.focus?.({ preventScroll: true });
    drag = {
      pointerId: event.pointerId,
      mode: resolveThreePointerDragMode(event),
      x: event.clientX,
      y: event.clientY,
    };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = drag.mode === "pan" ? "move" : "grabbing";
  };
  const onPointerMove = event => {
    // A few WebKit/Chromium paths omit the auxiliary pointerdown while still
    // exposing the middle-button bit on the first move. Recover that session
    // so a two-finger trackpad drag behaves like middle-button orbiting.
    if (!drag && (Number(event.buttons) & 4) !== 0) {
      canvas.focus?.({ preventScroll: true });
      drag = {
        pointerId: event.pointerId,
        mode: resolveThreePointerDragMode(event),
        x: event.clientX,
        y: event.clientY,
      };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = "move";
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.mode === "pan") pan(dx, dy);
    else orbit(dx, dy);
  };
  const endPointer = event => {
    if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.pointerId !== undefined) canvas.releasePointerCapture?.(drag.pointerId);
    drag = null;
    canvas.style.cursor = "grab";
  };
  const onWheel = event => {
    event.preventDefault();
    event.stopPropagation();
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now >= wheelModeUntil) wheelMode = classifyThreeWheelGesture(event);
    wheelModeUntil = now + 120;
    if (wheelMode === "orbit") {
      orbit(Number(event.deltaX) || 0, Number(event.deltaY) || 0);
      return;
    }
    if (wheelMode === "pan") {
      pan(-(Number(event.deltaX) || 0), -(Number(event.deltaY) || 0));
      return;
    }
    spherical.radius *= Math.exp((Number(event.deltaY) || 0) * 0.001);
    dirty = true;
  };
  const isCameraKey = event => ["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
  const onKeyDown = event => {
    if (!pointerInside && document.activeElement !== canvas) return;
    if (!isCameraKey(event) || event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    keys.add(event.key);
  };
  const onKeyUp = event => { keys.delete(event.key); };
  const onBlur = () => keys.clear();
  const onContextMenu = event => { event.preventDefault(); event.stopPropagation(); };
  const reset = () => {
    focusTarget.copy(target);
    spherical.set(initialRadius, Math.PI / 2, 0);
    dirty = true;
  };

  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Three.js output; Option-drag to orbit, Shift-Option-drag to pan, Ctrl-Option-drag to zoom, two-finger drag to orbit, Shift-two-finger drag to pan, Ctrl-two-finger drag to zoom");
  canvas.title = THREE_CAMERA_CONTROLS_HINT;
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerenter", onPointerEnter);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const update = delta => {
    const amount = Math.max(0, Math.min(0.1, Number(delta) || 0));
    const step = amount * 2.4;
    if (keys.has("w") || keys.has("ArrowUp")) {
      if (keys.has("ArrowUp")) spherical.phi -= amount * 0.9;
      else focusTarget.y += step;
      dirty = true;
    }
    if (keys.has("s") || keys.has("ArrowDown")) {
      if (keys.has("ArrowDown")) spherical.phi += amount * 0.9;
      else focusTarget.y -= step;
      dirty = true;
    }
    if (keys.has("a") || keys.has("ArrowLeft")) {
      if (keys.has("ArrowLeft")) spherical.theta += amount * 0.9;
      else focusTarget.x -= step;
      dirty = true;
    }
    if (keys.has("d") || keys.has("ArrowRight")) {
      if (keys.has("ArrowRight")) spherical.theta -= amount * 0.9;
      else focusTarget.x += step;
      dirty = true;
    }
    if (keys.has("q")) { spherical.radius *= Math.exp(-amount * 0.8); dirty = true; }
    if (keys.has("e")) { spherical.radius *= Math.exp(amount * 0.8); dirty = true; }
    if (dirty) apply();
  };

  apply();
  return {
    update,
    reset,
    dispose: () => {
      keys.clear();
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
};

export const THREE_CAMERA_CONTROLS_HINT = "Option-drag to orbit · Shift-Option-drag to pan · Ctrl-Option-drag to zoom · Two-finger drag to orbit · Shift-two-finger drag to pan · Ctrl-two-finger drag to zoom · WASD/arrow keys to move";
