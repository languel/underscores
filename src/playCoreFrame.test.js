import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLAY_CORE_SOURCE,
  canHostPlayCoreFrame,
  compilePlayCoreSource,
  createPlayCoreScript,
  evaluatePlayCoreSource,
  isPlayCoreFrameElement,
  normalizePlayCoreFrame,
  normalizePlayCoreScripts,
  shouldRenderPlayCoreFrame,
  validatePlayCoreSource,
} from "./playCoreFrame.js";

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
