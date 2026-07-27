import test from "node:test";
import assert from "node:assert/strict";
import {
  compileClassicP5Source,
  DEFAULT_P5_CDN_URL,
  DEFAULT_P5_SOURCE,
  detectP5SourceMode,
  canHostP5Frame,
  getP5RunnerKey,
  getP5HostElementType,
  isP5FrameElement,
  normalizeP5Frame,
  reconcileP5ScriptsWithElements,
  resolveP5SourceMode,
  shouldRenderP5Frame,
  validateP5Source,
} from "./p5Frame.js";
import { createP5SerialBridge } from "./p5Serial.js";

test("normalizes p5 frame settings to the bundled trusted runtime", () => {
  assert.deepEqual(normalizeP5Frame({}), {
    source: DEFAULT_P5_SOURCE,
    scriptId: "",
    hostType: "rectangle",
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

test("rehydrates p5 catalogs and migrates legacy p5 embeds to Drawerator-owned hosts", () => {
  let next = 0;
  const createId = () => `created-${++next}`;
  const { scripts, elements } = reconcileP5ScriptsWithElements([], [{
    id: "frame",
    type: "embeddable",
    link: "https://example.test/old-embed",
    version: 3,
    customData: { draweratorP5: { source: "function setup() {}", mode: "global" } },
  }], { createId, now: 42 });
  assert.equal(scripts.length, 1);
  assert.equal(elements[0].type, "rectangle");
  assert.equal(elements[0].link, null);
  assert.equal(elements[0].validated, false);
  assert.equal(elements[0].customData.draweratorP5.scriptId, scripts[0].id);
  assert.equal(elements[0].customData.draweratorP5.source, "function setup() {}");
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

test("validates p5 source syntax without running a sketch", () => {
  assert.deepEqual(validateP5Source("function setup() {}"), { valid: true, error: "" });
  const invalid = validateP5Source("function setup( {");
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /Unexpected|expected/i);
});

test("classic mode exposes pointer callbacks and the Drawerator drag compatibility flag", () => {
  const interaction = { mouseIsDragged: false };
  const p = { line: (...args) => { p.lineArgs = args; } };
  const source = `
    function mouseDragged() {
      if (mouseIsDragged) line(mouseX, mouseY, pmouseX, pmouseY);
    }
  `;
  const callbacks = compileClassicP5Source(p, {}, source, interaction);
  assert.equal(typeof callbacks.mouseDragged, "function");
  interaction.mouseIsDragged = true;
  p.mouseX = 30;
  p.mouseY = 40;
  p.pmouseX = 20;
  p.pmouseY = 10;
  callbacks.mouseDragged();
  assert.deepEqual(p.lineArgs, [30, 40, 20, 10]);
});

test("classic mode exposes keyboard, touch, and Web Serial callback names", () => {
  const p = {};
  const callbacks = compileClassicP5Source(p, {}, `
    function keyPressed() { return key; }
    function touchMoved() { return false; }
    function serialData(data) { return data; }
  `);
  assert.equal(typeof callbacks.keyPressed, "function");
  assert.equal(typeof callbacks.touchMoved, "function");
  assert.equal(typeof callbacks.serialData, "function");
});

test("p5 serial bridge streams chunks, text, and lifecycle events", async () => {
  let nativeListeners = {};
  const chunks = [];
  const reader = {
    async read() {
      if (chunks.length) return { value: chunks.shift(), done: false };
      return { done: true };
    },
    async cancel() {},
    releaseLock() {},
  };
  const port = {
    readable: null,
    writable: { getWriter: () => ({ write: async value => { port.written = value; }, releaseLock() {} }) },
    async open(options) {
      port.openOptions = options;
      port.readable = { getReader: () => reader };
    },
    async close() { port.closed = true; },
  };
  const serialApi = {
    addEventListener: (type, handler) => { nativeListeners[type] = handler; },
    removeEventListener: type => { delete nativeListeners[type]; },
    requestPort: async () => port,
  };
  const events = [];
  chunks.push(new Uint8Array([79, 75]));
  const bridge = createP5SerialBridge({ serialApi, onEvent: event => events.push(event) });
  await bridge.requestPort({ baudRate: 115200 });
  await new Promise(resolve => setTimeout(resolve, 0));
  await bridge.write("!");
  assert.equal(port.openOptions.baudRate, 115200);
  assert.equal(events.find(event => event.type === "data")?.text, "OK");
  assert.deepEqual(Array.from(port.written), [33]);
  await bridge.disconnect();
  assert.equal(port.closed, true);
  bridge.dispose();
  assert.equal(nativeListeners.connect, undefined);
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
  assert.equal(getP5HostElementType({ hostType: "frame" }), "frame");
  assert.equal(getP5HostElementType({ hostType: "embeddable" }), "rectangle");
});

test("does not render p5 overlays for outliner-hidden frames", () => {
  const frame = {
    id: "p5-frame",
    type: "rectangle",
    customData: { draweratorP5: normalizeP5Frame({}) },
  };

  assert.equal(shouldRenderP5Frame(frame), true);
  assert.equal(shouldRenderP5Frame({
    ...frame,
    customData: { ...frame.customData, outlinerHidden: true },
  }), false);
});

test("keeps the p5 runner alive for host transforms and lock changes", () => {
  const config = normalizeP5Frame({ source: "function setup() {}", mode: "global" });
  const original = {
    id: "p5-frame",
    x: 24,
    y: 48,
    angle: 0,
    width: 320,
    height: 180,
    isLocked: false,
    version: 1,
    versionNonce: 10,
  };
  const transformedAndLocked = {
    ...original,
    x: 640,
    y: -120,
    angle: Math.PI / 4,
    isLocked: true,
    version: 9,
    versionNonce: 99,
  };

  assert.equal(
    getP5RunnerKey(config, original),
    getP5RunnerKey(config, transformedAndLocked),
  );
  assert.notEqual(
    getP5RunnerKey(config, original),
    getP5RunnerKey(config, { ...transformedAndLocked, width: 321 }),
  );
});
