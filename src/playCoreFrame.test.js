import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLAY_CORE_SOURCE,
  canHostPlayCoreFrame,
  compilePlayCoreSource,
  createPlayCoreScript,
  evaluatePlayCoreSource,
  getPlayCoreGridSize,
  mapPlayCorePointerToLayout,
  isPlayCoreFrameElement,
  normalizePlayCoreFrame,
  normalizePlayCoreScripts,
  shouldRenderPlayCoreFrame,
  validatePlayCoreSource,
} from "./playCoreFrame.js";
import { PLAY_CORE_EXAMPLES } from "./playCoreExamples.js";

test("normalizes Play Core frame data and recognizes supported hosts", () => {
  assert.deepEqual(normalizePlayCoreFrame({}), {
    source: DEFAULT_PLAY_CORE_SOURCE,
    scriptId: "",
    fps: 30,
    allowInteraction: true,
    parameters: {},
    reloadNonce: 0,
  });
  assert.equal(canHostPlayCoreFrame({ type: "rectangle" }), true);
  assert.equal(canHostPlayCoreFrame({ type: "frame" }), true);
  assert.equal(canHostPlayCoreFrame({ type: "line" }), false);
  assert.equal(isPlayCoreFrameElement({ customData: { draweratorPlayCore: {} } }), true);
});

test("compiles the Play Core ES-module lifecycle and injects the Drawerator bridge", () => {
  const source = `export const settings = { fps: 12 };
export function main({ x }, context, cursor, buffer, drawerator) {
  return drawerator.params.glyph + x;
}`;
  const program = evaluatePlayCoreSource(source, { params: { glyph: "#" } });
  assert.equal(program.settings.fps, 12);
  assert.equal(program.main({ x: 2 }, {}, {}, [], { params: { glyph: "#" } }), "#2");
  assert.deepEqual(validatePlayCoreSource(source), { valid: true, error: "" });
  assert.equal(typeof compilePlayCoreSource(source).main, "function");
});

test("bundles the Play Core utility modules into imported programs", () => {
  const source = `import { map } from '/src/modules/num.js';
import { sort } from '/src/modules/sort.js';
import { vec2, rot, add, mulN, addN, subN, length } from '/src/modules/vec2.js';

export function main({ x, y }) {
  const point = add(vec2(x, y), rot(vec2(1, 0), Math.PI / 2));
  const value = map(length(subN(addN(mulN(point, 2), 1), 1)), 0, 10, 0, 9);
  return sort(' .#', 'monospace').charAt(Math.max(0, Math.min(2, Math.round(value))));
}`;
  const program = compilePlayCoreSource(source);
  assert.equal(typeof program.main, "function");
  assert.equal(typeof program.main({ x: 1, y: 2 }), "string");
  assert.deepEqual(validatePlayCoreSource(source), { valid: true, error: "" });
});

test("supports the Play Core SDF and drawbox example module surface", () => {
  const source = `import { sdCircle, opSmoothUnion } from '/src/modules/sdf.js';
import { sub, vec2 } from '/src/modules/vec2.js';

export function main(coord) {
  return sdCircle(sub(vec2(coord.x, coord.y), vec2(0, 0)), .2) < opSmoothUnion(1, 1, .7) ? '#' : ' ';
}
import { drawInfo } from '/src/modules/drawbox.js';
export function post(context, cursor, buffer) { drawInfo(context, cursor, buffer); }`;
  const program = compilePlayCoreSource(source);
  const buffer = Array.from({ length: 20 * 12 }, () => ({ char: " " }));
  program.post({ frame: 1, time: 100, cols: 20, rows: 12, metrics: { aspect: .5 }, runtime: { fps: 30 } }, { x: 4, y: 3 }, buffer);
  assert.equal(typeof program.main({ x: 0, y: 0 }), "string");
  assert.equal(buffer.some(cell => cell.char !== " "), true);
});

test("reports a useful error for imports outside the bundled Play Core module set", () => {
  const validation = validatePlayCoreSource(`import { thing } from '/not-supported.js';\nexport function main() { return thing; }`);
  assert.equal(validation.valid, false);
  assert.match(validation.error, /Unsupported Play Core module/);
});

test("reports invalid source, preserves hidden state, and creates portable catalog entries", () => {
  assert.equal(validatePlayCoreSource("export function main( {").valid, false);
  const frame = { id: "play", type: "rectangle", customData: { draweratorPlayCore: {} } };
  assert.equal(shouldRenderPlayCoreFrame(frame), true);
  assert.equal(shouldRenderPlayCoreFrame({ ...frame, customData: { ...frame.customData, outlinerHidden: true } }), false);
  const script = createPlayCoreScript({ id: "saved", name: "  Score  ", source: "export function main() {}", createdAt: 1, updatedAt: 2 });
  assert.deepEqual(script, { id: "saved", name: "Score", source: "export function main() {}", createdAt: 1, updatedAt: 2 });
});

test("normalizes a persisted Play Core working-file catalog", () => {
  assert.deepEqual(normalizePlayCoreScripts(null), []);
  const [script] = normalizePlayCoreScripts([{
    id: "saved", name: "  Score  ", source: "export function main() {}", createdAt: 1, updatedAt: 2,
  }]);
  assert.deepEqual(script, {
    id: "saved", name: "Score", source: "export function main() {}", createdAt: 1, updatedAt: 2,
  });
});

test("all bundled original play.core examples compile against the portable module registry", () => {
  assert.ok(PLAY_CORE_EXAMPLES.length >= 10);
  PLAY_CORE_EXAMPLES.forEach(example => {
    assert.doesNotThrow(() => compilePlayCoreSource(example.source), example.name);
  });
});

test("Play Core derives its adaptive grid from content-box and real glyph metrics", () => {
  assert.deepEqual(getPlayCoreGridSize({ contentWidth: 1032, contentHeight: 584, cellWidth: 7.224, cellHeight: 16 }), { cols: 142, rows: 36 });
  assert.deepEqual(getPlayCoreGridSize({ contentWidth: 1032, contentHeight: 584, cellWidth: 7.224, cellHeight: 16, cols: 80, rows: 24 }), { cols: 80, rows: 24 });
});

test("Play Core converts screen coordinates back into the host layout before mapping cells", () => {
  assert.deepEqual(mapPlayCorePointerToLayout({
    clientX: 400, clientY: 300, rect: { left: 100, top: 50, width: 600, height: 400 }, layoutWidth: 960, layoutHeight: 640,
  }), { x: 480, y: 400 });
});
