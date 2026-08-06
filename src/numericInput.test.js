import assert from "node:assert/strict";
import test from "node:test";
import { formatNumericDraft, resolveNumericDraft } from "./numericInput.js";

test("numeric drafts preserve an empty editing state and resolve it on commit", () => {
  assert.equal(formatNumericDraft(1), "1");
  assert.equal(formatNumericDraft(null), "");
  assert.equal(resolveNumericDraft("", { value: 1, defaultValue: 100 }), 100);
  assert.equal(resolveNumericDraft("", { value: null }), null);
});

test("numeric drafts accept fractional values and apply bounds only on commit", () => {
  assert.equal(resolveNumericDraft("0.5", { value: 1, min: 0 }), 0.5);
  assert.equal(resolveNumericDraft("-2", { value: 1, min: 0 }), 0);
  assert.equal(resolveNumericDraft("50", { value: 1, max: 10 }), 10);
  assert.equal(resolveNumericDraft("invalid", { value: 3, defaultValue: 5 }), 5);
});
