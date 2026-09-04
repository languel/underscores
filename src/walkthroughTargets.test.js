import test from "node:test";
import assert from "node:assert/strict";
import { isRegisteredWalkthroughTarget, performWalkthroughUiAction, resolveWalkthroughTarget } from "./walkthroughTargets.js";

test("walkthrough target registry rejects selectors and script access", () => {
  assert.equal(isRegisteredWalkthroughTarget("panel.script"), true);
  assert.equal(isRegisteredWalkthroughTarget("canvas.element:node-1"), true);
  assert.equal(isRegisteredWalkthroughTarget(".script-panel"), false);
  assert.equal(isRegisteredWalkthroughTarget("document.body"), false);
  assert.equal(isRegisteredWalkthroughTarget("javascript:alert(1)"), false);
});

test("canvas element targets resolve through scene coordinates", () => {
  const api = {
    getSceneElementsIncludingDeleted: () => [{ id: "node-1", x: 10, y: 20, width: 30, height: 40 }],
    getAppState: () => ({}),
  };
  const target = resolveWalkthroughTarget("canvas.element:node-1", {
    documentRef: null,
    getCanvasApi: () => api,
    sceneToViewport: ({ sceneX, sceneY }) => ({ x: sceneX + 5, y: sceneY + 6 }),
  });
  assert.equal(target.rect.left, 30);
  assert.equal(target.rect.top, 46);
});

test("the command palette target resolves against the live palette markup", () => {
  // The palette input carries #command-palette-input inside .command-palette-card;
  // it has no role="dialog" ancestor and no bare .command-palette class, so the
  // resolver has to name the real id or the cursor never finds the field.
  const seen = [];
  const documentRef = {
    querySelector: selector => {
      seen.push(selector);
      return selector.split(", ").some(part => part === "#command-palette-input")
        ? { id: "command-palette-input" }
        : null;
    },
  };
  const target = resolveWalkthroughTarget("app.commandPalette", { documentRef });
  assert.equal(target?.key, "app.commandPalette");
  assert.equal(target?.element?.id, "command-palette-input");
  assert.ok(seen[0].startsWith("#command-palette-input"));
});

test("the script type target resolves to the adapter picker", () => {
  const scriptType = { focus() {} };
  const documentRef = {
    querySelector(selector) {
      assert.match(selector, /editor\.scriptType|script-panel-type-picker/);
      return scriptType;
    },
  };
  assert.equal(isRegisteredWalkthroughTarget("editor.scriptType"), true);
  assert.equal(resolveWalkthroughTarget("editor.scriptType", { documentRef }).element, scriptType);
});

test("the p5 example target resolves and walkthrough select cues dispatch change", async () => {
  const events = [];
  const example = {
    value: "",
    dispatchEvent: event => events.push(event.type),
  };
  const documentRef = {
    querySelector(selector) {
      assert.match(selector, /editor\.p5Example|livecode-example-control/);
      return example;
    },
  };
  assert.equal(isRegisteredWalkthroughTarget("editor.p5Example"), true);
  await performWalkthroughUiAction(
    { target: "editor.p5Example", action: "select", value: "pollock-splatter" },
    { documentRef },
  );
  assert.equal(example.value, "pollock-splatter");
  assert.deepEqual(events, ["change"]);
});
