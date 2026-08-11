import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SHADER_VERTEX_SOURCE } from "./shaderLivecode.js";
import { collectShaderSceneSegments, flattenShaderSegments, MAX_SHADER_SEGMENTS } from "./shaderSceneGeometry.js";

const DISPLAY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_transparentBackground;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 dye = texture(u_texture, v_uv).rgb;
  float density = max(dye.r, max(dye.g, dye.b));
  if (u_transparentBackground > 0.5) {
    outColor = vec4(dye, smoothstep(0.008, 0.22, density));
    return;
  }
  vec3 background = vec3(0.012, 0.017, 0.03);
  outColor = vec4(background + dye, 1.0);
}`;

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

const parseColor = value => {
  const match = /^#([\da-f]{6})/i.exec(String(value || ""));
  if (!match) return [0.35, 0.72, 1, 1];
  return [0, 2, 4].map(index => Number.parseInt(match[1].slice(index, index + 2), 16) / 255).concat(1);
};

const makeTextureTarget = (gl, width, height) => {
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
    throw new Error("The fluid feedback framebuffer is incomplete.");
  }
  return { texture, framebuffer, width, height };
};

const disposeTarget = (gl, target) => {
  if (!target) return;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
};

export default function FluidShaderFrame({ element, node, transport, scriptRuntimeRef }) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const transportRef = useRef(transport);
  const elementRef = useRef(element);
  const [error, setError] = useState("");
  transportRef.current = transport;
  elementRef.current = element;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) {
      setError("WebGL 2 is unavailable in this browser.");
      return undefined;
    }
    try {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const displayProgram = createProgram(gl, DISPLAY_FRAGMENT_SOURCE);
      runtimeRef.current = {
        gl,
        buffer,
        displayProgram,
        updateProgram: null,
        targets: [],
        startedAt: performance.now(),
      };
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : String(setupError));
    }
    return () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.targets.forEach(target => disposeTarget(gl, target));
      if (runtime.updateProgram) gl.deleteProgram(runtime.updateProgram);
      gl.deleteProgram(runtime.displayProgram);
      gl.deleteBuffer(runtime.buffer);
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const program = createProgram(runtime.gl, node.source);
      if (runtime.updateProgram) runtime.gl.deleteProgram(runtime.updateProgram);
      runtime.updateProgram = program;
      setError("");
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : String(compileError));
    }
  }, [node.revision, node.source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return undefined;
    const { gl } = runtime;
    let frame = 0;
    let active = true;
    let pointer = [0.5, 0.5];
    let previousPointer = [...pointer];
    let pointerDelta = [0, 0];
    let pointerDown = false;
    let lastTime = performance.now();
    let geometryCache = { elements: null, nodeSignature: "", values: null, count: 0 };

    const bindQuad = program => {
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);
      const position = gl.getAttribLocation(program, "a_position");
      if (position >= 0) {
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(1.5, Math.max(1, Number(window.devicePixelRatio) || 1));
      const width = Math.max(2, Math.min(1024, Math.round(rect.width * scale)));
      const height = Math.max(2, Math.min(1024, Math.round(rect.height * scale)));
      if (canvas.width === width && canvas.height === height && runtime.targets.length === 2) return;
      canvas.width = width;
      canvas.height = height;
      runtime.targets.forEach(target => disposeTarget(gl, target));
      runtime.targets = [makeTextureTarget(gl, width, height), makeTextureTarget(gl, width, height)];
      runtime.targets.forEach(target => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const updatePointer = event => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      previousPointer = pointer;
      pointer = [
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height)),
      ];
      pointerDelta = [pointer[0] - previousPointer[0], pointer[1] - previousPointer[1]];
    };
    const handlePointerDown = event => {
      updatePointer(event);
      const rect = canvas.getBoundingClientRect();
      pointerDown = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const handlePointerUp = () => { pointerDown = false; };
    const setUniform1f = (program, name, value) => {
      const location = gl.getUniformLocation(program, name);
      if (location) gl.uniform1f(location, value);
    };
    const draw = now => {
      if (active && runtime.updateProgram) {
        resize();
        const delta = Math.min(1 / 20, Math.max(1 / 240, (now - lastTime) / 1000));
        lastTime = now;
        const scoreTime = Number(transportRef.current?.time) || 0;
        const time = node.runtime.transportMode === "free" ? (now - runtime.startedAt) / 1000 : scoreTime;
        const [read, write] = runtime.targets;

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
        gl.viewport(0, 0, write.width, write.height);
        gl.useProgram(runtime.updateProgram);
        bindQuad(runtime.updateProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        const previous = gl.getUniformLocation(runtime.updateProgram, "u_previous");
        if (previous) gl.uniform1i(previous, 0);
        const resolution = gl.getUniformLocation(runtime.updateProgram, "u_resolution");
        if (resolution) gl.uniform2f(resolution, write.width, write.height);
        setUniform1f(runtime.updateProgram, "u_time", time);
        setUniform1f(runtime.updateProgram, "u_delta", delta);
        setUniform1f(runtime.updateProgram, "u_pointerDown", pointerDown ? 1 : 0);
        const pointerLocation = gl.getUniformLocation(runtime.updateProgram, "u_pointer");
        if (pointerLocation) gl.uniform2f(pointerLocation, pointer[0], pointer[1]);
        const pointerDeltaLocation = gl.getUniformLocation(runtime.updateProgram, "u_pointerDelta");
        if (pointerDeltaLocation) gl.uniform2f(pointerDeltaLocation, pointerDelta[0], pointerDelta[1]);
        const currentColor = gl.getUniformLocation(runtime.updateProgram, "u_currentColor");
        if (currentColor) gl.uniform4f(currentColor, ...parseColor(scriptRuntimeRef.current?.getAppearance?.()?.currentColor));
        const segmentsLocation = gl.getUniformLocation(runtime.updateProgram, "u_segments[0]");
        const segmentCountLocation = gl.getUniformLocation(runtime.updateProgram, "u_segmentCount");
        if (segmentsLocation || segmentCountLocation) {
          const sceneElements = scriptRuntimeRef.current?.getElements?.() || [];
          const shaderElement = elementRef.current;
          const nodeSignature = [shaderElement?.id, shaderElement?.x, shaderElement?.y, shaderElement?.width, shaderElement?.height, shaderElement?.angle].join(":");
          if (geometryCache.elements !== sceneElements || geometryCache.nodeSignature !== nodeSignature) {
            const segments = collectShaderSceneSegments(sceneElements, shaderElement, MAX_SHADER_SEGMENTS, { fallback: false });
            geometryCache = {
              elements: sceneElements,
              nodeSignature,
              values: flattenShaderSegments(segments),
              count: Math.min(segments.length, MAX_SHADER_SEGMENTS),
            };
          }
          if (segmentsLocation) gl.uniform4fv(segmentsLocation, geometryCache.values);
          if (segmentCountLocation) gl.uniform1f(segmentCountLocation, geometryCache.count);
        }
        setUniform1f(runtime.updateProgram, "u_sceneInteraction", node.runtime.settings?.sceneInteraction === false ? 0 : 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(runtime.displayProgram);
        bindQuad(runtime.displayProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, write.texture);
        const displayTexture = gl.getUniformLocation(runtime.displayProgram, "u_texture");
        if (displayTexture) gl.uniform1i(displayTexture, 0);
        setUniform1f(runtime.displayProgram, "u_transparentBackground", node.runtime.settings?.backgroundMode === "transparent" ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        runtime.targets = [write, read];
        pointerDelta[0] *= 0.72;
        pointerDelta[1] *= 0.72;
      }
      frame = window.requestAnimationFrame(draw);
    };

    const intersectionObserver = new IntersectionObserver(entries => { active = entries.some(entry => entry.isIntersecting); });
    intersectionObserver.observe(canvas);
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
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [node.runtime.settings?.backgroundMode, node.runtime.settings?.sceneInteraction, node.runtime.transportMode, scriptRuntimeRef]);

  return <div className={`drawerator-shader-frame drawerator-fluid-shader-frame${node.runtime.settings?.backgroundMode === "transparent" ? " transparent-background" : ""}`}>
    <canvas ref={canvasRef} className="drawerator-shader-canvas" aria-label="GLSL fluid brush output" />
    {error ? <pre className="drawerator-shader-error" role="alert">{error}</pre> : null}
  </div>;
}
