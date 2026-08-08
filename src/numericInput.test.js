import test from "node:test";
import assert from "node:assert/strict";
import { isIncompleteNumericDraft, resolveNumericDraft } from "./numericInput.js";

test("numeric drafts keep incomplete signed values editable until commit", () => {
  assert.equal(isIncompleteNumericDraft(""), true);
  assert.equal(isIncompleteNumericDraft("-"), true);
  assert.equal(isIncompleteNumericDraft("-."), true);
  assert.equal(isIncompleteNumericDraft("-0."), true);
  assert.equal(isIncompleteNumericDraft("-0.5"), false);

  assert.equal(resolveNumericDraft("-0.5", { value: 100, defaultValue: 0 }), -0.5);
  assert.equal(resolveNumericDraft("", { value: 100, defaultValue: 0 }), 0);
  assert.equal(resolveNumericDraft("", { value: 100 }), 100);
  assert.equal(resolveNumericDraft("-", { value: 100, defaultValue: 0 }), 100);
});
