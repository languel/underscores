import { useEffect, useLayoutEffect, useRef } from "react";
import { SHADER_VERTEX_SOURCE } from "./shaderLivecode.js";
import { collectShaderSceneSegments, collectShaderWorldSegments, flattenShaderSegments, MAX_SHADER_SEGMENTS } from "./shaderSceneGeometry.js";
import { publishShaderStatus } from "./shaderStatus.js";
import { isLivecodeTransportPlaying } from "./livecodeTransport.js";
import { readWebglFrame, registerLivecodeCapture } from "./livecodeCapture.js";

const publishFrameStatus = (statusRef, kind, message = "") => publishShaderStatus({
  ...statusRef.current,
  kind,
  message,
});

const DISPLAY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_transparentBackground;
uniform float u_inkwash;
in vec2 v_uv;
out vec4 outColor;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec4 state = texture(u_texture, v_uv);
  vec3 dye = state.rgb;
  float density = max(dye.r, max(dye.g, dye.b));
  if (u_inkwash > 0.5) {
    float grain = hash(v_uv * vec2(913.0, 677.0));
    vec3 paper = vec3(0.962, 0.954, 0.930) - (grain - 0.5) * 0.035;
    vec3 color = paper * exp(-dye * (1.82 + grain * 0.26));
    color *= 1.0 - smoothstep(0.02, 0.7, state.a) * vec3(0.13, 0.12, 0.08);
    if (u_transparentBackground > 0.5) {
      float alpha = smoothstep(0.003, 0.34, density);
      outColor = vec4(mix(vec3(0.10, 0.11, 0.16), color, 0.18), alpha);
      return;
    }
    outColor = vec4(color, 1.0);
    return;
  }
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
      // Only retain the default framebuffer when the stopped-frame option is
      // enabled; ordinary fluid playback does not pay the readback cost.
      preserveDrawingBuffer: node.runtime.settings?.keepLastFrame !== false,
    });
    if (!gl) {
      publishFrameStatus(statusRef, "error", "WebGL 2 is unavailable in this browser.");
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
        displayAttributes: { position: gl.getAttribLocation(displayProgram, "a_position") },
        displayUniforms: {
          texture: gl.getUniformLocation(displayProgram, "u_texture"),
          transparentBackground: gl.getUniformLocation(displayProgram, "u_transparentBackground"),
          inkwash: gl.getUniformLocation(displayProgram, "u_inkwash"),
        },
        updateProgram: null,
        updateAttributes: null,
        updateUniforms: null,
        targets: [],
        startedAt: performance.now(),
      };
      const unregisterCapture = registerLivecodeCapture(element.id, () => readWebglFrame(canvas, gl, runtimeRef.current));
      runtimeRef.current.unregisterCapture = unregisterCapture;
    } catch (setupError) {
      publishFrameStatus(statusRef, "error", setupError instanceof Error ? setupError.message : String(setupError));
    }
    return () => {
      const runtime = runtimeRef.current;
      if (!runtime) return;
      runtime.unregisterCapture?.();
      runtime.targets.forEach(target => disposeTarget(gl, target));
      if (runtime.updateProgram) gl.deleteProgram(runtime.updateProgram);
      gl.deleteProgram(runtime.displayProgram);
      gl.deleteBuffer(runtime.buffer);
      runtimeRef.current = null;
    };
  }, [element.id, node.runtime.settings?.keepLastFrame]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    try {
      const program = createProgram(runtime.gl, node.source);
      if (runtime.updateProgram) runtime.gl.deleteProgram(runtime.updateProgram);
      runtime.updateProgram = program;
      runtime.updateAttributes = { position: runtime.gl.getAttribLocation(program, "a_position") };
      runtime.updateUniforms = {
        previous: runtime.gl.getUniformLocation(program, "u_previous"),
        resolution: runtime.gl.getUniformLocation(program, "u_resolution"),
        time: runtime.gl.getUniformLocation(program, "u_time"),
        delta: runtime.gl.getUniformLocation(program, "u_delta"),
        pointerDown: runtime.gl.getUniformLocation(program, "u_pointerDown"),
        brushMode: runtime.gl.getUniformLocation(program, "u_brushMode"),
        pointer: runtime.gl.getUniformLocation(program, "u_pointer"),
        pointerDelta: runtime.gl.getUniformLocation(program, "u_pointerDelta"),
        currentColor: runtime.gl.getUniformLocation(program, "u_currentColor"),
        segments: runtime.gl.getUniformLocation(program, "u_segments[0]"),
        segmentCount: runtime.gl.getUniformLocation(program, "u_segmentCount"),
        sceneInteraction: runtime.gl.getUniformLocation(program, "u_sceneInteraction"),
      };
      runtime.targets.forEach(target => {
        runtime.gl.bindFramebuffer(runtime.gl.FRAMEBUFFER, target.framebuffer);
        runtime.gl.viewport(0, 0, target.width, target.height);
        runtime.gl.clearColor(0, 0, 0, 0);
        runtime.gl.clear(runtime.gl.COLOR_BUFFER_BIT);
      });
      runtime.gl.bindFramebuffer(runtime.gl.FRAMEBUFFER, null);
      runtime.startedAt = performance.now();
      publishFrameStatus(statusRef, "clear");
    } catch (compileError) {
      publishFrameStatus(statusRef, "error", compileError instanceof Error ? compileError.message : String(compileError));
    }
  }, [node.revision, node.source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return undefined;
    const { gl } = runtime;
    let frame = 0;
    let active = true;
    let pageVisible = document.visibilityState !== "hidden";
    let pointer = [0.5, 0.5];
    let previousPointer = [...pointer];
    let pointerDelta = [0, 0];
    let pointerDown = false;
    let brushMode = false;
    let lastTime = performance.now();
    let geometryCache = { elements: null, nodeSignature: "", values: null, count: 0 };

    const bindQuad = (program, attributes = null) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, runtime.buffer);
      const position = attributes?.position ?? gl.getAttribLocation(program, "a_position");
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
        gl.clearColor(0, 0, 0, 0);
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
      brushMode = Boolean(event.metaKey);
    };
    const handlePointerUp = () => { pointerDown = false; brushMode = false; };
    const setUniform1f = (location, value) => {
      if (location) gl.uniform1f(location, value);
    };
    const draw = now => {
      if (active && pageVisible && isLivecodeTransportPlaying(node.runtime.transportMode, transportRef.current) && runtime.updateProgram) {
        resize();
        const delta = Math.min(1 / 20, Math.max(1 / 240, (now - lastTime) / 1000));
        lastTime = now;
        const scoreTime = Number(transportRef.current?.time) || 0;
        const time = node.runtime.transportMode === "free" ? (now - runtime.startedAt) / 1000 : scoreTime;
        const [read, write] = runtime.targets;

        gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
        gl.viewport(0, 0, write.width, write.height);
        gl.useProgram(runtime.updateProgram);
        bindQuad(runtime.updateProgram, runtime.updateAttributes);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        const uniforms = runtime.updateUniforms || {};
        if (uniforms.previous) gl.uniform1i(uniforms.previous, 0);
        if (uniforms.resolution) gl.uniform2f(uniforms.resolution, write.width, write.height);
        setUniform1f(uniforms.time, time);
        setUniform1f(uniforms.delta, delta);
        setUniform1f(uniforms.pointerDown, pointerDown ? 1 : 0);
        setUniform1f(uniforms.brushMode, brushMode ? 1 : 0);
        if (uniforms.pointer) gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
        if (uniforms.pointerDelta) gl.uniform2f(uniforms.pointerDelta, pointerDelta[0], pointerDelta[1]);
        if (uniforms.currentColor) gl.uniform4f(uniforms.currentColor, ...parseColor(scriptRuntimeRef.current?.getAppearance?.()?.currentColor));
        const segmentsLocation = uniforms.segments;
        const segmentCountLocation = uniforms.segmentCount;
        if (segmentsLocation || segmentCountLocation) {
          const shaderElement = elementRef.current;
          const useDebugEmitters = node.runtime.settings?.emitterSource === "debug";
          if (useDebugEmitters) {
            const segments = collectShaderWorldSegments(
              scriptRuntimeRef.current?.getPhysicsDebugSegments?.() || [],
              shaderElement,
              MAX_SHADER_SEGMENTS,
            );
            geometryCache = {
              elements: null,
              nodeSignature: "debug",
              values: flattenShaderSegments(segments),
              count: Math.min(segments.length, MAX_SHADER_SEGMENTS),
            };
          } else {
            const sceneElements = scriptRuntimeRef.current?.getElements?.() || [];
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
          }
          if (segmentsLocation) gl.uniform4fv(segmentsLocation, geometryCache.values);
          if (segmentCountLocation) gl.uniform1f(segmentCountLocation, geometryCache.count);
        }
        setUniform1f(uniforms.sceneInteraction, node.runtime.settings?.sceneInteraction === false ? 0 : 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(runtime.displayProgram);
        bindQuad(runtime.displayProgram, runtime.displayAttributes);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, write.texture);
        const displayTexture = runtime.displayUniforms?.texture;
        if (displayTexture) gl.uniform1i(displayTexture, 0);
        setUniform1f(runtime.displayUniforms?.transparentBackground, node.runtime.settings?.backgroundMode === "transparent" ? 1 : 0);
        setUniform1f(runtime.displayUniforms?.inkwash, node.runtime.settings?.shaderExample === "inkwash" ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        runtime.targets = [write, read];
        pointerDelta[0] *= 0.72;
        pointerDelta[1] *= 0.72;
      }
      frame = window.requestAnimationFrame(draw);
    };

    const intersectionObserver = new IntersectionObserver(entries => { active = entries.some(entry => entry.isIntersecting); });
    const handleVisibility = () => { pageVisible = document.visibilityState !== "hidden"; };
    intersectionObserver.observe(canvas);
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
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [node.runtime.settings?.backgroundMode, node.runtime.settings?.emitterSource, node.runtime.settings?.sceneInteraction, node.runtime.settings?.shaderExample, node.runtime.transportMode, scriptRuntimeRef]);

  return <div className={`underscores-shader-frame underscores-fluid-shader-frame${node.runtime.settings?.backgroundMode === "transparent" ? " transparent-background" : ""}`}>
    <canvas ref={canvasRef} className="underscores-shader-canvas" aria-label="GLSL output" />
  </div>;
}
