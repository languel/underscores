import test from "node:test";
import assert from "node:assert/strict";
import { embedPolicyForElement, extractDroppedEmbedURL, getEmbedProvider, isAllowedEmbedURL, normalizeEmbedPolicy, sanitizeEmbedURL, shouldRenderEmbed } from "./embedPolicy.js";

test("accepts safe web URLs and rejects executable schemes", () => {
  assert.equal(isAllowedEmbedURL("https://www.youtube.com/watch?v=abc"), true);
  assert.equal(getEmbedProvider("https://player.vimeo.com/video/1"), "vimeo");
  assert.equal(sanitizeEmbedURL("javascript:alert(1)"), "");
});

test("normalizes bare web hosts for embeds", () => {
  assert.equal(sanitizeEmbedURL("example.com/demo"), "https://example.com/demo");
  assert.equal(sanitizeEmbedURL("www.example.com/demo"), "https://www.example.com/demo");
  assert.equal(sanitizeEmbedURL("localhost:8089/"), "https://localhost:8089/");
  assert.equal(sanitizeEmbedURL("//example.com/demo"), "https://example.com/demo");
  assert.equal(sanitizeEmbedURL("mailto:someone@example.com"), "");
  assert.equal(getEmbedProvider("youtube.com/watch?v=abc"), "youtube");
});

test("extracts HTTP(S) and bare URLs from dragged browser data", () => {
  const data = values => ({ getData: type => values[type] || "" });
  assert.equal(extractDroppedEmbedURL(data({ "text/uri-list": "example.com/sketch" })), "https://example.com/sketch");
  assert.equal(extractDroppedEmbedURL(data({ "text/html": '<a href="https://example.com/page">page</a>' })), "https://example.com/page");
  assert.equal(extractDroppedEmbedURL(data({ "text/plain": "See https://example.com/page, now" })), "https://example.com/page");
  assert.equal(extractDroppedEmbedURL(data({ "text/plain": "image.gif" })), "");
});

test("normalizes the always-loaded interactive default and explicit visibility gates", () => {
  assert.deepEqual(normalizeEmbedPolicy({ display: "always", allowInteraction: true }), {
    enabled: true, display: "always", allowInteraction: true,
    cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0, css: "", reloadNonce: 0,
  });
  assert.equal(shouldRenderEmbed({ display: "presentation" }, false), false);
  assert.equal(shouldRenderEmbed({ display: "presentation" }, true), true);
  assert.equal(shouldRenderEmbed({ display: "never" }, true), false);
  assert.equal(shouldRenderEmbed({}, false), true);
  assert.equal(shouldRenderEmbed({ enabled: false }, false), false);
  assert.deepEqual(embedPolicyForElement({ customData: {} }), normalizeEmbedPolicy({}));
});

test("normalizes embed viewport cropping and same-origin CSS", () => {
  assert.deepEqual(normalizeEmbedPolicy({ cropTop: "72", cropLeft: -4, css: "body { margin: 0; }" }), {
    enabled: true, display: "always", allowInteraction: true,
    cropTop: 72, cropRight: 0, cropBottom: 0, cropLeft: 0,
    css: "body { margin: 0; }", reloadNonce: 0,
  });
  assert.equal(normalizeEmbedPolicy({ allowInteraction: false }).allowInteraction, false);
});

test("normalizes an embed reload nonce without accepting negative values", () => {
  assert.equal(normalizeEmbedPolicy({ reloadNonce: "42" }).reloadNonce, 42);
  assert.equal(normalizeEmbedPolicy({ reloadNonce: -12 }).reloadNonce, 0);
});
