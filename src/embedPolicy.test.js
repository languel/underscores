import test from "node:test";
import assert from "node:assert/strict";
import { embedPolicyForElement, getEmbedProvider, isAllowedEmbedURL, normalizeEmbedPolicy, sanitizeEmbedURL, shouldRenderEmbed } from "./embedPolicy.js";

test("accepts safe web URLs and rejects executable schemes", () => {
  assert.equal(isAllowedEmbedURL("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(getEmbedProvider("https://player.vimeo.com/video/1"), "vimeo");
  assert.equal(sanitizeEmbedURL("javascript:alert(1)"), "");
});

test("normalizes presentation-gated embed policy", () => {
  assert.deepEqual(normalizeEmbedPolicy({ display: "always", allowInteraction: true }), {
    enabled: true, display: "always", allowInteraction: true,
    cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, css: "",
  });
  assert.equal(shouldRenderEmbed({ display: "presentation" }, false), false);
  assert.equal(shouldRenderEmbed({ display: "presentation" }, true), true);
  assert.equal(shouldRenderEmbed({ display: "never" }, true), false);
  assert.deepEqual(embedPolicyForElement({ customData: {} }), normalizeEmbedPolicy({}));
});

test("normalizes embed viewport cropping and same-origin CSS", () => {
  assert.deepEqual(normalizeEmbedPolicy({ cropTop: "72", cropLeft: -4, css: "body { margin: 0; }" }), {
    enabled: true, display: "presentation", allowInteraction: false,
    cropTop: 72, cropRight: 0, cropBottom: 0, cropLeft: 0,
    css: "body { margin: 0; }",
  });
});
