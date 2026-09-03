import test from "node:test";
import assert from "node:assert/strict";
import {
  WELCOME_STORAGE_KEY,
  WELCOME_TOURS,
  readWelcomeDismissed,
  shouldOfferWelcome,
  writeWelcomeDismissed,
} from "./welcomeExperience.js";
import { BUNDLED_WALKTHROUGHS } from "./walkthroughCatalog.js";

const memoryStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test("the welcome offer lists tours that actually exist", () => {
  const known = new Set(BUNDLED_WALKTHROUGHS.map(item => item.id));
  assert.equal(WELCOME_TOURS.length, 4);
  assert.equal(WELCOME_TOURS[0].primary, true, "the full tour leads");
  for (const tour of WELCOME_TOURS) {
    assert.ok(known.has(tour.id), `unknown walkthrough ${tour.id}`);
    assert.ok(tour.label.length > 0 && tour.summary.length > 0, tour.id);
  }
  const ids = WELCOME_TOURS.map(tour => tour.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("a first visitor on an empty canvas is greeted", () => {
  assert.equal(shouldOfferWelcome({}), true);
  assert.equal(shouldOfferWelcome({ elementCount: 0, walkthroughStatus: "idle" }), true);
});

test("a deliberate arrival is never interrupted", () => {
  // Reopening a saved patch, following a ?scene= link, presenting, or having
  // already drawn all mean the visitor did not need an introduction.
  assert.equal(shouldOfferWelcome({ dismissed: true }), false);
  assert.equal(shouldOfferWelcome({ elementCount: 3 }), false);
  assert.equal(shouldOfferWelcome({ presentationMode: true }), false);
  assert.equal(shouldOfferWelcome({ sceneReference: "../board/week-01.scene.json" }), false);
  assert.equal(shouldOfferWelcome({ sceneReference: "   " }), true, "whitespace is not a reference");
  assert.equal(shouldOfferWelcome({ restoredScene: true }), false);
});

test("the offer stays out of the way of a running walkthrough", () => {
  assert.equal(shouldOfferWelcome({ walkthroughStatus: "running" }), false);
  assert.equal(shouldOfferWelcome({ walkthroughStatus: "waiting" }), false);
  assert.equal(shouldOfferWelcome({ walkthroughStatus: "paused" }), false);
  assert.equal(shouldOfferWelcome({ walkthroughStatus: "completed" }), true);
  assert.equal(shouldOfferWelcome({ walkthroughStatus: "stopped" }), true);
});

test("dismissal round-trips through storage and survives a blocked backend", () => {
  const storage = memoryStorage();
  assert.equal(readWelcomeDismissed(storage), false);
  assert.equal(writeWelcomeDismissed(storage), true);
  assert.equal(storage.getItem(WELCOME_STORAGE_KEY), "true");
  assert.equal(readWelcomeDismissed(storage), true);

  const blocked = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
  };
  assert.equal(readWelcomeDismissed(blocked), false);
  assert.equal(writeWelcomeDismissed(blocked), false);
  assert.equal(readWelcomeDismissed(undefined), false);
});
