import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPresentationVisibility,
  applyPresentationVisibilityToElement,
  canFitPresentationBounds,
  isElementPresentationMasked,
  isElementVisibleInPresentation,
} from "./presentationVisibility.js";

const element = (customData = {}, opacity = 63) => ({
  id: "object-1",
  type: "rectangle",
  opacity,
  version: 4,
  customData,
});

test("presentation auto-fit rejects bounds that exceed Excalidraw's minimum zoom", () => {
  assert.equal(canFitPresentationBounds([0, 0, 1000, 600], { width: 1200, height: 800 }), true);
  assert.equal(canFitPresentationBounds([0, 0, 1000, 13_700_000], { width: 1455, height: 1104 }), false);
});

test("presentation visibility defaults on and honors an explicit false flag", () => {
  assert.equal(isElementVisibleInPresentation(element()), true);
  assert.equal(isElementVisibleInPresentation(element({ presentationVisible: true })), true);
  assert.equal(isElementVisibleInPresentation(element({ presentationVisible: false })), false);
});

test("presentation masking preserves and restores authored opacity", () => {
  const original = element({ presentationVisible: false }, 37);
  const masked = applyPresentationVisibilityToElement(original, true, 1000);
  assert.equal(masked.opacity, 0);
  assert.equal(masked.customData.presentationSavedOpacity, 37);
  assert.equal(isElementPresentationMasked(masked), true);

  const reapplied = applyPresentationVisibilityToElement(masked, true, 1100);
  assert.equal(reapplied, masked);

  const restored = applyPresentationVisibilityToElement(masked, false, 1200);
  assert.equal(restored.opacity, 37);
  assert.equal(restored.customData.presentationMaskActive, undefined);
  assert.equal(restored.customData.presentationSavedOpacity, undefined);
  assert.equal(restored.customData.presentationVisible, false);
});

test("presentation masking changes only hidden presentation objects", () => {
  const visible = element({ presentationVisible: true });
  const hidden = { ...element({ presentationVisible: false }), id: "object-2" };
  const elements = [visible, hidden];
  const masked = applyPresentationVisibility(elements, true, 1000);
  assert.notEqual(masked, elements);
  assert.equal(masked[0], visible);
  assert.equal(masked[1].opacity, 0);
  assert.equal(applyPresentationVisibility(masked, true, 1100), masked);
});

test("a persisted presentation mask is recoverable after a non-presentation reload", () => {
  const persisted = element({
    presentationVisible: false,
    presentationMaskActive: true,
    presentationSavedOpacity: 71,
  }, 0);
  const restored = applyPresentationVisibilityToElement(persisted, false, 1000);
  assert.equal(restored.opacity, 71);
  assert.equal(isElementPresentationMasked(restored), false);
});
