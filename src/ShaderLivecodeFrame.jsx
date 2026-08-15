import { useEffect, useLayoutEffect, useRef } from "react";
import FluidShaderFrame from "./FluidShaderFrame.jsx";
import { FLUID_BRUSH_FRAGMENT_SOURCE, prepareShaderSource, SHADER_VERTEX_SOURCE } from "./shaderLivecode.js";
import { collectShaderSceneSegments, flattenShaderSegments, MAX_SHADER_SEGMENTS } from "./shaderSceneGeometry.js";
import { publishShaderStatus } from "./shaderStatus.js";

const publishFrameStatus = (statusRef, kind, message = "") => publishShaderStatus({
  ...statusRef.current,
  kind,
  message,
});

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const message = gl.getShaderInfoLog(shader) || "Unknown GLSL compile error.";
  gl.deleteShader(shader);
  throw new Error(message);
};

const createProgram = (gl, fragmentSource) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, SHADER_VERTEX_SOURCE);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  const message = gl.getProgramInfoLog(program) || "Unknown GLSL link error.";
  gl.deleteProgram(program);
  throw new Error(message);
};

const uniformLocations = (gl, program) => Object.freeze({
  resolution: gl.getUniformLocation(program, "u_resolution"),
  time: gl.getUniformLocation(program, "u_time"),
  transportTime: gl.getUniformLocation(program, "u_transportTime"),
  pointer: gl.getUniformLocation(program, "u_pointer"),
  pointerDown: gl.getUniformLocation(program, "u_pointerDown"),
  currentColor: gl.getUniformLocation(program, "u_currentColor"),
  segments: gl.getUniformLocation(program, "u_segments[0]"),
  segmentCount: gl.getUniformLocation(program, "u_segmentCount"),
  darkMode: gl.getUniformLocation(program, "u_darkMode"),
  zoom: gl.getUniformLocation(program, "u_zoom"),
  quality: gl.getUniformLocation(program, "u_quality"),
  stepSize: gl.getUniformLocation(program, "u_stepSize"),
  steps: gl.getUniformLocation(program, "u_steps"),
  offset: gl.getUniformLocation(program, "u_offset"),
  lightPos: gl.getUniformLocation(program, "u_lightPos"),
  shadowContrast: gl.getUniformLocation(program, "u_shadowContrast"),
});

const parseColor = value => {
  const match = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(String(value || ""));
  if (!match) return [0.91, 0.93, 0.98, 1];
  const rgb = match[1];
  return [
    Number.parseInt(rgb.slice(0, 2), 16) / 255,
    Number.parseInt(rgb.slice(2, 4), 16) / 255,
    Number.parseInt(rgb.slice(4, 6), 16) / 255,
    match[2] ? Number.parseInt(match[2], 16) / 255 : 1,
  ];
};

function FragmentShaderLivecodeFrame({ element, node, transport, scriptRuntimeRef }) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const transportRef = useRef(transport);
  const elementRef = useRef(element);
  const statusRef = useRef({});
  transportRef.current = transport;
  elementRef.current = element;
  statusRef.current = {
    elementId: element.id,
    nodeId: node.nodeId,
    label: node.name || "Shader",
  };

  useEffect(() => () => publishShaderStatus({ elementId: element.id, kind: "clear" }), [element.id]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // Keep the drawing buffer only when the node has opted into a stopped
      // frame thumbnail. This makes the eventual readback reliable without
      // imposing the buffer-retention cost on ordinary running shaders.
      preserveDrawingBuffer: node.runtime.settings?.keepLastFrame === true,
    });
    if (!gl) {
      publishFrameStatus(statusRef, "error", "WebGL 2 is unavailable in this browser.");
      return undefined;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    runtimeRef.current = { gl, buffer, program: null, uniforms: null, startedAt: performance.now() };
    return () => {
      const runtime = runtimeRef.current;
      if (runtime?.program) gl.deleteProgram(runtime.program);
      gl.deleteBuffer(buffer);
      runtimeRef.current = null;
    };
  }, [node.runtime.settings?.keepLastFrame]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const program = createProgram(runtime.gl, prepareShaderSource(node.source, node.runtime.settings?.shaderDialect));
      if (runtime.program) runtime.gl.deleteProgram(runtime.program);
      runtime.program = program;
      runtime.uniforms = uniformLocations(runtime.gl, program);
      publishFrameStatus(statusRef, "clear");
    } catch (compileError) {
      publishFrameStatus(statusRef, "error", compileError instanceof Error ? compileError.message : String(compileError));
    }
  }, [node.revision, node.source, node.runtime.settings?.shaderDialect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return undefined;
    const { gl } = runtime;
    let frame = 0;
    let active = true;
    let pointer = [0.5, 0.5];
    let pointerDown = false;
    let geometryCache = { elements: null, nodeSignature: "", values: null, count: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    };
    const updatePointer = event => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer = [
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)),
      ];
    };
    const handlePointerDown = event => {
      updatePointer(event);
      pointerDown = canvas.getBoundingClientRect().left <= event.clientX
        && canvas.getBoundingClientRect().right >= event.clientX
        && canvas.getBoundingClientRect().top <= event.clientY
        && canvas.getBoundingClientRect().bottom >= event.clientY;
    };
    const handlePointerUp = () => { pointerDown = false; };
    const draw = now => {
      if (active && runtime.program && runtime.uniforms) {
        resize();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(runtime.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);
        const position = gl.getAttribLocation(runtime.program, "a_position");
        if (position >= 0) {
          gl.enableVertexAttribArray(position);
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        }
        const linked = node.runtime.transportMode !== "free";
        const scoreTime = Number(transportRef.current?.time) || 0;
        const time = linked ? scoreTime : (now - runtime.startedAt) / 1000;
        const appearance = scriptRuntimeRef.current?.getAppearance?.() || {};
        const color = parseColor(appearance.currentColor);
        if (runtime.uniforms.resolution) gl.uniform2f(runtime.uniforms.resolution, canvas.width, canvas.height);
        if (runtime.uniforms.time) gl.uniform1f(runtime.uniforms.time, time);
        if (runtime.uniforms.transportTime) gl.uniform1f(runtime.uniforms.transportTime, scoreTime);
        if (runtime.uniforms.pointer) gl.uniform2f(runtime.uniforms.pointer, pointer[0], pointer[1]);
        if (runtime.uniforms.pointerDown) gl.uniform1f(runtime.uniforms.pointerDown, pointerDown ? 1 : 0);
        if (runtime.uniforms.currentColor) gl.uniform4f(runtime.uniforms.currentColor, ...color);
        if (runtime.uniforms.darkMode) gl.uniform1f(runtime.uniforms.darkMode, appearance.theme === "dark" ? 1 : 0);
        if (runtime.uniforms.zoom) gl.uniform1f(runtime.uniforms.zoom, 1);
        if (runtime.uniforms.quality) gl.uniform1f(runtime.uniforms.quality, 1);
        if (runtime.uniforms.stepSize) gl.uniform1f(runtime.uniforms.stepSize, 13);
        if (runtime.uniforms.steps) gl.uniform1i(runtime.uniforms.steps, 11);
        if (runtime.uniforms.offset) gl.uniform1f(runtime.uniforms.offset, (time * 0.035) % 1);
        if (runtime.uniforms.lightPos) gl.uniform2f(runtime.uniforms.lightPos, pointer[0], pointer[1]);
        if (runtime.uniforms.shadowContrast) gl.uniform1f(runtime.uniforms.shadowContrast, 0.72);
        if (runtime.uniforms.segments || runtime.uniforms.segmentCount) {
          const sceneElements = scriptRuntimeRef.current?.getElements?.() || [];
          const shaderElement = elementRef.current;
          const nodeSignature = [shaderElement?.id, shaderElement?.x, shaderElement?.y, shaderElement?.width, shaderElement?.height, shaderElement?.angle].join(":");
          if (geometryCache.elements !== sceneElements || geometryCache.nodeSignature !== nodeSignature) {
            const segments = collectShaderSceneSegments(sceneElements, shaderElement, MAX_SHADER_SEGMENTS);
            geometryCache = {
              elements: sceneElements,
              nodeSignature,
              values: flattenShaderSegments(segments),
              count: Math.min(segments.length, MAX_SHADER_SEGMENTS),
            };
          }
          if (runtime.uniforms.segments) gl.uniform4fv(runtime.uniforms.segments, geometryCache.values);
          if (runtime.uniforms.segmentCount) gl.uniform1f(runtime.uniforms.segmentCount, geometryCache.count);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      frame = window.requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting);
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    resize();
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [node.runtime.transportMode, scriptRuntimeRef]);

  return <div className={`underscores-shader-frame${node.runtime.settings?.backgroundMode === "transparent" ? " transparent-background" : ""}`}>
    <canvas ref={canvasRef} className="underscores-shader-canvas" aria-label="GLSL output" />
  </div>;
}

export default function ShaderLivecodeFrame(props) {
  const feedback = props.node.runtime.settings?.shaderMode === "feedback"
    || props.node.runtime.settings?.shaderExample === "fluid"
    || props.node.runtime.settings?.shaderExample === "inkwash"
    || props.node.source === FLUID_BRUSH_FRAGMENT_SOURCE;
  return feedback ? <FluidShaderFrame {...props} /> : <FragmentShaderLivecodeFrame {...props} />;
}
