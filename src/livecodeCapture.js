// Livecode surfaces are DOM overlays rather than Excalidraw exports. Keep a
// tiny opt-in registry so canvas capture can ask a node for one frame without
// making every livecode renderer retain or copy its drawing buffer each tick.
const captures = new Map();

export const registerLivecodeCapture = (elementId, capture) => {
  const id = String(elementId || "");
  if (!id || typeof capture !== "function") return () => {};
  captures.set(id, capture);
  return () => {
    if (captures.get(id) === capture) captures.delete(id);
  };
};

export const captureLivecodeFrame = async elementId => {
  const capture = captures.get(String(elementId || ""));
  if (!capture) return null;
  try {
    const frame = await capture();
    return frame && Number(frame.width) > 0 && Number(frame.height) > 0 ? frame : null;
  } catch {
    return null;
  }
};

// Read a WebGL default framebuffer only when a capture is requested. The
// result is vertically flipped into a reusable 2D canvas because WebGL's
// origin is bottom-left while Canvas 2D's origin is top-left.
export const readWebglFrame = (canvas, gl, runtime) => {
  if (!canvas || !gl || !runtime) return null;
  const width = Number(canvas.width) || 0;
  const height = Number(canvas.height) || 0;
  if (!width || !height || typeof document === "undefined") return null;
  const pixels = runtime.capturePixels?.length === width * height * 4
    ? runtime.capturePixels
    : new Uint8Array(width * height * 4);
  runtime.capturePixels = pixels;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  if (gl.getError?.() !== gl.NO_ERROR) return null;
  if (!runtime.captureCanvas) runtime.captureCanvas = document.createElement("canvas");
  const target = runtime.captureCanvas;
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  const context = target.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = (height - y - 1) * width * 4;
    image.data.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4);
  }
  context.putImageData(image, 0, 0);
  return target;
};

export const clearLivecodeCaptures = () => captures.clear();
