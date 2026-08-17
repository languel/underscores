import { useEffect, useLayoutEffect, useRef } from "react";
import FluidShaderFrame from "./FluidShaderFrame.jsx";
import { FLUID_BRUSH_FRAGMENT_SOURCE, prepareShaderSource, shaderSourceUsesFeedbackBuffer, SHADER_VERTEX_SOURCE } from "./shaderLivecode.js";
import { collectShaderSceneSegments, flattenShaderSegments, MAX_SHADER_SEGMENTS } from "./shaderSceneGeometry.js";
import { publishShaderStatus } from "./shaderStatus.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";
import { readWebglFrame, registerLivecodeCapture } from "./livecodeCapture.js";

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
  frame: gl.getUniformLocation(program, "u_frame"),
  currentColor: gl.getUniformLocation(program, "u_currentColor"),
  buffer: gl.getUniformLocation(program, "b"),
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

const attributeLocations = (gl, program) => Object.freeze({
  position: gl.getAttribLocation(program, "a_position"),
});

const DISPLAY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv);
}`;

const createFeedbackTarget = (gl, width, height) => {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error("The minimal shader feedback framebuffer is incomplete.");
  }
  return { texture, framebuffer, width, height };
};

const disposeFeedbackTargets = (gl, targets = []) => {
  targets.forEach(target => {
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  });
};

const clearFeedbackTargets = (gl, targets = []) => {
  targets.forEach(target => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    // A Shadertoy/TWGL-style buffer starts as opaque black. Clearing alpha to
    // zero makes common compact `vec4(..., texture(b, ...))` bodies invisible
    // forever because their first feedback sample is transparent.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

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
    runtimeRef.current = {
      gl,
      buffer,
      program: null,
      uniforms: null,
      attributes: null,
      displayProgram: null,
      displayUniforms: null,
      displayAttributes: null,
      feedback: false,
      feedbackTargets: [],
      frame: 0,
      startedAt: performance.now(),
    };
    const unregisterCapture = registerLivecodeCapture(element.id, () => readWebglFrame(canvas, gl, runtimeRef.current));
    return () => {
      unregisterCapture();
      const runtime = runtimeRef.current;
      if (runtime?.program) gl.deleteProgram(runtime.program);
      if (runtime?.displayProgram) gl.deleteProgram(runtime.displayProgram);
      disposeFeedbackTargets(gl, runtime?.feedbackTargets);
      gl.deleteBuffer(buffer);
      runtimeRef.current = null;
    };
  }, [element.id, node.runtime.settings?.keepLastFrame]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const dialect = node.runtime.settings?.shaderDialect;
      const source = prepareShaderSource(node.source, dialect);
      const usesFeedback = shaderSourceUsesFeedbackBuffer(node.source, dialect);
      const program = createProgram(runtime.gl, source);
      if (runtime.program) runtime.gl.deleteProgram(runtime.program);
      if (usesFeedback && !runtime.displayProgram) {
        runtime.displayProgram = createProgram(runtime.gl, DISPLAY_FRAGMENT_SOURCE);
        runtime.displayUniforms = Object.freeze({ texture: runtime.gl.getUniformLocation(runtime.displayProgram, "u_texture") });
        runtime.displayAttributes = attributeLocations(runtime.gl, runtime.displayProgram);
      } else if (!usesFeedback && runtime.displayProgram) {
        runtime.gl.deleteProgram(runtime.displayProgram);
        runtime.displayProgram = null;
        runtime.displayUniforms = null;
        runtime.displayAttributes = null;
        disposeFeedbackTargets(runtime.gl, runtime.feedbackTargets);
        runtime.feedbackTargets = [];
      }
      runtime.program = program;
      runtime.uniforms = uniformLocations(runtime.gl, program);
      runtime.attributes = attributeLocations(runtime.gl, program);
      runtime.feedback = usesFeedback;
      runtime.frame = 0;
      clearFeedbackTargets(runtime.gl, runtime.feedbackTargets);
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
    let pageVisible = document.visibilityState !== "hidden";
    let pointer = [0.5, 0.5];
    let pointerDown = false;
    let geometryCache = { elements: null, nodeSignature: "", values: null, count: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      const sizeChanged = canvas.width !== width || canvas.height !== height;
      const target = runtime.feedbackTargets[0];
      const targetsReady = runtime.feedbackTargets.length === 2 && target?.width === width && target?.height === height;
      if (!sizeChanged && (!runtime.feedback || targetsReady)) return;
      canvas.width = width;
      canvas.height = height;
      if (runtime.feedback && !targetsReady) {
        disposeFeedbackTargets(gl, runtime.feedbackTargets);
        runtime.feedbackTargets = [createFeedbackTarget(gl, width, height), createFeedbackTarget(gl, width, height)];
        clearFeedbackTargets(gl, runtime.feedbackTargets);
      }
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
    const bindPosition = (program, attributes = runtime.attributes) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);
      const position = attributes?.position ?? gl.getAttribLocation(program, "a_position");
      if (position >= 0) {
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      }
    };
    const draw = now => {
      if (active && pageVisible && isLivecodeTransportPlaying(node.runtime.transportMode, transportRef.current) && runtime.program && runtime.uniforms) {
        resize();
        const feedback = runtime.feedback && runtime.displayProgram && runtime.feedbackTargets.length === 2;
        const [readTarget, writeTarget] = feedback ? runtime.feedbackTargets : [null, null];
        gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget?.framebuffer || null);
        gl.viewport(0, 0, writeTarget?.width || canvas.width, writeTarget?.height || canvas.height);
        gl.useProgram(runtime.program);
        bindPosition(runtime.program, runtime.attributes);
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
        if (runtime.uniforms.frame) gl.uniform1f(runtime.uniforms.frame, runtime.frame);
        if (runtime.uniforms.currentColor) gl.uniform4f(runtime.uniforms.currentColor, ...color);
        if (feedback && runtime.uniforms.buffer) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readTarget.texture);
          gl.uniform1i(runtime.uniforms.buffer, 0);
        }
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
        if (feedback) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(runtime.displayProgram);
          bindPosition(runtime.displayProgram, runtime.displayAttributes);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, writeTarget.texture);
          if (runtime.displayUniforms?.texture) gl.uniform1i(runtime.displayUniforms.texture, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          runtime.feedbackTargets = [writeTarget, readTarget];
        }
        runtime.frame += 1;
      }
      frame = window.requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(entries => {
      active = entries.some(entry => entry.isIntersecting);
    });
    const handleVisibility = () => { pageVisible = document.visibilityState !== "hidden"; };
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    window.addEventListener("pointermove", updatePointer, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", handlePointerUp, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
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
      document.removeEventListener("visibilitychange", handleVisibility);
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
