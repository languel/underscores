import test from "node:test";
import assert from "node:assert/strict";
import {
  compileClassicP5Source,
  DEFAULT_P5_CDN_URL,
  DEFAULT_P5_SOURCE,
  detectP5SourceMode,
  canHostP5Frame,
  isP5FrameElement,
  normalizeP5Frame,
  resolveP5SourceMode,
} from "./p5Frame.js";

test("normalizes p5 frame settings to the bundled trusted runtime", () => {
  assert.deepEqual(normalizeP5Frame({}), {
    source: DEFAULT_P5_SOURCE,
    scriptId: "",
    hostType: "embeddable",
    mode: "auto",
    runtime: "bundled",
    cdnUrl: DEFAULT_P5_CDN_URL,
    autoplay: true,
    fps: 60,
    transparent: false,
    allowInteraction: true,
    reloadNonce: 0,
  });
});

test("detects and runs classic global-mode setup and draw callbacks in a local p5 scope", () => {
  const calls = [];
  const p = {
    createCanvas: (width, height) => calls.push(["canvas", width, height]),
    background: value => calls.push(["background", value]),
  };
  const drawerator = { element: { width: 320, height: 180 }, frame: {} };
  const source = `
    function setup() {
      createCanvas(drawerator.element.width, drawerator.element.height);
    }
    function draw() {
      background(42);
    }
  `;

  assert.equal(detectP5SourceMode(source), "global");
  assert.equal(resolveP5SourceMode({ mode: "auto", source }), "global");
  const callbacks = compileClassicP5Source(p, drawerator, source);
  callbacks.setup();
  callbacks.draw();
  assert.deepEqual(calls, [["canvas", 320, 180], ["background", 42]]);
});

test("classic mode also supports callback assignment syntax", () => {
  const p = { clear: () => { p.cleared = true; } };
  const callbacks = compileClassicP5Source(p, {}, "setup = () => clear();");
  callbacks.setup();
  assert.equal(p.cleared, true);
});

test("normalizes p5 runtime bounds and recognizes p5 frames", () => {
  const frame = normalizeP5Frame({ runtime: "cdn", cdnUrl: " https://example.test/p5.js ", fps: 999, reloadNonce: -4, allowInteraction: false });
  assert.equal(frame.runtime, "cdn");
  assert.equal(frame.cdnUrl, "https://example.test/p5.js");
  assert.equal(frame.fps, 120);
  assert.equal(frame.reloadNonce, 0);
  assert.equal(frame.allowInteraction, false);
  assert.equal(isP5FrameElement({ customData: { draweratorP5: frame } }), true);
  assert.equal(isP5FrameElement({ type: "embeddable", customData: {} }), false);
  assert.equal(canHostP5Frame({ type: "rectangle" }), true);
  assert.equal(canHostP5Frame({ type: "frame" }), true);
  assert.equal(canHostP5Frame({ type: "line" }), false);
});
