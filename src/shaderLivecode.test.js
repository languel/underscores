import test from "node:test";
import assert from "node:assert/strict";
import {
  FLUID_BRUSH_FRAGMENT_SOURCE,
  getShaderExample,
  INKWASH_FRAGMENT_SOURCE,
  normalizeShaderCompositionSettings,
  resolveShaderEmissionEnabled,
  isShaderUnderlayVisible,
  prepareShaderSource,
  SHADER_EXAMPLES,
  shaderSourceUsesFeedbackBuffer,
  SHADERTOY_MINIMAL_RAYMARCH_SOURCE,
  SHADERTOY_QUARKSOUP_SOURCE,
  shaderExampleForSource,
  normalizeShaderSourceMode,
  STARFIELD_FRAGMENT_SOURCE,
  STOKES_FLUID_FRAGMENT_SOURCE,
  validateShaderSource,
} from "./shaderLivecode.js";

test("the bundled Stokes fragment shader satisfies the Livecode shader contract", () => {
  assert.deepEqual(validateShaderSource(STOKES_FLUID_FRAGMENT_SOURCE), { valid: true, error: "" });
  assert.match(STOKES_FLUID_FRAGMENT_SOURCE, /uniform vec2 u_resolution/);
  assert.match(STOKES_FLUID_FRAGMENT_SOURCE, /vec2 stokeslet/);
});

test("shader validation catches empty programs, missing entry points, and unmatched braces", () => {
  assert.equal(validateShaderSource("").valid, false);
  assert.equal(validateShaderSource("precision highp float;").valid, false);
  assert.equal(validateShaderSource("vec4 o;", { shaderDialect: "shadertoy" }).valid, true);
  assert.equal(validateShaderSource("void main() {").valid, false);
  assert.equal(validateShaderSource("void main() { }}").valid, false);
});

test("minimal shader mode wraps Shadertoy bodies and mainImage programs", () => {
  assert.equal(normalizeShaderSourceMode("shadertoy"), "shadertoy");
  assert.equal(normalizeShaderSourceMode("unknown"), "standard");
  const body = prepareShaderSource(SHADERTOY_MINIMAL_RAYMARCH_SOURCE, "shadertoy");
  assert.match(body, /#define FC gl_FragCoord/);
  assert.match(body, /#define iFrame int\(u_frame\)/);
  assert.match(body, /uniform sampler2D b/);
  assert.match(body, /#define r u_resolution/);
  assert.match(body, /float oneMinusCos = 1\.0 - c/);
  assert.doesNotMatch(body, /float u_resolution = 1\.0 - c/);
  assert.match(body, /#define o outColor/);
  assert.match(body, /void main\(\)/);
  assert.match(body, /outColor = vec4\(0\.0, 0\.0, 0\.0, 1\.0\)/);
  const mainImage = prepareShaderSource("void mainImage(out vec4 color, in vec2 coord) { color = vec4(coord, 0.0, 1.0); }", "shadertoy");
  assert.match(mainImage, /mainImage\(outColor, gl_FragCoord\.xy\)/);
  assert.equal(shaderSourceUsesFeedbackBuffer("o = texture(b, FC.xy / r);", "shadertoy"), true);
  assert.equal(shaderSourceUsesFeedbackBuffer("o = texture(backbuffer, FC.xy / resolution);", "shadertoy"), true);
  assert.equal(shaderSourceUsesFeedbackBuffer("o = vec4(1.0);", "shadertoy"), false);
  assert.equal(shaderSourceUsesFeedbackBuffer("o = texture(b, FC.xy / r);", "standard"), false);
});

test("minimal mode initializes Twigl declaration-only loop variables for WebGL 2", () => {
  const source = "for(float i,g,e,s;++i<99.;o.rgb+=hsv(g,e,s)){for(int i;i++<19;)s+=1.;}";
  const prepared = prepareShaderSource(source, "shadertoy");
  assert.match(prepared, /for\(float i=0\.,g=0\.,e=0\.,s=0\.;/);
  assert.match(prepared, /for\(int i=0;/);
  const explicit = prepareShaderSource("for(float i=1.,g; i<2.; i++) o=vec4(g);", "shadertoy");
  assert.match(explicit, /for\(float i=1\.,g;/);
});

test("quark soup keeps its mouse-reactive compact body and starfield uses standard GLSL", () => {
  assert.match(SHADERTOY_QUARKSOUP_SOURCE, /m\.xy\/r/);
  assert.equal(validateShaderSource(SHADERTOY_QUARKSOUP_SOURCE, { shaderDialect: "shadertoy" }).valid, true);
  assert.match(STARFIELD_FRAGMENT_SOURCE, /#version 300 es/);
  assert.match(STARFIELD_FRAGMENT_SOURCE, /void main\(\)/);
  assert.equal(validateShaderSource(STARFIELD_FRAGMENT_SOURCE).valid, true);
});

test("minimal feedback bodies keep the compact buffer alias usable", () => {
  const source = "vec2 p=FC.xy/r.y*2e1+t;for(float i;i++<8.;)p+=sin(p+t/.2+i)*.4,p*=mat2(6,-8,8,6)/9.;o=vec4(tanh(length(fwidth(sin(p*.3)/.1))),texture(b,FC.xy/r));";
  const prepared = prepareShaderSource(source, "shadertoy");
  assert.match(prepared, /uniform sampler2D b/);
  assert.match(prepared, /#define r u_resolution/);
  assert.equal(shaderSourceUsesFeedbackBuffer(source, "shadertoy"), true);
});

test("minimal mode accepts common twigl classic boilerplate and aliases", () => {
  const source = "precision highp float; uniform vec2 resolution; uniform float time; void main(){vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;gl_FragColor=vec4(hsv(time*.1,1.,1.),1.);}";
  const prepared = prepareShaderSource(source, "shadertoy");
  assert.doesNotMatch(prepared, /uniform vec2 resolution/);
  assert.equal((prepared.match(/precision highp float;/g) || []).length, 1);
  assert.doesNotMatch(prepared, /uniform float time/);
  assert.match(prepared, /#define resolution u_resolution/);
  assert.match(prepared, /#define mouse vec4\(u_pointer \* u_resolution, u_pointerDown, 0\.0\)/);
  assert.match(prepared, /#define gl_FragColor outColor/);
  assert.match(prepared, /vec3 hsv\(/);
});

test("the shader catalog exposes the bundled examples, Inkwash, and Stokes", () => {
  assert.deepEqual(SHADER_EXAMPLES.map(example => example.id), ["hello", "minimal-raymarch", "quarksoup", "starfield", "shadow", "fluid", "inkwash", "stokes"]);
  SHADER_EXAMPLES.forEach(example => assert.equal(validateShaderSource(example.source, { shaderDialect: example.dialect }).valid, true));
  assert.equal(getShaderExample("fluid").mode, "feedback");
  assert.equal(shaderExampleForSource(FLUID_BRUSH_FRAGMENT_SOURCE)?.id, "fluid");
  assert.equal(shaderExampleForSource(INKWASH_FRAGMENT_SOURCE)?.id, "inkwash");
  assert.equal(getShaderExample("missing").id, "hello");
  assert.equal(getShaderExample("minimal-raymarch").dialect, "shadertoy");
  assert.match(FLUID_BRUSH_FRAGMENT_SOURCE, /uniform vec4 u_segments/);
  assert.match(FLUID_BRUSH_FRAGMENT_SOURCE, /@param emission = true \(boolean\)/);
  assert.match(FLUID_BRUSH_FRAGMENT_SOURCE, /uniform float u_sceneInteraction/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /float mobility/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /uniform float u_brushMode/);
  assert.match(INKWASH_FRAGMENT_SOURCE, /float sceneCapacity/);
});

test("fluid emission is an authored parameter with legacy node-setting fallback", () => {
  assert.equal(resolveShaderEmissionEnabled({ source: FLUID_BRUSH_FRAGMENT_SOURCE, parameters: {} }), true);
  assert.equal(resolveShaderEmissionEnabled({ source: FLUID_BRUSH_FRAGMENT_SOURCE, parameters: { emission: false } }), false);
  assert.equal(resolveShaderEmissionEnabled({ source: "void main() {}", runtime: { settings: { sceneInteraction: false } } }), false);
});

test("shader composition settings normalize optional layering and transparency", () => {
  assert.deepEqual(normalizeShaderCompositionSettings(), {
    compositeMode: "overlay",
    compositeOpacity: 1,
    blendMode: "normal",
    backgroundMode: "solid",
    sceneInteraction: true,
    emitterSource: "scene",
  });
  assert.deepEqual(normalizeShaderCompositionSettings({
    compositeMode: "underlay",
    compositeOpacity: 0.45,
    blendMode: "screen",
    backgroundMode: "transparent",
    sceneInteraction: false,
  }), {
    compositeMode: "underlay",
    compositeOpacity: 0.45,
    blendMode: "screen",
    backgroundMode: "transparent",
    sceneInteraction: false,
    emitterSource: "scene",
  });
  assert.equal(normalizeShaderCompositionSettings({ compositeOpacity: 5 }).compositeOpacity, 1);
  assert.equal(normalizeShaderCompositionSettings({ blendMode: "difference" }).blendMode, "normal");
  assert.equal(normalizeShaderCompositionSettings({ backgroundMode: "checkerboard" }).backgroundMode, "solid");
  assert.equal(normalizeShaderCompositionSettings({ emitterSource: "debug" }).emitterSource, "debug");
});

test("stopped underlay shaders remain visible when a last frame is retained", () => {
  const element = {
    customData: {
      underscoresLivecode: {
        kind: "shader",
        runtime: {
          running: false,
          settings: { compositeMode: "underlay", keepLastFrame: true },
        },
      },
    },
  };
  assert.equal(isShaderUnderlayVisible(element, { hasRetainedFrame: true }), true);
  assert.equal(isShaderUnderlayVisible(element, { hasRetainedFrame: false }), false);
});
