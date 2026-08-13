export const SHADER_VERTEX_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// An analytical 2D Stokes-flow field. This is intentionally a single editable
// fragment shader rather than the stateful, multipass Navier-Stokes solver in
// excalishader: it establishes the Livecode shader contract without hiding a
// second simulation model behind the node source.
export const STOKES_FLUID_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_transportTime;
uniform vec2 u_pointer;
uniform float u_pointerDown;
uniform vec4 u_currentColor;

in vec2 v_uv;
out vec4 outColor;

const float PI = 3.14159265359;

vec2 stokeslet(vec2 point, vec2 center, vec2 force) {
  vec2 delta = point - center;
  float radius2 = max(dot(delta, delta), 0.0025);
  float radius = sqrt(radius2);
  return (-log(radius) * force + delta * dot(delta, force) / radius2) / (4.0 * PI);
}

vec3 palette(float t) {
  vec3 ink = mix(vec3(0.04, 0.055, 0.09), u_currentColor.rgb, 0.82);
  vec3 glow = vec3(0.18, 0.72, 1.0);
  return mix(ink, glow, 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.12, 0.27))));
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 point = v_uv * 2.0 - 1.0;
  point.x *= aspect;

  vec2 pointer = u_pointer * 2.0 - 1.0;
  pointer.x *= aspect;
  vec2 animatedCenter = vec2(0.32 * sin(u_time * 0.43), 0.22 * cos(u_time * 0.31));
  vec2 center = mix(animatedCenter, pointer, u_pointerDown);
  vec2 force = vec2(cos(u_time * 0.37), sin(u_time * 0.51)) * 1.35;

  vec2 velocity = stokeslet(point, center, force);
  velocity += 0.58 * stokeslet(point, -center * 0.72, vec2(-force.y, force.x));
  velocity = clamp(velocity, vec2(-1.5), vec2(1.5));

  vec2 traced = point - velocity * 0.42;
  float stream = traced.y * 5.4 + sin(traced.x * 3.0 + u_time * 0.18);
  float streamLines = pow(1.0 - abs(sin(stream * PI)), 12.0);
  float dye = 0.5 + 0.5 * sin(traced.x * 6.0 - traced.y * 4.2 + u_time * 0.22);
  float speed = smoothstep(0.0, 0.85, length(velocity));
  float sourceGlow = exp(-8.0 * length(point - center));

  vec3 background = vec3(0.018, 0.025, 0.045);
  vec3 color = mix(background, palette(dye), 0.18 + speed * 0.58);
  color += palette(dye + 0.18) * streamLines * (0.18 + speed * 0.72);
  color += vec3(1.0, 0.52, 0.2) * sourceGlow * 0.75;
  color *= 0.86 + 0.14 * cos(length(point) * 5.0);

  outColor = vec4(color, 1.0);
}`;

export const HELLO_GLSL_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_resolution.x / max(u_resolution.y, 1.0);
  float pulse = 0.5 + 0.5 * sin(u_time * 1.5);
  float ring = smoothstep(0.035, 0.0, abs(length(p) - mix(0.32, 0.42, pulse)));
  vec3 color = vec3(v_uv.x, v_uv.y, 0.55 + 0.35 * sin(u_time));
  color += ring * vec3(1.0, 0.85, 0.35);
  color += 0.18 / (0.04 + distance(v_uv, u_pointer)) * vec3(0.15, 0.35, 0.7);
  outColor = vec4(color, 1.0);
}`;

export const RAINBOW_GEOMETRY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

#define MAX_SEGMENTS 128

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec4 u_segments[MAX_SEGMENTS];
uniform float u_segmentCount;

in vec2 v_uv;
out vec4 outColor;

vec2 closestPointOnSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return a + ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
}

vec3 spectrum(float t) {
  return 0.56 + 0.44 * cos(6.28318 * (t + vec3(0.0, 0.67, 0.33)));
}

void main() {
  vec2 pixel = v_uv * u_resolution;
  float minDistance = 100000.0;
  for (int index = 0; index < MAX_SEGMENTS; index++) {
    if (float(index) >= u_segmentCount) break;
    vec4 segment = u_segments[index];
    vec2 nearest = closestPointOnSegment(pixel, segment.xy * u_resolution, segment.zw * u_resolution);
    minDistance = min(minDistance, distance(pixel, nearest));
  }

  float pointerDistance = distance(pixel, u_pointer * u_resolution);
  minDistance -= 12.0 * exp(-pointerDistance * 0.025);
  float band = floor(max(minDistance, 0.0) / 13.0);
  float reach = smoothstep(150.0, 0.0, minDistance);
  vec3 rainbow = spectrum(band / 11.0 + u_time * 0.035);
  vec3 background = vec3(0.018, 0.022, 0.038);
  vec3 color = mix(background, rainbow, reach * 0.86);
  color += rainbow * pow(reach, 4.0) * 0.35;
  outColor = vec4(color, 1.0);
}`;

export const SHADOW_CASTING_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

#define MAX_SEGMENTS 128

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec4 u_segments[MAX_SEGMENTS];
uniform float u_segmentCount;

in vec2 v_uv;
out vec4 outColor;

float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}

bool rayBlocked(vec2 point, vec2 light) {
  vec2 ray = light - point;
  float rayLength = length(ray);
  vec2 direction = ray / max(rayLength, 0.00001);
  for (int index = 0; index < MAX_SEGMENTS; index++) {
    if (float(index) >= u_segmentCount) break;
    vec4 segment = u_segments[index];
    vec2 edge = segment.zw - segment.xy;
    float determinant = cross2(direction, edge);
    if (abs(determinant) < 0.00001) continue;
    vec2 offset = segment.xy - point;
    float alongRay = cross2(offset, edge) / determinant;
    float alongEdge = cross2(offset, direction) / determinant;
    if (alongRay > 0.001 && alongRay < rayLength - 0.001 && alongEdge >= 0.0 && alongEdge <= 1.0) return true;
  }
  return false;
}

void main() {
  vec2 light = u_pointer;
  bool blocked = rayBlocked(v_uv, light);
  float distanceToLight = distance(v_uv * vec2(u_resolution.x / u_resolution.y, 1.0), light * vec2(u_resolution.x / u_resolution.y, 1.0));
  float falloff = smoothstep(1.2, 0.02, distanceToLight);
  float halo = 0.015 / max(distanceToLight, 0.02);
  vec3 ambient = vec3(0.018, 0.022, 0.034);
  vec3 warmLight = vec3(1.0, 0.68, 0.32) * (0.18 + falloff * 0.9 + halo);
  vec3 color = blocked ? ambient * 0.65 : ambient + warmLight;
  color += 0.015 * sin(vec3(1.0, 1.7, 2.3) * u_time);
  outColor = vec4(color, 1.0);
}`;

// The fluid example is an editable feedback pass. The host supplies the
// previous frame as u_previous and ping-pongs it through two framebuffers.
// This keeps the example source-owned while remaining dramatically smaller
// than excalishader's optional 2,000-line bloom/sunrays solver.
export const FLUID_BRUSH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

#define MAX_SEGMENTS 128

uniform sampler2D u_previous;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_delta;
uniform vec2 u_pointer;
uniform vec2 u_pointerDelta;
uniform float u_pointerDown;
uniform vec4 u_currentColor;
uniform vec4 u_segments[MAX_SEGMENTS];
uniform float u_segmentCount;
uniform float u_sceneInteraction;

in vec2 v_uv;
out vec4 outColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 palette(float t) {
  return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.16, 0.38)));
}

vec2 closestPointOnSegment(vec2 point, vec2 start, vec2 end) {
  vec2 segment = end - start;
  return start + segment * clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  float left = luminance(texture(u_previous, v_uv - vec2(texel.x, 0.0)).rgb);
  float right = luminance(texture(u_previous, v_uv + vec2(texel.x, 0.0)).rgb);
  float down = luminance(texture(u_previous, v_uv - vec2(0.0, texel.y)).rgb);
  float up = luminance(texture(u_previous, v_uv + vec2(0.0, texel.y)).rgb);
  vec2 curlFlow = vec2(up - down, left - right) * 0.018;

  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 delta = (v_uv - u_pointer) * aspect;
  float brush = exp(-dot(delta, delta) * 95.0);
  vec2 push = u_pointerDelta * brush * 1.8;
  vec2 swirl = vec2(-delta.y, delta.x) * brush * 0.0035;
  float strokeField = 0.0;
  vec2 strokeFlow = vec2(0.0);
  for (int index = 0; index < MAX_SEGMENTS; index++) {
    if (float(index) >= u_segmentCount) break;
    vec4 segment = u_segments[index];
    vec2 start = segment.xy;
    vec2 end = segment.zw;
    vec2 nearest = closestPointOnSegment(v_uv, start, end);
    vec2 fromStroke = (v_uv - nearest) * aspect;
    float influence = exp(-dot(fromStroke, fromStroke) * 900.0);
    vec2 tangent = normalize((end - start) * aspect + vec2(0.000001));
    strokeField = max(strokeField, influence);
    strokeFlow += vec2(-tangent.y, tangent.x) * influence * sin(u_time * 0.8 + float(index) * 1.7);
  }
  strokeFlow *= 0.0018 * u_sceneInteraction;
  vec2 drift = vec2(0.00035 * sin(u_time * 0.7 + v_uv.y * 12.0), 0.00018);
  vec2 sampleUv = clamp(v_uv - curlFlow - push - swirl - strokeFlow - drift, texel, 1.0 - texel);

  vec3 dye = texture(u_previous, sampleUv).rgb;
  dye *= exp(-u_delta * 0.34);

  float startup = 1.0 - smoothstep(0.4, 2.4, u_time);
  vec2 seedPoint = vec2(0.5 + 0.18 * sin(u_time * 2.1), 0.52 + 0.12 * cos(u_time * 1.7));
  vec2 seedDelta = (v_uv - seedPoint) * aspect;
  float seed = exp(-dot(seedDelta, seedDelta) * 140.0) * startup;
  float injection = brush * u_pointerDown + seed;
  vec3 brushColor = mix(palette(u_time * 0.08), u_currentColor.rgb, 0.25);
  dye += brushColor * injection * (0.15 + 2.4 * length(u_pointerDelta));
  dye += palette(u_time * 0.025 + v_uv.x * 0.18) * strokeField * u_sceneInteraction * u_delta * 0.55;

  outColor = vec4(clamp(dye, 0.0, 1.0), 1.0);
}`;

// Compact single-pass adaptation of the Inkwash wet-pigment model. RGB stores
// mobile absorption density and alpha stores paper wetness in the feedback
// texture; the host display pass supplies paper grain and Beer-Lambert color.
export const INKWASH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

#define MAX_SEGMENTS 128

uniform sampler2D u_previous;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_delta;
uniform vec2 u_pointer;
uniform vec2 u_pointerDelta;
uniform float u_pointerDown;
uniform float u_brushMode;
uniform vec4 u_currentColor;
uniform vec4 u_segments[MAX_SEGMENTS];
uniform float u_segmentCount;
uniform float u_sceneInteraction;

in vec2 v_uv;
out vec4 outColor;

vec2 closestPointOnSegment(vec2 point, vec2 start, vec2 end) {
  vec2 segment = end - start;
  return start + segment * clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
}

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec4 center = texture(u_previous, v_uv);
  float wet = center.a;

  float wetL = texture(u_previous, v_uv - vec2(texel.x, 0.0)).a;
  float wetR = texture(u_previous, v_uv + vec2(texel.x, 0.0)).a;
  float wetB = texture(u_previous, v_uv - vec2(0.0, texel.y)).a;
  float wetT = texture(u_previous, v_uv + vec2(0.0, texel.y)).a;
  vec2 wetFlow = vec2(wetR - wetL, wetT - wetB) * 0.45;

  vec2 pointerDelta = (v_uv - u_pointer) * aspect;
  float penBrush = exp(-dot(pointerDelta, pointerDelta) * 14500.0) * u_pointerDown * (1.0 - u_brushMode);
  float waterBrush = exp(-dot(pointerDelta, pointerDelta) * 620.0) * u_pointerDown * u_brushMode;
  vec2 pointerFlow = u_pointerDelta * waterBrush * 1.15;

  float strokeInk = 0.0;
  vec2 strokeFlow = vec2(0.0);
  for (int index = 0; index < MAX_SEGMENTS; index++) {
    if (float(index) >= u_segmentCount) break;
    vec4 segment = u_segments[index];
    vec2 nearest = closestPointOnSegment(v_uv, segment.xy, segment.zw);
    vec2 offset = (v_uv - nearest) * aspect;
    float influence = exp(-dot(offset, offset) * 8200.0);
    vec2 tangent = normalize((segment.zw - segment.xy) * aspect + vec2(0.000001));
    strokeInk = max(strokeInk, influence);
    strokeFlow += vec2(-tangent.y, tangent.x) * influence * sin(u_time * 0.38 + float(index));
  }
  strokeInk *= u_sceneInteraction;
  strokeFlow *= 0.00034 * u_sceneInteraction;

  float mobility = smoothstep(0.015, 0.32, wet);
  vec2 drift = vec2(0.00008 * sin(u_time * 0.2 + v_uv.y * 9.0), -0.000025);
  vec2 sampleUv = clamp(v_uv - (wetFlow * texel * 3.0 + pointerFlow + strokeFlow + drift) * mobility, texel, 1.0 - texel);
  vec3 pigment = texture(u_previous, sampleUv).rgb;

  vec3 neighbors = (
    texture(u_previous, sampleUv - vec2(texel.x, 0.0)).rgb +
    texture(u_previous, sampleUv + vec2(texel.x, 0.0)).rgb +
    texture(u_previous, sampleUv - vec2(0.0, texel.y)).rgb +
    texture(u_previous, sampleUv + vec2(0.0, texel.y)).rgb
  ) * 0.25;
  vec3 chromatography = vec3(1.34, 1.05, 0.72);
  pigment = mix(pigment, neighbors, clamp(mobility * u_delta * 3.2 * chromatography, 0.0, 0.32));

  float freshWet = max(max(penBrush * 0.12, waterBrush * 0.72), strokeInk * 0.035);
  wet = max(wet, freshWet);
  wet = mix(wet, (wet + wetL + wetR + wetB + wetT) / 5.0, 0.055);
  wet *= exp(-u_delta / 7.5);

  vec3 houseInk = vec3(1.0, 0.97, 0.88);
  vec3 selectedInk = -log(clamp(u_currentColor.rgb, vec3(0.025), vec3(0.98)));
  selectedInk /= max(max(selectedInk.r, selectedInk.g), max(selectedInk.b, 0.25));
  vec3 inkColor = mix(houseInk, selectedInk, 0.28);
  float speed = length(u_pointerDelta) * 45.0;
  float penDeposit = penBrush * u_delta * (0.42 + min(speed, 1.0) * 0.28);
  // Scene paths continuously emit ink, but stop loading already-saturated
  // paper. Flow and diffusion can carry pigment away and reopen capacity.
  float pigmentLoad = max(pigment.r, max(pigment.g, pigment.b));
  float sceneCapacity = 1.0 - smoothstep(0.16, 0.62, pigmentLoad);
  float sceneDeposit = strokeInk * u_delta * 0.16 * sceneCapacity;
  pigment += inkColor * (penDeposit + sceneDeposit);

  // Pigment settles as the paper dries, retaining a soft dark rim.
  float edge = length(vec2(wetR - wetL, wetT - wetB));
  pigment *= 1.0 - u_delta * mix(0.002, 0.018, 1.0 - mobility);
  pigment += inkColor * edge * (1.0 - mobility) * u_delta * 0.08;
  outColor = vec4(clamp(pigment, 0.0, 3.0), clamp(wet, 0.0, 1.0));
}`;

export const SHADER_EXAMPLES = Object.freeze([
  Object.freeze({ id: "hello", label: "Hello GLSL", name: "Hello GLSL", source: HELLO_GLSL_FRAGMENT_SOURCE, mode: "fragment", summary: "Minimal animated fragment shader and uniform reference." }),
  Object.freeze({ id: "rainbow", label: "Rainbow geometry", name: "Rainbow geometry shader", source: RAINBOW_GEOMETRY_FRAGMENT_SOURCE, mode: "fragment", summary: "Distance-field rainbow bands around Underscores scene geometry." }),
  Object.freeze({ id: "shadow", label: "2D shadows", name: "2D shadow simulation", source: SHADOW_CASTING_FRAGMENT_SOURCE, mode: "fragment", summary: "Pointer-driven 2D ray casting against Underscores scene geometry." }),
  Object.freeze({ id: "fluid", label: "Fluid brush", name: "Fluid brush shader", source: FLUID_BRUSH_FRAGMENT_SOURCE, mode: "feedback", summary: "Interactive ping-pong GLSL dye brush with editable feedback source." }),
  Object.freeze({ id: "inkwash", label: "Inkwash", name: "Inkwash shader", source: INKWASH_FRAGMENT_SOURCE, mode: "feedback", summary: "Wet-paper pigment feedback with drying, chromatography, grain, and edge pooling." }),
  Object.freeze({ id: "stokes", label: "Stokes flow", name: "Stokes fluid shader", source: STOKES_FLUID_FRAGMENT_SOURCE, mode: "fragment", summary: "Analytical Stokes-flow field from the first shader-node prototype." }),
]);

export const getShaderExample = id => SHADER_EXAMPLES.find(example => example.id === id) || SHADER_EXAMPLES[0];

export const shaderExampleForSource = source => SHADER_EXAMPLES.find(example => example.source === source) || null;

export const SHADER_COMPOSITE_MODES = Object.freeze(["overlay", "underlay"]);
export const SHADER_BLEND_MODES = Object.freeze(["normal", "screen", "multiply", "overlay", "soft-light"]);
export const SHADER_BACKGROUND_MODES = Object.freeze(["solid", "transparent"]);
export const SHADER_EMITTER_SOURCES = Object.freeze(["scene", "debug"]);

export const normalizeShaderCompositionSettings = value => {
  const raw = value && typeof value === "object" ? value : {};
  return {
    compositeMode: SHADER_COMPOSITE_MODES.includes(raw.compositeMode) ? raw.compositeMode : "overlay",
    compositeOpacity: Math.max(0, Math.min(1, Number.isFinite(Number(raw.compositeOpacity)) ? Number(raw.compositeOpacity) : 1)),
    blendMode: SHADER_BLEND_MODES.includes(raw.blendMode) ? raw.blendMode : "normal",
    backgroundMode: SHADER_BACKGROUND_MODES.includes(raw.backgroundMode) ? raw.backgroundMode : "solid",
    sceneInteraction: raw.sceneInteraction !== false,
    emitterSource: SHADER_EMITTER_SOURCES.includes(raw.emitterSource) ? raw.emitterSource : "scene",
  };
};

export const validateShaderSource = source => {
  const text = String(source || "");
  if (!text.trim()) return { valid: false, error: "Enter a GLSL fragment shader before running this node." };
  if (!/\bvoid\s+main\s*\(/.test(text)) return { valid: false, error: "The fragment shader needs a void main() entry point." };
  let depth = 0;
  for (const character of text) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) return { valid: false, error: "The fragment shader has an unmatched closing brace." };
  }
  if (depth !== 0) return { valid: false, error: "The fragment shader has unmatched braces." };
  return { valid: true, error: "" };
};
